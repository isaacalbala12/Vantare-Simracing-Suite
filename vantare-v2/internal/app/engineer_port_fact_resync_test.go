package app

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/service"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

// Keep the real consumer; only hold its first acknowledgement to fill the port.
type heldFactService struct {
	*service.EngineerService
	started, release chan struct{}
	nextEpoch        chan struct{}
	once             sync.Once
}

func (s *heldFactService) ConsumeFact(fact engineerprojection.FactEnvelopeV1) error {
	err := s.EngineerService.ConsumeFact(fact)
	s.once.Do(func() { close(s.started); <-s.release })
	if fact.Epoch == 2 && s.nextEpoch != nil {
		close(s.nextEpoch)
	}
	return err
}

func TestEngineerNewEpochRetiresPendingBoundaryWake(t *testing.T) {
	consumer := &heldFactService{EngineerService: service.NewEngineerService(nil), started: make(chan struct{}), release: make(chan struct{}), nextEpoch: make(chan struct{})}
	if err := consumer.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer, EngineerFactQueueCapacity: 1})
	if err != nil {
		consumer.Stop()
		t.Fatal(err)
	}
	port := runtime.engineerPort
	port.Start()
	statuses, unsubscribe := consumer.SubscribeStatus()
	defer unsubscribe()
	var release sync.Once
	t.Cleanup(func() {
		release.Do(func() { close(consumer.release) })
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := port.Stop(ctx); err != nil {
			t.Error(err)
		}
		consumer.Stop()
	})
	if _, err := port.EnqueueFact(engineerFact(1, 1)); err != nil {
		t.Fatal(err)
	}
	awaitSignal(t, consumer.started, "old epoch callback")
	if _, err := port.EnqueueFact(engineerFact(1, 2)); err != nil {
		t.Fatal(err)
	}
	if _, err := port.EnqueueFact(engineerFact(1, 3)); !errors.Is(err, engineerprojection.ErrFactResyncRequired) {
		t.Fatalf("boundary = %v", err)
	}
	if _, err := port.EnqueueFact(engineerFact(2, 1)); err != nil {
		t.Fatal(err)
	}
	release.Do(func() { close(consumer.release) })
	awaitSignal(t, consumer.nextEpoch, "new epoch fact")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := port.Stop(ctx); err != nil {
		t.Fatal(err)
	}
	for {
		select {
		case status := <-statuses:
			if status.LastError != "" {
				t.Fatalf("obsolete boundary published: %s", status.LastError)
			}
		default:
			return
		}
	}
}

func TestEngineerFactBoundaryReachesServiceAndNewEpochRecovers(t *testing.T) {
	for _, overflow := range []bool{false, true} {
		name := "sequence-gap"
		if overflow {
			name = "queue-overflow"
		}
		t.Run(name, func(t *testing.T) {
			consumer := &heldFactService{EngineerService: service.NewEngineerService(nil), started: make(chan struct{}), release: make(chan struct{})}
			if err := consumer.Start(context.Background()); err != nil {
				t.Fatal(err)
			}
			runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer, EngineerFactQueueCapacity: 1})
			if err != nil {
				consumer.Stop()
				t.Fatal(err)
			}
			port := runtime.engineerPort
			port.Start()
			var release sync.Once
			t.Cleanup(func() {
				release.Do(func() { close(consumer.release) })
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				if err := port.Stop(ctx); err != nil {
					t.Error(err)
				}
				consumer.Stop()
			})
			if _, err := port.EnqueueFact(engineerFact(1, 1)); err != nil {
				t.Fatal(err)
			}
			awaitSignal(t, consumer.started, "first real service fact")
			if overflow {
				if _, err := port.EnqueueFact(engineerFact(1, 2)); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := port.EnqueueFact(engineerFact(1, 3)); !errors.Is(err, engineerprojection.ErrFactResyncRequired) {
				t.Fatalf("boundary = %v", err)
			}
			release.Do(func() { close(consumer.release) })
			waitForServiceFactError(t, consumer.EngineerService, true)
			if consumer.Status().LastError == "" {
				t.Fatal("status hides the fact gap")
			}
			if _, err := port.EnqueueFact(engineerFact(1, 4)); !errors.Is(err, engineerprojection.ErrFactResyncRequired) {
				t.Fatalf("same epoch boundary = %v", err)
			}
			if _, err := port.EnqueueFact(engineerFact(2, 1)); err != nil {
				t.Fatal(err)
			}
			waitForServiceFactError(t, consumer.EngineerService, false)
			if consumer.Status().LastError != "" {
				t.Fatal("new epoch left an obsolete boundary in status")
			}
		})
	}
}

func waitForServiceFactError(t *testing.T, svc *service.EngineerService, want bool) {
	t.Helper()
	deadline := time.NewTimer(2 * time.Second)
	defer deadline.Stop()
	poll := time.NewTicker(time.Millisecond)
	defer poll.Stop()
	for (svc.Health().LastError != "") != want {
		select {
		case <-deadline.C:
			t.Fatalf("fact error = %q, want present=%v", svc.Health().LastError, want)
		case <-poll.C:
		}
	}
}
