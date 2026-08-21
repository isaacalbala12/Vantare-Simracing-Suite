package solver

import (
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func baseInputV2() SolverInputV2 {
	return SolverInputV2{
		ContractVersion: SolverContractVersionV2,
		RaceLaps:        5,
		BaseLapSeconds:  90,
		PitCost: PitCostModel{
			TransitSeconds: 10, RefuelRateLPerS: 1, VERatePPerS: 2, TyreSeconds: 2,
			ServiceMode: manual.PitServiceParallel,
		},
		Formation:          Formation{Seconds: 3, Presence: "valid"},
		Budget:             ComputeBudget{P95Millis: 10_000},
		FuelCapacityLiters: 2,
		FuelPerLapLiters:   1,
		Discretization:     ServiceDiscretization{FuelLiters: 1, VEPercent: 1},
	}
}

// exhaustiveV2Best enumera sin poda exactamente las vueltas de parada y los
// multiplos discretizados de Fuel/VE que SolveV2 puede escoger. Solo usa casos
// enteros pequenos porque su crecimiento es deliberadamente exponencial.
func exhaustiveV2Best(t *testing.T, input SolverInputV2) float64 {
	t.Helper()
	fuel, ve, err := input.serviceResources()
	if err != nil {
		t.Fatalf("serviceResources: %v", err)
	}
	paceCost, err := input.stintPaceCost()
	if err != nil {
		t.Fatalf("stintPaceCost: %v", err)
	}
	best := math.Inf(1)
	var walk func(lap, fuelLeft, veLeft int64, stops int, total float64)
	walk = func(lap, fuelLeft, veLeft int64, stops int, total float64) {
		node := searchNode{lap: lap, fuel: fuelLeft, ve: veLeft}
		maxLaps := runnableLaps(input.RaceLaps-lap, node, fuel, ve, input.TyreLifeLaps)
		for stintLaps := int64(1); stintLaps <= maxLaps; stintLaps++ {
			stint, err := paceCost.stint(stintLaps, input.BaseLapSeconds)
			if err != nil {
				t.Fatalf("paceCost.stint: %v", err)
			}
			nextLap := lap + stintLaps
			nextFuel := fuelLeft - fuel.perLap*stintLaps
			nextVE := veLeft - ve.perLap*stintLaps
			nextTotal := total + stint.TotalSeconds
			if nextLap == input.RaceLaps {
				if allowed, _, _ := input.stopCountAllowed(stops); allowed && nextTotal < best {
					best = nextTotal
				}
				continue
			}
			for _, fuelAmount := range serviceAmounts(nextFuel, fuel) {
				for _, veAmount := range serviceAmounts(nextVE, ve) {
					pitInput, err := solverPitInput(input, fuelAmount, veAmount)
					if err != nil {
						t.Fatalf("solverPitInput: %v", err)
					}
					pit, err := manual.CalculatePitStop(pitInput)
					if err != nil {
						t.Fatalf("CalculatePitStop: %v", err)
					}
					if input.EventRules.MaxPitStops == nil || stops < *input.EventRules.MaxPitStops {
						walk(nextLap, nextFuel+fuelAmount, nextVE+veAmount, stops+1, nextTotal+pit.TotalSeconds.Value())
					}
				}
			}
		}
	}
	walk(0, fuel.capacity, ve.capacity, 0, input.Formation.Seconds)
	return best
}

func curveProjection(points []sp.PacePoint, sampleSize int, lower, upper float64) *sp.StrategyInputProjectionV2 {
	return &sp.StrategyInputProjectionV2{
		ContractVersion:    sp.ContractVersionStrategyInputProjectionV2,
		GeneratedAt:        time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC),
		ComputationVersion: "solver-test.v1", SourceSessions: []string{"session-1"}, CombinationID: "combo-1",
		CombinedStintPaceCurve: sp.CombinedStintPaceCurve{
			Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "aggregate:combo-1"},
			Confidence:      sp.Confidence{SampleSize: sampleSize, RangeLower: &lower, RangeUpper: &upper, ComputationVersion: "derived-curves.v1"},
			Identifiability: sp.IdentifiabilityCombinedOnly, Points: points,
		},
		Pit: sp.PitFamily{Presence: sp.PresenceMissing},
	}
}

func pacePoint(lap int, delta float64, samples int) sp.PacePoint {
	lower, upper := delta, delta
	return sp.PacePoint{LapInStint: lap, DeltaSeconds: delta, SampleSize: samples, RangeLower: &lower, RangeUpper: &upper}
}

func TestCombinedStintPaceCurveInterpolatesAndExtrapolatesConservatively(t *testing.T) {
	input := baseInputV2()
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(3, 0.5, 2), pacePoint(1, 0, 2)}, 2, 0, 4)
	cost, err := input.stintPaceCost()
	if err != nil {
		t.Fatalf("stintPaceCost: %v", err)
	}
	checks := []struct {
		name string
		lap  int64
		want float64
	}{
		{name: "primer punto", lap: 1, want: 0},
		{name: "interpolacion", lap: 2, want: 0.25},
		{name: "ultimo punto", lap: 3, want: 0.5},
		{name: "extrapolacion por rango y N", lap: 4, want: 0.5 + 4/math.Sqrt(2)},
	}
	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			if got := cost.deltaAt(check.lap); math.Abs(got-check.want) > epsilon {
				t.Fatalf("lap %d delta = %v, want %v", check.lap, got, check.want)
			}
		})
	}
}

func TestSolveV2RejectsInvalidSelectedCurve(t *testing.T) {
	input := baseInputV2()
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 2), pacePoint(1, 1, 2)}, 2, 0, 1)
	_, err := SolveV2(input)
	if err == nil || !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("SolveV2 error = %v, want invalid_input", err)
	}
}

func TestSolveV2UsesDerivedCurveAndPreservesProvenance(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.FuelCapacityLiters = 0
	input.FuelPerLapLiters = 0
	input.PitCost.TransitSeconds = 100
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 4), pacePoint(3, 2, 4)}, 4, 0, 4)

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || result.StintPaceCost.Model != StintPaceModelCombinedCurve || result.StintPaceCost.Provenance.SourceID != "aggregate:combo-1" {
		t.Fatalf("curve source was not preserved: %+v", result)
	}
	if result.Expected.DegradationSeconds != 7 || result.Expected.TotalSeconds != 370 {
		t.Fatalf("curve evaluation = %+v", result.Expected)
	}
	if len(result.Sensitivities) != 1 || result.Sensitivities[0].Parameter != "combinedStintPaceCurve" || result.Sensitivities[0].ImpactSeconds <= 0 {
		t.Fatalf("curve sensitivity = %+v", result.Sensitivities)
	}
}

func TestSolveV2LateCliffChangesOptimalStopAgainstLinearApproximation(t *testing.T) {
	linear := baseInputV2()
	linear.RaceLaps = 8
	linear.FuelCapacityLiters = 0
	linear.FuelPerLapLiters = 0
	linear.Formation.Seconds = 0
	linear.PitCost.TransitSeconds = 1
	linear.PitCost.TyreSeconds = 0
	linear.DegradationPerLap = 0.05

	linearResult, err := SolveV2(linear)
	if err != nil {
		t.Fatalf("SolveV2(linear): %v", err)
	}
	cliff := linear
	cliff.Projection = curveProjection([]sp.PacePoint{
		pacePoint(1, 0, 20), pacePoint(4, 0, 20), pacePoint(5, 8, 20),
	}, 20, 0, 8)
	cliffResult, err := SolveV2(cliff)
	if err != nil {
		t.Fatalf("SolveV2(cliff): %v", err)
	}
	if len(linearResult.Best.PitStops) != 0 {
		t.Fatalf("linear approximation unexpectedly stops: %+v", linearResult.Best)
	}
	if len(cliffResult.Best.PitStops) != 1 || cliffResult.Best.PitStops[0].Lap != 4 {
		t.Fatalf("late cliff did not move the optimum to lap 4: %+v", cliffResult.Best)
	}
}

func TestSolveV2CurveMatchesExhaustiveOracle(t *testing.T) {
	for _, raceLaps := range []int64{3, 4, 5, 6} {
		input := baseInputV2()
		input.RaceLaps = raceLaps
		input.Projection = curveProjection([]sp.PacePoint{
			pacePoint(1, 0, 6), pacePoint(3, 0.4, 5), pacePoint(5, 2.4, 2),
		}, 6, 0, 2.4)
		got, err := SolveV2(input)
		if err != nil {
			t.Fatalf("SolveV2(laps=%d): %v", raceLaps, err)
		}
		want := exhaustiveV2Best(t, input)
		if !got.Feasible || math.Abs(got.Expected.TotalSeconds-want) > epsilon {
			t.Fatalf("laps=%d: solver=%v feasible=%v exhaustive=%v", raceLaps, got.Expected.TotalSeconds, got.Feasible, want)
		}
	}
}

func TestSolveV2MatchesExhaustiveStopsAndServiceQuantities(t *testing.T) {
	for _, raceLaps := range []int64{2, 3, 4, 5, 6} {
		for _, degradation := range []float64{0, 0.5} {
			for _, mode := range []manual.PitServiceMode{manual.PitServiceParallel, manual.PitServiceSequential} {
				input := baseInputV2()
				input.RaceLaps = raceLaps
				input.DegradationPerLap = degradation
				input.PitCost.ServiceMode = mode
				input.VECapacityPercent = 2
				input.VEPerLapPercent = 1

				got, err := SolveV2(input)
				if err != nil {
					t.Fatalf("SolveV2(laps=%d degradation=%v mode=%s): %v", raceLaps, degradation, mode, err)
				}
				want := exhaustiveV2Best(t, input)
				if !got.Feasible || math.Abs(got.Expected.TotalSeconds-want) > epsilon {
					t.Fatalf("laps=%d degradation=%v mode=%s: solver=%v feasible=%v exhaustive=%v", raceLaps, degradation, mode, got.Expected.TotalSeconds, got.Feasible, want)
				}
			}
		}
	}
}

func TestSolveV2ExposesPerStopBreakdownAndBinding(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.VECapacityPercent = 2
	input.VEPerLapPercent = 1
	input.PitCost.VERatePPerS = 2

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if len(result.Best.PitStops) != 1 {
		t.Fatalf("pit stops = %+v", result.Best.PitStops)
	}
	stop := result.Best.PitStops[0]
	if stop.Lap != 2 || stop.FuelLiters != 2 || stop.VEPercent != 2 {
		t.Fatalf("service decision = %+v", stop)
	}
	if stop.PitBreakdown == nil || stop.PitBreakdown.TravelSeconds.Value() != 10 || stop.PitBreakdown.CoreServiceSeconds.Value() != 2 || stop.PitBreakdown.OverlapSavedSeconds.Value() != 3 || stop.PitBreakdown.TotalSeconds.Value() != 12 {
		t.Fatalf("pit breakdown = %+v", stop.PitBreakdown)
	}
	if result.Binding.Kind != string(ResourceFuel) || result.Binding.Laps != 2 {
		t.Fatalf("binding = %+v", result.Binding)
	}
	if result.Expected.PitSeconds != 12 || result.Expected.FormationSeconds != 3 || result.Expected.TotalSeconds != 375 {
		t.Fatalf("evaluation = %+v", result.Expected)
	}
	if result.StintPaceCost.Model != StintPaceModelManualLinear || result.StintPaceCost.Provenance.Kind != sp.ProvenanceManual {
		t.Fatalf("manual pace source = %+v", result.StintPaceCost)
	}
	if len(result.Sensitivities) != 1 || result.Sensitivities[0].Parameter != "degradationPerLapSeconds" {
		t.Fatalf("manual sensitivity = %+v", result.Sensitivities)
	}
}

func TestSolveV2KeepsInfeasibleCandidateReason(t *testing.T) {
	input := baseInputV2()
	input.FuelCapacityLiters = 0.5
	input.Discretization.FuelLiters = 0.5

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if result.Feasible || len(result.Reasons) == 0 || len(result.CandidateDetails) == 0 {
		t.Fatalf("infeasible result lost its reasons: %+v", result)
	}
	if result.CandidateDetails[0].Feasible || len(result.CandidateDetails[0].Reasons) == 0 {
		t.Fatalf("infeasible candidate = %+v", result.CandidateDetails[0])
	}
}

func TestSolveV2AppliesPitStopCountRulesWithoutHidingRejections(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 2
	input.FuelCapacityLiters = 2
	minimum := 1
	maximum := 1
	input.EventRules.MinPitStops = &minimum
	input.EventRules.MaxPitStops = &maximum

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || len(result.Best.PitStops) != 1 {
		t.Fatalf("event-constrained best = %+v", result)
	}
	var sawMinimumRejection bool
	for _, candidate := range result.CandidateDetails {
		for _, reason := range candidate.Reasons {
			if reason.Code == "minimum_pit_stops" {
				sawMinimumRejection = true
			}
		}
	}
	if !sawMinimumRejection {
		t.Fatalf("no-stop candidate was hidden: %+v", result.CandidateDetails)
	}
}

func TestSolveV2RankingIsDeterministic(t *testing.T) {
	input := baseInputV2()
	first, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	for attempt := 0; attempt < 25; attempt++ {
		again, err := SolveV2(input)
		if err != nil {
			t.Fatalf("SolveV2 repeat: %v", err)
		}
		if first.InputHash != again.InputHash || !reflect.DeepEqual(first.Best, again.Best) || !reflect.DeepEqual(first.Candidates, again.Candidates) || !reflect.DeepEqual(first.CandidateDetails, again.CandidateDetails) {
			t.Fatalf("ranking changed on attempt %d", attempt)
		}
	}
}

func TestV2DominancePreservesStopCountStateRequiredByEventRules(t *testing.T) {
	equalWithMoreStops := searchNode{
		fuel: 2 * serviceScale, ve: 2 * serviceScale, green: 10,
		decision: DecisionVector{PitStops: []PitStopDecision{{Lap: 1}, {Lap: 2}}},
	}
	equalWithFewerStops := searchNode{
		fuel: 2 * serviceScale, ve: 2 * serviceScale, green: 10,
		decision: DecisionVector{PitStops: []PitStopDecision{{Lap: 2}}},
	}
	if dominates(equalWithMoreStops, equalWithFewerStops, 0, true) {
		t.Fatal("a state with no remaining stop allowance cannot dominate one that can still pit")
	}
	if dominates(equalWithMoreStops, equalWithFewerStops, 0, false) {
		t.Fatal("a cheaper tie path with more stops cannot erase the fewer-stop tie breaker")
	}
}
