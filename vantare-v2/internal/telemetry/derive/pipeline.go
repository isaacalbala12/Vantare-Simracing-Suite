// Package derive owns the deterministic, product-neutral derivation chain.
package derive

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

var (
	ErrInvalidDefinition = errors.New("invalid derivation definition")
	ErrStaleSnapshot     = errors.New("derived pipeline snapshot is duplicate or out of order")
	ErrSequenceGap       = errors.New("derived pipeline snapshot has a sequence gap")
	ErrEpochGap          = errors.New("derived pipeline snapshot has an epoch gap")
	ErrInvalidEpochReset = errors.New("derived pipeline epoch must restart at sequence one")
	ErrIdentityChanged   = errors.New("derived pipeline identity changed without an epoch reset")
)

const MaxControlsHistory = 120

type DerivationID string

const (
	DerivationSessionRemaining DerivationID = "session.remaining"
	DerivationRelativeGaps     DerivationID = "standings.relative-gaps"
	DerivationSelfDelta        DerivationID = "session.self-delta"
	DerivationControlsHistory  DerivationID = "controls.history"
	DerivationFuelUsage        DerivationID = "fuel.per-lap"
)

var canonicalAlgorithmVersions = []AlgorithmVersion{
	{ID: DerivationControlsHistory, Version: 1},
	{ID: DerivationSessionRemaining, Version: 1},
	{ID: DerivationRelativeGaps, Version: 1},
	{ID: DerivationSelfDelta, Version: 1},
	{ID: DerivationFuelUsage, Version: 1},
}

type Availability struct {
	Freshness schema.Freshness
}

type ControlSample struct {
	Cursor schema.Cursor
	// CapturedAt is the envelope reception instant of the batch the sample was
	// taken from, exactly as SelfDeltaSample already records it. Without it the
	// series only has an ordering, and any consumer that draws it against time
	// has to invent a spacing; with it the canonical history carries its own
	// time base and the projection can publish a real window.
	CapturedAt time.Time
	Vehicle    identity.VehicleID
	Throttle   schema.Ratio
	Brake      schema.Ratio
	Clutch     schema.Ratio
}

type ControlHistory struct {
	Freshness schema.Freshness
	Samples   []ControlSample
}

type AlgorithmVersion struct {
	ID      DerivationID
	Version uint32
}

type DerivedState struct {
	SessionRemaining schema.Field[session.RemainingTime]
	Gaps             GapSet
	Delta            SelfDelta
	Fuel             FuelUsage
	ControlsHistory  ControlHistory
	Algorithms       []AlgorithmVersion
}

type FinalState struct {
	Observed core.ObservedState
	Derived  DerivedState
}

type Config struct {
	// MaxControlsHistory can reduce the canonical budget for harnesses. Values
	// outside 1..120 use the canonical maximum and can never widen it.
	MaxControlsHistory int
	// FuelUsageWindow is the number of completed valid laps averaged into
	// DerivedState.Fuel.PerLap. Values outside 1..MaxFuelUsageWindow use
	// DefaultFuelUsageWindow.
	FuelUsageWindow int
}

type Pipeline struct {
	mu sync.RWMutex

	initialized bool
	header      envelope.Header
	state       FinalState
	maxHistory  int
	delta       *selfDeltaTracker
	fuel        *fuelUsageTracker
}

// PipelineCandidate owns a fully derived next state without publishing it.
type PipelineCandidate struct {
	pipeline *Pipeline
	header   envelope.Header
	state    FinalState
	delta    *selfDeltaTracker
	fuel     *fuelUsageTracker
	snapshot envelope.Snapshot[FinalState]
}

func NewPipeline(config Config) *Pipeline {
	limit := config.MaxControlsHistory
	if limit <= 0 || limit > MaxControlsHistory {
		limit = MaxControlsHistory
	}
	return &Pipeline{
		maxHistory: limit,
		delta:      newSelfDeltaTracker(MaxSelfDeltaSamples),
		fuel:       newFuelUsageTracker(config.FuelUsageWindow),
	}
}

// Apply runs the fixed chain synchronously. It performs no I/O and commits the
// new header, history and final snapshot together only after every stage wins.
func (pipeline *Pipeline) Apply(
	ctx context.Context,
	observed envelope.Snapshot[core.ObservedState],
) (envelope.Snapshot[FinalState], error) {
	candidate, err := pipeline.Prepare(ctx, observed)
	if err != nil {
		return envelope.Snapshot[FinalState]{}, err
	}
	pipeline.Commit(candidate)
	return candidate.Snapshot(), nil
}

// Prepare runs the fixed derivation chain without advancing pipeline state.
func (pipeline *Pipeline) Prepare(
	ctx context.Context,
	observed envelope.Snapshot[core.ObservedState],
) (PipelineCandidate, error) {
	if err := ctx.Err(); err != nil {
		return PipelineCandidate{}, err
	}
	observedState, ok := observed.Value()
	if !ok {
		return PipelineCandidate{}, fmt.Errorf("%w: observed snapshot has no owned value", ErrInvalidDefinition)
	}

	pipeline.mu.RLock()
	defer pipeline.mu.RUnlock()

	header := observed.Header()
	if err := validateInput(pipeline.header, pipeline.initialized, header); err != nil {
		return PipelineCandidate{}, err
	}
	if err := ctx.Err(); err != nil {
		return PipelineCandidate{}, err
	}

	history := slices.Clone(pipeline.state.Derived.ControlsHistory.Samples)
	if pipeline.initialized && mustReset(pipeline.header, header) {
		history = nil
	}
	derivedHistory := deriveControlsHistory(header, observedState, history, pipeline.maxHistory)
	deltaTracker := cloneSelfDeltaTracker(pipeline.delta)
	fuelTracker := cloneFuelUsageTracker(pipeline.fuel)
	next := FinalState{
		Observed: cloneObserved(observedState),
		Derived: DerivedState{
			SessionRemaining: deriveSessionRemaining(observedState.SourceTime, observedState.EndTime),
			Gaps:             deriveRelativeGaps(header.Identity.Vehicle, observedState.PlayerPresent, observedState.Vehicles),
			Delta:            deltaTracker.Apply(header, observedState),
			Fuel:             fuelTracker.Apply(header, observedState),
			ControlsHistory:  derivedHistory,
			Algorithms:       canonicalVersions(),
		},
	}
	if err := ctx.Err(); err != nil {
		return PipelineCandidate{}, err
	}
	snapshot, err := envelope.NewSnapshot(header, next, cloneFinal)
	if err != nil {
		return PipelineCandidate{}, fmt.Errorf("create final derived snapshot: %w", err)
	}
	return PipelineCandidate{pipeline: pipeline, header: header, state: next, delta: deltaTracker, fuel: fuelTracker, snapshot: snapshot}, nil
}

// Snapshot returns the fully owned final state prepared by this candidate.
func (candidate PipelineCandidate) Snapshot() envelope.Snapshot[FinalState] {
	return candidate.snapshot
}

// Commit publishes a candidate prepared by this pipeline.
func (pipeline *Pipeline) Commit(candidate PipelineCandidate) {
	if candidate.pipeline != pipeline {
		return
	}
	pipeline.mu.Lock()
	defer pipeline.mu.Unlock()
	pipeline.header = candidate.header
	pipeline.state = cloneFinal(candidate.state)
	pipeline.delta = candidate.delta
	pipeline.fuel = candidate.fuel
	pipeline.initialized = true
}

func (pipeline *Pipeline) Current() (envelope.Snapshot[FinalState], bool) {
	pipeline.mu.RLock()
	defer pipeline.mu.RUnlock()
	if !pipeline.initialized {
		return envelope.Snapshot[FinalState]{}, false
	}
	snapshot, err := envelope.NewSnapshot(pipeline.header, pipeline.state, cloneFinal)
	if err != nil {
		return envelope.Snapshot[FinalState]{}, false
	}
	return snapshot, true
}

func deriveControlsHistory(
	header envelope.Header,
	observed core.ObservedState,
	history []ControlSample,
	limit int,
) ControlHistory {
	var active *core.VehicleState
	for index := range observed.Vehicles {
		if observed.Vehicles[index].Identity.Vehicle == header.Identity.Vehicle {
			active = &observed.Vehicles[index]
			break
		}
	}
	if active == nil {
		return ControlHistory{Freshness: schema.FreshnessMissing, Samples: history}
	}

	freshness := controlsFreshness(active.Throttle, active.Brake, active.Clutch)
	if freshness != schema.FreshnessFresh {
		return ControlHistory{Freshness: freshness, Samples: history}
	}
	throttle, _ := active.Throttle.Value()
	brake, _ := active.Brake.Value()
	clutch, _ := active.Clutch.Value()
	history = append(history, ControlSample{
		Cursor:     header.Cursor,
		CapturedAt: header.Clock.ReceivedUTC,
		Vehicle:    header.Identity.Vehicle,
		Throttle:   throttle,
		Brake:      brake,
		Clutch:     clutch,
	})
	if overflow := len(history) - limit; overflow > 0 {
		history = slices.Clone(history[overflow:])
	}
	return ControlHistory{Freshness: schema.FreshnessFresh, Samples: history}
}

func controlsFreshness(fields ...schema.Field[schema.Ratio]) schema.Freshness {
	result := schema.FreshnessFresh
	for _, field := range fields {
		_, present := field.Value()
		if field.Freshness() == schema.FreshnessInvalid {
			return schema.FreshnessInvalid
		}
		if !present || field.Freshness() == schema.FreshnessMissing {
			result = schema.FreshnessMissing
			continue
		}
		if field.Freshness() == schema.FreshnessStale && result == schema.FreshnessFresh {
			result = schema.FreshnessStale
		}
	}
	return result
}

func validateInput(current envelope.Header, initialized bool, next envelope.Header) error {
	if !initialized {
		if next.Cursor.Epoch == 0 || next.Cursor.Sequence != 1 {
			return ErrInvalidEpochReset
		}
		return nil
	}
	if next.Cursor.Epoch < current.Cursor.Epoch ||
		(next.Cursor.Epoch == current.Cursor.Epoch && next.Cursor.Sequence <= current.Cursor.Sequence) {
		return ErrStaleSnapshot
	}
	if next.Cursor.Epoch == current.Cursor.Epoch {
		if next.Cursor.Sequence != current.Cursor.Sequence+1 {
			return ErrSequenceGap
		}
		if !current.Identity.SameSession(next.Identity) {
			return ErrIdentityChanged
		}
		return nil
	}
	if next.Cursor.Epoch != current.Cursor.Epoch+1 {
		return ErrEpochGap
	}
	if next.Cursor.Sequence != 1 {
		return ErrInvalidEpochReset
	}
	return nil
}

func mustReset(previous, next envelope.Header) bool {
	return previous.Cursor.Epoch != next.Cursor.Epoch ||
		!previous.Identity.SameSession(next.Identity)
}

func cloneObserved(state core.ObservedState) core.ObservedState {
	result := state
	result.Vehicles = slices.Clone(state.Vehicles)
	return result
}

func cloneFinal(state FinalState) FinalState {
	result := state
	result.Observed = cloneObserved(state.Observed)
	result.Derived.Gaps.Vehicles = slices.Clone(state.Derived.Gaps.Vehicles)
	result.Derived.Delta.History = slices.Clone(state.Derived.Delta.History)
	result.Derived.ControlsHistory.Samples = slices.Clone(state.Derived.ControlsHistory.Samples)
	result.Derived.Algorithms = slices.Clone(state.Derived.Algorithms)
	return result
}

func canonicalVersions() []AlgorithmVersion {
	return slices.Clone(canonicalAlgorithmVersions)
}
