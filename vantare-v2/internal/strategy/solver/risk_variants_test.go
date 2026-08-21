package solver

import (
	"reflect"
	"testing"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestSolveV2FastWarnsAboutFuelRiskAndConservativeKeepsMargin(t *testing.T) {
	input := rangedFuelInput(1, 1.1)

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	fast := requireVariant(t, result, SolverVariantFast)
	conservative := requireVariant(t, result, SolverVariantConservative)
	if fast.WorstCaseFeasible || !hasRisk(fast.Risks, "worst_case_fuel_shortfall") {
		t.Fatalf("fast variant must expose its hard fuel risk: %+v", fast)
	}
	if !conservative.WorstCaseFeasible || len(conservative.Risks) != 0 {
		t.Fatalf("conservative variant must exclude hard risk: %+v", conservative)
	}
	if reflect.DeepEqual(fast.Decision, conservative.Decision) {
		t.Fatalf("conservative variant reused the risky decision: fast=%+v conservative=%+v", fast.Decision, conservative.Decision)
	}
	if conservative.Expected.TotalSeconds < fast.Expected.TotalSeconds {
		t.Fatalf("risk margin cannot beat the expected optimum: fast=%v conservative=%v", fast.Expected.TotalSeconds, conservative.Expected.TotalSeconds)
	}
	if len(result.Sensitivities) < 2 || !hasRiskSensitivity(result.Sensitivities, "fuelConsumptionPerLap") {
		t.Fatalf("consumption sensitivity was not consolidated: %+v", result.Sensitivities)
	}
}

func TestSolveV2VariantsConvergeWhenRangesAreNarrow(t *testing.T) {
	input := rangedFuelInput(1, 1)

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	fast := requireVariant(t, result, SolverVariantFast)
	balanced := requireVariant(t, result, SolverVariantBalanced)
	conservative := requireVariant(t, result, SolverVariantConservative)
	if !reflect.DeepEqual(fast.Decision, balanced.Decision) || !reflect.DeepEqual(fast.Decision, conservative.Decision) {
		t.Fatalf("narrow ranges must converge: fast=%+v balanced=%+v conservative=%+v", fast.Decision, balanced.Decision, conservative.Decision)
	}
	if !fast.WorstCaseFeasible || !balanced.WorstCaseFeasible || !conservative.WorstCaseFeasible {
		t.Fatalf("narrow range unexpectedly created risk: %+v", result.Variants)
	}
}

func TestSolveV2WorstCaseMarksTyreLifeViolation(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 8
	input.FuelCapacityLiters, input.FuelPerLapLiters = 0, 0
	input.TyreLifeLaps = 4
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 20)}, 20, 0, 0)
	lower, upper, estimate := 3.0, 4.0, 4
	input.Projection.TyreDegradation = sp.TyreDegradationFamily{
		Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "tyre-range"},
		Confidence:       sp.Confidence{SampleSize: 20, ComputationVersion: "tyre-range.v1"},
		LifeLapsEstimate: &estimate, LifeLapsRangeLower: &lower, LifeLapsRangeUpper: &upper,
	}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	fast := requireVariant(t, result, SolverVariantFast)
	conservative := requireVariant(t, result, SolverVariantConservative)
	if !hasRisk(fast.Risks, "worst_case_tyre_life_exceeded") || fast.WorstCaseFeasible {
		t.Fatalf("fast variant lost tyre-life risk: %+v", fast)
	}
	if !conservative.WorstCaseFeasible || len(conservative.Risks) != 0 {
		t.Fatalf("conservative variant did not select a tyre-safe plan: %+v", conservative)
	}
}

func TestSolveV2P95BudgetDegradesDiscretizationDeterministically(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 5
	input.FuelCapacityLiters = 10
	input.FuelPerLapLiters = 1
	input.Discretization.FuelLiters = 0.1
	input.Budget.P95Millis = 1

	first, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	degradation := first.ComputeStats.Degradation
	if !degradation.Applied || degradation.Reason != "p95_budget_reduced_service_discretization" {
		t.Fatalf("budget degradation was silent: %+v", degradation)
	}
	if degradation.Effective.FuelLiters <= degradation.Requested.FuelLiters {
		t.Fatalf("effective grid was not coarser: %+v", degradation)
	}
	if !hasSolverReason(first.Assumptions, "compute_budget_degraded") {
		t.Fatalf("result did not declare degradation: %+v", first.Assumptions)
	}
	for attempt := 0; attempt < 20; attempt++ {
		again, err := SolveV2(input)
		if err != nil {
			t.Fatalf("SolveV2 repeat: %v", err)
		}
		if again.ComputeStats.Degradation != degradation || !reflect.DeepEqual(again.Best, first.Best) || !reflect.DeepEqual(again.Variants, first.Variants) {
			t.Fatalf("degradation changed on attempt %d: first=%+v again=%+v", attempt, first.ComputeStats.Degradation, again.ComputeStats.Degradation)
		}
	}

	input.Budget.P95Millis = 500
	full, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2 full budget: %v", err)
	}
	if full.ComputeStats.Degradation.Applied {
		t.Fatalf("ample budget unexpectedly degraded: %+v", full.ComputeStats.Degradation)
	}
}

func rangedFuelInput(mean, upper float64) SolverInputV2 {
	input := baseInputV2()
	input.RaceLaps = 8
	input.Formation.Seconds = 0
	input.FuelCapacityLiters = 4.4
	input.FuelPerLapLiters = mean
	input.Discretization.FuelLiters = 1
	input.PitCost.RefuelRateLPerS = 100
	input.PitCost.TyreSeconds = 0
	input.PitCost.ServiceMode = "sequential"
	input.FuelWeight = fuelWeightParameter(0.0001, sp.ProvenanceManual)
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 20)}, 20, 0, 0)
	input.Projection.FuelConsumption = sp.ResourceConsumptionFamily{
		Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "fuel-range"},
		Confidence: sp.Confidence{SampleSize: 20, ComputationVersion: "fuel-range.v1"},
		MeanPerLap: mean, RangeLower: mean, RangeUpper: upper,
	}
	return input
}

func requireVariant(t *testing.T, result SolverResultV2, kind SolverVariantKind) SolverVariantV2 {
	t.Helper()
	variant, ok := variantByKind(result.Variants, kind)
	if !ok {
		t.Fatalf("variant %s missing: %+v", kind, result.Variants)
	}
	return variant
}

func hasRisk(risks []SolverRisk, code string) bool {
	for _, risk := range risks {
		if risk.Code == code {
			return true
		}
	}
	return false
}

func hasRiskSensitivity(sensitivities []SolverSensitivity, parameter string) bool {
	for _, sensitivity := range sensitivities {
		if sensitivity.Parameter == parameter {
			return true
		}
	}
	return false
}

func hasSolverReason(reasons []SolverReason, code string) bool {
	for _, reason := range reasons {
		if reason.Code == code {
			return true
		}
	}
	return false
}
