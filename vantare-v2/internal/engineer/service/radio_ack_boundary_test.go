package service

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/families"
	"github.com/vantare/overlays/v2/internal/radio"
)

type radioACKBoundaryClock struct {
	at            int64
	calls         atomic.Int32
	beforeStarted func()
}

func (clock *radioACKBoundaryClock) NowMS() int64 {
	// Dispatch reads once, then DualPort reads for queued, its two context
	// checks and finally Session's started ACK. Revoke at that last boundary,
	// after the transport has already accepted the context as live.
	if clock.calls.Add(1) == 5 {
		clock.beforeStarted()
	}
	return clock.at
}

func TestRadioStartedACKRechecksCancellationBeforeCommittingCooldown(t *testing.T) {
	for _, revoke := range []bool{false, true} {
		name := "valid_start"
		if revoke {
			name = "revoked_after_transport_check"
		}
		t.Run(name, func(t *testing.T) {
			svc := NewEngineerService(nil)
			// Drive the production dispatch directly without a background queue
			// selecting the retry before its admission can be inspected.
			svc.running = true
			notifications, unsubscribe := svc.Subscribe()
			defer unsubscribe()
			now := svc.policyClock.NowMS()
			message := radio.RadioMessage{
				Version: radio.VersionV1, ID: "ack-timing", Source: "telemetry-core",
				Intent: families.IntentTimingGapReport, Subject: "player", Locale: radio.LocaleES,
				Priority: radio.PriorityP3, TTL: 15 * time.Second, CreatedAtMS: now,
				ExpiresAtMS: now + 15_000, Payload: map[string]string{},
			}
			submitted, err := svc.radioBus.Submit(message)
			if err != nil || !submitted.Accepted {
				t.Fatalf("submit = %+v, %v", submitted, err)
			}
			item, ok := svc.radioBus.Next(context.Background())
			if !ok {
				t.Fatal("no selected timing delivery")
			}
			clock := &radioACKBoundaryClock{at: now, beforeStarted: func() {
				if revoke {
					svc.mu.Lock()
					intents := svc.familyEngine.ResetFamily("timings")
					svc.radioBus.ResetIntents(radio.ErrPolicyRejected, intents...)
					svc.mu.Unlock()
				}
			}}
			svc.policyClock = clock
			svc.mu.Lock()
			svc.dispatchRadioLocked(item)
			svc.wg.Wait()

			if clock.calls.Load() < 5 {
				t.Fatal("delivery never reached the final started ACK boundary")
			}
			if cancelled := errors.Is(context.Cause(item.Context), radio.ErrPolicyRejected); cancelled != revoke {
				t.Fatalf("policy cancellation = %v, want %v", cancelled, revoke)
			}
			wantSamples := 1
			if revoke {
				wantSamples = 0
			}
			if got := svc.radioMetrics.Snapshot().Samples; got != wantSamples {
				t.Errorf("started samples = %d, want %d", got, wantSamples)
			}
			select {
			case notification := <-notifications:
				if revoke || notification.TextKey != families.IntentTimingGapReport {
					t.Errorf("unexpected delivery at final ACK: %+v", notification)
				}
			default:
				if !revoke {
					t.Error("valid started timing did not reach the pilot")
				}
			}
			message.ID = "ack-timing-retry"
			retried, err := svc.radioBus.Submit(message)
			if err != nil || retried.Accepted != revoke {
				t.Errorf("retry accepted = %v, want %v (only started consumes cooldown), error = %v", retried.Accepted, revoke, err)
			}
		})
	}
}
