package core

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

type managerTestDriver struct {
	state driver.State
	run   func(context.Context) error
}

func (d *managerTestDriver) Run(ctx context.Context, _ driver.ObservationSink[int]) error {
	if d.run != nil {
		return d.run(ctx)
	}
	<-ctx.Done()
	return ctx.Err()
}

func (d *managerTestDriver) State() driver.State { return d.state }

type managerTestSink struct{}

func (managerTestSink) WriteObservation(context.Context, int) error { return nil }

func TestDriverManagerSupportedIsStaticAndSelectionIsDeterministic(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		preferred driver.ID
		want      driver.ID
	}{
		{name: "declared priority wins", want: "high"},
		{name: "preference wins over priority", preferred: "low", want: "low"},
		{name: "unknown preference falls back to priority", preferred: "missing", want: "high"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			started := make(chan driver.ID, 1)
			candidates := []DriverCandidate[int]{
				managerCandidate("low", 10, []driver.Capability{"shared-memory"}, started),
				managerCandidate("high", 20, []driver.Capability{"rest"}, started),
			}
			manager, err := NewDriverManager(candidates, ManagerConfig{Preferred: tt.preferred})
			if err != nil {
				t.Fatalf("NewDriverManager: %v", err)
			}

			supported := manager.Supported()
			if len(supported) != 2 || supported[0].ID != "high" || supported[1].ID != "low" {
				t.Fatalf("Supported() = %#v, want priority order high, low", supported)
			}
			supported[0].Capabilities[0] = "mutated"
			if got := manager.Supported()[0].Capabilities[0]; got != "rest" {
				t.Fatalf("Supported leaked mutable catalog: %q", got)
			}

			if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
				t.Fatalf("Start: %v", err)
			}
			select {
			case got := <-started:
				if got != tt.want {
					t.Fatalf("started %q, want %q", got, tt.want)
				}
			case <-time.After(time.Second):
				t.Fatal("driver did not start")
			}
			status := manager.Status()
			if status.ActiveID != tt.want {
				t.Fatalf("active ID = %q, want %q", status.ActiveID, tt.want)
			}
			if err := manager.Stop(t.Context()); err != nil {
				t.Fatalf("Stop: %v", err)
			}
		})
	}
}

func TestDriverManagerLifecycleAndConstructorFailure(t *testing.T) {
	t.Run("double start is typed and stop is idempotent", func(t *testing.T) {
		started := make(chan driver.ID, 1)
		manager, err := NewDriverManager([]DriverCandidate[int]{managerCandidate("lmu", 1, nil, started)}, ManagerConfig{})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
			t.Fatal(err)
		}
		<-started
		if err := manager.Start(t.Context(), managerTestSink{}); !errors.Is(err, ErrManagerAlreadyStarted) {
			t.Fatalf("second Start error = %v, want ErrManagerAlreadyStarted", err)
		}
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatal(err)
		}
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatalf("idempotent Stop: %v", err)
		}
		if got := manager.Status().State; got != driver.StateStopped {
			t.Fatalf("state = %s, want stopped", got)
		}
	})

	t.Run("constructor failure is observable and terminal", func(t *testing.T) {
		want := errors.New("constructor failed")
		manager, err := NewDriverManager([]DriverCandidate[int]{
			{
				Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
				Detect:     func(context.Context) (bool, error) { return true, nil },
				New:        func() (Driver[int], error) { return nil, want },
			},
		}, ManagerConfig{})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
			t.Fatal(err)
		}
		waitManagerState(t, manager, driver.StateError)
		status := manager.Status()
		if !errors.Is(status.Err, want) {
			t.Fatalf("status error = %v, want wrapped constructor error", status.Err)
		}
		if status.ActiveID != "" {
			t.Fatalf("failed constructor left active driver %q", status.ActiveID)
		}
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatal(err)
		}
	})
}

func TestDriverManagerDetectionWithoutCandidateNeverStartsMock(t *testing.T) {
	checks := make(chan struct{}, 2)
	waits := make(chan struct{}, 1)
	manager, err := NewDriverManager([]DriverCandidate[int]{
		{
			Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
			Detect: func(context.Context) (bool, error) {
				checks <- struct{}{}
				return false, nil
			},
			New: func() (Driver[int], error) {
				t.Fatal("constructor called for unavailable candidate")
				return nil, nil
			},
		},
	}, ManagerConfig{Retry: RetryPolicy{
		Wait: func(ctx context.Context, _ time.Duration) error {
			waits <- struct{}{}
			<-ctx.Done()
			return ctx.Err()
		},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-checks
	<-waits
	status := manager.Status()
	if status.State != driver.StateDetecting || status.ActiveID != "" {
		t.Fatalf("status = %#v, want detecting without active driver", status)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestDriverManagerReconnectIsBoundedAndCancelable(t *testing.T) {
	t.Run("replaces failed instance sequentially and exhausts retries", func(t *testing.T) {
		transient := errors.New("transient disconnect")
		var mu sync.Mutex
		activeRuns := 0
		maxActive := 0
		constructed := 0
		waits := make(chan time.Duration, 2)
		manager, err := NewDriverManager([]DriverCandidate[int]{
			{
				Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
				Detect:     func(context.Context) (bool, error) { return true, nil },
				New: func() (Driver[int], error) {
					mu.Lock()
					constructed++
					mu.Unlock()
					return &managerTestDriver{state: driver.StateLive, run: func(context.Context) error {
						mu.Lock()
						activeRuns++
						if activeRuns > maxActive {
							maxActive = activeRuns
						}
						mu.Unlock()
						mu.Lock()
						activeRuns--
						mu.Unlock()
						return transient
					}}, nil
				},
				Retryable: func(err error) bool { return errors.Is(err, transient) },
			},
		}, ManagerConfig{Retry: RetryPolicy{
			MaxReconnects:  2,
			InitialBackoff: time.Second,
			MaxBackoff:     2 * time.Second,
			Jitter:         func(delay time.Duration) time.Duration { return delay },
			Wait: func(context.Context, time.Duration) error {
				waits <- time.Second
				return nil
			},
		}})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
			t.Fatal(err)
		}
		waitManagerState(t, manager, driver.StateError)
		status := manager.Status()
		if !errors.Is(status.Err, ErrReconnectExhausted) || !errors.Is(status.Err, transient) {
			t.Fatalf("status error = %v, want reconnect exhaustion wrapping transient error", status.Err)
		}
		mu.Lock()
		gotConstructed, gotMax := constructed, maxActive
		mu.Unlock()
		if gotConstructed != 3 || gotMax != 1 {
			t.Fatalf("constructed=%d max active=%d, want 3 and 1", gotConstructed, gotMax)
		}
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("stop cancels backoff and waits for teardown", func(t *testing.T) {
		transient := errors.New("lost")
		backoff := make(chan struct{})
		cancelled := make(chan struct{})
		manager, err := NewDriverManager([]DriverCandidate[int]{
			{
				Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
				Detect:     func(context.Context) (bool, error) { return true, nil },
				New: func() (Driver[int], error) {
					return &managerTestDriver{state: driver.StateLive, run: func(context.Context) error { return transient }}, nil
				},
				Retryable: func(error) bool { return true },
			},
		}, ManagerConfig{Retry: RetryPolicy{
			MaxReconnects: 1,
			Wait: func(ctx context.Context, _ time.Duration) error {
				close(backoff)
				<-ctx.Done()
				close(cancelled)
				return ctx.Err()
			},
		}})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
			t.Fatal(err)
		}
		<-backoff
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatal(err)
		}
		select {
		case <-cancelled:
		default:
			t.Fatal("Stop returned before backoff cancellation completed")
		}
	})
}

func TestDriverManagerParentCancellationLeavesNoRunBehind(t *testing.T) {
	runStarted := make(chan struct{})
	runStopped := make(chan struct{})
	parent, cancel := context.WithCancel(t.Context())
	manager, err := NewDriverManager([]DriverCandidate[int]{
		{
			Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New: func() (Driver[int], error) {
				return &managerTestDriver{state: driver.StateLive, run: func(ctx context.Context) error {
					close(runStarted)
					<-ctx.Done()
					close(runStopped)
					return ctx.Err()
				}}, nil
			},
		},
	}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(parent, managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-runStarted
	cancel()
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	select {
	case <-runStopped:
	default:
		t.Fatal("Stop returned while Run was still active")
	}
}

func managerCandidate(id driver.ID, priority int, capabilities []driver.Capability, started chan<- driver.ID) DriverCandidate[int] {
	return DriverCandidate[int]{
		Descriptor: driver.Descriptor{ID: id, Priority: priority, Capabilities: capabilities},
		Detect:     func(context.Context) (bool, error) { return true, nil },
		New: func() (Driver[int], error) {
			return &managerTestDriver{state: driver.StateLive, run: func(ctx context.Context) error {
				started <- id
				<-ctx.Done()
				return ctx.Err()
			}}, nil
		},
	}
}

func waitManagerState(t *testing.T, manager *DriverManager[int], want driver.State) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		if manager.Status().State == want {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("manager did not reach %s; last status %#v", want, manager.Status())
		default:
		}
	}
}
