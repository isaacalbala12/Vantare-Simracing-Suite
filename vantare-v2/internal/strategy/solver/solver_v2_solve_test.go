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
	fuelWeight, err := input.fuelWeightCost()
	if err != nil {
		t.Fatalf("fuelWeightCost: %v", err)
	}
	saving, err := input.savingCost()
	if err != nil {
		t.Fatalf("savingCost: %v", err)
	}
	compoundPace, err := input.compoundPaceCosts()
	if err != nil {
		t.Fatalf("compoundPaceCosts: %v", err)
	}
	tyreModel, err := newTyreDecisionModel(input, compoundPace)
	if err != nil {
		t.Fatalf("newTyreDecisionModel: %v", err)
	}
	costs := lapCostModel{pace: paceCost, compounds: compoundPace, fuelWeight: fuelWeight, fuelPerLap: fuel.perLap}
	best := math.Inf(1)
	var walk func(searchNode)
	walk = func(node searchNode) {
		for _, level := range saving.levels {
			effectiveFuel := fuel.withPerLapSaving(level.fuelSavedPerLap)
			effectiveVE := ve.withPerLapSaving(level.veSavedPerLap)
			maxLaps := runnableLaps(input.RaceLaps-node.lap, node, effectiveFuel, effectiveVE, input.TyreLifeLaps)
			for stintLaps := int64(1); stintLaps <= maxLaps; stintLaps++ {
				next, err := appendStint(node, stintLaps, input, costs, level)
				if err != nil {
					t.Fatalf("appendStint: %v", err)
				}
				next.lap = node.lap + stintLaps
				next.fuel -= effectiveFuel.perLap * stintLaps
				next.ve -= effectiveVE.perLap * stintLaps
				if next.lap == input.RaceLaps {
					if allowed, _, _ := input.completedAllowed(next, tyreModel); allowed && next.total(input.Formation.Seconds) < best {
						best = next.total(input.Formation.Seconds)
					}
					continue
				}
				if _, closed := input.firstClosedWindow(next.lap, next.windowMask); closed {
					continue
				}
				if input.EventRules.MaxPitStops != nil && len(next.decision.PitStops) >= *input.EventRules.MaxPitStops {
					continue
				}
				for _, tyreOption := range tyreModel.nextChoices(next.tyre) {
					for _, fuelAmount := range serviceAmounts(next.fuel, fuel) {
						for _, veAmount := range serviceAmounts(next.ve, ve) {
							afterPit, err := appendPit(next, fuelAmount, veAmount, tyreOption, input)
							if err != nil {
								t.Fatalf("appendPit: %v", err)
							}
							afterPit.fuel += fuelAmount
							afterPit.ve += veAmount
							walk(afterPit)
						}
					}
				}
			}
		}
	}
	for _, choice := range tyreModel.initialChoices() {
		walk(searchNode{
			fuel: fuel.capacity, ve: ve.capacity, tyre: choice,
			decision: DecisionVector{PitStops: []PitStopDecision{}, Stints: []StintDecision{}},
		})
	}
	return best
}

func savingCostParameter(levels ...SavingLevelOption) *SavingCostParameter {
	return &SavingCostParameter{
		Presence:   sp.PresenceValid,
		Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "solver-test:saving"},
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "solver-test.v1"},
		Levels:     levels,
	}
}

func TestSolveV2D6SavingEliminatesShortFinalStintOnlyWhenCheaper(t *testing.T) {
	base := baseInputV2()
	base.RaceLaps = 25
	base.Formation.Seconds = 0
	base.FuelCapacityLiters = 10
	base.FuelPerLapLiters = 1
	base.PitCost.TransitSeconds = 20
	base.PitCost.RefuelRateLPerS = 100
	base.PitCost.TyreSeconds = 0
	base.FuelWeight = fuelWeightParameter(0.02, sp.ProvenanceManual)

	withoutSaving, err := SolveV2(base)
	if err != nil {
		t.Fatalf("SolveV2(without saving): %v", err)
	}
	if len(withoutSaving.Best.PitStops) != 2 {
		t.Fatalf("base plan must need the short third stint: %+v", withoutSaving.Best)
	}

	cheap := base
	cheap.SavingCost = savingCostParameter(SavingLevelOption{
		Level: SavingLow, FuelSavedPerLap: 0.25, TimeCostPerLap: 0.20,
	})
	cheapResult, err := SolveV2(cheap)
	if err != nil {
		t.Fatalf("SolveV2(cheap saving): %v", err)
	}
	if len(cheapResult.Best.PitStops) != 1 || len(cheapResult.Best.Stints) != 2 {
		t.Fatalf("cheap saving did not absorb the short final stint: %+v", cheapResult.Best)
	}
	if len(cheapResult.SavingPlan.Stints) != 2 || math.Abs(cheapResult.SavingPlan.TotalCostSeconds-5) > epsilon {
		t.Fatalf("explicit saving plan = %+v, want two stints and 5 seconds", cheapResult.SavingPlan)
	}
	if math.Abs(cheapResult.SavingPlan.TotalFuelSaved-6.25) > epsilon || cheapResult.Expected.FuelWeightSeconds <= 0 {
		t.Fatalf("saving/weight interaction = plan:%+v evaluation:%+v", cheapResult.SavingPlan, cheapResult.Expected)
	}
	baseRefuel := withoutSaving.Best.PitStops[0].FuelLiters + withoutSaving.Best.PitStops[1].FuelLiters
	if cheapResult.Best.PitStops[0].FuelLiters >= baseRefuel || cheapResult.Expected.PitSeconds >= withoutSaving.Expected.PitSeconds {
		t.Fatalf("saving did not reduce refuel/pit: base=%+v cheap=%+v", withoutSaving.Expected, cheapResult.Expected)
	}
	for _, stint := range cheapResult.SavingPlan.Stints {
		if stint.Level != SavingLow || stint.FuelSavedPerLap != 0.25 || stint.TimeCostPerLap != 0.20 {
			t.Fatalf("saving stint not explicit: %+v", stint)
		}
	}

	expensive := base
	expensive.SavingCost = savingCostParameter(SavingLevelOption{
		Level: SavingHigh, FuelSavedPerLap: 0.25, TimeCostPerLap: 2,
	})
	expensiveResult, err := SolveV2(expensive)
	if err != nil {
		t.Fatalf("SolveV2(expensive saving): %v", err)
	}
	if len(expensiveResult.Best.PitStops) != 2 || expensiveResult.SavingPlan.TotalCostSeconds != 0 {
		t.Fatalf("expensive saving should keep the stop: best=%+v saving=%+v", expensiveResult.Best, expensiveResult.SavingPlan)
	}
}

func TestSolveV2SavingMatchesExhaustiveOracleAndExposesSensitivity(t *testing.T) {
	for _, resource := range []ResourceKind{ResourceFuel, ResourceVirtualEnergy} {
		for _, raceLaps := range []int64{3, 4, 5, 6} {
			input := baseInputV2()
			input.RaceLaps = raceLaps
			level := SavingLevelOption{Level: SavingMid, TimeCostPerLap: 0.15}
			if resource == ResourceFuel {
				level.FuelSavedPerLap = 0.5
			} else {
				input.FuelCapacityLiters, input.FuelPerLapLiters = 0, 0
				input.VECapacityPercent, input.VEPerLapPercent = 2, 1
				level.VESavedPerLap = 0.5
			}
			lower := level
			lower.Level = SavingLow
			lower.FuelSavedPerLap /= 2
			lower.VESavedPerLap /= 2
			lower.TimeCostPerLap /= 3
			input.SavingCost = savingCostParameter(lower, level)
			if resource == ResourceFuel {
				input.FuelWeight = fuelWeightParameter(0.03, sp.ProvenanceManual)
			}

			got, err := SolveV2(input)
			if err != nil {
				t.Fatalf("SolveV2(resource=%s laps=%d): %v", resource, raceLaps, err)
			}
			want := exhaustiveV2Best(t, input)
			if !got.Feasible || math.Abs(got.Expected.TotalSeconds-want) > epsilon {
				t.Fatalf("resource=%s laps=%d: solver=%v exhaustive=%v", resource, raceLaps, got.Expected.TotalSeconds, want)
			}
		}
	}

	input := baseInputV2()
	input.RaceLaps = 5
	input.SavingCost = savingCostParameter(SavingLevelOption{
		Level: SavingLow, FuelSavedPerLap: 0.5, TimeCostPerLap: 0.10,
	})
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2(sensitivity): %v", err)
	}
	var sensitivity *SolverSensitivity
	for index := range result.Sensitivities {
		if result.Sensitivities[index].Parameter == "savingTimeCostPerLap" {
			sensitivity = &result.Sensitivities[index]
		}
	}
	if sensitivity == nil || math.Abs(sensitivity.ImpactSeconds-result.Expected.SavingSeconds*defaultSavingCostSensitivity) > epsilon {
		t.Fatalf("saving sensitivity = %+v expected=%+v", result.Sensitivities, result.Expected)
	}
}

func TestSolveV2AcceptsDerivedSavingOnlyFromABFamily(t *testing.T) {
	input := baseInputV2()
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 10)}, 10, 0, 0)
	input.Projection.SavingCost = sp.SavingCostFamily{
		Presence:   sp.PresenceValid,
		Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "session-ab"},
		Confidence: sp.Confidence{SampleSize: 10, ComputationVersion: "derived-curves.v1"},
		ManualNote: "derived_from_controlled_ab_protocol",
		Levels: []sp.SavingLevel{
			{MixtureCode: 0},
			{MixtureCode: 1, FuelSavedPerLap: 0.5, TimeCostPerLap: 0.1},
		},
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2(valid A/B): %v", err)
	}
	if result.SavingCost.Provenance.SourceID != "session-ab" {
		t.Fatalf("saving source = %+v", result.SavingCost)
	}

	input.Projection.SavingCost.ManualNote = "not_an_ab_protocol"
	if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("invalid derived saving error = %v, want invalid_input", err)
	}
}

func TestSolveV2SavingSourcesFailClosed(t *testing.T) {
	t.Run("reference accepted", func(t *testing.T) {
		input := baseInputV2()
		input.SavingCost = savingCostParameter(SavingLevelOption{
			Level: SavingLow, FuelSavedPerLap: 0.25, TimeCostPerLap: 0.1,
		})
		input.SavingCost.Provenance.Kind = sp.ProvenanceReference
		result, err := SolveV2(input)
		if err != nil {
			t.Fatalf("SolveV2(reference): %v", err)
		}
		if result.SavingCost.Provenance.Kind != sp.ProvenanceReference {
			t.Fatalf("saving source = %+v", result.SavingCost)
		}
	})

	t.Run("two authorities rejected", func(t *testing.T) {
		input := baseInputV2()
		input.SavingCost = savingCostParameter(SavingLevelOption{
			Level: SavingLow, FuelSavedPerLap: 0.25, TimeCostPerLap: 0.1,
		})
		input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 10)}, 10, 0, 0)
		input.Projection.SavingCost = sp.SavingCostFamily{
			Presence:   sp.PresenceValid,
			Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "session-ab"},
			Confidence: sp.Confidence{SampleSize: 10, ComputationVersion: "derived-curves.v1"},
			ManualNote: derivedABSavingMethod,
			Levels:     []sp.SavingLevel{{MixtureCode: 1, FuelSavedPerLap: 0.25, TimeCostPerLap: 0.1}},
		}
		if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
			t.Fatalf("two-authority error = %v, want invalid_input", err)
		}
	})

	t.Run("saving above base consumption rejected", func(t *testing.T) {
		input := baseInputV2()
		input.SavingCost = savingCostParameter(SavingLevelOption{
			Level: SavingHigh, FuelSavedPerLap: 1.01, TimeCostPerLap: 0.1,
		})
		if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
			t.Fatalf("over-saving error = %v, want invalid_input", err)
		}
	})
}

func TestSolveV2SavingStopsImmediatelyWhenCandidateBudgetIsExhausted(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 6
	input.Budget.MaxCandidates = 1
	input.SavingCost = savingCostParameter(
		SavingLevelOption{Level: SavingLow, FuelSavedPerLap: 0.25, TimeCostPerLap: 0.1},
		SavingLevelOption{Level: SavingHigh, FuelSavedPerLap: 0.5, TimeCostPerLap: 0.2},
	)

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if result.Feasible || result.ComputeStats.EvaluatedCandidates != 2 {
		t.Fatalf("budget must stop at the first candidate over the limit: %+v", result.ComputeStats)
	}
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

func fuelWeightParameter(secondsPerLiter float64, kind sp.ProvenanceKind) *FuelWeightParameter {
	return &FuelWeightParameter{
		Presence:        sp.PresenceValid,
		SecondsPerLiter: secondsPerLiter,
		Provenance:      sp.Provenance{Kind: kind, SourceID: "solver-test:fuel-weight"},
		Confidence:      sp.Confidence{SampleSize: 1, ComputationVersion: "solver-test.v1"},
	}
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

func TestSolveV2FuelWeightMatchesExhaustiveOracle(t *testing.T) {
	for _, raceLaps := range []int64{3, 4, 5, 6} {
		input := baseInputV2()
		input.RaceLaps = raceLaps
		input.FuelWeight = fuelWeightParameter(0.08, sp.ProvenanceReference)

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

func TestFuelWeightCostUsesFuelBeforeEachLap(t *testing.T) {
	cost := fuelWeightCost{secondsPerLiter: 0.1}
	got := cost.stint(4*serviceScale, serviceScale, 3)
	// Las tres vueltas empiezan con 4, 3 y 2 L: 9 L-vuelta en total.
	if math.Abs(got-0.9) > epsilon {
		t.Fatalf("fuel weight stint cost = %v, want 0.9", got)
	}
}

func TestSolveV2FuelWeightChangesFillToSplash(t *testing.T) {
	withoutWeight := baseInputV2()
	withoutWeight.RaceLaps = 8
	withoutWeight.FuelCapacityLiters = 4
	withoutWeight.FuelPerLapLiters = 1
	withoutWeight.Formation.Seconds = 0
	withoutWeight.PitCost.TransitSeconds = 0.7
	withoutWeight.PitCost.RefuelRateLPerS = 100
	withoutWeight.PitCost.TyreSeconds = 0

	filled, err := SolveV2(withoutWeight)
	if err != nil {
		t.Fatalf("SolveV2(without weight): %v", err)
	}
	withWeight := withoutWeight
	withWeight.FuelWeight = fuelWeightParameter(0.20, sp.ProvenanceManual)
	light, err := SolveV2(withWeight)
	if err != nil {
		t.Fatalf("SolveV2(with weight): %v", err)
	}

	if len(filled.Best.PitStops) != 1 || filled.Best.PitStops[0].FuelLiters != 4 {
		t.Fatalf("model without weight did not fill once: %+v", filled.Best)
	}
	if len(light.Best.PitStops) != 2 {
		t.Fatalf("fuel weight did not move the optimum to splash stops: %+v", light.Best)
	}
	fuelLeft := withWeight.FuelCapacityLiters
	for index, stop := range light.Best.PitStops {
		fuelLeft -= float64(light.Best.Stints[index].Laps) * withWeight.FuelPerLapLiters
		fuelLeft += stop.FuelLiters
		if fuelLeft >= withWeight.FuelCapacityLiters {
			t.Fatalf("weighted plan filled instead of splashing: %+v", light.Best)
		}
	}
}

func TestSolveV2FuelWeightSensitivityAndAssumption(t *testing.T) {
	input := baseInputV2()
	input.FuelWeight = fuelWeightParameter(0.05, sp.ProvenanceReference)

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if result.Expected.FuelWeightSeconds <= 0 {
		t.Fatalf("fuel weight cost = %+v", result.Expected)
	}
	var sensitivity *SolverSensitivity
	for index := range result.Sensitivities {
		if result.Sensitivities[index].Parameter == "fuelWeightSecondsPerLiter" {
			sensitivity = &result.Sensitivities[index]
		}
	}
	if sensitivity == nil || math.Abs(sensitivity.ImpactSeconds-result.Expected.FuelWeightSeconds*defaultFuelWeightSensitivity) > epsilon {
		t.Fatalf("fuel weight sensitivity = %+v", result.Sensitivities)
	}
	if result.FuelWeightCost.Provenance.Kind != sp.ProvenanceReference || len(result.Assumptions) == 0 {
		t.Fatalf("fuel weight source/assumptions = source:%+v assumptions:%+v", result.FuelWeightCost, result.Assumptions)
	}
}

func TestSolveV2AcceptsDerivedFuelWeightOnlyFromIdentifiabilityGate(t *testing.T) {
	input := baseInputV2()
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 3), pacePoint(2, 0.1, 3)}, 3, 0, 0.1)
	input.FuelWeight = fuelWeightParameter(0.03, sp.ProvenanceDerived)
	if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("derived manual parameter error = %v, want invalid_input", err)
	}

	input.FuelWeight = nil
	input.Projection.CombinedStintPaceCurve.Identifiability = sp.IdentifiabilitySeparable
	input.Projection.FuelWeightCurve = &sp.SeparableCurve{
		Presence: sp.PresenceValid,
		Provenance: sp.Provenance{
			Kind:     sp.ProvenanceDerived,
			SourceID: "identifiability-gate:test",
		},
		Confidence:          sp.Confidence{SampleSize: 12, ComputationVersion: "derived-curves.v1"},
		SlopeSecondsPerUnit: 0.03,
		Points:              []sp.PacePoint{pacePoint(1, 0, 12)},
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2(gated derived): %v", err)
	}
	if result.FuelWeightCost.Provenance.SourceID != "identifiability-gate:test" || result.FuelWeightCost.SecondsPerLiter != 0.03 {
		t.Fatalf("derived fuel weight source = %+v", result.FuelWeightCost)
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
	if dominates(equalWithMoreStops, equalWithFewerStops, 0, true, false, false, false, false) {
		t.Fatal("a state with no remaining stop allowance cannot dominate one that can still pit")
	}
	if dominates(equalWithMoreStops, equalWithFewerStops, 0, false, false, false, false, false) {
		t.Fatal("a cheaper tie path with more stops cannot erase the fewer-stop tie breaker")
	}
}
