package solver

import (
	"context"
	"errors"
	"fmt"
	"testing"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func timedInput(durationSeconds float64) SolverInputV2 {
	input := baseInputV2()
	input.RaceLaps = 20
	input.RaceDurationSeconds = &durationSeconds
	input.BaseLapSeconds = NewFallbackScalar(60, "test:timed-base-lap")
	input.Formation.Seconds = NewFallbackScalar(0, "test:timed-formation")
	input.FuelCapacityLiters = NewFallbackScalar(20, "test:timed-fuel-capacity")
	return input
}

func timedDecisionLaps(decision DecisionVector) int64 {
	var laps int64
	for _, stint := range decision.Stints {
		laps += stint.Laps
	}
	return laps
}

func TestSolveV2TimedBoundaryUsesActualLapStart(t *testing.T) {
	for _, tc := range []struct {
		duration float64
		wantLaps int64
	}{
		{duration: 239, wantLaps: 4},
		{duration: 240, wantLaps: 4},
		{duration: 241, wantLaps: 5},
	} {
		t.Run(fmt.Sprintf("%.0f_seconds", tc.duration), func(t *testing.T) {
			input := timedInput(tc.duration)
			result, err := SolveV2(input)
			if err != nil {
				t.Fatalf("SolveV2: %v", err)
			}
			if !result.Feasible || timedDecisionLaps(result.Best) != tc.wantLaps {
				t.Fatalf("duration %.0f: feasible=%v laps=%d result=%+v", tc.duration, result.Feasible, timedDecisionLaps(result.Best), result)
			}
			replayed, err := ReplayDecisionV2(input, result.Best)
			if err != nil {
				t.Fatalf("ReplayDecisionV2: %v", err)
			}
			if !replayed.Feasible || replayed.FinalLapStartSeconds >= tc.duration || replayed.Evaluation.TotalSeconds < tc.duration {
				t.Fatalf("duration %.0f: replay=%+v", tc.duration, replayed)
			}
		})
	}
}

func TestSolveV2TimedCountsFormationOnce(t *testing.T) {
	input := timedInput(600)
	input.Formation.Seconds = NewFallbackScalar(130, "test:timed-formation")
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || timedDecisionLaps(result.Best) != 8 || result.Expected.TotalSeconds != 610 {
		t.Fatalf("timed formation result = %+v", result)
	}
	replayed, err := ReplayDecisionV2(input, result.Best)
	if err != nil || replayed.FinalLapStartSeconds != 550 {
		t.Fatalf("timed formation replay = %+v, err=%v", replayed, err)
	}
}

func TestSolveV2TimedChecksFinishAfterCanonicalInitialLoad(t *testing.T) {
	input := timedInput(200)
	input.FuelCapacityLiters = NewFallbackScalar(10, "test:timed-fuel-capacity")
	input.FuelWeight = &FuelWeightParameter{
		Presence: sp.PresenceValid, SecondsPerLiter: 1,
		Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "test:timed-fuel-weight"},
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"},
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || timedDecisionLaps(result.Best) != 4 || result.Expected.TotalSeconds != 250 {
		t.Fatalf("canonical timed result = %+v", result)
	}
	replayed, err := ReplayDecisionV2(input, result.Best)
	if err != nil || replayed.FinalLapStartSeconds != 189 {
		t.Fatalf("canonical timed replay = %+v, err=%v", replayed, err)
	}
}

func TestSolveV2TimedDriverMinimumCanExceedAverageSeed(t *testing.T) {
	input := timedInput(180)
	minimumFast := int64(3)
	input.DriverProfiles = []DriverProfileInput{
		manualDriver("fast", 60, 1),
		manualDriver("slow", 180, 1),
	}
	input.EventRules.DriverLimits = map[string]DriverLimit{"fast": {MinLaps: &minimumFast}}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || timedDecisionLaps(result.Best) != 3 || len(result.Best.Stints) != 1 || result.Best.Stints[0].Driver != "fast" {
		t.Fatalf("timed driver minimum result = %+v", result)
	}
}

func TestSolveV2TimedPitCanConsumeRemainingClock(t *testing.T) {
	input := timedInput(240)
	oneLap := int64(1)
	input.DriverProfiles = []DriverProfileInput{
		manualDriver("fast", 60, 1),
		manualDriver("slow", 120, 1),
	}
	input.EventRules.DriverLimits = map[string]DriverLimit{
		"fast": {MaxLaps: &oneLap},
		"slow": {MaxLaps: &oneLap},
	}
	input.EventRules.MinPitStops = intPointer(1)
	input.PitCost.TransitSeconds = NewFallbackScalar(100, "test:timed-pit")
	input.PitCost.TyreSeconds = NewFallbackScalar(0, "test:timed-tyres")
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || timedDecisionLaps(result.Best) != 2 || len(result.Best.PitStops) != 1 || result.Expected.TotalSeconds != 280 {
		t.Fatalf("timed pit result = %+v", result)
	}
	replayed, err := ReplayDecisionV2(input, result.Best)
	if err != nil || replayed.FinalLapStartSeconds >= 240 {
		t.Fatalf("timed pit replay = %+v, err=%v", replayed, err)
	}
}

func TestSolveV2TimedPreservesCancellationAndBudgetErrors(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := SolveV2Context(ctx, timedInput(240)); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled timed solve error = %v", err)
	}

	input := timedInput(240)
	input.Budget.MaxCandidates = 1
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("budgeted timed solve: %v", err)
	}
	if result.Feasible || len(result.Reasons) != 1 || result.Reasons[0].Code != "candidate_budget_exhausted" {
		t.Fatalf("budgeted timed result = %+v", result)
	}
}
