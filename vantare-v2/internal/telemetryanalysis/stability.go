package telemetryanalysis

import "time"

type Observation struct {
	Identity   string
	ObservedAt time.Time
	Exists     bool
	Relocated  bool
	Compatible bool
	WALPresent bool
	Size       int64
	ModTime    time.Time
	Err        error
}

type StabilityTracker struct {
	window      time.Duration
	last        Observation
	stableSince time.Time
	hasLast     bool
}

func NewStabilityTracker(window time.Duration) (*StabilityTracker, error) {
	if window <= 0 {
		return nil, ErrInvalidWindow
	}
	return &StabilityTracker{window: window}, nil
}

// Assess updates a candidate with one injected metadata observation. Only this
// method can issue the internal gate required by BuildManifest.
func (t *StabilityTracker) Assess(candidate Candidate, observation Observation) Candidate {
	observation.Identity = candidate.Locator
	candidate.State = t.Observe(observation)
	candidate.WALPresent = observation.WALPresent
	candidate.Size = observation.Size
	candidate.ModTime = observation.ModTime.UTC()
	candidate.stabilityGate = candidate.State == StateReady
	return candidate
}

func (t *StabilityTracker) Observe(observation Observation) State {
	if observation.Err != nil {
		t.reset()
		return StateError
	}
	if observation.ObservedAt.IsZero() {
		t.reset()
		return StateError
	}
	if observation.Identity == "" || observation.Size < 0 {
		t.reset()
		return StateError
	}
	if t.hasLast && observation.ObservedAt.Before(t.last.ObservedAt) {
		t.reset()
		return StateError
	}
	if !observation.Exists {
		t.reset()
		return StateMissing
	}
	if observation.Relocated {
		t.reset()
		return StateMoved
	}
	if !observation.Compatible {
		t.reset()
		return StateIncompatible
	}
	if observation.WALPresent {
		t.reset()
		t.last = observation
		t.hasLast = true
		return StateActive
	}

	unchanged := t.hasLast &&
		t.last.Identity == observation.Identity &&
		!t.last.WALPresent &&
		t.last.Size == observation.Size &&
		t.last.ModTime.Equal(observation.ModTime)
	if !unchanged {
		t.stableSince = observation.ObservedAt
	}
	t.last = observation
	t.hasLast = true

	if observation.ObservedAt.Sub(t.stableSince) >= t.window {
		return StateReady
	}
	return StateStabilizing
}

func (t *StabilityTracker) reset() {
	t.last = Observation{}
	t.stableSince = time.Time{}
	t.hasLast = false
}
