package core

import (
	"context"
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

// ErrInvalidSimulatorRegistration reports a registration without the pieces a
// simulator needs to reach the canonical pipeline.
var ErrInvalidSimulatorRegistration = errors.New("invalid telemetry simulator registration")

// ObservationMapper turns one driver-shaped observation into canonical
// batches. It is the seam that lets the composition root stay generic: the
// mapper is the only component that knows the observation type, and it is
// injected, never named by the runtime.
type ObservationMapper[T any] interface {
	WriteObservation(ctx context.Context, observation T, sink BatchSink) error
}

// MapperMetrics is the simulator-neutral subset of mapper counters the
// composition root publishes. A driver whose mapper has no slot generations
// simply reports zeros.
type MapperMetrics struct {
	SlotGraceReopen     uint64
	SlotGenerationBumps uint64
}

// SimulatorHooks are the composition root's counters. They are called on the
// driver goroutine and must not block.
type SimulatorHooks struct {
	// ObservationReceived is called once per observation handed to the mapper.
	ObservationReceived func()
	// ObservationRejected is called when the mapper refuses an observation.
	// Unmappable distinguishes a frame that does not yet describe a coherent
	// session -- a garage screen, a session change -- from a real failure.
	ObservationRejected func(err error, unmappable bool)
}

// SimulatorRuntime erases the observation type of one registered simulator so
// that the composition root holds no simulator-specific generic parameter.
type SimulatorRuntime interface {
	// Start detects a candidate and streams canonical batches into sink.
	Start(ctx context.Context, sink BatchSink, hooks SimulatorHooks) error
	Stop(ctx context.Context) error
	Status() DriverStatus
	Supported() []driver.Descriptor
	MapperMetrics() MapperMetrics
	// Unmappable classifies a mapping error as a frame that cannot yet be
	// mapped rather than a driver failure. It replaces the driver-specific
	// predicate the composition root used to call by name.
	Unmappable(err error) bool
}

// SimulatorRegistration is everything one simulator contributes to the
// canonical pipeline. It is generic over the observation type; the constructed
// SimulatorRuntime is not.
type SimulatorRegistration[T any] struct {
	Candidates []DriverCandidate[T]
	Manager    ManagerConfig
	Mapper     ObservationMapper[T]
	// Metrics reports the mapper counters. Nil reports zeros.
	Metrics func() MapperMetrics
	// Unmappable classifies mapping errors. Nil treats every error as fatal.
	Unmappable func(error) bool
}

type simulatorRuntime[T any] struct {
	manager    *DriverManager[T]
	mapper     ObservationMapper[T]
	metrics    func() MapperMetrics
	unmappable func(error) bool
}

// NewSimulatorRuntime builds the type-erased runtime of one simulator.
func NewSimulatorRuntime[T any](registration SimulatorRegistration[T]) (SimulatorRuntime, error) {
	if registration.Mapper == nil {
		return nil, fmt.Errorf("%w: observation mapper is required", ErrInvalidSimulatorRegistration)
	}
	manager, err := NewDriverManager(registration.Candidates, registration.Manager)
	if err != nil {
		return nil, err
	}
	return &simulatorRuntime[T]{
		manager:    manager,
		mapper:     registration.Mapper,
		metrics:    registration.Metrics,
		unmappable: registration.Unmappable,
	}, nil
}

func (runtime *simulatorRuntime[T]) Start(ctx context.Context, sink BatchSink, hooks SimulatorHooks) error {
	return runtime.manager.Start(ctx, NewObservationBridge(runtime.mapper, runtime.unmappable, sink, hooks))
}

// NewObservationBridge returns the observation sink that maps one driver's
// observations into canonical batches and applies the unmappable-frame policy.
// NewSimulatorRuntime wires it internally; it is exported because that policy
// is worth exercising without starting a driver.
func NewObservationBridge[T any](
	mapper ObservationMapper[T],
	unmappable func(error) bool,
	sink BatchSink,
	hooks SimulatorHooks,
) driver.ObservationSink[T] {
	return observationBridge[T]{mapper: mapper, unmappable: unmappable, sink: sink, hooks: hooks}
}

func (runtime *simulatorRuntime[T]) Stop(ctx context.Context) error { return runtime.manager.Stop(ctx) }

func (runtime *simulatorRuntime[T]) Status() DriverStatus { return runtime.manager.Status() }

func (runtime *simulatorRuntime[T]) Supported() []driver.Descriptor {
	return runtime.manager.Supported()
}

func (runtime *simulatorRuntime[T]) MapperMetrics() MapperMetrics {
	if runtime.metrics == nil {
		return MapperMetrics{}
	}
	return runtime.metrics()
}

func (runtime *simulatorRuntime[T]) Unmappable(err error) bool {
	if err == nil || runtime.unmappable == nil {
		return false
	}
	return runtime.unmappable(err)
}

type observationBridge[T any] struct {
	mapper     ObservationMapper[T]
	unmappable func(error) bool
	sink       BatchSink
	hooks      SimulatorHooks
}

func (bridge observationBridge[T]) unmappableFrame(err error) bool {
	return err != nil && bridge.unmappable != nil && bridge.unmappable(err)
}

func (bridge observationBridge[T]) WriteObservation(ctx context.Context, observation T) error {
	if bridge.hooks.ObservationReceived != nil {
		bridge.hooks.ObservationReceived()
	}
	err := bridge.mapper.WriteObservation(ctx, observation, bridge.sink)
	if err == nil {
		return nil
	}
	unmappable := bridge.unmappableFrame(err)
	if bridge.hooks.ObservationRejected != nil {
		bridge.hooks.ObservationRejected(err, unmappable)
	}
	// A frame that does not yet describe a coherent session -- pits, loading
	// screens, session changes -- is counted as rejected but never propagated:
	// DriverManager would classify it as a non-retryable failure and switch the
	// telemetry off until the application restarts.
	if unmappable {
		return nil
	}
	return err
}
