package core

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

var (
	ErrInvalidInitialCursor  = errors.New("first telemetry batch must have a non-zero epoch and sequence one")
	ErrStaleBatch            = errors.New("telemetry batch is duplicate or out of order")
	ErrSequenceGap           = errors.New("telemetry batch has a sequence gap")
	ErrEpochGap              = errors.New("telemetry batch has an epoch gap")
	ErrInvalidEpochReset     = errors.New("new telemetry epoch must start at sequence one")
	ErrDuplicateVehicle      = errors.New("telemetry batch contains a duplicate vehicle identity")
	ErrMissingVehicleID      = errors.New("telemetry batch contains an empty vehicle identity")
	ErrVehicleRunMismatch    = errors.New("telemetry vehicle identity does not belong to the batch run")
	ErrVehicleCountMismatch  = errors.New("telemetry vehicle count does not match the complete batch")
	ErrIncompleteRunIdentity = errors.New("telemetry batch requires complete event and session identity")
	ErrRunIdentityChanged    = errors.New("telemetry event, session, or vehicle changed without an epoch reset")
	ErrReducerRunning        = errors.New("telemetry reducer already has an active owner")
)

// VehicleState is the observed, product-neutral state of one vehicle. Every
// field uses the canonical schema contracts, including explicit presence and
// freshness; zero values are never interpreted as absence.
type VehicleState struct {
	Identity      identity.RunIdentity
	Name          schema.Field[vehicle.VehicleName]
	LapNumber     schema.Field[session.LapNumber]
	Gear          schema.Field[vehicle.Gear]
	EngineRPM     schema.Field[vehicle.EngineRPM]
	SpeedMPS      schema.Field[float64]
	Throttle      schema.Field[schema.Ratio]
	Brake         schema.Field[schema.Ratio]
	Clutch        schema.Field[schema.Ratio]
	Position      schema.Field[standings.Position]
	CompletedLaps schema.Field[standings.CompletedLaps]
	InPit         schema.Field[pit.InPit]
	PitStopCount  schema.Field[pit.StopCount]
}

// ObservedState is the complete state replaced by one atomic batch. The
// catalog remains outside the runtime hot path by architecture; these typed
// fields are the runtime counterparts of its canonical signal definitions.
type ObservedState struct {
	SourceTime    schema.Field[time.Duration]
	TrackName     schema.Field[string]
	SessionType   schema.Field[session.Type]
	VehicleCount  schema.Field[schema.Count]
	PlayerPresent schema.Field[bool]
	Vehicles      []VehicleState
}

// Batch carries one complete observed state and its canonical ordering header.
// A rejected batch never changes reducer state or cursor.
type Batch struct {
	Header envelope.Header
	State  ObservedState
}

// Reducer has one active Run owner at a time. It performs no I/O, starts no
// goroutines and publishes only snapshots that own all mutable collections.
type Reducer struct {
	running atomic.Bool

	mu          sync.RWMutex
	initialized bool
	header      envelope.Header
	state       ObservedState
}

func NewReducer() *Reducer {
	return &Reducer{}
}

// Apply is the synchronous harness entry point. It cannot be used while Run
// owns the reducer.
func (reducer *Reducer) Apply(batch Batch) (envelope.Snapshot[ObservedState], error) {
	if !reducer.running.CompareAndSwap(false, true) {
		return envelope.Snapshot[ObservedState]{}, ErrReducerRunning
	}
	defer reducer.running.Store(false)
	return reducer.apply(batch)
}

func (reducer *Reducer) apply(batch Batch) (envelope.Snapshot[ObservedState], error) {
	reducer.mu.Lock()
	defer reducer.mu.Unlock()

	if err := validateBatchHeader(reducer.header, reducer.initialized, batch.Header); err != nil {
		return envelope.Snapshot[ObservedState]{}, err
	}
	if err := validateObservedState(batch.Header.Identity, batch.State); err != nil {
		return envelope.Snapshot[ObservedState]{}, err
	}

	owned := cloneObservedState(batch.State)
	snapshot, err := envelope.NewSnapshot(batch.Header, owned, cloneObservedState)
	if err != nil {
		return envelope.Snapshot[ObservedState]{}, fmt.Errorf("create owned telemetry snapshot: %w", err)
	}

	reducer.header = batch.Header
	reducer.state = owned
	reducer.initialized = true
	return snapshot, nil
}

// Current returns an owned copy of the latest accepted snapshot.
func (reducer *Reducer) Current() (envelope.Snapshot[ObservedState], bool) {
	reducer.mu.RLock()
	defer reducer.mu.RUnlock()
	if !reducer.initialized {
		return envelope.Snapshot[ObservedState]{}, false
	}
	snapshot, err := envelope.NewSnapshot(reducer.header, reducer.state, cloneObservedState)
	if err != nil {
		return envelope.Snapshot[ObservedState]{}, false
	}
	return snapshot, true
}

// Run synchronously owns the reducer until input closes, cancellation, or the
// first rejected batch. It does not close caller-owned channels.
func (reducer *Reducer) Run(
	ctx context.Context,
	batches <-chan Batch,
	snapshots chan<- envelope.Snapshot[ObservedState],
) error {
	if !reducer.running.CompareAndSwap(false, true) {
		return ErrReducerRunning
	}
	defer reducer.running.Store(false)

	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case batch, ok := <-batches:
			if !ok {
				return nil
			}
			if err := ctx.Err(); err != nil {
				return err
			}
			snapshot, err := reducer.apply(batch)
			if err != nil {
				return fmt.Errorf("apply telemetry batch: %w", err)
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case snapshots <- snapshot:
			}
		}
	}
}

func (reducer *Reducer) Running() bool {
	return reducer.running.Load()
}

func validateBatchHeader(current envelope.Header, initialized bool, next envelope.Header) error {
	if !next.Identity.SessionKnown() {
		return ErrIncompleteRunIdentity
	}
	if err := validateCursor(current.Cursor, initialized, next.Cursor); err != nil {
		return err
	}
	if initialized && next.Cursor.Epoch == current.Cursor.Epoch &&
		!current.Identity.SameRun(next.Identity) {
		return ErrRunIdentityChanged
	}
	return nil
}

func validateCursor(current schema.Cursor, initialized bool, next schema.Cursor) error {
	if !initialized {
		if next.Epoch == 0 || next.Sequence != 1 {
			return ErrInvalidInitialCursor
		}
		return nil
	}
	if next.Epoch < current.Epoch || (next.Epoch == current.Epoch && next.Sequence <= current.Sequence) {
		return ErrStaleBatch
	}
	if next.Epoch == current.Epoch {
		if next.Sequence != current.Sequence+1 {
			return ErrSequenceGap
		}
		return nil
	}
	if next.Epoch != current.Epoch+1 {
		return ErrEpochGap
	}
	if next.Sequence != 1 {
		return ErrInvalidEpochReset
	}
	return nil
}

func validateObservedState(run identity.RunIdentity, state ObservedState) error {
	if count, present := state.VehicleCount.Value(); present &&
		state.VehicleCount.Freshness() != schema.FreshnessInvalid &&
		int(count) != len(state.Vehicles) {
		return ErrVehicleCountMismatch
	}
	vehicles := make(map[identity.VehicleID]struct{}, len(state.Vehicles))
	for _, current := range state.Vehicles {
		id := current.Identity.Vehicle
		if id == "" {
			return ErrMissingVehicleID
		}
		if stateIdentityMismatch(current.Identity, run) {
			return ErrVehicleRunMismatch
		}
		if _, exists := vehicles[id]; exists {
			return ErrDuplicateVehicle
		}
		vehicles[id] = struct{}{}
	}
	return nil
}

func stateIdentityMismatch(current, run identity.RunIdentity) bool {
	return run.Event != "" && run.Session != "" &&
		(current.Event != run.Event || current.Session != run.Session)
}

func cloneObservedState(state ObservedState) ObservedState {
	result := state
	result.Vehicles = append([]VehicleState(nil), state.Vehicles...)
	return result
}
