package live

import (
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type ValueState uint8

const (
	ValueMissing ValueState = iota
	ValueFresh
	ValueStale
	ValueInvalid
	ValueUnsupported
)

// Value separates availability from the Go zero value. Value returns false
// for missing/unsupported derived values, while a fresh numeric zero is owned.
type Value[T any] struct {
	value   T
	present bool
	state   ValueState
}

func (value Value[T]) State() ValueState { return value.state }
func (value Value[T]) Value() (T, bool)  { return value.value, value.present }
func (value Value[T]) Usable() bool      { return value.present && value.state == ValueFresh }

func valueOf[T any](value T, present bool, state ValueState) Value[T] {
	return Value[T]{value: value, present: present, state: state}
}

type Cursor struct {
	Epoch    uint64
	Sequence uint64
}

type SourceState string

const (
	SourceStopped    SourceState = "stopped"
	SourceDetecting  SourceState = "detecting"
	SourceConnecting SourceState = "connecting"
	SourceLive       SourceState = "live"
	SourceDegraded   SourceState = "degraded"
	SourceStale      SourceState = "stale"
	SourceError      SourceState = "error"
)

func (state SourceState) valid() bool {
	switch state {
	case SourceStopped, SourceDetecting, SourceConnecting, SourceLive,
		SourceDegraded, SourceStale, SourceError:
		return true
	default:
		return false
	}
}

type SourceStatus struct {
	State            SourceState
	Revision         uint64
	ReconnectAttempt int
	UpdatedAt        time.Time
}

type StintProgress struct {
	Stint         Stint
	Index         int
	CompletedLaps contract.LapCount
	LapBoundary   contract.LapCount
}

type ActionKind string

const (
	ActionPit    ActionKind = "pit"
	ActionFinish ActionKind = "finish"
)

type PlannedAction struct {
	Kind        ActionKind
	LapBoundary contract.LapCount
}

type ReadModel struct {
	Cursor              Cursor
	ActivePlan          contract.ActivePlan
	Source              Value[SourceStatus]
	Status              contract.ExecutionStatus
	Stint               Value[StintProgress]
	CompletedLaps       Value[contract.LapCount]
	FuelAmount          Value[contract.FuelLiters]
	FuelCapacity        Value[contract.FuelLiters]
	FuelDeviationLiters Value[float64]
	NextAction          Value[PlannedAction]
}

func cloneReadModel(model ReadModel) ReadModel {
	model.ActivePlan = cloneActivePlan(model.ActivePlan)
	return model
}
