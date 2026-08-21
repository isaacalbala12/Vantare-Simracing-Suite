package derive

import (
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

// fuelStep is one observed batch of the player: the lap it is on, the fuel in
// the tank, whether it is in the pits and how fresh the observation is.
type fuelStep struct {
	lap       session.LapNumber
	fuel      float64
	capacity  float64
	inPit     bool
	freshness schema.Freshness
	session   identity.SessionID
	stint     identity.StintID
	epoch     schema.Epoch
	noPlayer  bool
}

func TestFuelUsageTrackerPublishesOnlyMeasuredValidLaps(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		window     int
		steps      []fuelStep
		wantPerLap float64
		wantLast   float64
		wantWindow schema.Count
		wantMissed bool
		wantFresh  schema.Freshness
	}{
		{
			name:       "no completed lap publishes nothing",
			steps:      []fuelStep{{lap: 1, fuel: 100}, {lap: 1, fuel: 97}},
			wantMissed: true,
			wantFresh:  schema.FreshnessFresh,
		},
		{
			name: "one completed lap is the average and the last lap",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 1, fuel: 97}, {lap: 2, fuel: 96.5},
			},
			wantPerLap: 3.5, wantLast: 3.5, wantWindow: 1, wantFresh: schema.FreshnessFresh,
		},
		{
			name: "the window is bounded to the configured laps",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 2, fuel: 96}, // 4
				{lap: 3, fuel: 93}, // 3
				{lap: 4, fuel: 91}, // 2
				{lap: 5, fuel: 90}, // 1 -> window keeps 3,2,1
			},
			window:     3,
			wantPerLap: 2, wantLast: 1, wantWindow: 3, wantFresh: schema.FreshnessFresh,
		},
		{
			name: "a pit lap is invalid and never enters the window",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 2, fuel: 96},
				{lap: 2, fuel: 95, inPit: true}, {lap: 3, fuel: 94},
				{lap: 4, fuel: 90},
			},
			wantPerLap: 4, wantLast: 4, wantWindow: 2, wantFresh: schema.FreshnessFresh,
		},
		{
			name: "a refuel invalidates the lap it happens on",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 2, fuel: 96},
				{lap: 2, fuel: 99}, {lap: 3, fuel: 95},
				{lap: 4, fuel: 90},
			},
			wantPerLap: 4.5, wantLast: 5, wantWindow: 2, wantFresh: schema.FreshnessFresh,
		},
		{
			name: "a lap jump has no observed boundary and produces no sample",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 4, fuel: 88}, {lap: 5, fuel: 85},
			},
			wantPerLap: 3, wantLast: 3, wantWindow: 1, wantFresh: schema.FreshnessFresh,
		},
		{
			name: "a stale batch keeps the measured window and drops its freshness",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 2, fuel: 96},
				{lap: 2, fuel: 95, freshness: schema.FreshnessStale},
			},
			wantPerLap: 4, wantLast: 4, wantWindow: 1, wantFresh: schema.FreshnessStale,
		},
		{
			name: "a missing batch never publishes the window as fresh",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 2, fuel: 96}, {noPlayer: true, lap: 2, fuel: 95},
			},
			wantPerLap: 4, wantLast: 4, wantWindow: 1, wantFresh: schema.FreshnessStale,
		},
		{
			name: "a new session clears everything measured before it",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 2, fuel: 96},
				{lap: 1, fuel: 100, session: "other", epoch: 2},
				{lap: 2, fuel: 99, session: "other", epoch: 2},
			},
			wantPerLap: 1, wantLast: 1, wantWindow: 1, wantFresh: schema.FreshnessFresh,
		},
		{
			name: "a new stint clears the window of the previous one",
			steps: []fuelStep{
				{lap: 1, fuel: 100}, {lap: 2, fuel: 96},
				{lap: 3, fuel: 100, stint: "stint-2"},
				{lap: 4, fuel: 98, stint: "stint-2"},
			},
			wantPerLap: 2, wantLast: 2, wantWindow: 1, wantFresh: schema.FreshnessFresh,
		},
		{
			name: "a lap that gained fuel across the boundary is discarded",
			steps: []fuelStep{
				{lap: 1, fuel: 90}, {lap: 2, fuel: 90},
			},
			wantMissed: true, wantFresh: schema.FreshnessFresh,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			tracker := newFuelUsageTracker(tt.window)
			var usage FuelUsage
			for index, step := range tt.steps {
				header, observed := fuelBatch(schema.Sequence(index+1), step)
				usage = tracker.Apply(header, observed)
			}
			if usage.Freshness != tt.wantFresh {
				t.Fatalf("freshness = %v, want %v", usage.Freshness, tt.wantFresh)
			}
			perLap, present := usage.PerLap.Value()
			if tt.wantMissed {
				if present {
					t.Fatalf("perLap = %v, want missing", perLap)
				}
				if _, ok := usage.WindowLaps.Value(); ok {
					t.Fatal("windowLaps must be missing without a measured lap")
				}
				return
			}
			if !present || math.Abs(float64(perLap)-tt.wantPerLap) > 1e-9 {
				t.Fatalf("perLap = (%v,%t), want %v", perLap, present, tt.wantPerLap)
			}
			if usage.PerLap.Provenance() != schema.ProvenanceDerived {
				t.Fatalf("perLap provenance = %v, want derived", usage.PerLap.Provenance())
			}
			if last, ok := usage.LastLap.Value(); !ok || math.Abs(float64(last)-tt.wantLast) > 1e-9 {
				t.Fatalf("lastLap = (%v,%t), want %v", last, ok, tt.wantLast)
			}
			if window, ok := usage.WindowLaps.Value(); !ok || window != tt.wantWindow {
				t.Fatalf("windowLaps = (%v,%t), want %v", window, ok, tt.wantWindow)
			}
		})
	}
}

func TestFuelUsageTrackerRejectsUnobservedProvenance(t *testing.T) {
	t.Parallel()

	tracker := newFuelUsageTracker(0)
	header, observed := fuelBatch(1, fuelStep{lap: 1, fuel: 100})
	observed.Vehicles[0].Fuel = mustDerived(energy.Fuel{Amount: 100, Capacity: 110}, schema.FreshnessFresh)
	usage := tracker.Apply(header, observed)
	if usage.Freshness != schema.FreshnessInvalid {
		t.Fatalf("freshness = %v, want invalid for a non observed tank", usage.Freshness)
	}
	if _, present := usage.PerLap.Value(); present {
		t.Fatal("a non observed tank must not seed the window")
	}
}

func TestCloneFuelUsageTrackerLeavesTheCommittedWindowUntouched(t *testing.T) {
	t.Parallel()

	committed := newFuelUsageTracker(0)
	for index, step := range []fuelStep{{lap: 1, fuel: 100}, {lap: 2, fuel: 96}} {
		header, observed := fuelBatch(schema.Sequence(index+1), step)
		committed.Apply(header, observed)
	}
	candidate := cloneFuelUsageTracker(committed)
	header, observed := fuelBatch(3, fuelStep{lap: 3, fuel: 90})
	candidate.Apply(header, observed)

	if len(committed.samples) != 1 {
		t.Fatalf("committed window = %v, want the single lap it measured", committed.samples)
	}
	if len(candidate.samples) != 2 {
		t.Fatalf("candidate window = %v, want two laps", candidate.samples)
	}
}

func TestPipelinePublishesTheCanonicalFuelDerivation(t *testing.T) {
	t.Parallel()

	found := false
	for _, algorithm := range canonicalVersions() {
		if algorithm.ID == DerivationFuelUsage {
			found = true
			if algorithm.Version == 0 {
				t.Fatal("the fuel derivation must publish a version")
			}
		}
	}
	if !found {
		t.Fatal("fuel.per-lap must appear in the canonical algorithm versions")
	}
}

func fuelBatch(sequence schema.Sequence, step fuelStep) (envelope.Header, core.ObservedState) {
	freshness := step.freshness
	if freshness == 0 {
		freshness = schema.FreshnessFresh
	}
	sessionID := step.session
	if sessionID == "" {
		sessionID = "session"
	}
	stintID := step.stint
	if stintID == "" {
		stintID = "stint-1"
	}
	epoch := step.epoch
	if epoch == 0 {
		epoch = 1
	}
	capacity := step.capacity
	if capacity == 0 {
		capacity = 110
	}
	run := identity.RunIdentity{Event: "event", Session: sessionID, Vehicle: "player", Stint: stintID}
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: epoch, Sequence: sequence},
		Clock: schema.NewClock(
			schema.MissingField[time.Duration](),
			schema.MissingField[time.Duration](),
			deltaCapturedAt(sequence),
		),
		Identity: run,
	}
	playerPresent := derivedInput(true, freshness)
	player := derivedInput(true, freshness)
	if step.noPlayer {
		playerPresent = schema.MissingField[bool]()
	}
	observed := core.ObservedState{
		SourceTime:    derivedInput(time.Duration(sequence)*100*time.Millisecond, freshness),
		PlayerPresent: playerPresent,
		Vehicles: []core.VehicleState{{
			Identity:  run,
			Player:    player,
			LapNumber: derivedInput(step.lap, freshness),
			InPit:     derivedInput(pit.InPit(step.inPit), freshness),
			Fuel: derivedInput(
				energy.Fuel{Amount: energy.FuelAmount(step.fuel), Capacity: energy.FuelCapacity(capacity)},
				freshness,
			),
		}},
	}
	return header, observed
}
