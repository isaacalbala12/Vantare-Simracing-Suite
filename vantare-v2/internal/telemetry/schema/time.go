package schema

import (
	"errors"
	"math"
	"time"
)

var (
	ErrUnknownTransition = errors.New("unknown telemetry transition")
	ErrInvalidCursor     = errors.New("telemetry cursor epoch and sequence must both be zero or non-zero")
	ErrEpochExhausted    = errors.New("telemetry epoch exhausted")
)

type Epoch uint64
type Sequence uint64

type Cursor struct {
	Epoch    Epoch
	Sequence Sequence
}

type Transition uint8

const (
	TransitionContinuous Transition = iota
	TransitionBriefDisconnect
	TransitionSourceReset
	TransitionEventChanged
	TransitionSessionChanged
	TransitionVehicleChanged
)

func (transition Transition) Known() bool { return transition <= TransitionVehicleChanged }

func (transition Transition) startsNewEpoch() bool {
	return transition >= TransitionSourceReset && transition <= TransitionVehicleChanged
}

func (cursor Cursor) Advance(transition Transition) (Cursor, error) {
	if !transition.Known() {
		return Cursor{}, ErrUnknownTransition
	}
	if (cursor.Epoch == 0) != (cursor.Sequence == 0) {
		return Cursor{}, ErrInvalidCursor
	}
	if cursor.Epoch == 0 {
		return Cursor{Epoch: 1, Sequence: 1}, nil
	}
	if transition.startsNewEpoch() || cursor.Sequence == Sequence(math.MaxUint64) {
		if cursor.Epoch == Epoch(math.MaxUint64) {
			return Cursor{}, ErrEpochExhausted
		}
		return Cursor{Epoch: cursor.Epoch + 1, Sequence: 1}, nil
	}
	return Cursor{Epoch: cursor.Epoch, Sequence: cursor.Sequence + 1}, nil
}

// Clock separates source/session clocks from receipt time. receivedMonotonic is
// process-local and deliberately remains unexported and unserialized.
type Clock struct {
	ReceivedUTC time.Time `json:"receivedUtc"`

	source            Field[time.Duration]
	session           Field[time.Duration]
	receivedMonotonic time.Time
}

func NewClock(source, session Field[time.Duration], received time.Time) Clock {
	return Clock{
		ReceivedUTC:       received.Round(0).UTC(),
		source:            source,
		session:           session,
		receivedMonotonic: received,
	}
}

func (clock Clock) SourceTime() Field[time.Duration] { return clock.source }

func (clock Clock) SessionTime() Field[time.Duration] { return clock.session }

func (clock Clock) Age(now time.Time) time.Duration {
	if clock.receivedMonotonic.IsZero() {
		return 0
	}
	age := now.Sub(clock.receivedMonotonic)
	if age < 0 {
		return 0
	}
	return age
}
