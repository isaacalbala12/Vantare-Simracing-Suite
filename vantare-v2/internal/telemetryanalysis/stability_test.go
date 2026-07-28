package telemetryanalysis

import (
	"errors"
	"testing"
	"time"
)

func TestStabilityTrackerObserve(t *testing.T) {
	t.Parallel()

	const window = 5 * time.Second
	start := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name         string
		observations []Observation
		want         []State
	}{
		{
			name: "wal present remains active",
			observations: []Observation{
				{ObservedAt: start, Exists: true, Size: 100, ModTime: start, WALPresent: true, Compatible: true},
				{ObservedAt: start.Add(window * 2), Exists: true, Size: 100, ModTime: start, WALPresent: true, Compatible: true},
			},
			want: []State{StateActive, StateActive},
		},
		{
			name: "wal absent requires a full unchanged window",
			observations: []Observation{
				{ObservedAt: start, Exists: true, Size: 100, ModTime: start, Compatible: true},
				{ObservedAt: start.Add(window - time.Nanosecond), Exists: true, Size: 100, ModTime: start, Compatible: true},
				{ObservedAt: start.Add(window), Exists: true, Size: 100, ModTime: start, Compatible: true},
			},
			want: []State{StateStabilizing, StateStabilizing, StateReady},
		},
		{
			name: "metadata change restarts the window",
			observations: []Observation{
				{ObservedAt: start, Exists: true, Size: 100, ModTime: start, Compatible: true},
				{ObservedAt: start.Add(window), Exists: true, Size: 101, ModTime: start.Add(time.Second), Compatible: true},
				{ObservedAt: start.Add(window * 2), Exists: true, Size: 101, ModTime: start.Add(time.Second), Compatible: true},
			},
			want: []State{StateStabilizing, StateStabilizing, StateReady},
		},
		{
			name: "availability states are explicit",
			observations: []Observation{
				{ObservedAt: start, Exists: false},
				{ObservedAt: start.Add(time.Second), Exists: true, Relocated: true},
				{ObservedAt: start.Add(2 * time.Second), Exists: true, Compatible: false},
				{ObservedAt: start.Add(3 * time.Second), Exists: true, Compatible: true, Err: errors.New("private path")},
			},
			want: []State{StateMissing, StateMoved, StateIncompatible, StateError},
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			tracker, err := NewStabilityTracker(window)
			if err != nil {
				t.Fatal(err)
			}
			for index, observation := range tt.observations {
				observation.Identity = "candidate-a"
				got := tracker.Observe(observation)
				if got != tt.want[index] {
					t.Fatalf("observation %d: got %q, want %q", index, got, tt.want[index])
				}
			}
		})
	}
}

func TestStabilityTrackerRejectsNonMonotonicObservationTime(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	tracker, err := NewStabilityTracker(time.Second)
	if err != nil {
		t.Fatal(err)
	}
	tracker.Observe(Observation{Identity: "candidate-a", ObservedAt: start, Exists: true, Compatible: true})

	if got := tracker.Observe(Observation{Identity: "candidate-a", ObservedAt: start.Add(-time.Second), Exists: true, Compatible: true}); got != StateError {
		t.Fatalf("got %q, want %q", got, StateError)
	}
}

func TestStabilityTrackerRejectsInvalidWindow(t *testing.T) {
	t.Parallel()

	for _, window := range []time.Duration{0, -time.Second} {
		if _, err := NewStabilityTracker(window); !errors.Is(err, ErrInvalidWindow) {
			t.Fatalf("NewStabilityTracker(%s) error = %v, want ErrInvalidWindow", window, err)
		}
	}
}

func TestStabilityTrackerAssessIssuesReadGateOnlyWhenReady(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	tracker, err := NewStabilityTracker(time.Second)
	if err != nil {
		t.Fatal(err)
	}
	candidate := Candidate{Kind: SourceLMU, Locator: "lmu://0123456789abcdef", sourcePath: "source"}
	candidate = tracker.Assess(candidate, Observation{
		ObservedAt: start, Exists: true, Compatible: true, Size: 9, ModTime: start,
	})
	if candidate.stabilityGate {
		t.Fatal("first observation issued a read gate")
	}
	candidate = tracker.Assess(candidate, Observation{
		ObservedAt: start.Add(time.Second), Exists: true, Compatible: true, Size: 9, ModTime: start,
	})
	if candidate.State != StateReady || !candidate.stabilityGate {
		t.Fatalf("stable candidate did not receive gate: %+v", candidate)
	}
}

func TestStabilityTrackerDoesNotShareWindowAcrossCandidates(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	tracker, err := NewStabilityTracker(time.Second)
	if err != nil {
		t.Fatal(err)
	}
	first := Observation{
		Identity: "candidate-a", ObservedAt: start, Exists: true,
		Compatible: true, Size: 9, ModTime: start,
	}
	if got := tracker.Observe(first); got != StateStabilizing {
		t.Fatalf("first state = %q, want stabilizing", got)
	}
	first.Identity = "candidate-b"
	first.ObservedAt = start.Add(time.Second)
	if got := tracker.Observe(first); got != StateStabilizing {
		t.Fatalf("second candidate inherited stability: got %q", got)
	}
}

func TestStabilityTrackerRejectsInvalidObservation(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	tests := []Observation{
		{ObservedAt: start, Exists: true, Compatible: true},
		{Identity: "candidate-a", ObservedAt: start, Exists: true, Compatible: true, Size: -1},
	}
	for _, observation := range tests {
		tracker, err := NewStabilityTracker(time.Second)
		if err != nil {
			t.Fatal(err)
		}
		if got := tracker.Observe(observation); got != StateError {
			t.Fatalf("Observe(%+v) = %q, want error", observation, got)
		}
	}
}
