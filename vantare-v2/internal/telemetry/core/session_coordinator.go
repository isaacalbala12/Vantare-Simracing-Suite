package core

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

var (
	ErrCoordinatorRunning    = errors.New("telemetry session coordinator already has an active owner")
	ErrFactBatchOverflow     = errors.New("telemetry fact batch exceeds configured limit")
	ErrFactSequenceExhausted = errors.New("telemetry fact sequence exhausted")
)

type FactKind uint8

const (
	FactSessionStarted FactKind = iota + 1
	FactSessionEnded
	FactLapCompleted
	FactPitEntered
	FactPitExited
	FactDriverChanged
	FactConnectionLost
	FactConnectionRecovered
)

func (kind FactKind) Known() bool {
	return kind >= FactSessionStarted && kind <= FactConnectionRecovered
}

type FactSequence uint64

// SessionFact is a discrete, value-semantic occurrence. Sequence orders facts
// independently from latest-wins snapshot cursors. PreviousIdentity is set for
// identity transitions; Lap is set only for FactLapCompleted.
type SessionFact struct {
	Sequence         FactSequence
	Kind             FactKind
	OccurredUTC      time.Time
	Identity         identity.RunIdentity
	PreviousIdentity identity.RunIdentity
	Lap              session.LapNumber
}

// FactBatchSink either accepts the complete ordered batch or returns an error.
// ErrBackpressure and ErrClosed remain inspectable through wrapping. Partial
// acceptance is outside this port contract, preventing silent loss or replay
// ambiguity when a caller retries the same snapshot.
type FactBatchSink interface {
	WriteFacts(context.Context, []envelope.Fact[SessionFact]) error
}

type SessionCoordinatorConfig struct {
	Now          func() time.Time
	MaxFactBatch int
}

type coordinatorVehicle struct {
	identity      identity.RunIdentity
	completedLaps standings.CompletedLaps
	hasLaps       bool
	inPit         bool
	hasPit        bool
}

type coordinatorState struct {
	initialized     bool
	header          envelope.Header
	connected       bool
	connectionKnown bool
	vehicles        map[identity.VehicleID]coordinatorVehicle
	factSequence    FactSequence
}

// SessionCoordinator is a synchronous, single-owner state machine. It performs
// no I/O except the caller-provided loss-intolerant fact port and starts no
// goroutines. A failed fact write leaves all coordinator state unchanged.
type SessionCoordinator struct {
	running  atomic.Bool
	mu       sync.RWMutex
	now      func() time.Time
	maxFacts int
	state    coordinatorState
}

func NewSessionCoordinator(config SessionCoordinatorConfig) *SessionCoordinator {
	now := config.Now
	if now == nil {
		now = time.Now
	}
	maxFacts := config.MaxFactBatch
	if maxFacts <= 0 {
		maxFacts = 256
	}
	return &SessionCoordinator{now: now, maxFacts: maxFacts}
}

func (coordinator *SessionCoordinator) Apply(
	ctx context.Context,
	snapshot envelope.Snapshot[ObservedState],
	sink FactBatchSink,
) error {
	if !coordinator.running.CompareAndSwap(false, true) {
		return ErrCoordinatorRunning
	}
	defer coordinator.running.Store(false)
	if err := ctx.Err(); err != nil {
		return err
	}
	if sink == nil {
		return fmt.Errorf("write session facts: %w", ErrClosed)
	}

	header := snapshot.Header()
	value, ok := snapshot.Value()
	if !ok {
		return envelope.ErrCloneRequired
	}
	header = coordinatorHeader(header, value)
	if err := validateObservedState(header.Identity, value); err != nil {
		return err
	}

	coordinator.mu.RLock()
	if err := validateBatchHeader(coordinator.state.header, coordinator.state.initialized, header); err != nil {
		coordinator.mu.RUnlock()
		return err
	}
	next := cloneCoordinatorState(coordinator.state)
	coordinator.mu.RUnlock()

	facts, err := coordinator.applySnapshot(&next, header, value)
	if err != nil {
		return err
	}
	if err := coordinator.publish(ctx, sink, header, &next, facts); err != nil {
		return err
	}
	coordinator.mu.Lock()
	coordinator.state = next
	coordinator.mu.Unlock()
	return nil
}

// SetConnected emits connection lifecycle facts against the latest accepted
// snapshot. Brief disconnect/recovery never changes epoch or session identity.
func (coordinator *SessionCoordinator) SetConnected(
	ctx context.Context,
	connected bool,
	sink FactBatchSink,
) error {
	if !coordinator.running.CompareAndSwap(false, true) {
		return ErrCoordinatorRunning
	}
	defer coordinator.running.Store(false)
	if err := ctx.Err(); err != nil {
		return err
	}
	if sink == nil {
		return fmt.Errorf("write connection fact: %w", ErrClosed)
	}

	coordinator.mu.RLock()
	if !coordinator.state.initialized {
		coordinator.mu.RUnlock()
		return ErrInvalidInitialCursor
	}
	if coordinator.state.connectionKnown && coordinator.state.connected == connected {
		coordinator.mu.RUnlock()
		return nil
	}

	next := cloneCoordinatorState(coordinator.state)
	coordinator.mu.RUnlock()
	next.connectionKnown = true
	next.connected = connected
	kind := FactConnectionLost
	if connected {
		kind = FactConnectionRecovered
	}
	events := []SessionFact{{
		Kind:        kind,
		OccurredUTC: coordinator.now().Round(0).UTC(),
		Identity:    next.header.Identity,
	}}
	if err := coordinator.publish(ctx, sink, next.header, &next, events); err != nil {
		return err
	}
	coordinator.mu.Lock()
	coordinator.state = next
	coordinator.mu.Unlock()
	return nil
}

func (coordinator *SessionCoordinator) Current() (envelope.Header, FactSequence, bool) {
	coordinator.mu.RLock()
	defer coordinator.mu.RUnlock()
	return coordinator.state.header, coordinator.state.factSequence, coordinator.state.initialized
}

func (coordinator *SessionCoordinator) applySnapshot(
	next *coordinatorState,
	header envelope.Header,
	state ObservedState,
) ([]SessionFact, error) {
	now := coordinator.now().Round(0).UTC()
	facts := make([]SessionFact, 0, 4)
	previousHeader := next.header
	previousVehicles := next.vehicles

	if !next.initialized {
		facts = append(facts, SessionFact{Kind: FactSessionStarted, OccurredUTC: now, Identity: header.Identity})
		previousVehicles = nil
	} else if !previousHeader.Identity.SameSession(header.Identity) {
		facts = append(facts,
			SessionFact{Kind: FactSessionEnded, OccurredUTC: now, Identity: previousHeader.Identity},
			SessionFact{Kind: FactSessionStarted, OccurredUTC: now, Identity: header.Identity, PreviousIdentity: previousHeader.Identity},
		)
		previousVehicles = nil
	} else if previousHeader.Identity.Vehicle != header.Identity.Vehicle {
		// A car/run reset is distinct from a session reset.
		previousVehicles = nil
	}

	updatedVehicles := make(map[identity.VehicleID]coordinatorVehicle, len(state.Vehicles))
	for _, vehicle := range state.Vehicles {
		previous, exists := previousVehicles[vehicle.Identity.Vehicle]
		current := coordinatorVehicle{identity: vehicle.Identity}

		if exists && (previous.identity.Driver != vehicle.Identity.Driver || previous.identity.Team != vehicle.Identity.Team) {
			facts = append(facts, SessionFact{
				Kind:             FactDriverChanged,
				OccurredUTC:      now,
				Identity:         vehicle.Identity,
				PreviousIdentity: previous.identity,
			})
		}

		if laps, present := usableField(vehicle.CompletedLaps); present {
			current.completedLaps, current.hasLaps = laps, true
			if exists && previous.hasLaps {
				if laps < previous.completedLaps {
					// A same-session source regression cannot revoke an
					// already emitted fact. Preserve the high-water mark.
					current.completedLaps = previous.completedLaps
				} else {
					for completed := previous.completedLaps + 1; completed <= laps; completed++ {
						facts = append(facts, SessionFact{
							Kind:        FactLapCompleted,
							OccurredUTC: now,
							Identity:    vehicle.Identity,
							Lap:         session.LapNumber(completed),
						})
						if len(facts) > coordinator.maxFacts {
							return nil, ErrFactBatchOverflow
						}
					}
				}
			}
		} else if exists {
			current.completedLaps, current.hasLaps = previous.completedLaps, previous.hasLaps
		}

		if inPit, present := usableField(vehicle.InPit); present {
			current.inPit, current.hasPit = inPit, true
			if exists && previous.hasPit && inPit != previous.inPit {
				kind := FactPitExited
				if inPit {
					kind = FactPitEntered
				}
				facts = append(facts, SessionFact{
					Kind:             kind,
					OccurredUTC:      now,
					Identity:         vehicle.Identity,
					PreviousIdentity: previous.identity,
				})
			}
		} else if exists {
			current.inPit, current.hasPit = previous.inPit, previous.hasPit
		}
		updatedVehicles[vehicle.Identity.Vehicle] = current
		if len(facts) > coordinator.maxFacts {
			return nil, ErrFactBatchOverflow
		}
	}

	next.initialized = true
	next.header = header
	next.vehicles = updatedVehicles
	if !next.connectionKnown {
		next.connectionKnown = true
		next.connected = true
	}
	return facts, nil
}

func coordinatorHeader(header envelope.Header, state ObservedState) envelope.Header {
	if header.Identity.Vehicle == "" {
		return header
	}
	for _, vehicle := range state.Vehicles {
		if vehicle.Identity.Vehicle == header.Identity.Vehicle {
			header.Identity.Team = vehicle.Identity.Team
			header.Identity.Driver = vehicle.Identity.Driver
			return header
		}
	}
	return header
}

func (coordinator *SessionCoordinator) publish(
	ctx context.Context,
	sink FactBatchSink,
	header envelope.Header,
	next *coordinatorState,
	values []SessionFact,
) error {
	if len(values) == 0 {
		return nil
	}
	if len(values) > coordinator.maxFacts {
		return ErrFactBatchOverflow
	}
	if uint64(next.factSequence) > math.MaxUint64-uint64(len(values)) {
		return ErrFactSequenceExhausted
	}
	facts := make([]envelope.Fact[SessionFact], len(values))
	for index := range values {
		values[index].Sequence = next.factSequence + FactSequence(index) + 1
		facts[index] = envelope.NewFact(header, values[index])
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := sink.WriteFacts(ctx, facts); err != nil {
		return fmt.Errorf("write ordered telemetry facts: %w", err)
	}
	next.factSequence += FactSequence(len(values))
	return nil
}

func cloneCoordinatorState(state coordinatorState) coordinatorState {
	result := state
	if state.vehicles != nil {
		result.vehicles = make(map[identity.VehicleID]coordinatorVehicle, len(state.vehicles))
		for id, vehicle := range state.vehicles {
			result.vehicles[id] = vehicle
		}
	}
	return result
}

func usableField[T comparable](field schema.Field[T]) (T, bool) {
	value, present := field.Value()
	return value, present && field.Freshness() != schema.FreshnessInvalid
}
