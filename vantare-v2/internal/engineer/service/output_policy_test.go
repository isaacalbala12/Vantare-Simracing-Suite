package service

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
)

type cachedAudioResolver struct{}

func (cachedAudioResolver) ResolvePresentationCached(context.Context, audio.PresentationRequest) (string, error) {
	return "cached.wav", nil
}

func TestEngineerOutputModesAreBoundedAndReported(t *testing.T) {
	service := NewEngineerService(nil)
	initialLifecycle := service.Status().PresentationLifecycle
	if got := service.OutputMode(messagepolicy.FamilyFuel); got != OutputBoth {
		t.Fatalf("default fuel output = %q, want both", got)
	}
	if err := service.SetOutputMode("future", "both"); err == nil {
		t.Fatal("unknown family accepted")
	}
	if err := service.SetOutputMode("fuel", "future"); err == nil {
		t.Fatal("unknown output mode accepted")
	}
	if err := service.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}
	if got := service.Status().OutputModes["fuel"]; got != OutputVisual {
		t.Fatalf("status fuel output = %q, want visual", got)
	}
	if got := service.Status().PresentationLifecycle; got != initialLifecycle+1 {
		t.Fatalf("presentation lifecycle = %d, want %d after routing change", got, initialLifecycle+1)
	}
	if err := service.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}
	if got := service.Status().PresentationLifecycle; got != initialLifecycle+1 {
		t.Fatalf("no-op routing change advanced lifecycle to %d", got)
	}
}

func TestStatusSubscriberReceivesLatestLifecycleInsteadOfStaleBufferedStatus(t *testing.T) {
	service := NewEngineerService(nil)
	statusCh, unsubscribe := service.SubscribeStatus()
	defer unsubscribe()

	if err := service.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}
	status := <-statusCh
	if status.PresentationLifecycle != 1 || status.OutputModes["fuel"] != OutputVisual {
		t.Fatalf("status = %+v, want latest lifecycle and output mode", status)
	}
}

func TestLifecycleBoundaryDrainsBufferedVisualNotification(t *testing.T) {
	service := NewEngineerService(nil)
	notifications, unsubscribe := service.Subscribe()
	defer unsubscribe()

	service.mu.Lock()
	service.subs[0] <- EngineerNotification{Version: 1, ID: "old-generation"}
	service.mu.Unlock()
	if err := service.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}

	select {
	case notification := <-notifications:
		t.Fatalf("stale notification survived lifecycle boundary: %+v", notification)
	default:
	}
}

func TestProductDeliveryHonoursCategoryOutputMode(t *testing.T) {
	resolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	decision := messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "lap", Family: messagepolicy.FamilyLaps,
		Intent: messagepolicy.IntentLapCompleted, Priority: messagepolicy.PriorityInformation,
		CreatedAtMS: 100, ExpiresAtMS: 200,
	}
	for _, test := range []struct {
		mode                  OutputMode
		wantVisual, wantAudio bool
	}{
		{OutputVisual, true, false},
		{OutputAudio, false, true},
		{OutputBoth, true, true},
		{OutputDisabled, false, false},
	} {
		t.Run(string(test.mode), func(t *testing.T) {
			service := NewEngineerService(nil)
			if err := service.SetOutputMode("laps", string(test.mode)); err != nil {
				t.Fatal(err)
			}
			player := &recordingPresentationPlayer{}
			port := productDeliveryPort{
				service: service, player: player, resolver: cachedAudioResolver{},
				presentationResolver: resolver, locale: presentation.LocaleEnglish,
			}
			if err := port.Deliver(context.Background(), delivery.Request{
				Version: delivery.ContractVersionV1, DeliveryID: "delivery", Decision: decision,
			}, &presentationAckRecorder{}); err != nil {
				t.Fatal(err)
			}
			if got := len(service.RecentNotifications()) == 1; got != test.wantVisual {
				t.Fatalf("visual published = %v, want %v", got, test.wantVisual)
			}
			if got := len(player.paths) == 1; got != test.wantAudio {
				t.Fatalf("audio played = %v, want %v", got, test.wantAudio)
			}
		})
	}
}
