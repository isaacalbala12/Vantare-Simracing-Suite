package schema

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"
	"time"
)

func TestCursorAdvanceModelsContinuityResetAndWrap(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		cursor     Cursor
		transition Transition
		want       Cursor
	}{
		{name: "initialize", want: Cursor{Epoch: 1, Sequence: 1}},
		{name: "continuous", cursor: Cursor{Epoch: 2, Sequence: 8}, want: Cursor{Epoch: 2, Sequence: 9}},
		{name: "brief disconnect keeps epoch", cursor: Cursor{Epoch: 2, Sequence: 8}, transition: TransitionBriefDisconnect, want: Cursor{Epoch: 2, Sequence: 9}},
		{name: "source reset", cursor: Cursor{Epoch: 2, Sequence: 8}, transition: TransitionSourceReset, want: Cursor{Epoch: 3, Sequence: 1}},
		{name: "vehicle change", cursor: Cursor{Epoch: 2, Sequence: 8}, transition: TransitionVehicleChanged, want: Cursor{Epoch: 3, Sequence: 1}},
		{name: "sequence wrap", cursor: Cursor{Epoch: 2, Sequence: Sequence(math.MaxUint64)}, want: Cursor{Epoch: 3, Sequence: 1}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.cursor.Advance(tt.transition)
			if err != nil || got != tt.want {
				t.Fatalf("Advance() = (%+v, %v), want (%+v, nil)", got, err, tt.want)
			}
		})
	}
}

func TestCursorAdvanceRejectsUnknownTransitionAndEpochOverflow(t *testing.T) {
	t.Parallel()

	if _, err := (Cursor{}).Advance(Transition(255)); !errors.Is(err, ErrUnknownTransition) {
		t.Fatalf("unknown transition error = %v, want %v", err, ErrUnknownTransition)
	}
	if _, err := (Cursor{Epoch: 1}).Advance(TransitionContinuous); !errors.Is(err, ErrInvalidCursor) {
		t.Fatalf("invalid cursor error = %v, want %v", err, ErrInvalidCursor)
	}
	if _, err := (Cursor{Epoch: Epoch(math.MaxUint64), Sequence: Sequence(math.MaxUint64)}).Advance(TransitionContinuous); !errors.Is(err, ErrEpochExhausted) {
		t.Fatalf("epoch overflow error = %v, want %v", err, ErrEpochExhausted)
	}
}

func TestClockUsesMonotonicAgeWithoutSerializingIt(t *testing.T) {
	t.Parallel()

	received := time.Now()
	clock := NewClock(MissingField[time.Duration](), MissingField[time.Duration](), received)
	if got := clock.Age(received.Add(250 * time.Millisecond)); got != 250*time.Millisecond {
		t.Fatalf("Age() = %s, want 250ms", got)
	}
	if got := clock.Age(received.Add(-time.Second)); got != 0 {
		t.Fatalf("negative Age() = %s, want zero", got)
	}

	encoded, err := json.Marshal(clock)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if strings.Contains(string(encoded), "monotonic") || !strings.Contains(string(encoded), "receivedUtc") {
		t.Fatalf("serialized clock = %s, want receivedUtc without monotonic state", encoded)
	}
}
