package simx

import (
	"context"
	"sync"
	"time"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
)

// Config configures the synthetic driver. Every time source is injected so the
// driver is deterministic and never touches the wall clock in tests.
type Config struct {
	// Epoch anchors the reported UTC clock.
	Epoch time.Time
	// Interval is the emission period. Values <= 0 use TickInterval.
	Interval time.Duration
	// Frames bounds the run. Zero runs until the context is cancelled.
	Frames uint64
	// BoundaryEvery opens a new session every N frames. Zero never does.
	BoundaryEvery uint64
	// Wait paces the loop. Nil uses a timer; tests inject an instant pacer so
	// no test sleeps.
	Wait func(ctx context.Context, delay time.Duration) error
}

// Driver is the synthetic simulator driver.
type Driver struct {
	config Config

	mu     sync.RWMutex
	state  drivercontract.State
	frames uint64
}

// New builds a stopped synthetic driver.
func New(config Config) *Driver {
	if config.Interval <= 0 {
		config.Interval = TickInterval
	}
	if config.Wait == nil {
		config.Wait = waitTimer
	}
	return &Driver{config: config, state: drivercontract.StateStopped}
}

// RuntimeSnapshot reports the current health. The synthetic source is always
// complete, so the capability list never shrinks.
func (driver *Driver) RuntimeSnapshot() drivercontract.RuntimeSnapshot {
	driver.mu.RLock()
	defer driver.mu.RUnlock()
	return drivercontract.RuntimeSnapshot{
		State:        driver.state,
		Capabilities: []drivercontract.Capability{CapabilitySynthetic},
	}
}

// Frames reports how many observations the driver has emitted.
func (driver *Driver) Frames() uint64 {
	driver.mu.RLock()
	defer driver.mu.RUnlock()
	return driver.frames
}

// Run streams synthetic observations until the frame budget is spent or the
// context is cancelled. Cancellation is the normal stop path and is not an
// error the manager should treat as a failure.
func (driver *Driver) Run(ctx context.Context, sink drivercontract.ObservationSink[Observation]) error {
	if ctx == nil {
		ctx = context.Background()
	}
	driver.setState(drivercontract.StateConnecting)
	reader := NewReader(driver.config.Epoch, driver.config.BoundaryEvery)
	fused := &Fusion{}
	driver.setState(drivercontract.StateLive)
	defer driver.setState(drivercontract.StateStopped)

	for {
		if err := ctx.Err(); err != nil {
			return nil
		}
		if driver.config.Frames > 0 && reader.Frame() >= driver.config.Frames {
			return nil
		}
		raw := reader.Next()
		elapsed := time.Duration(reader.Frame()) * driver.config.Interval
		observation, _ := fused.Merge(elapsed, raw)
		if err := sink.WriteObservation(ctx, observation); err != nil {
			driver.setState(drivercontract.StateError)
			return err
		}
		driver.mu.Lock()
		driver.frames++
		driver.mu.Unlock()
		if err := driver.config.Wait(ctx, driver.config.Interval); err != nil {
			return nil
		}
	}
}

func (driver *Driver) setState(state drivercontract.State) {
	driver.mu.Lock()
	driver.state = state
	driver.mu.Unlock()
}

func waitTimer(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// IsRetryable classifies run failures. The synthetic source cannot fail
// transiently, so nothing is retryable.
func IsRetryable(error) bool { return false }
