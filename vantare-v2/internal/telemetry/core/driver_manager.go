package core

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"sort"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

var (
	ErrManagerAlreadyStarted   = errors.New("telemetry driver manager already started")
	ErrManagerRunning          = errors.New("telemetry driver manager is running")
	ErrReconnectExhausted      = errors.New("telemetry driver reconnect attempts exhausted")
	ErrInvalidDriverCatalog    = errors.New("invalid telemetry driver catalog")
	ErrInvalidDriverTransition = errors.New("invalid telemetry driver state transition")
)

// DriverCandidate binds static support metadata to cancelable detection and a
// constructor. Retryable must explicitly classify transient Run failures;
// nil means every failure is terminal.
type DriverCandidate[T any] struct {
	Descriptor driver.Descriptor
	Detect     func(context.Context) (bool, error)
	New        func() (Driver[T], error)
	// DetectionRetryable explicitly permits retrying a detector failure. A
	// nil classifier makes detector errors terminal; normal absence is false,nil.
	DetectionRetryable func(error) bool
	Retryable          func(error) bool
}

// RetryPolicy controls reconnects after an already constructed driver exits.
// MaxReconnects excludes the initial run. Wait and Jitter are injectable so
// tests and harnesses do not depend on wall-clock sleeps.
type RetryPolicy struct {
	MaxReconnects  int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	Jitter         func(time.Duration) time.Duration
	Wait           func(context.Context, time.Duration) error
}

type ManagerConfig struct {
	Preferred driver.ID
	Retry     RetryPolicy
}

// DriverStatus is one point-in-time, immutable view of manager state.
type DriverStatus struct {
	State            driver.State
	ActiveID         driver.ID
	Capabilities     []driver.Capability
	ReconnectAttempt int
	Err              error
}

// DriverManager owns exactly one driver Run call at a time.
type DriverManager[T any] struct {
	mu         sync.RWMutex
	candidates []DriverCandidate[T]
	config     ManagerConfig

	running             bool
	generation          uint64
	state               driver.State
	active              Driver[T]
	activeID            driver.ID
	runtimeCapabilities []driver.Capability
	attempt             int
	err                 error
	cancel              context.CancelFunc
	done                chan struct{}
}

func NewDriverManager[T any](candidates []DriverCandidate[T], config ManagerConfig) (*DriverManager[T], error) {
	owned := make([]DriverCandidate[T], len(candidates))
	seen := make(map[driver.ID]struct{}, len(candidates))
	for i, candidate := range candidates {
		if candidate.Descriptor.ID == "" || candidate.Detect == nil || candidate.New == nil {
			return nil, fmt.Errorf("%w: candidate %d has incomplete metadata or functions", ErrInvalidDriverCatalog, i)
		}
		if _, duplicate := seen[candidate.Descriptor.ID]; duplicate {
			return nil, fmt.Errorf("%w: duplicate driver ID %q", ErrInvalidDriverCatalog, candidate.Descriptor.ID)
		}
		seen[candidate.Descriptor.ID] = struct{}{}
		candidate.Descriptor.Capabilities = append([]driver.Capability(nil), candidate.Descriptor.Capabilities...)
		owned[i] = candidate
	}
	sort.Slice(owned, func(i, j int) bool {
		if owned[i].Descriptor.Priority != owned[j].Descriptor.Priority {
			return owned[i].Descriptor.Priority > owned[j].Descriptor.Priority
		}
		return owned[i].Descriptor.ID < owned[j].Descriptor.ID
	})
	config.Retry = normalizedRetryPolicy(config.Retry)
	return &DriverManager[T]{candidates: owned, config: config, state: driver.StateStopped}, nil
}

// Supported reports compiled support independently of current detection and
// runtime health. Returned capability slices are owned by the caller.
func (manager *DriverManager[T]) Supported() []driver.Descriptor {
	manager.mu.RLock()
	defer manager.mu.RUnlock()

	result := make([]driver.Descriptor, len(manager.candidates))
	for i, candidate := range manager.candidates {
		result[i] = cloneDescriptor(candidate.Descriptor)
	}
	return result
}

// SetPreferred changes selection for the next Start. A live manager is never
// hot-swapped implicitly: callers must Stop, change preference, then Start.
func (manager *DriverManager[T]) SetPreferred(id driver.ID) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.running {
		return ErrManagerRunning
	}
	manager.config.Preferred = id
	return nil
}

// Start begins detection and driver ownership in one managed goroutine.
func (manager *DriverManager[T]) Start(parent context.Context, sink driver.ObservationSink[T]) error {
	if parent == nil {
		return fmt.Errorf("start driver manager: nil context")
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.running {
		return ErrManagerAlreadyStarted
	}

	ctx, cancel := context.WithCancel(parent)
	manager.running = true
	manager.generation++
	manager.state = driver.StateDetecting
	manager.active = nil
	manager.activeID = ""
	manager.runtimeCapabilities = nil
	manager.attempt = 0
	manager.err = nil
	manager.cancel = cancel
	manager.done = make(chan struct{})
	go manager.run(ctx, sink, manager.generation, manager.done)
	return nil
}

// Stop is idempotent. It cancels detection, backoff or Run and waits until the
// owned goroutine has returned, or until ctx expires.
func (manager *DriverManager[T]) Stop(ctx context.Context) error {
	if ctx == nil {
		return fmt.Errorf("stop driver manager: nil context")
	}
	manager.mu.Lock()
	if !manager.running {
		manager.mu.Unlock()
		return nil
	}
	manager.state = driver.StateStopping
	cancel := manager.cancel
	done := manager.done
	generation := manager.generation
	manager.mu.Unlock()

	cancel()
	select {
	case <-done:
		manager.completeStop(generation, done)
		return nil
	case <-ctx.Done():
		return fmt.Errorf("stop driver manager: %w", ctx.Err())
	}
}

func (manager *DriverManager[T]) Status() DriverStatus {
	manager.mu.RLock()
	active := manager.active
	generation := manager.generation
	status := manager.statusLocked()
	manager.mu.RUnlock()

	if active == nil || status.State == driver.StateStopping || status.State == driver.StateError {
		return status
	}

	// RuntimeSnapshot is external driver code and may block briefly; never call
	// it while holding the manager mutex.
	runtime := active.RuntimeSnapshot()
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.generation == generation && manager.active == active {
		manager.applyRuntimeSnapshot(runtime)
	}
	return manager.statusLocked()
}

func (manager *DriverManager[T]) run(ctx context.Context, sink driver.ObservationSink[T], generation uint64, done chan<- struct{}) {
	defer func() {
		manager.finishRun(generation)
		close(done)
	}()

	for {
		candidate, found, detectErr, terminalDetection := manager.detect(ctx)
		if ctx.Err() != nil {
			return
		}
		if !found {
			if terminalDetection {
				manager.setTerminal(detectErr)
				return
			}
			manager.setWaitingDetection(detectErr)
			if err := manager.config.Retry.Wait(ctx, manager.backoffDelay(0)); err != nil {
				return
			}
			continue
		}

		instance, err := candidate.New()
		if err != nil {
			manager.setTerminal(fmt.Errorf("construct driver %q: %w", candidate.Descriptor.ID, err))
			return
		}
		if instance == nil {
			manager.setTerminal(fmt.Errorf("construct driver %q: returned nil", candidate.Descriptor.ID))
			return
		}
		manager.setActive(candidate.Descriptor.ID, instance)
		runErr := instance.Run(ctx, sink)
		if ctx.Err() != nil {
			manager.clearActive()
			return
		}
		if runErr == nil {
			runErr = errors.New("driver Run returned without cancellation")
		}
		if candidate.Retryable == nil || !candidate.Retryable(runErr) {
			manager.setTerminal(fmt.Errorf("run driver %q: %w", candidate.Descriptor.ID, runErr))
			return
		}

		attempt := manager.recordTransient(runErr)
		if attempt > manager.config.Retry.MaxReconnects {
			manager.setTerminal(errors.Join(ErrReconnectExhausted, runErr))
			return
		}
		if err := manager.config.Retry.Wait(ctx, manager.backoffDelay(attempt-1)); err != nil {
			return
		}
	}
}

func (manager *DriverManager[T]) finishRun(generation uint64) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.generation != generation {
		return
	}
	manager.active = nil
	manager.activeID = ""
	manager.runtimeCapabilities = nil
	switch manager.state {
	case driver.StateError, driver.StateStopping:
		// Error remains observable until an explicit Stop acknowledges it.
		// Stop owns the final transition when cancellation was requested.
		return
	default:
		manager.state = driver.StateStopped
		manager.err = nil
		manager.running = false
	}
}

func (manager *DriverManager[T]) completeStop(generation uint64, done <-chan struct{}) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.generation != generation || manager.done != done {
		return
	}
	manager.running = false
	manager.state = driver.StateStopped
	manager.active = nil
	manager.activeID = ""
	manager.runtimeCapabilities = nil
	manager.attempt = 0
	manager.err = nil
	manager.cancel = nil
	manager.done = nil
}

func (manager *DriverManager[T]) statusLocked() DriverStatus {
	return DriverStatus{
		State:            manager.state,
		ActiveID:         manager.activeID,
		Capabilities:     append([]driver.Capability(nil), manager.runtimeCapabilities...),
		ReconnectAttempt: manager.attempt,
		Err:              manager.err,
	}
}

func (manager *DriverManager[T]) applyRuntimeSnapshot(runtime driver.RuntimeSnapshot) {
	manager.runtimeCapabilities = append(manager.runtimeCapabilities[:0], runtime.Capabilities...)
	if runtime.State == manager.state {
		return
	}
	if runtime.State.Known() && manager.state.CanTransitionTo(runtime.State) {
		manager.state = runtime.State
		if errors.Is(manager.err, ErrInvalidDriverTransition) {
			manager.err = nil
		}
		return
	}
	from := manager.state
	manager.state = driver.StateDegraded
	manager.err = fmt.Errorf("%w: %s -> %s", ErrInvalidDriverTransition, from, runtime.State)
}

func (manager *DriverManager[T]) detect(ctx context.Context) (DriverCandidate[T], bool, error, bool) {
	ordered := manager.orderedCandidates()
	var lastErr error
	terminal := false
	for _, candidate := range ordered {
		available, err := candidate.Detect(ctx)
		if err != nil {
			lastErr = errors.Join(lastErr, fmt.Errorf("detect driver %q: %w", candidate.Descriptor.ID, err))
			if candidate.DetectionRetryable == nil || !candidate.DetectionRetryable(err) {
				terminal = true
			}
			continue
		}
		if available {
			return candidate, true, lastErr, false
		}
		if ctx.Err() != nil {
			return DriverCandidate[T]{}, false, ctx.Err(), false
		}
	}
	return DriverCandidate[T]{}, false, lastErr, terminal
}

func (manager *DriverManager[T]) orderedCandidates() []DriverCandidate[T] {
	ordered := append([]DriverCandidate[T](nil), manager.candidates...)
	preferred := manager.config.Preferred
	if preferred == "" {
		return ordered
	}
	for i := range ordered {
		if ordered[i].Descriptor.ID == preferred {
			copy(ordered[1:i+1], ordered[0:i])
			ordered[0] = manager.candidates[i]
			break
		}
	}
	return ordered
}

func (manager *DriverManager[T]) setWaitingDetection(err error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state = driver.StateDetecting
	manager.active = nil
	manager.activeID = ""
	manager.runtimeCapabilities = nil
	manager.err = err
}

func (manager *DriverManager[T]) setActive(id driver.ID, active Driver[T]) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state = driver.StateConnecting
	manager.activeID = id
	manager.active = active
	manager.runtimeCapabilities = nil
	manager.err = nil
}

func (manager *DriverManager[T]) clearActive() {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.active = nil
	manager.activeID = ""
	manager.runtimeCapabilities = nil
}

func (manager *DriverManager[T]) recordTransient(err error) int {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.active = nil
	manager.activeID = ""
	manager.runtimeCapabilities = nil
	manager.attempt++
	manager.state = driver.StateStale
	manager.err = err
	return manager.attempt
}

func (manager *DriverManager[T]) setTerminal(err error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state = driver.StateError
	manager.active = nil
	manager.activeID = ""
	manager.runtimeCapabilities = nil
	manager.err = err
}

func (manager *DriverManager[T]) backoffDelay(exponent int) time.Duration {
	delay := manager.config.Retry.InitialBackoff
	for i := 0; i < exponent && delay < manager.config.Retry.MaxBackoff; i++ {
		if delay > manager.config.Retry.MaxBackoff/2 {
			delay = manager.config.Retry.MaxBackoff
			break
		}
		delay *= 2
	}
	if delay > manager.config.Retry.MaxBackoff {
		delay = manager.config.Retry.MaxBackoff
	}
	delay = manager.config.Retry.Jitter(delay)
	if delay < 0 {
		return 0
	}
	if delay > manager.config.Retry.MaxBackoff {
		return manager.config.Retry.MaxBackoff
	}
	return delay
}

func normalizedRetryPolicy(policy RetryPolicy) RetryPolicy {
	if policy.MaxReconnects < 0 {
		policy.MaxReconnects = 0
	}
	if policy.InitialBackoff <= 0 {
		policy.InitialBackoff = 250 * time.Millisecond
	}
	if policy.MaxBackoff <= 0 {
		policy.MaxBackoff = 5 * time.Second
	}
	if policy.InitialBackoff > policy.MaxBackoff {
		policy.InitialBackoff = policy.MaxBackoff
	}
	if policy.Jitter == nil {
		policy.Jitter = defaultJitter
	}
	if policy.Wait == nil {
		policy.Wait = waitWithTimer
	}
	return policy
}

func defaultJitter(delay time.Duration) time.Duration {
	window := delay / 10
	if window == 0 {
		return delay
	}
	return delay - window + time.Duration(rand.Int64N(int64(2*window+1)))
}

func waitWithTimer(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func cloneDescriptor(descriptor driver.Descriptor) driver.Descriptor {
	descriptor.Capabilities = append([]driver.Capability(nil), descriptor.Capabilities...)
	return descriptor
}
