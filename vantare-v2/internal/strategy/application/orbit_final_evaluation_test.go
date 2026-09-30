package application

import (
	"encoding/json"
	"errors"
	"math"
	"testing"

	document "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func finalEvaluationInput() OrbitCalculationInput {
	return OrbitCalculationInput{Event: OrbitCalculationEvent{DurationMinutes: 4, TankLiters: 10, PitLossSeconds: 100}, Drivers: []OrbitCalculationDriver{{ID: "a", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}}}, Variants: []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"a"}}}, ActiveVariantID: "s1"}
}

func TestOrbitFinalEvaluationRejectsUnderfuelledStint(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.TankLiters = 4
	fuel := 0.1
	input.Variants[0].Overrides = map[int]OrbitCalculationOverride{0: {Fuel: &fuel}}
	_, err := calculateOrbit(input)
	if !errors.Is(err, ErrCalculationInfeasible) {
		t.Fatalf("error=%v; underfuelled plan must be infeasible", err)
	}
}

func TestOrbitFinalEvaluationUsesLastDriverReserve(t *testing.T) {
	input := finalEvaluationInput()
	input.Drivers = append(input.Drivers, OrbitCalculationDriver{ID: "b", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 3}})
	input.Variants[0].Order = []string{"a", "b"}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	p := result.Plans["s1"]
	if !p.ReserveSatisfied || p.ReserveLaps+1e-6 < p.ReserveRequiredLaps {
		t.Fatalf("effective=%v required=%v satisfied=%t", p.ReserveLaps, p.ReserveRequiredLaps, p.ReserveSatisfied)
	}
	if math.Abs(p.FinishFuelLiters-3*orbitDefaultReserveLaps) > 1e-6 {
		t.Fatalf("finish fuel=%v", p.FinishFuelLiters)
	}
}

func TestOrbitFinalEvaluationMatchesSolverCost(t *testing.T) {
	input := finalEvaluationInput()
	input.PlanningInputs = &document.PlanningInputs{Overrides: map[document.PlanningInputField]document.NumericInputOverride{document.PlanningInputDegradation: {Value: 2, Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "test:degradation"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"}}}}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	solved, err := solver.SolveV2(orbitSolverInput(4, input.Event, 60, 1, sp.ClimateBucketDry, input.PlanningInputs))
	if err != nil {
		t.Fatal(err)
	}
	p := result.Plans["s1"]
	if math.Abs(p.TotalSeconds-solved.Expected.TotalSeconds) > 1e-9 {
		t.Fatalf("orbit=%v solver=%v", p.TotalSeconds, solved.Expected.TotalSeconds)
	}
	if math.Abs(p.Stints[0].EndSeconds-p.Stints[0].StartSeconds-p.DrivingSeconds) > 1e-9 {
		t.Fatal("stint clock differs from driving cost")
	}
}

func TestOrbitFinalEvaluationProvesUnchangedSolvedDecision(t *testing.T) {
	input := finalEvaluationInput()
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(result.Plans["s1"])
	if err != nil {
		t.Fatal(err)
	}
	var plan map[string]any
	if err := json.Unmarshal(raw, &plan); err != nil {
		t.Fatal(err)
	}
	if plan["optimality"] != "proven" {
		t.Fatalf("final plan did not preserve solver optimality: %s", raw)
	}
	if plan["modelVersion"] != "strategy.solver.v2" || plan["objective"] != "minimum_total_seconds" {
		t.Fatalf("final plan omitted its model identity: %s", raw)
	}
}

func TestOrbitFinalEvaluationPreservesUneditedSolverRefuelling(t *testing.T) {
	input := finalEvaluationInput()
	input.Event = OrbitCalculationEvent{RaceKind: "laps", TargetLaps: new(int64), TankLiters: 5, PitLossSeconds: 30}
	*input.Event.TargetLaps = 10
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["s1"]
	if plan.Stops == 0 {
		t.Fatal("test requires an optimized pit stop")
	}
	if plan.Optimality != "proven" {
		t.Fatalf("unedited solver decision lost optimality: %+v", plan)
	}
}

func TestOrbitFinalEvaluationPublishesVirtualEnergyOnlyWhenApplicable(t *testing.T) {
	without, err := calculateOrbit(finalEvaluationInput())
	if err != nil {
		t.Fatal(err)
	}
	if without.Plans["s1"].Stints[0].VirtualEnergy != nil {
		t.Fatal("non-applicable virtual energy was published")
	}
	with, err := calculateOrbit(isa825OrbitInput())
	if err != nil {
		t.Fatal(err)
	}
	stint := with.Plans["strategy-1"].Stints[0]
	if stint.VirtualEnergy == nil || *stint.VirtualEnergy <= 0 {
		t.Fatalf("applicable virtual energy load was not published: %+v", stint)
	}
}

func TestOrbitFinalEvaluationDoesNotClaimOptimalityAfterVisibleOverride(t *testing.T) {
	input := finalEvaluationInput()
	fuel := 8.0
	input.Variants[0].Overrides = map[int]OrbitCalculationOverride{0: {Fuel: &fuel}}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	if result.Plans["s1"].Optimality != "not_proven" {
		t.Fatalf("edited final decision claimed optimality: %+v", result.Plans["s1"])
	}
}

func TestOrbitFinalEvaluationRejectsVirtualEnergyOverflowAfterLapEdit(t *testing.T) {
	input := isa825OrbitInput()
	input.Event.DurationMinutes = 60
	laps := int64(25)
	input.Variants[0].Overrides = map[int]OrbitCalculationOverride{0: {Laps: &laps}}
	_, err := calculateOrbit(input)
	if !errors.Is(err, ErrCalculationInfeasible) {
		t.Fatalf("virtual energy overflow accepted: %v", err)
	}
}
