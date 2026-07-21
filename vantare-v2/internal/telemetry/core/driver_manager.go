package core

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

var (
	ErrManagerAlreadyStarted = errors.New("telemetry driver manager already started")
	ErrReconnectExhausted    = errors.New("telemetry driver reconnect attempts exhausted")
	ErrInvalidDriverCatalog  = errors.New("invalid telemetry driver catalog")
)

// DriverCandidate binds static support metadata to cancelable detection and a
// constructor. Retryable must explicitly classify transient Run failures;
// nil means every failure is terminal.
type DriverCandidate[T any] struct {
	Descriptor driver.Descriptor
	Detect     func(context.Context) (bool, error)
	New        func() (Driver[T], error)
	Retryable  func(error) bool
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

	running  bool
	state    driver.State
	active   Driver[T]
	activeID driver.ID
	attempt  int
	err      error
	cancel   context.CancelFunc
	done     chan struct{}
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
	manager.state = driver.StateDetecting
	manager.active = nil
	manager.activeID = ""
	manager.attempt = 0
	manager.err = nil
	manager.cancel = cancel
	manager.done = make(chan struct{})
	go manager.run(ctx, sink, manager.done)
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
	manager.mu.Unlock()

	cancel()
	select {
	case <-done:
		manager.mu.Lock()
		manager.running = false
		manager.state = driver.StateStopped
		manager.active = nil
		manager.activeID = ""
		manager.attempt = 0
		manager.err = nil
		manager.cancel = nil
		manager.done = nil
		manager.mu.Unlock()
		return nil
	case <-ctx.Done():
		return fmt.Errorf("stop driver manager: %w", ctx.Err())
	}
}

func (manager *DriverManager[T]) Status() DriverStatus {
	manager.mu.RLock()
	status := DriverStatus{
		State:            manager.state,
		ActiveID:         manager.activeID,
		ReconnectAttempt: manager.attempt,
		Err:              manager.err,
	}
	active := manager.active
	if active != nil {
		for _, candidate := range manager.candidates {
			if candidate.Descriptor.ID == manager.activeID {
				status.Capabilities = append([]driver.Capability(nil), candidate.Descriptor.Capabilities...)
				break
			}
		}
	}
	manager.mu.RUnlock()

	if active != nil && status.State != driver.StateStopping && status.State != driver.StateError {
		if current := active.State(); current.Known() && current != driver.StateStopped {
			status.State = current
		}
	}
	return status
}

func (manager *DriverManager[T]) run(ctx context.Context, sink driver.ObservationSink[T], done chan<- struct{}) {
	defer close(done)

	for {
		candidate, found, detectErr := manager.detect(ctx)
		if ctx.Err() != nil {
			return
		}
		if !found {
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
		manager.clearActive()
		if ctx.Err() != nil {
			return
		}
		if runErr == nil {
			runErr = errors.New("driver Run returned without cancellation")
		}
		if candidate.Retryable == nil || !candidate.Retryable(runErr) {
			manager.setTerminal(fmt.Errorf("run driver %q: %w", candidate.Descriptor.ID, runErr))
			return
		}

		attempt := manager.incrementAttempt()
		if attempt > manager.config.Retry.MaxReconnects {
			manager.setTerminal(errors.Join(ErrReconnectExhausted, runErr))
			return
		}
		manager.setStale(runErr)
		if err := manager.config.Retry.Wait(ctx, manager.backoffDelay(attempt-1)); err != nil {
			return
		}
	}
}

func (manager *DriverManager[T]) detect(ctx context.Context) (DriverCandidate[T], bool, error) {
	ordered := manager.orderedCandidates()
	var lastErr error
	for _, candidate := range ordered {
		available, err := candidate.Detect(ctx)
		if err != nil {
			lastErr = errors.Join(lastErr, fmt.Errorf("detect driver %q: %w", candidate.Descriptor.ID, err))
			continue
		}
		if available {
			return candidate, true, lastErr
		}
		if ctx.Err() != nil {
			return DriverCandidate[T]{}, false, ctx.Err()
		}
	}
	return DriverCandidate[T]{}, false, lastErr
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
	manager.err = err
}

func (manager *DriverManager[T]) setActive(id driver.ID, active Driver[T]) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state = driver.StateConnecting
	manager.activeID = id
	manager.active = active
	manager.err = nil
}

func (manager *DriverManager[T]) clearActive() {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.active = nil
	manager.activeID = ""
}

func (manager *DriverManager[T]) incrementAttempt() int {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.attempt++
	return manager.attempt
}

func (manager *DriverManager[T]) setStale(err error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state = driver.StateStale
	manager.err = err
}

func (manager *DriverManager[T]) setTerminal(err error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.state = driver.StateError
	manager.active = nil
	manager.activeID = ""
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
		policy.Jitter = func(delay time.Duration) time.Duration { return delay }
	}
	if policy.Wait == nil {
		policy.Wait = waitWithTimer
	}
	return policy
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
