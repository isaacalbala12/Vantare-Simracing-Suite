// Package derive owns the deterministic, product-neutral derivation chain.
package derive

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

var (
	ErrDuplicateVersion  = errors.New("duplicate derivation id and version")
	ErrInvalidDefinition = errors.New("invalid derivation definition")
	ErrInvalidOrder      = errors.New("derivation order must be unique and contiguous")
	ErrDerivationCycle   = errors.New("derivation dependency is cyclic or ordered backwards")
	ErrStaleSnapshot     = errors.New("derived pipeline snapshot is duplicate or out of order")
	ErrSequenceGap       = errors.New("derived pipeline snapshot has a sequence gap")
	ErrEpochGap          = errors.New("derived pipeline snapshot has an epoch gap")
	ErrInvalidEpochReset = errors.New("derived pipeline epoch must restart at sequence one")
	ErrIdentityChanged   = errors.New("derived pipeline identity changed without an epoch reset")
)

const MaxControlsHistory = 120

type DerivationID string
type SignalID string

const (
	DerivationSessionRemaining DerivationID = "session.remaining"
	DerivationRelativeGaps     DerivationID = "standings.relative-gaps"
	DerivationSelfDelta        DerivationID = "session.self-delta"
	DerivationControlsHistory  DerivationID = "controls.history"

	SignalObservedSourceTime       SignalID = "observed.session.source-time"
	SignalObservedEndTime          SignalID = "observed.session.end-time"
	SignalObservedTimeBehindLeader SignalID = "observed.standings.time-behind-leader"
	SignalObservedLapsBehindLeader SignalID = "observed.standings.laps-behind-leader"
	SignalObservedLapNumber        SignalID = "observed.session.lap-number"
	SignalObservedLapDistance      SignalID = "observed.standings.lap-distance"
	SignalObservedInPit            SignalID = "observed.pit.in-pit"
	SignalObservedDeltaBest        SignalID = "observed.session.delta-best"
	SignalObservedThrottle         SignalID = "observed.vehicle.throttle"
	SignalObservedBrake            SignalID = "observed.vehicle.brake"
	SignalObservedClutch           SignalID = "observed.vehicle.clutch"
	SignalSessionRemaining         SignalID = "derived.session.remaining"
	SignalRelativeTimeGap          SignalID = "derived.standings.relative-time-gap"
	SignalRelativeLapDelta         SignalID = "derived.standings.relative-lap-delta"
	SignalSelfDeltaSeconds         SignalID = "derived.session.self-delta-seconds"
	SignalSelfDeltaRef             SignalID = "derived.session.self-delta-reference"
	SignalControlsHistory          SignalID = "derived.controls.history"
)

type ResetPolicy uint8

const (
	ResetEpoch ResetPolicy = 1 << iota
	ResetSession
	ResetRun
	ResetVehicle
)

// Definition is immutable registry metadata. Runtime stages are fixed in code;
// definitions do not contain callbacks and cannot be extended as plugins.
type Definition struct {
	ID           DerivationID
	Version      uint32
	Order        uint16
	Inputs       []SignalID
	Outputs      []SignalID
	Reset        ResetPolicy
	HistoryLimit int
}

var canonicalRegistry = []Definition{
	{
		ID: DerivationControlsHistory, Version: 1, Order: 1,
		Inputs: []SignalID{
			SignalObservedThrottle,
			SignalObservedBrake,
			SignalObservedClutch,
		},
		Outputs:      []SignalID{SignalControlsHistory},
		Reset:        ResetEpoch | ResetSession | ResetRun | ResetVehicle,
		HistoryLimit: MaxControlsHistory,
	},
	{
		ID: DerivationSessionRemaining, Version: 1, Order: 2,
		Inputs:  []SignalID{SignalObservedSourceTime, SignalObservedEndTime},
		Outputs: []SignalID{SignalSessionRemaining},
		Reset:   ResetEpoch | ResetSession,
	},
	{
		ID: DerivationRelativeGaps, Version: 1, Order: 3,
		Inputs:  []SignalID{SignalObservedTimeBehindLeader, SignalObservedLapsBehindLeader},
		Outputs: []SignalID{SignalRelativeTimeGap, SignalRelativeLapDelta},
		Reset:   ResetEpoch | ResetSession | ResetRun | ResetVehicle,
	},
	{
		ID: DerivationSelfDelta, Version: 1, Order: 4,
		Inputs:       []SignalID{SignalObservedSourceTime, SignalObservedLapNumber, SignalObservedLapDistance, SignalObservedInPit, SignalObservedDeltaBest},
		Outputs:      []SignalID{SignalSelfDeltaSeconds, SignalSelfDeltaRef},
		Reset:        ResetEpoch | ResetSession | ResetRun | ResetVehicle,
		HistoryLimit: MaxSelfDeltaSamples,
	},
}

// Registry returns an owned copy of the fixed, explicitly ordered registry.
func Registry() []Definition {
	result := make([]Definition, len(canonicalRegistry))
	for index, definition := range canonicalRegistry {
		result[index] = cloneDefinition(definition)
	}
	return result
}

func cloneDefinition(definition Definition) Definition {
	definition.Inputs = slices.Clone(definition.Inputs)
	definition.Outputs = slices.Clone(definition.Outputs)
	return definition
}

// ValidateDefinitions is exported for architecture guards and registry tests.
// Pipeline construction always uses the canonical static registry.
func ValidateDefinitions(definitions []Definition) error {
	type versionKey struct {
		id      DerivationID
		version uint32
	}
	versions := make(map[versionKey]struct{}, len(definitions))
	orders := make(map[uint16]struct{}, len(definitions))
	producers := make(map[SignalID]uint16)

	for _, definition := range definitions {
		if definition.ID == "" || definition.Version == 0 || definition.Order == 0 ||
			len(definition.Inputs) == 0 || len(definition.Outputs) == 0 {
			return fmt.Errorf("%w: %+v", ErrInvalidDefinition, definition)
		}
		key := versionKey{id: definition.ID, version: definition.Version}
		if _, exists := versions[key]; exists {
			return fmt.Errorf("%w: %s@%d", ErrDuplicateVersion, definition.ID, definition.Version)
		}
		versions[key] = struct{}{}
		if _, exists := orders[definition.Order]; exists {
			return fmt.Errorf("%w: duplicate position %d", ErrInvalidOrder, definition.Order)
		}
		orders[definition.Order] = struct{}{}
		for _, output := range definition.Outputs {
			if output == "" {
				return fmt.Errorf("%w: %s has empty output", ErrInvalidDefinition, definition.ID)
			}
			if _, exists := producers[output]; exists {
				return fmt.Errorf("%w: output %s has multiple producers", ErrInvalidDefinition, output)
			}
			producers[output] = definition.Order
		}
	}
	for order := uint16(1); order <= uint16(len(definitions)); order++ {
		if _, exists := orders[order]; !exists {
			return fmt.Errorf("%w: missing position %d", ErrInvalidOrder, order)
		}
	}
	for _, definition := range definitions {
		for _, input := range definition.Inputs {
			if input == "" {
				return fmt.Errorf("%w: %s has empty input", ErrInvalidDefinition, definition.ID)
			}
			producerOrder, derived := producers[input]
			if strings.HasPrefix(string(input), "derived.") && (!derived || producerOrder >= definition.Order) {
				return fmt.Errorf("%w: %s consumes %s", ErrDerivationCycle, definition.ID, input)
			}
		}
	}
	return nil
}

type Availability struct {
	Freshness schema.Freshness
}

type ControlSample struct {
	Cursor   schema.Cursor
	Vehicle  identity.VehicleID
	Throttle schema.Ratio
	Brake    schema.Ratio
	Clutch   schema.Ratio
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
}

type Pipeline struct {
	mu sync.RWMutex

	initialized bool
	header      envelope.Header
	state       FinalState
	maxHistory  int
	delta       *selfDeltaTracker
}

// PipelineCandidate owns a fully derived next state without publishing it.
type PipelineCandidate struct {
	pipeline *Pipeline
	header   envelope.Header
	state    FinalState
	delta    *selfDeltaTracker
	snapshot envelope.Snapshot[FinalState]
}

func NewPipeline(config Config) *Pipeline {
	limit := config.MaxControlsHistory
	if limit <= 0 || limit > MaxControlsHistory {
		limit = MaxControlsHistory
	}
	return &Pipeline{maxHistory: limit, delta: newSelfDeltaTracker(MaxSelfDeltaSamples)}
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
	next := FinalState{
		Observed: cloneObserved(observedState),
		Derived: DerivedState{
			SessionRemaining: deriveSessionRemaining(observedState.SourceTime, observedState.EndTime),
			Gaps:             deriveRelativeGaps(header.Identity.Vehicle, observedState.PlayerPresent, observedState.Vehicles),
			Delta:            deltaTracker.Apply(header, observedState),
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
	return PipelineCandidate{pipeline: pipeline, header: header, state: next, delta: deltaTracker, snapshot: snapshot}, nil
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
		Cursor:   header.Cursor,
		Vehicle:  header.Identity.Vehicle,
		Throttle: throttle,
		Brake:    brake,
		Clutch:   clutch,
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
	result := make([]AlgorithmVersion, len(canonicalRegistry))
	for index, definition := range canonicalRegistry {
		result[index] = AlgorithmVersion{ID: definition.ID, Version: definition.Version}
	}
	return result
}
