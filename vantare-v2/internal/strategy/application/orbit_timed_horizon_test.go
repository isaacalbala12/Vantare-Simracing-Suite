package application

import (
	"errors"
	document "github.com/vantare/overlays/v2/internal/strategy/document"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
	"testing"
)

func TestOrbitTimedRaceDoesNotStartLapsAfterExpiry(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.TankLiters = 4
	input.Event.PitLossSeconds = 300
	result, err := calculateOrbit(input)
	if err != nil {
		if !errors.Is(err, ErrCalculationOverflow) {
			t.Fatal(err)
		}
		return
	} // A non-convergent horizon must not publish an impossible recommendation.
	plan := result.Plans["s1"]
	for _, stint := range plan.Stints {
		for lap := int64(0); lap < stint.Laps; lap++ {
			if start := stint.StartSeconds + float64(lap)*stint.Pace; start >= 240 {
				t.Fatalf("lap starts at %v after expiry: %+v", start, plan)
			}
		}
	}
}

func TestOrbitTimedRaceUsesActualLastLapCost(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.PitLossSeconds = 1000 // Keep the cost-optimal decision in one stint.
	input.PlanningInputs = &document.PlanningInputs{Overrides: map[document.PlanningInputField]document.NumericInputOverride{
		document.PlanningInputDegradation: {Value: 100, Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "test:degradation"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"}},
	}}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["s1"]
	// Lap durations 60, 160, 260: lap three begins at 220 and finishes at 480.
	if plan.TotalLaps != 3 || plan.FinalLapStartSeconds != 220 || plan.TotalSeconds != 480 {
		t.Fatalf("last lap clock=%+v", plan)
	}
}

func TestOrbitTimedRaceReportsNonConvergentHorizon(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.DurationMinutes = 20
	input.Event.TankLiters = 4
	input.Event.PitLossSeconds = 90
	_, err := calculateOrbit(input)
	if !errors.Is(err, ErrCalculationOverflow) {
		t.Fatalf("cycle must have a typed unavailable result: %v", err)
	}
}

func TestOrbitTimedRaceRecalculatesStopsAndResources(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.DurationMinutes = 18
	input.Event.TankLiters = 4
	input.Event.PitLossSeconds = 90
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["s1"]
	if plan.TotalLaps != 14 || plan.Stops != 3 || !plan.ReserveSatisfied {
		t.Fatalf("inconsistent horizon: %+v", plan)
	}
	if plan.TotalSeconds < 1080-1e-8 || plan.TotalSeconds > 1140+1e-8 {
		t.Fatalf("finish=%v", plan.TotalSeconds)
	}
}

func TestOrbitTimedRaceExactBoundaryAndCurrentLap(t *testing.T) {
	for _, seconds := range []float64{239, 240, 241} {
		input := finalEvaluationInput()
		input.Event.DurationMinutes = seconds / 60
		result, err := calculateOrbit(input)
		if err != nil {
			t.Fatal(err)
		}
		want := int64(4)
		if seconds > 240 {
			want = 5
		}
		if got := result.Plans["s1"].TotalLaps; got != want {
			t.Fatalf("duration=%v got=%v want=%v", seconds, got, want)
		}
	}
}
