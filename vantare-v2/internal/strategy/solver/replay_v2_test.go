package solver

import (
	"math"
	"testing"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestReplayExplicitInitialResourcesCannotBeRaised(t *testing.T) {
	input := baseInputV2()
	input.VECapacityPercent = NewFallbackScalar(2, "test:ve-capacity")
	input.VEPerLapPercent = NewFallbackScalar(1, "test:ve-per-lap")
	solved, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	for _, loads := range [][2]float64{{0, input.VECapacityPercent.Value}, {input.FuelCapacityLiters.Value, 0}} {
		if loads[1] == 0 && input.VECapacityPercent.Value == 0 {
			continue
		}
		replayed, err := ReplayDecisionV2WithResources(input, solved.Best, loads[0], loads[1])
		if err != nil {
			t.Fatal(err)
		}
		if replayed.Feasible {
			t.Fatalf("empty initial resource accepted: %v", loads)
		}
	}
	if _, err := ReplayDecisionV2WithResources(input, solved.Best, math.NaN(), 0); !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("invalid initial load: %v", err)
	}
}

func TestReplayExplicitLoadChangesFuelWeightCost(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 2
	input.FuelCapacityLiters = NewFallbackScalar(10, "test:tank")
	input.FuelWeight = &FuelWeightParameter{
		Presence: sp.PresenceValid, SecondsPerLiter: 1,
		Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "test:fuel-weight"},
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"},
	}
	decision := DecisionVector{Stints: []StintDecision{{Laps: 2}}}
	light, err := ReplayDecisionV2WithResources(input, decision, 3, 0)
	if err != nil {
		t.Fatal(err)
	}
	heavy, err := ReplayDecisionV2WithResources(input, decision, 5, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !light.Feasible || !heavy.Feasible {
		t.Fatal("valid initial loads rejected")
	}
	// Two extra litres carried over both laps at one second per litre.
	if math.Abs(heavy.Evaluation.TotalSeconds-light.Evaluation.TotalSeconds-4) > 1e-9 {
		t.Fatalf("load delta ignored: light=%+v heavy=%+v", light.Evaluation, heavy.Evaluation)
	}
}

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
