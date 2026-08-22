package solver

import (
	"fmt"
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func compoundParameter(compound tyres.Compound, paceDelta, degradation float64, kind sp.ProvenanceKind) CompoundPaceParameter {
	return CompoundPaceParameter{
		Compound: compound, Presence: sp.PresenceValid,
		Provenance:       sp.Provenance{Kind: kind, SourceID: "solver-test:" + string(compound)},
		Confidence:       sp.Confidence{SampleSize: 1, ComputationVersion: "solver-test.v1"},
		PaceDeltaSeconds: paceDelta, DegradationPerLapSeconds: degradation,
	}
}

func physicalInventory(t *testing.T, compounds ...tyres.Compound) *TyreInventoryInput {
	t.Helper()
	values := make([]tyres.Tyre, 0, len(compounds)*4)
	for set, compound := range compounds {
		for corner := 0; corner < 4; corner++ {
			condition, err := tyres.DefaultCondition(tyres.OriginEventAllocation)
			if err != nil {
				t.Fatalf("DefaultCondition: %v", err)
			}
			tyre, err := tyres.NewTyre(
				tyres.TyreID(fmt.Sprintf("%s-%d-%d", compound, set, corner)),
				compound,
				tyres.OriginEventAllocation,
				condition,
			)
			if err != nil {
				t.Fatalf("NewTyre: %v", err)
			}
			values = append(values, tyre)
		}
	}
	return &TyreInventoryInput{Maximum: len(values), Tyres: values}
}

func compoundBusinessInput(t *testing.T, softDelta float64) SolverInputV2 {
	t.Helper()
	input := baseInputV2()
	input.RaceLaps = 8
	input.Formation.Seconds.Value = 0
	input.FuelCapacityLiters.Value = 4
	input.FuelPerLapLiters.Value = 1
	input.TyreLifeLaps.Value = 8
	input.PitCost = PitCostModel{
		TransitSeconds: NewFallbackScalar(0, "test:pit-transit"), RefuelRateLPerS: NewFallbackScalar(100, "test:refuel-rate"),
		VERatePPerS: NewFallbackScalar(1, "test:ve-rate"), TyreSeconds: NewFallbackScalar(4, "test:tyre-service"),
		ServiceMode: manual.PitServiceSequential,
	}
	minimum, maximum := 1, 1
	input.EventRules.MinPitStops = &minimum
	input.EventRules.MaxPitStops = &maximum
	input.EventRules.RequiredWindows = []PitWindow{{FromLap: 4, ToLap: 4}}
	input.EventRules.MandatoryCompounds = []TyreCompound{tyres.CompoundHard}
	input.TyreInventory = physicalInventory(t, tyres.CompoundHard, tyres.CompoundSoft)
	input.CompoundPace = []CompoundPaceParameter{
		compoundParameter(tyres.CompoundHard, 0, 0, sp.ProvenanceManual),
		compoundParameter(tyres.CompoundSoft, softDelta, 0, sp.ProvenanceReference),
	}
	return input
}

func TestSolveV2DoubleStintsHardOrPaysForSoftByTotalRaceTime(t *testing.T) {
	hardWins, err := SolveV2(compoundBusinessInput(t, -0.4))
	if err != nil {
		t.Fatalf("SolveV2(hard wins): %v", err)
	}
	if !hardWins.Feasible || len(hardWins.Best.Stints) != 2 || hardWins.Best.Stints[0].Compound != tyres.CompoundHard || hardWins.Best.Stints[1].Compound != tyres.CompoundHard {
		t.Fatalf("hard double stint was not selected: %+v", hardWins.Best)
	}
	if hardWins.Best.PitStops[0].ChangeTyres || hardWins.Best.PitStops[0].PitCostInput.Tyres.Value.Value() != 0 {
		t.Fatalf("hard double stint paid a tyre service: %+v", hardWins.Best.PitStops[0])
	}

	softWins, err := SolveV2(compoundBusinessInput(t, -2))
	if err != nil {
		t.Fatalf("SolveV2(soft wins): %v", err)
	}
	if !softWins.Feasible || len(softWins.Best.Stints) != 2 || softWins.Best.Stints[0].Compound == softWins.Best.Stints[1].Compound {
		t.Fatalf("paying for the faster soft stint was not selected: %+v", softWins.Best)
	}
	if !softWins.Best.PitStops[0].ChangeTyres || softWins.Best.PitStops[0].PitCostInput.Tyres.Value.Value() != 4 {
		t.Fatalf("soft strategy did not expose its tyre service: %+v", softWins.Best.PitStops[0])
	}
	hardOnlyInput := compoundBusinessInput(t, -2)
	hardOnlyInput.TyreInventory = physicalInventory(t, tyres.CompoundHard)
	hardOnly, err := SolveV2(hardOnlyInput)
	if err != nil {
		t.Fatalf("SolveV2(hard only): %v", err)
	}
	if softWins.Expected.TotalSeconds >= hardOnly.Expected.TotalSeconds {
		t.Fatalf("soft case did not beat hard on the same pace inputs: hard=%+v soft=%+v", hardOnly.Expected, softWins.Expected)
	}
}

func TestSolveV2UsesManualReferenceCurvePerCompound(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 3
	input.Formation.Seconds.Value = 0
	input.FuelCapacityLiters.Value = 0
	input.FuelPerLapLiters.Value = 0
	input.TyreLifeLaps.Value = 3
	input.TyreInventory = physicalInventory(t, tyres.CompoundHard)
	parameter := compoundParameter(tyres.CompoundHard, 1, 0, sp.ProvenanceReference)
	parameter.Curve = []CompoundPacePoint{
		{LapInStint: 1, DeltaSeconds: 0},
		{LapInStint: 3, DeltaSeconds: 3},
	}
	input.CompoundPace = []CompoundPaceParameter{parameter}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || math.Abs(result.Expected.CompoundSeconds-3) > epsilon || math.Abs(result.Expected.DegradationSeconds-4.5) > epsilon {
		t.Fatalf("compound curve evaluation = %+v", result.Expected)
	}
	if len(result.CompoundPaceCost) != 1 || len(result.CompoundPaceCost[0].Curve) != 2 || result.CompoundPaceCost[0].Provenance.Kind != sp.ProvenanceReference {
		t.Fatalf("compound curve source = %+v", result.CompoundPaceCost)
	}
}

func TestSolveV2PhysicalInventoryRestrictsCandidatesAndTyreLifeDoesNotResetWithoutChange(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 8
	input.FuelCapacityLiters.Value = 4
	input.TyreLifeLaps.Value = 4
	input.TyreInventory = physicalInventory(t, tyres.CompoundHard)
	input.CompoundPace = []CompoundPaceParameter{
		compoundParameter(tyres.CompoundHard, 0, 0, sp.ProvenanceManual),
		compoundParameter(tyres.CompoundSoft, -10, 0, sp.ProvenanceReference),
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if result.Feasible {
		t.Fatalf("one hard set cannot reset its life by declaring no change: %+v", result.Best)
	}

	input.TyreInventory = physicalInventory(t, tyres.CompoundHard, tyres.CompoundHard)
	result, err = SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2(two hard sets): %v", err)
	}
	if !result.Feasible || len(result.Best.PitStops) != 1 || !result.Best.PitStops[0].ChangeTyres {
		t.Fatalf("second physical hard set was not used: %+v", result)
	}
	for _, stint := range result.Best.Stints {
		if stint.Compound != tyres.CompoundHard || stint.TyreFitment == nil {
			t.Fatalf("unavailable soft compound entered the plan: %+v", result.Best)
		}
	}
}

func TestSolveV2RemountingAUsedSetDoesNotRestoreItsLife(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 12
	input.Formation.Seconds.Value = 0
	input.FuelCapacityLiters.Value = 4
	input.FuelPerLapLiters.Value = 1
	input.TyreLifeLaps.Value = 4
	input.PitCost.TransitSeconds.Value = 1
	input.PitCost.TyreSeconds.Value = 0
	minimum, maximum := 2, 2
	input.EventRules.MinPitStops = &minimum
	input.EventRules.MaxPitStops = &maximum
	input.EventRules.RequiredWindows = []PitWindow{{FromLap: 4, ToLap: 4}, {FromLap: 8, ToLap: 8}}
	input.EventRules.MandatoryCompounds = []TyreCompound{tyres.CompoundHard, tyres.CompoundSoft}
	input.TyreInventory = physicalInventory(t, tyres.CompoundHard, tyres.CompoundSoft)
	input.CompoundPace = []CompoundPaceParameter{
		compoundParameter(tyres.CompoundHard, 0, 0, sp.ProvenanceManual),
		compoundParameter(tyres.CompoundSoft, 0, 0, sp.ProvenanceReference),
	}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2(two sets): %v", err)
	}
	if result.Feasible {
		t.Fatalf("an exhausted set was treated as fresh after remounting: %+v", result.Best)
	}

	input.TyreInventory = physicalInventory(t, tyres.CompoundHard, tyres.CompoundHard, tyres.CompoundSoft)
	result, err = SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2(three sets): %v", err)
	}
	if !result.Feasible || len(result.Best.Stints) != 3 {
		t.Fatalf("fresh third physical set did not make the plan feasible: %+v", result)
	}
	for left := range result.Best.Stints {
		for right := left + 1; right < len(result.Best.Stints); right++ {
			if *result.Best.Stints[left].TyreFitment == *result.Best.Stints[right].TyreFitment {
				t.Fatalf("an exhausted fitment was reused: %+v", result.Best.Stints)
			}
		}
	}
}

func TestSolveV2RequiredPitWindowRejectsCandidateWithReason(t *testing.T) {
	input := compoundBusinessInput(t, -0.4)
	input.EventRules.RequiredWindows = []PitWindow{{FromLap: 3, ToLap: 3}}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if result.Feasible {
		t.Fatalf("candidate outside mandatory window was accepted: %+v", result.Best)
	}
	found := false
	for _, candidate := range result.CandidateDetails {
		for _, reason := range candidate.Reasons {
			found = found || reason.Code == "required_pit_window"
		}
	}
	if !found {
		t.Fatalf("required window reason was lost: %+v", result.CandidateDetails)
	}
}

func TestSolveV2CompoundOracleParityPruningProvenanceAndSensitivity(t *testing.T) {
	input := compoundBusinessInput(t, -1.2)
	input.RaceLaps = 6
	input.FuelCapacityLiters.Value = 3
	input.TyreLifeLaps.Value = 6
	input.EventRules.RequiredWindows = []PitWindow{{FromLap: 2, ToLap: 4}}
	maximum := 2
	input.EventRules.MaxPitStops = &maximum
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	want := exhaustiveV2Best(t, input)
	if !result.Feasible || math.Abs(result.Expected.TotalSeconds-want) > epsilon {
		t.Fatalf("solver=%v feasible=%v exhaustive=%v", result.Expected.TotalSeconds, result.Feasible, want)
	}
	if result.ComputeStats.PrunedStates == 0 {
		t.Fatalf("small exhaustive case did not demonstrate dominance pruning: %+v", result.ComputeStats)
	}
	if len(result.CompoundPaceCost) != 2 || result.CompoundPaceCost[0].Provenance.Kind != sp.ProvenanceManual || result.CompoundPaceCost[1].Provenance.Kind != sp.ProvenanceReference {
		t.Fatalf("compound provenance was not preserved: %+v", result.CompoundPaceCost)
	}
	foundSensitivity := false
	for _, sensitivity := range result.Sensitivities {
		if sensitivity.Parameter == "compoundPaceDeltaSeconds.soft" && sensitivity.Delta == defaultCompoundDeltaSensitivity && sensitivity.ImpactSeconds > 0 {
			foundSensitivity = true
		}
	}
	if !foundSensitivity {
		t.Fatalf("compound delta sensitivity missing: %+v", result.Sensitivities)
	}
}

func TestSolveV2CompoundParametersFailClosedWithoutD19ManualOrReferenceSource(t *testing.T) {
	input := compoundBusinessInput(t, -1)
	input.CompoundPace[0].Provenance.Kind = sp.ProvenanceDerived
	if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("derived compound parameter error = %v, want invalid_input", err)
	}

	input = compoundBusinessInput(t, -1)
	input.TyreInventory = nil
	if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("missing physical inventory error = %v, want invalid_input", err)
	}

	input = compoundBusinessInput(t, -1)
	input.DegradationPerLap.Value = 0.1
	if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("two pace authorities error = %v, want invalid_input", err)
	}
}
