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
	state   driver.State
	runtime func() driver.RuntimeSnapshot
	run     func(context.Context) error
}

func (d *managerTestDriver) Run(ctx context.Context, _ driver.ObservationSink[int]) error {
	if d.run != nil {
		return d.run(ctx)
	}
	<-ctx.Done()
	return ctx.Err()
}

func (d *managerTestDriver) RuntimeSnapshot() driver.RuntimeSnapshot {
	if d.runtime != nil {
		return d.runtime()
	}
	return driver.RuntimeSnapshot{State: d.state}
}

type managerTestSink struct{}

func (managerTestSink) WriteObservation(context.Context, int) error { return nil }

type nonComparableDriver struct {
	values  []int
	started chan struct{}
}

func (d nonComparableDriver) Run(ctx context.Context, _ driver.ObservationSink[int]) error {
	close(d.started)
	<-ctx.Done()
	return ctx.Err()
}

func (d nonComparableDriver) RuntimeSnapshot() driver.RuntimeSnapshot {
	return driver.RuntimeSnapshot{State: driver.StateLive, Capabilities: []driver.Capability{"runtime"}}
}

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

func TestDriverManagerCatalogValidationAndStableTieBreak(t *testing.T) {
	t.Parallel()

	invalid := []struct {
		name       string
		candidates []DriverCandidate[int]
	}{
		{name: "empty ID", candidates: []DriverCandidate[int]{{Detect: func(context.Context) (bool, error) { return false, nil }, New: func() (Driver[int], error) { return nil, nil }}}},
		{name: "missing detector", candidates: []DriverCandidate[int]{{Descriptor: driver.Descriptor{ID: "lmu"}, New: func() (Driver[int], error) { return nil, nil }}}},
		{name: "missing constructor", candidates: []DriverCandidate[int]{{Descriptor: driver.Descriptor{ID: "lmu"}, Detect: func(context.Context) (bool, error) { return false, nil }}}},
		{name: "duplicate ID", candidates: []DriverCandidate[int]{
			managerCandidate("lmu", 1, nil, make(chan driver.ID, 1)),
			managerCandidate("lmu", 2, nil, make(chan driver.ID, 1)),
		}},
	}
	for _, tt := range invalid {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := NewDriverManager(tt.candidates, ManagerConfig{}); !errors.Is(err, ErrInvalidDriverCatalog) {
				t.Fatalf("NewDriverManager error = %v, want ErrInvalidDriverCatalog", err)
			}
		})
	}

	started := make(chan driver.ID, 1)
	manager, err := NewDriverManager([]DriverCandidate[int]{
		managerCandidate("zeta", 10, nil, started),
		managerCandidate("alpha", 10, nil, started),
	}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	if got := <-started; got != "alpha" {
		t.Fatalf("equal-priority driver = %q, want stable ID tie-break alpha", got)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestDriverManagerPreferenceChangesOnlyWhileStopped(t *testing.T) {
	started := make(chan driver.ID, 2)
	manager, err := NewDriverManager([]DriverCandidate[int]{
		managerCandidate("primary", 20, nil, started),
		managerCandidate("secondary", 10, nil, started),
	}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	if got := <-started; got != "primary" {
		t.Fatalf("first driver = %q, want primary", got)
	}
	if err := manager.SetPreferred("secondary"); !errors.Is(err, ErrManagerRunning) {
		t.Fatalf("SetPreferred while running = %v, want ErrManagerRunning", err)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := manager.SetPreferred("secondary"); err != nil {
		t.Fatalf("SetPreferred while stopped: %v", err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	if got := <-started; got != "secondary" {
		t.Fatalf("driver after preference change = %q, want secondary", got)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestConcurrentStopsCannotClearRestartedGeneration(t *testing.T) {
	started := make(chan driver.ID, 2)
	manager, err := NewDriverManager([]DriverCandidate[int]{managerCandidate("lmu", 1, nil, started)}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-started
	manager.mu.RLock()
	oldGeneration, oldDone := manager.generation, manager.done
	manager.mu.RUnlock()

	releaseStops := make(chan struct{})
	results := make(chan error, 2)
	for range 2 {
		go func() {
			<-releaseStops
			results <- manager.Stop(t.Context())
		}()
	}
	close(releaseStops)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatalf("concurrent Stop: %v", err)
		}
	}

	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatalf("restart: %v", err)
	}
	<-started
	manager.completeStop(oldGeneration, oldDone)
	status := manager.Status()
	if status.State != driver.StateLive || status.ActiveID != "lmu" {
		t.Fatalf("stale Stop completion cleared restarted generation: %#v", status)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestStopTimeoutCompletionCanBeAcknowledgedAndRestarted(t *testing.T) {
	runStarted := make(chan struct{})
	releaseRun := make(chan struct{})
	var startOnce sync.Once
	manager, err := NewDriverManager([]DriverCandidate[int]{
		{
			Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New: func() (Driver[int], error) {
				return &managerTestDriver{state: driver.StateLive, run: func(ctx context.Context) error {
					startOnce.Do(func() { close(runStarted) })
					<-ctx.Done()
					<-releaseRun
					return ctx.Err()
				}}, nil
			},
		},
	}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-runStarted
	manager.mu.RLock()
	oldDone := manager.done
	manager.mu.RUnlock()

	stopCtx, cancelStop := context.WithCancel(t.Context())
	cancelStop()
	if err := manager.Stop(stopCtx); !errors.Is(err, context.Canceled) {
		t.Fatalf("timed out Stop = %v, want context cancellation", err)
	}
	if got := manager.Status().State; got != driver.StateStopping {
		t.Fatalf("state after timed out Stop = %s, want stopping", got)
	}
	close(releaseRun)
	select {
	case <-oldDone:
	case <-time.After(time.Second):
		t.Fatal("driver did not finish after release")
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatalf("acknowledge completed Stop: %v", err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatalf("restart after completed timeout: %v", err)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestDriverManagerValidatesRuntimeStateAndCapabilities(t *testing.T) {
	var snapshotMu sync.RWMutex
	snapshot := driver.RuntimeSnapshot{State: driver.StateLive, Capabilities: []driver.Capability{"shared-memory"}}
	setSnapshot := func(next driver.RuntimeSnapshot) {
		snapshotMu.Lock()
		snapshot = next
		snapshotMu.Unlock()
	}
	readSnapshot := func() driver.RuntimeSnapshot {
		snapshotMu.RLock()
		defer snapshotMu.RUnlock()
		return driver.RuntimeSnapshot{
			State:        snapshot.State,
			Capabilities: append([]driver.Capability(nil), snapshot.Capabilities...),
		}
	}
	started := make(chan struct{})
	manager, err := NewDriverManager([]DriverCandidate[int]{
		{
			Descriptor: driver.Descriptor{ID: "lmu", Priority: 1, Capabilities: []driver.Capability{"compiled-shared-memory", "compiled-rest"}},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New: func() (Driver[int], error) {
				return &managerTestDriver{runtime: readSnapshot, run: func(ctx context.Context) error {
					close(started)
					<-ctx.Done()
					return ctx.Err()
				}}, nil
			},
		},
	}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-started

	status := manager.Status()
	if status.State != driver.StateLive || len(status.Capabilities) != 1 || status.Capabilities[0] != "shared-memory" {
		t.Fatalf("initial runtime status = %#v", status)
	}
	status.Capabilities[0] = "mutated"
	if got := manager.Status().Capabilities[0]; got != "shared-memory" {
		t.Fatalf("runtime capabilities leaked mutable state: %q", got)
	}
	if got := manager.Supported()[0].Capabilities; len(got) != 2 || got[0] != "compiled-shared-memory" {
		t.Fatalf("static support was replaced by runtime capabilities: %#v", got)
	}

	valid := []driver.RuntimeSnapshot{
		{State: driver.StateStale, Capabilities: nil},
		{State: driver.StateConnecting, Capabilities: []driver.Capability{"shared-memory"}},
		{State: driver.StateLive, Capabilities: []driver.Capability{"shared-memory", "rest"}},
	}
	for _, next := range valid {
		setSnapshot(next)
		if got := manager.Status(); got.State != next.State || !equalCapabilities(got.Capabilities, next.Capabilities) || got.Err != nil {
			t.Fatalf("valid transition to %s produced %#v", next.State, got)
		}
	}

	setSnapshot(driver.RuntimeSnapshot{State: driver.StateStopped, Capabilities: []driver.Capability{"rest"}})
	invalid := manager.Status()
	if invalid.State != driver.StateDegraded || !errors.Is(invalid.Err, ErrInvalidDriverTransition) {
		t.Fatalf("illegal live -> stopped transition = %#v, want degraded diagnostic", invalid)
	}
	setSnapshot(driver.RuntimeSnapshot{State: driver.StateLive, Capabilities: []driver.Capability{"shared-memory"}})
	recovered := manager.Status()
	if recovered.State != driver.StateLive || recovered.Err != nil {
		t.Fatalf("valid recovery from degraded = %#v", recovered)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestDriverManagerStatusAcceptsNonComparableDriverValue(t *testing.T) {
	started := make(chan struct{})
	manager, err := NewDriverManager([]DriverCandidate[int]{
		{
			Descriptor: driver.Descriptor{ID: "non-comparable", Priority: 1},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New: func() (Driver[int], error) {
				return nonComparableDriver{values: []int{1}, started: started}, nil
			},
		},
	}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-started
	status := manager.Status()
	if status.State != driver.StateLive || !equalCapabilities(status.Capabilities, []driver.Capability{"runtime"}) {
		t.Fatalf("non-comparable runtime status = %#v", status)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestSlowSnapshotCannotOverwriteReconnectedReuseOfSameInstance(t *testing.T) {
	transient := errors.New("transient disconnect")
	firstRunStarted := make(chan struct{})
	secondRunStarted := make(chan struct{})
	failFirst := make(chan struct{})
	snapshotStarted := make(chan struct{})
	releaseSnapshot := make(chan struct{})

	var mu sync.Mutex
	runs := 0
	snapshots := 0
	reused := &managerTestDriver{}
	reused.run = func(ctx context.Context) error {
		mu.Lock()
		runs++
		run := runs
		mu.Unlock()
		if run == 1 {
			close(firstRunStarted)
			<-failFirst
			return transient
		}
		close(secondRunStarted)
		<-ctx.Done()
		return ctx.Err()
	}
	reused.runtime = func() driver.RuntimeSnapshot {
		mu.Lock()
		snapshots++
		snapshot := snapshots
		mu.Unlock()
		if snapshot == 1 {
			close(snapshotStarted)
			<-releaseSnapshot
			return driver.RuntimeSnapshot{State: driver.StateLive, Capabilities: []driver.Capability{"old-cycle"}}
		}
		return driver.RuntimeSnapshot{State: driver.StateLive, Capabilities: []driver.Capability{"new-cycle"}}
	}

	manager, err := NewDriverManager([]DriverCandidate[int]{
		{
			Descriptor: driver.Descriptor{ID: "reused", Priority: 1},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New:        func() (Driver[int], error) { return reused, nil },
			Retryable:  func(err error) bool { return errors.Is(err, transient) },
		},
	}, ManagerConfig{Retry: RetryPolicy{
		MaxReconnects: 1,
		Jitter:        func(delay time.Duration) time.Duration { return delay },
		Wait:          func(context.Context, time.Duration) error { return nil },
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-firstRunStarted
	oldStatus := make(chan DriverStatus, 1)
	go func() { oldStatus <- manager.Status() }()
	<-snapshotStarted
	close(failFirst)
	select {
	case <-secondRunStarted:
	case <-time.After(time.Second):
		t.Fatal("reconnected Run did not start")
	}
	close(releaseSnapshot)
	staleResult := <-oldStatus
	if staleResult.State == driver.StateLive || equalCapabilities(staleResult.Capabilities, []driver.Capability{"old-cycle"}) {
		t.Fatalf("old snapshot contaminated reconnected cycle: %#v", staleResult)
	}
	fresh := manager.Status()
	if fresh.State != driver.StateLive || !equalCapabilities(fresh.Capabilities, []driver.Capability{"new-cycle"}) {
		t.Fatalf("fresh reconnected status = %#v", fresh)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
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
		waitManagerError(t, manager, want)
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

func TestDriverManagerDetectionErrorsRequireExplicitRetryClassification(t *testing.T) {
	t.Run("unclassified detector error is terminal", func(t *testing.T) {
		failure := errors.New("detector permission denied")
		manager, err := NewDriverManager([]DriverCandidate[int]{
			{
				Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
				Detect:     func(context.Context) (bool, error) { return false, failure },
				New:        func() (Driver[int], error) { return nil, nil },
			},
		}, ManagerConfig{})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
			t.Fatal(err)
		}
		waitManagerError(t, manager, failure)
		if got := manager.Status().State; got != driver.StateError {
			t.Fatalf("state = %s, want error", got)
		}
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("classified transient detector error remains detecting", func(t *testing.T) {
		failure := errors.New("temporary detector failure")
		waiting := make(chan struct{})
		manager, err := NewDriverManager([]DriverCandidate[int]{
			{
				Descriptor:         driver.Descriptor{ID: "lmu", Priority: 1},
				Detect:             func(context.Context) (bool, error) { return false, failure },
				DetectionRetryable: func(err error) bool { return errors.Is(err, failure) },
				New:                func() (Driver[int], error) { return nil, nil },
			},
		}, ManagerConfig{Retry: RetryPolicy{Wait: func(ctx context.Context, _ time.Duration) error {
			close(waiting)
			<-ctx.Done()
			return ctx.Err()
		}}})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
			t.Fatal(err)
		}
		<-waiting
		status := manager.Status()
		if status.State != driver.StateDetecting || !errors.Is(status.Err, failure) {
			t.Fatalf("status = %#v, want retryable detecting error", status)
		}
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatal(err)
		}
	})
}

func TestDriverManagerReconnectIsBoundedAndCancelable(t *testing.T) {
	t.Run("terminal run error is not retried", func(t *testing.T) {
		terminal := errors.New("incompatible simulator build")
		constructed := 0
		manager, err := NewDriverManager([]DriverCandidate[int]{
			{
				Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
				Detect:     func(context.Context) (bool, error) { return true, nil },
				New: func() (Driver[int], error) {
					constructed++
					return &managerTestDriver{state: driver.StateError, run: func(context.Context) error { return terminal }}, nil
				},
				Retryable: func(error) bool { return false },
			},
		}, ManagerConfig{Retry: RetryPolicy{MaxReconnects: 10}})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
			t.Fatal(err)
		}
		waitManagerError(t, manager, terminal)
		if constructed != 1 || !errors.Is(manager.Status().Err, terminal) {
			t.Fatalf("constructed=%d status=%#v, want one terminal attempt", constructed, manager.Status())
		}
		if err := manager.Stop(t.Context()); err != nil {
			t.Fatal(err)
		}
	})

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
			Wait: func(_ context.Context, delay time.Duration) error {
				waits <- delay
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
		if first, second := <-waits, <-waits; first != time.Second || second != 2*time.Second {
			t.Fatalf("backoff delays = %s, %s; want 1s, 2s", first, second)
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

func TestDefaultJitterIsBounded(t *testing.T) {
	t.Parallel()

	const delay = 10 * time.Second
	for range 1000 {
		got := defaultJitter(delay)
		if got < 9*time.Second || got > 11*time.Second {
			t.Fatalf("defaultJitter(%s) = %s, want within +/-10%%", delay, got)
		}
	}
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
	select {
	case <-runStopped:
	case <-time.After(time.Second):
		t.Fatal("parent cancellation did not stop Run")
	}
	waitManagerState(t, manager, driver.StateStopped)
	if status := manager.Status(); status.ActiveID != "" || status.Err != nil {
		t.Fatalf("status after parent cancellation = %#v, want clean stopped state", status)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatalf("Stop after parent cancellation: %v", err)
	}
}

func TestDriverManagerStopReturnsGenerationTeardownFailure(t *testing.T) {
	closeFailure := errors.New("close mapping failed")
	started := make(chan int, 2)
	constructed := 0
	manager, err := NewDriverManager([]DriverCandidate[int]{
		{
			Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New: func() (Driver[int], error) {
				constructed++
				cycle := constructed
				return &managerTestDriver{state: driver.StateLive, run: func(ctx context.Context) error {
					started <- cycle
					<-ctx.Done()
					if cycle == 1 {
						return errors.Join(ctx.Err(), driver.ErrTeardown, closeFailure)
					}
					return ctx.Err()
				}}, nil
			},
		},
	}, ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatal(err)
	}
	<-started

	results := make(chan error, 2)
	for range 2 {
		go func() { results <- manager.Stop(t.Context()) }()
	}
	for range 2 {
		if err := <-results; !errors.Is(err, driver.ErrTeardown) || !errors.Is(err, closeFailure) {
			t.Fatalf("Stop error = %v, want teardown and close failure", err)
		}
	}
	if err := manager.Start(t.Context(), managerTestSink{}); err != nil {
		t.Fatalf("restart: %v", err)
	}
	if cycle := <-started; cycle != 2 {
		t.Fatalf("cycle = %d", cycle)
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatalf("clean second Stop inherited old error: %v", err)
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

func waitManagerError(t *testing.T, manager *DriverManager[int], want error) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		if errors.Is(manager.Status().Err, want) {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("manager did not expose %v; last status %#v", want, manager.Status())
		default:
		}
	}
}

func equalCapabilities(left, right []driver.Capability) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}
