package solver

import (
	"math"
	"testing"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestSolveV2DoesNotRaiseFixedInitialFuel(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 2
	zeroStops := 0
	input.EventRules.MaxPitStops = &zeroStops
	input.InitialFuelLiters = initialResource(1, "test:initial-fuel")

	result, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	if result.Feasible {
		t.Fatalf("underfuelled fixed start became feasible: %+v", result.Best)
	}

	input.InitialFuelLiters = nil
	legacy, err := SolveV2(input)
	if err != nil || !legacy.Feasible {
		t.Fatalf("legacy minimum start changed: feasible=%t err=%v", legacy.Feasible, err)
	}
}

func TestSolveV2FixedInitialLoadMatchesReplayAndFuelWeight(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 2
	input.FuelCapacityLiters = NewFallbackScalar(5, "test:fuel-capacity")
	input.InitialFuelLiters = initialResource(4, "test:initial-fuel")
	input.FuelWeight = &FuelWeightParameter{
		Presence: sp.PresenceValid, SecondsPerLiter: 1,
		Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "test:fuel-weight"},
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"},
	}

	solved, err := SolveV2(input)
	if err != nil || !solved.Feasible {
		t.Fatalf("solve: feasible=%t err=%v", solved.Feasible, err)
	}
	if solved.ResolvedInputs.InitialFuelLiters == nil || solved.ResolvedInputs.InitialFuelLiters.Value != 4 {
		t.Fatalf("resolved initial fuel = %+v", solved.ResolvedInputs.InitialFuelLiters)
	}
	replayed, err := ReplayDecisionV2(input, solved.Best)
	if err != nil || !replayed.Feasible {
		t.Fatalf("replay: feasible=%t err=%v", replayed.Feasible, err)
	}
	if math.Abs(replayed.Evaluation.TotalSeconds-solved.Expected.TotalSeconds) > 1e-9 {
		t.Fatalf("solve/replay differ: solve=%v replay=%v", solved.Expected.TotalSeconds, replayed.Evaluation.TotalSeconds)
	}
	// The fixed four-litre start carries 4 L then 3 L over the two laps.
	if math.Abs(replayed.Evaluation.FuelWeightSeconds-7) > 1e-9 {
		t.Fatalf("fuel weight = %v", replayed.Evaluation.FuelWeightSeconds)
	}
}

func TestSolverV2ValidatesFixedInitialResourcesIndependently(t *testing.T) {
	for _, test := range []struct {
		name string
		fuel *ScalarInput
		ve   *ScalarInput
	}{
		{name: "negative fuel", fuel: initialResource(-1, "test:fuel")},
		{name: "fuel over capacity", fuel: initialResource(3, "test:fuel")},
		{name: "non finite fuel", fuel: initialResource(math.NaN(), "test:fuel")},
		{name: "VE over capacity", ve: initialResource(1, "test:ve")},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := baseInputV2()
			input.InitialFuelLiters = test.fuel
			input.InitialVEPercent = test.ve
			if err := input.Validate(); err == nil {
				t.Fatal("invalid fixed initial resource accepted")
			}
		})
	}
}

func TestSolveV2ExplicitZeroInitialVEDiffersFromAbsence(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 1
	input.FuelCapacityLiters = NewFallbackScalar(0, "test:fuel-capacity")
	input.FuelPerLapLiters = NewFallbackScalar(0, "test:fuel-per-lap")
	input.VECapacityPercent = NewFallbackScalar(1, "test:ve-capacity")
	input.VEPerLapPercent = NewFallbackScalar(1, "test:ve-per-lap")

	legacy, err := SolveV2(input)
	if err != nil || !legacy.Feasible {
		t.Fatalf("legacy solve: feasible=%t err=%v", legacy.Feasible, err)
	}
	input.InitialVEPercent = initialResource(0, "test:initial-ve")
	fixed, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	if fixed.Feasible || fixed.InputHash == legacy.InputHash {
		t.Fatalf("explicit zero lost: feasible=%t hashEqual=%t", fixed.Feasible, fixed.InputHash == legacy.InputHash)
	}
}

func TestSolveV2WorstCaseStartsWithFixedLoad(t *testing.T) {
	input := rangedFuelInput(1, 1.1)
	input.InitialFuelLiters = initialResource(1, "test:initial-fuel")

	result, err := SolveV2(input)
	if err != nil || !result.Feasible {
		t.Fatalf("solve: feasible=%t err=%v", result.Feasible, err)
	}
	fast := requireVariant(t, result, SolverVariantFast)
	if fast.WorstCaseFeasible || !hasRisk(fast.Risks, "worst_case_fuel_shortfall") {
		t.Fatalf("fixed load was raised in worst case: %+v", fast)
	}
}

func TestSolveV2WorstCaseStartsWithFixedVirtualEnergy(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 8
	input.FuelCapacityLiters = NewFallbackScalar(0, "test:fuel-capacity")
	input.FuelPerLapLiters = NewFallbackScalar(0, "test:fuel-per-lap")
	input.VECapacityPercent = NewFallbackScalar(4.4, "test:ve-capacity")
	input.VEPerLapPercent = NewFallbackScalar(0, "test:ve-per-lap")
	input.InitialVEPercent = initialResource(1, "test:initial-ve")
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 20)}, 20, 0, 0)
	input.Projection.VirtualEnergyConsumption = sp.ResourceConsumptionFamily{
		Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "ve-range"},
		Confidence: sp.Confidence{SampleSize: 20, ComputationVersion: "ve-range.v1"},
		MeanPerLap: 1, RangeLower: 1, RangeUpper: 1.1,
	}

	result, err := SolveV2(input)
	if err != nil || !result.Feasible {
		t.Fatalf("solve: feasible=%t err=%v", result.Feasible, err)
	}
	fast := requireVariant(t, result, SolverVariantFast)
	if fast.WorstCaseFeasible || !hasRisk(fast.Risks, "worst_case_virtual_energy_shortfall") {
		t.Fatalf("fixed VE load was raised in worst case: %+v", fast)
	}
}

func TestSolveWeatherScenariosKeepsFixedInitialLoad(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 1
	input.FuelCapacityLiters = NewFallbackScalar(0, "test:fuel-capacity")
	input.FuelPerLapLiters = NewFallbackScalar(0, "test:fuel-per-lap")
	input.VECapacityPercent = NewFallbackScalar(1, "test:ve-capacity")
	input.VEPerLapPercent = NewFallbackScalar(1, "test:ve-per-lap")
	input.InitialVEPercent = initialResource(0, "test:initial-ve")

	_, err := SolveWeatherScenarios(input, WeatherScenarioSet{
		Scenarios: []WeightedWeatherScenario{{Scenario: weatherScenario("dry-fixed-load", [5]float64{}), Weight: 1}},
	})
	if !HasErrorCode(err, ErrorInfeasible) {
		t.Fatalf("weather raised fixed VE load: %v", err)
	}
}

func TestReplayResourcesCannotContradictFixedSolverInput(t *testing.T) {
	input := baseInputV2()
	input.InitialFuelLiters = initialResource(2, "test:initial-fuel")
	decision := DecisionVector{Stints: []StintDecision{{Laps: 1}}}
	if _, err := ReplayDecisionV2WithResources(input, decision, 1, 0); !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("contradictory replay load accepted: %v", err)
	}
}

func initialResource(value float64, sourceID string) *ScalarInput {
	input := NewUserOverrideScalar(value, sourceID)
	return &input
}
