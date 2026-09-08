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

func TestOrbitFinalEvaluationDoesNotClaimOptimality(t *testing.T) {
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
	if plan["optimality"] != "not_proven" {
		t.Fatalf("missing final-plan optimality status: %s", raw)
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
