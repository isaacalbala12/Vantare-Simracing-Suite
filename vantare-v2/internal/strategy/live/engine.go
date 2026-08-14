package live

import (
	"reflect"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

type Engine struct {
	mu             sync.RWMutex
	plan           Plan
	model          ReadModel
	lastProjection *strategyprojection.SnapshotV1
	source         SourceStatus
	hasSource      bool
}

func NewEngine(plan Plan) (*Engine, error) {
	owned, err := NewPlan(PlanInput{ActivePlan: plan.ActivePlan(), Stints: plan.Stints(), FuelTargets: plan.FuelTargets()})
	if err != nil {
		return nil, err
	}
	return &Engine{
		plan: owned,
		model: ReadModel{
			ActivePlan: owned.ActivePlan(), Source: valueOf(SourceStatus{}, false, ValueMissing),
			Status: contract.ExecutionIdle,
			Stint:  valueOf(StintProgress{}, false, ValueMissing), CompletedLaps: valueOf(contract.LapCount(0), false, ValueMissing),
			FuelAmount: valueOf(contract.FuelLiters(0), false, ValueMissing), FuelCapacity: valueOf(contract.FuelLiters(0), false, ValueMissing),
			FuelDeviationLiters: valueOf(float64(0), false, ValueMissing), NextAction: valueOf(PlannedAction{}, false, ValueMissing),
		},
	}, nil
}

func (engine *Engine) Snapshot() ReadModel {
	engine.mu.RLock()
	defer engine.mu.RUnlock()
	return cloneReadModel(engine.model)
}

func (engine *Engine) ApplySourceStatus(status SourceStatus) error {
	if err := validateSourceStatus(status); err != nil {
		return err
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if engine.hasSource {
		switch {
		case status.Revision < engine.source.Revision:
			return invalid(ErrOutOfOrder, "source.revision", nil)
		case status.Revision == engine.source.Revision:
			if reflect.DeepEqual(status, engine.source) {
				return nil
			}
			return invalid(ErrSourceConflict, "source.revision", nil)
		}
	}
	wasLive := engine.hasSource && engine.source.State == SourceLive
	reconnected := wasLive && status.ReconnectAttempt > engine.source.ReconnectAttempt
	engine.source = status
	engine.model.Source = valueOf(status, true, ValueFresh)
	engine.hasSource = true
	if wasLive && (status.State != SourceLive || reconnected) {
		downgradeFresh(&engine.model)
	}
	engine.model.Status = executionStatus(engine.model, engine.plan)
	return nil
}

func validateSourceStatus(status SourceStatus) error {
	if !status.State.valid() || status.Revision == 0 || status.Revision > uint64(maxSafeInteger) ||
		status.ReconnectAttempt < 0 || status.UpdatedAt.IsZero() || status.UpdatedAt.Location() != time.UTC ||
		status.UpdatedAt != status.UpdatedAt.Round(0) {
		return invalid(ErrInvalidSource, "source", nil)
	}
	return nil
}

func (engine *Engine) ApplySnapshot(input strategyprojection.SnapshotV1) error {
	if err := validateProjection(input); err != nil {
		return err
	}
	owned := cloneProjection(input)
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if engine.lastProjection != nil {
		previous := engine.lastProjection.Metadata
		switch {
		case owned.Epoch < previous.Epoch || (owned.Epoch == previous.Epoch && owned.Sequence < previous.Sequence):
			return invalid(ErrOutOfOrder, "cursor", nil)
		case owned.Epoch == previous.Epoch && owned.Sequence == previous.Sequence:
			if reflect.DeepEqual(owned, *engine.lastProjection) {
				return nil
			}
			return invalid(ErrCursorConflict, "cursor", nil)
		}
	}

	model := engine.project(owned)
	engine.model = model
	engine.lastProjection = &owned
	return nil
}

func (engine *Engine) project(snapshot strategyprojection.SnapshotV1) ReadModel {
	model := ReadModel{
		Cursor:     Cursor{Epoch: uint64(snapshot.Epoch), Sequence: uint64(snapshot.Sequence)},
		ActivePlan: engine.plan.ActivePlan(), Source: engine.model.Source,
	}
	source, sourcePresent := model.Source.Value()
	live := sourcePresent && source.State == SourceLive
	progressSupported := capabilityPresent(snapshot.Capabilities, strategyprojection.CapabilityProgress)
	fuelSupported := capabilityPresent(snapshot.Capabilities, strategyprojection.CapabilityFuel)
	model.CompletedLaps = mapLapProjected(snapshot.Player.CompletedLaps, progressSupported, live)
	model.FuelAmount = mapFuelProjected(snapshot.Player.FuelLiters, fuelSupported, live)
	model.FuelCapacity = mapFuelProjected(snapshot.Player.FuelCapacity, fuelSupported, live)
	engine.derivePlan(&model)
	model.Status = executionStatus(model, engine.plan)
	return model
}

func mapLapProjected[Source ~int32](field telemetryprojection.Field[Source], supported, live bool) Value[contract.LapCount] {
	return mapProjected(field, supported, live, func(value Source) contract.LapCount { return contract.LapCount(value) })
}

func mapFuelProjected[Source ~float64](field telemetryprojection.Field[Source], supported, live bool) Value[contract.FuelLiters] {
	return mapProjected(field, supported, live, func(value Source) contract.FuelLiters { return contract.FuelLiters(value) })
}

func mapProjected[Source comparable, Target any](field telemetryprojection.Field[Source], supported, live bool, convert func(Source) Target) Value[Target] {
	var zero Target
	if !supported {
		if field.Present && field.Freshness == telemetryprojection.FreshnessInvalid {
			return valueOf(convert(field.Value), true, ValueInvalid)
		}
		return valueOf(zero, false, ValueUnsupported)
	}
	state := projectedState(field.Freshness)
	if state == ValueFresh && !live {
		state = ValueStale
	}
	if !field.Present {
		return valueOf(zero, false, state)
	}
	return valueOf(convert(field.Value), true, state)
}

func projectedState(freshness telemetryprojection.Freshness) ValueState {
	switch freshness {
	case telemetryprojection.FreshnessFresh:
		return ValueFresh
	case telemetryprojection.FreshnessStale:
		return ValueStale
	case telemetryprojection.FreshnessInvalid:
		return ValueInvalid
	default:
		return ValueMissing
	}
}

func (engine *Engine) derivePlan(model *ReadModel) {
	completed, usable := model.CompletedLaps.Value()
	if !usable || !model.CompletedLaps.Usable() {
		state := model.CompletedLaps.State()
		model.Stint = valueOf(StintProgress{}, false, state)
		model.NextAction = valueOf(PlannedAction{}, false, state)
		model.FuelDeviationLiters = valueOf(float64(0), false, state)
		return
	}
	boundary := contract.LapCount(0)
	for index, stint := range engine.plan.stints {
		boundary += stint.Laps
		if completed < boundary {
			start := boundary - stint.Laps
			model.Stint = valueOf(StintProgress{Stint: stint, Index: index, CompletedLaps: completed - start, LapBoundary: boundary}, true, ValueFresh)
			kind := ActionPit
			if index == len(engine.plan.stints)-1 {
				kind = ActionFinish
			}
			model.NextAction = valueOf(PlannedAction{Kind: kind, LapBoundary: boundary}, true, ValueFresh)
			break
		}
	}
	if completed >= engine.plan.totalLaps {
		model.Stint = valueOf(StintProgress{}, false, ValueMissing)
		model.NextAction = valueOf(PlannedAction{Kind: ActionFinish, LapBoundary: engine.plan.totalLaps}, true, ValueFresh)
	}
	observedFuel, fuelUsable := model.FuelAmount.Value()
	target, exact := engine.plan.fuelTarget(completed)
	if !exact {
		model.FuelDeviationLiters = valueOf(float64(0), false, ValueMissing)
	} else if fuelUsable && model.FuelAmount.Usable() {
		model.FuelDeviationLiters = valueOf(observedFuel.Value()-target.Value(), true, ValueFresh)
	} else {
		model.FuelDeviationLiters = valueOf(float64(0), false, model.FuelAmount.State())
	}
}

func executionStatus(model ReadModel, plan Plan) contract.ExecutionStatus {
	source, present := model.Source.Value()
	if !present {
		return contract.ExecutionIdle
	}
	if source.State == SourceStopped {
		return contract.ExecutionStopped
	}
	if source.State != SourceLive {
		return contract.ExecutionIdle
	}
	completed, present := model.CompletedLaps.Value()
	if !present || !model.CompletedLaps.Usable() {
		return contract.ExecutionIdle
	}
	if completed >= plan.totalLaps {
		return contract.ExecutionCompleted
	}
	return contract.ExecutionMonitoring
}

func downgradeFresh(model *ReadModel) {
	downgradeValue(&model.CompletedLaps)
	downgradeValue(&model.FuelAmount)
	downgradeValue(&model.FuelCapacity)
	downgradeValue(&model.FuelDeviationLiters)
	downgradeValue(&model.Stint)
	downgradeValue(&model.NextAction)
}

func downgradeValue[T any](value *Value[T]) {
	if value.state == ValueFresh {
		value.state = ValueStale
	}
}
