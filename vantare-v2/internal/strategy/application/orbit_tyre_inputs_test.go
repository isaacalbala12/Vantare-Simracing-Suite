package application

import (
	"errors"
	"fmt"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/solver"
	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func orbitPhysicalInventory(t *testing.T, compounds ...tyres.Compound) *solver.TyreInventoryInput {
	t.Helper()
	values := make([]tyres.Tyre, 0, len(compounds)*4)
	for set, compound := range compounds {
		for corner := 0; corner < 4; corner++ {
			condition, err := tyres.DefaultCondition(tyres.OriginEventAllocation)
			if err != nil {
				t.Fatal(err)
			}
			tire, err := tyres.NewTyre(tyres.TyreID(fmt.Sprintf("orbit-%s-%d-%d", compound, set, corner)), compound, tyres.OriginEventAllocation, condition)
			if err != nil {
				t.Fatal(err)
			}
			values = append(values, tire)
		}
	}
	return &solver.TyreInventoryInput{Maximum: len(values), Tyres: values}
}

func orbitCompoundPace(compounds ...tyres.Compound) []solver.CompoundPaceParameter {
	result := make([]solver.CompoundPaceParameter, len(compounds))
	for index, compound := range compounds {
		result[index] = solver.CompoundPaceParameter{
			Compound: compound, Presence: sp.PresenceValid,
			Provenance: sp.Provenance{Kind: sp.ProvenanceReference, SourceID: "orbit-test:" + string(compound)},
			Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "orbit-test.v1"},
		}
	}
	return result
}

func orbitPhysicalInput(t *testing.T, compounds ...tyres.Compound) OrbitCalculationInput {
	t.Helper()
	laps := int64(8)
	return OrbitCalculationInput{
		Event: OrbitCalculationEvent{
			RaceKind: "laps", TargetLaps: &laps, TankLiters: 5, PitLossSeconds: 10,
			TyreInventory: orbitPhysicalInventory(t, compounds...), CompoundPace: orbitCompoundPace(compounds...),
		},
		Drivers:         []OrbitCalculationDriver{{ID: "driver", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}}},
		Variants:        []OrbitCalculationVariant{{ID: "plan", Mode: "dry", Order: []string{"driver"}}},
		ActiveVariantID: "plan",
	}
}

func TestCalculateOrbitUsesCombinedCurveAndDerivedTyreLife(t *testing.T) {
	input := isa825OrbitInput()
	input.Event.DurationMinutes = 0
	input.Event.RaceKind = "laps"
	laps := int64(8)
	input.Event.TargetLaps = &laps
	projection := input.PlanningInputs.Projection
	life := 4
	projection.TyreDegradation.LifeLapsEstimate = &life
	withoutCurve, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	baseline := withoutCurve.Plans["strategy-1"]
	if baseline.MaxLaps != 4 || len(baseline.Stints) != 2 {
		t.Fatalf("derived tyre life was not applied: %+v", baseline)
	}

	lower, upper := 0.0, 1.0
	projection.CombinedStintPaceCurve = sp.CombinedStintPaceCurve{
		Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "orbit-test:combined-curve"},
		Confidence:      sp.Confidence{SampleSize: 4, RangeLower: &lower, RangeUpper: &upper, ComputationVersion: "orbit-test.v1"},
		Identifiability: sp.IdentifiabilityCombinedOnly,
		Points:          []sp.PacePoint{{LapInStint: 1, DeltaSeconds: 1, SampleSize: 4}, {LapInStint: 8, DeltaSeconds: 1, SampleSize: 4}},
	}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["strategy-1"]
	if delta := plan.DrivingSeconds - baseline.DrivingSeconds; delta != 8 {
		t.Fatalf("combined curve driving delta=%v, want 8 seconds", delta)
	}
}

func TestCalculateOrbitPreservesPhysicalNoChangeDecision(t *testing.T) {
	input := orbitPhysicalInput(t, tyres.CompoundHard)
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["plan"]
	if len(plan.Stints) != 2 || len(plan.StopDetails) != 1 || plan.StopDetails[0].ChangeTyres == nil || *plan.StopDetails[0].ChangeTyres {
		t.Fatalf("fuel-only stop changed the sole physical set: %+v", plan)
	}
	if plan.Stints[0].Compound != tyres.CompoundHard || plan.Stints[0].TyreFitment == nil || plan.Stints[1].TyreFitment == nil || *plan.Stints[0].TyreFitment != *plan.Stints[1].TyreFitment {
		t.Fatalf("physical hard fitment was not preserved: %+v", plan.Stints)
	}
}

func TestCalculateOrbitPreservesPhysicalChangeDecision(t *testing.T) {
	input := orbitPhysicalInput(t, tyres.CompoundHard, tyres.CompoundHard)
	input.Event.CompoundPace = orbitCompoundPace(tyres.CompoundHard)
	input.PlanningInputs = isa825OrbitInput().PlanningInputs
	input.PlanningInputs.Projection.CombinedStintPaceCurve.Presence = sp.PresenceMissing
	input.PlanningInputs.Projection.FuelConsumption.Presence = sp.PresenceMissing
	input.PlanningInputs.Projection.VirtualEnergyConsumption.Presence = sp.PresenceMissing
	input.PlanningInputs.Projection.RepresentativePaceByClimateBucket = nil
	life := 4
	input.PlanningInputs.Projection.TyreDegradation.LifeLapsEstimate = &life

	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["plan"]
	if len(plan.StopDetails) != 1 || plan.StopDetails[0].ChangeTyres == nil || !*plan.StopDetails[0].ChangeTyres || plan.StopDetails[0].TyreFitment == nil {
		t.Fatalf("required physical change was not preserved: %+v", plan)
	}
	if plan.Stints[0].TyreFitment == nil || plan.Stints[1].TyreFitment == nil || *plan.Stints[0].TyreFitment == *plan.Stints[1].TyreFitment {
		t.Fatalf("fresh fitment was not selected: %+v", plan.Stints)
	}
}

func TestCalculateOrbitRejectsPartialOrRedistributedPhysicalInput(t *testing.T) {
	partial := orbitPhysicalInput(t, tyres.CompoundHard)
	partial.Event.CompoundPace = nil
	if _, err := calculateOrbit(partial); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("partial physical input error=%v", err)
	}

	doubleAuthority := orbitPhysicalInput(t, tyres.CompoundHard)
	doubleAuthority.PlanningInputs = isa825OrbitInput().PlanningInputs
	curveLower, curveUpper := 0.0, 1.0
	doubleAuthority.PlanningInputs.Projection.CombinedStintPaceCurve = sp.CombinedStintPaceCurve{
		Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "orbit-test:combined-curve"},
		Confidence:      sp.Confidence{SampleSize: 4, RangeLower: &curveLower, RangeUpper: &curveUpper, ComputationVersion: "orbit-test.v1"},
		Identifiability: sp.IdentifiabilityCombinedOnly,
		Points:          []sp.PacePoint{{LapInStint: 1, DeltaSeconds: 0, SampleSize: 4}},
	}
	if _, err := calculateOrbit(doubleAuthority); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("two pace authorities error=%v", err)
	}

	redistributed := orbitPhysicalInput(t, tyres.CompoundHard)
	first, second := int64(3), int64(5)
	redistributed.Variants[0].Overrides = map[int]OrbitCalculationOverride{0: {Laps: &first}, 1: {Laps: &second}}
	if _, err := calculateOrbit(redistributed); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("redistributed physical plan error=%v", err)
	}
}
