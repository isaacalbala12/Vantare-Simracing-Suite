package solver

import (
	"math"
	"testing"
)

func TestReplayDecisionV2MatchesSolvedRecommendation(t *testing.T) {
	input := baseInputV2()
	solved, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}

	replayed, err := ReplayDecisionV2(input, solved.Best)
	if err != nil {
		t.Fatalf("ReplayDecisionV2: %v", err)
	}
	if !replayed.Feasible {
		t.Fatalf("replay unexpectedly infeasible: %+v", replayed.Reasons)
	}
	if math.Abs(replayed.Evaluation.TotalSeconds-solved.Expected.TotalSeconds) > 1e-9 {
		t.Fatalf("total = %.12f, want %.12f", replayed.Evaluation.TotalSeconds, solved.Expected.TotalSeconds)
	}
	stintTotal := 0.0
	for _, stint := range replayed.Stints {
		stintTotal += stint.Evaluation.TotalSeconds
	}
	if math.Abs(stintTotal-replayed.Evaluation.TotalSeconds) > 1e-9 {
		t.Fatalf("stint total = %.12f, want replay total %.12f", stintTotal, replayed.Evaluation.TotalSeconds)
	}
}

func TestReplayDecisionV2ReportsFixedPlanConstraintViolation(t *testing.T) {
	input := baseInputV2()
	decision := DecisionVector{
		Stints:   []StintDecision{{Laps: 3}, {Laps: 2}},
		PitStops: []PitStopDecision{{Lap: 3, FuelLiters: 2}},
	}

	replayed, err := ReplayDecisionV2(input, decision)
	if err != nil {
		t.Fatalf("ReplayDecisionV2: %v", err)
	}
	if replayed.Feasible {
		t.Fatal("resource-violating replay reported feasible")
	}
	if len(replayed.Reasons) != 1 || replayed.Reasons[0].Code != "resource_exhausted" {
		t.Fatalf("reasons = %+v, want resource_exhausted", replayed.Reasons)
	}
}

func TestReplayDecisionV2RejectsPitOutsideStintBoundary(t *testing.T) {
	input := baseInputV2()
	decision := DecisionVector{
		Stints:   []StintDecision{{Laps: 2}, {Laps: 3}},
		PitStops: []PitStopDecision{{Lap: 3, FuelLiters: 2}},
	}

	if _, err := ReplayDecisionV2(input, decision); !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("error = %v, want invalid input", err)
	}
}
