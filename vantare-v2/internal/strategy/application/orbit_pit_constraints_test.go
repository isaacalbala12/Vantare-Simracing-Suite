package application

import (
	"encoding/json"
	"errors"
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestOrbitPitOverrideJSONPreservesExplicitZeroAndFalse(t *testing.T) {
	var command CalculateOrbitCommand
	if err := json.Unmarshal([]byte(`{"protocolVersion":"strategy.application.v1","commandId":"pit-wire","operation":"calculate_orbit","input":{"event":{"raceKind":"laps","targetLaps":2,"durationMinutes":0,"tankLiters":2,"pitLossSeconds":1},"drivers":[{"id":"a"}],"variants":[{"id":"pit","mode":"dry","order":["a","a"],"overrides":{},"pitOverrides":{"0":{"fuelLiters":0,"changeTyres":false}}}],"activeVariantId":"pit"}}`), &command); err != nil {
		t.Fatal(err)
	}
	override := command.Input.Variants[0].PitOverrides[0]
	if override.FuelLiters == nil || *override.FuelLiters != 0 || override.ChangeTyres == nil || *override.ChangeTyres {
		t.Fatalf("wire contract lost explicit values: %+v", override)
	}
}

func TestOrbitPitOverrideFixesAddedFuelAndUsesEventServiceCostOnce(t *testing.T) {
	target := int64(6)
	first, second := int64(3), int64(3)
	fuel := 4.5
	ve, zero, initial, capacity := 7.0, 0.0, 3.0, 10.0
	input := OrbitCalculationInput{
		Event: OrbitCalculationEvent{
			RaceKind: "laps", TargetLaps: &target, TankLiters: 5, PitLossSeconds: 99,
			VirtualEnergy: &OrbitCalculationVirtualEnergy{Applicability: "applicable", CapacityPercent: &capacity, InitialPercent: &initial, ReservePercent: &zero},
			PitServices: &OrbitCalculationPitServices{
				TransitSeconds: resourceValue(10), RefuelRateLPerS: resourceValue(2), VERatePPerS: resourceValue(5), TyreSeconds: resourceValue(0), ServiceMode: "parallel",
			},
		},
		Drivers: []OrbitCalculationDriver{{ID: "a", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}}},
		Variants: []OrbitCalculationVariant{
			{ID: "pit", Mode: "dry", Order: []string{"a", "a"}, Overrides: map[int]OrbitCalculationOverride{0: {Laps: &first}, 1: {Laps: &second}}, PitOverrides: map[int]OrbitCalculationPitOverride{0: {FuelLiters: &fuel, VEPercent: &ve}}},
		},
		ActiveVariantID: "pit",
		PlanningInputs:  planningOverride(sp.PresenceValid, 1),
	}

	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["pit"]
	if len(plan.StopDetails) != 1 || math.Abs(plan.StopDetails[0].FuelOutLiters-4.5) > 1e-9 || plan.StopDetails[0].VirtualEnergyOutPercent == nil || *plan.StopDetails[0].VirtualEnergyOutPercent != ve {
		t.Fatalf("fixed pit fuel was not replayed: %+v", plan.StopDetails)
	}
	wantPit := 10 + fuel/2
	if math.Abs(plan.PitSeconds-wantPit) > 1e-9 || math.Abs(plan.TotalSeconds-plan.DrivingSeconds-plan.PitSeconds) > 1e-9 {
		t.Fatalf("pit cost counted incorrectly: pit=%v total=%v driving=%v", plan.PitSeconds, plan.TotalSeconds, plan.DrivingSeconds)
	}
	input.Event.PitServices.ServiceMode = "sequential"
	sequential, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	sequentialPlan := sequential.Plans["pit"]
	wantSequential := 10 + fuel/2 + ve/5
	if math.Abs(sequentialPlan.PitSeconds-wantSequential) > 1e-9 || math.Abs(sequentialPlan.TotalSeconds-sequentialPlan.DrivingSeconds-sequentialPlan.PitSeconds) > 1e-9 {
		t.Fatalf("sequential services counted incorrectly: pit=%v total=%v driving=%v", sequentialPlan.PitSeconds, sequentialPlan.TotalSeconds, sequentialPlan.DrivingSeconds)
	}
	if plan.Optimality != "not_proven" {
		t.Fatalf("pit edit claimed optimality: %s", plan.Optimality)
	}
}

func TestOrbitPitOverrideSelectsPhysicalTyresThroughReplay(t *testing.T) {
	input := orbitPhysicalInput(t, tyres.CompoundHard, tyres.CompoundSoft)
	change := true
	compound := tyres.CompoundSoft
	input.Variants[0].PitOverrides = map[int]OrbitCalculationPitOverride{0: {ChangeTyres: &change, Compound: &compound}}

	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["plan"]
	if len(plan.StopDetails) != 1 || plan.StopDetails[0].ChangeTyres == nil || !*plan.StopDetails[0].ChangeTyres || plan.Stints[1].Compound != compound {
		t.Fatalf("physical tyre constraint was not replayed: %+v", plan)
	}

	keep := orbitPhysicalInput(t, tyres.CompoundHard)
	keepTyres := false
	hard := tyres.CompoundHard
	keep.Variants[0].PitOverrides = map[int]OrbitCalculationPitOverride{0: {ChangeTyres: &keepTyres, Compound: &hard}}
	kept, err := calculateOrbit(keep)
	if err != nil {
		t.Fatal(err)
	}
	keptStop := kept.Plans["plan"].StopDetails[0]
	if keptStop.ChangeTyres == nil || *keptStop.ChangeTyres {
		t.Fatalf("explicit false tyre service was lost: %+v", keptStop)
	}
}

func TestOrbitPitOverrideRejectsInvalidAuthorityAndUnavailableResources(t *testing.T) {
	target := int64(4)
	one, three := int64(1), int64(3)
	fuel, ve := 2.0, 1.0
	input := OrbitCalculationInput{
		Event:           OrbitCalculationEvent{RaceKind: "laps", TargetLaps: &target, TankLiters: 5, PitLossSeconds: 10},
		Drivers:         []OrbitCalculationDriver{{ID: "a", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}}},
		Variants:        []OrbitCalculationVariant{{ID: "pit", Mode: "dry", Order: []string{"a", "a"}, Overrides: map[int]OrbitCalculationOverride{0: {Laps: &one}, 1: {Laps: &three, Fuel: &fuel}}, PitOverrides: map[int]OrbitCalculationPitOverride{0: {FuelLiters: &fuel}}}},
		ActiveVariantID: "pit",
	}
	if _, err := calculateOrbit(input); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("two fuel authorities accepted: %v", err)
	}
	input.Variants[0].Overrides[1] = OrbitCalculationOverride{Laps: &three}
	input.Variants[0].PitOverrides[0] = OrbitCalculationPitOverride{VEPercent: &ve}
	if _, err := calculateOrbit(input); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("unavailable virtual energy accepted: %v", err)
	}
	input.Variants[0].PitOverrides = map[int]OrbitCalculationPitOverride{1: {FuelLiters: &fuel}}
	if _, err := calculateOrbit(input); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("unknown stop accepted: %v", err)
	}
	huge := 50.0
	input.Variants[0].PitOverrides = map[int]OrbitCalculationPitOverride{0: {FuelLiters: &huge}}
	if _, err := calculateOrbit(input); !errors.Is(err, ErrCalculationInfeasible) {
		t.Fatalf("over-capacity service accepted: %v", err)
	}
}
