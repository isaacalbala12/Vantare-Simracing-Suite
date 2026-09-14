package application

import (
	"errors"
	"reflect"
	"testing"
	"time"

	document "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/weather"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestOrbitMapsIndependentFuelAndVirtualEnergyReserves(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.FuelReserveLiters = resourceValue(3)
	input.Event.VirtualEnergy = &OrbitCalculationVirtualEnergy{
		Applicability:   "applicable",
		CapacityPercent: resourceValue(20),
		ReservePercent:  resourceValue(4),
	}
	input.PlanningInputs = planningOverride(sp.PresenceValid, 2)

	mapped := orbitSolverInput(4, input.Event, 60, 1, sp.ClimateBucketDry, input.PlanningInputs)
	if mapped.FuelReserve.Kind != manual.ReserveAmount || mapped.FuelReserve.Amount.Value.Value() != 3 {
		t.Fatalf("fuel reserve = %+v", mapped.FuelReserve)
	}
	if mapped.VirtualEnergyReserve.Kind != manual.ReserveAmount || mapped.VirtualEnergyReserve.Amount.Value.Value() != 4 {
		t.Fatalf("VE reserve = %+v", mapped.VirtualEnergyReserve)
	}
	if mapped.VECapacityPercent.Value != 20 {
		t.Fatalf("VE capacity = %+v", mapped.VECapacityPercent)
	}

	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["s1"]
	if !plan.ReserveSatisfied || plan.ReserveLimitingResource != "virtual_energy" || plan.ReserveLaps != 2 {
		t.Fatalf("plan reserve = %+v", plan)
	}
}

func TestOrbitExplicitZeroReserveDoesNotInheritLegacyLaps(t *testing.T) {
	event := finalEvaluationInput().Event
	event.FuelReserveLiters = resourceValue(0)
	event.VirtualEnergy = &OrbitCalculationVirtualEnergy{
		Applicability:   "applicable",
		CapacityPercent: resourceValue(20),
		ReservePercent:  resourceValue(0),
	}
	planning := planningOverride(sp.PresenceValid, 2)
	mapped := orbitSolverInput(4, event, 60, 1, sp.ClimateBucketDry, planning)
	if mapped.FuelReserve.Kind != manual.ReserveAmount || mapped.VirtualEnergyReserve.Kind != manual.ReserveAmount ||
		mapped.FuelReserve.Amount.Value.Value() != 0 || mapped.VirtualEnergyReserve.Amount.Value.Value() != 0 {
		t.Fatalf("zero reserves = fuel %+v VE %+v", mapped.FuelReserve, mapped.VirtualEnergyReserve)
	}

	legacy := orbitSolverInput(4, finalEvaluationInput().Event, 60, 1, sp.ClimateBucketDry, planning)
	if legacy.FuelReserve.Kind != manual.ReserveLaps || legacy.VirtualEnergyReserve.Kind != manual.ReserveLaps ||
		legacy.FuelReserve.Laps.Value != orbitDefaultReserveLaps || legacy.VECapacityPercent.Value != 100 {
		t.Fatalf("legacy resources changed = %+v", legacy)
	}
}

func TestOrbitVirtualEnergyNotApplicableOverridesProjectionWithoutMutatingIt(t *testing.T) {
	input := isa825OrbitInput()
	input.Event.VirtualEnergy = &OrbitCalculationVirtualEnergy{Applicability: "not_applicable"}
	input.PlanningInputs.Projection.VirtualEnergyConsumption.ByClimateBucket = map[sp.ClimateBucket]float64{
		sp.ClimateBucketDry: 5,
		sp.ClimateBucketWet: 5,
	}
	input.WeatherScenarios = []document.WeightedWeatherScenario{resourceWeatherScenario()}
	original := input.PlanningInputs.Projection.VirtualEnergyConsumption
	mapped := orbitSolverInput(4, input.Event, 60, 1, sp.ClimateBucketDry, input.PlanningInputs)
	if mapped.VECapacityPercent.Value != 0 || mapped.VEPerLapPercent.Value != 0 || mapped.VirtualEnergyReserve.Kind != manual.ReserveNone ||
		mapped.Projection.VirtualEnergyConsumption.Presence != sp.PresenceMissing {
		t.Fatalf("disabled VE = capacity %+v reserve %+v", mapped.VECapacityPercent, mapped.VirtualEnergyReserve)
	}
	if !reflect.DeepEqual(input.PlanningInputs.Projection.VirtualEnergyConsumption, original) {
		t.Fatal("original projection was mutated")
	}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	if result.Weather == nil {
		t.Fatal("weather result is missing")
	}
	if len(result.Weather.Plans) != 1 {
		t.Fatalf("weather plans = %d", len(result.Weather.Plans))
	}
	for _, plan := range result.Weather.Plans {
		if plan.ReserveLimitingResource == "virtual_energy" {
			t.Fatalf("weather reactivated VE: %+v", plan)
		}
	}
	if !reflect.DeepEqual(input.PlanningInputs.Projection.VirtualEnergyConsumption, original) {
		t.Fatal("calculation mutated the original projection")
	}
}

func TestOrbitRejectsIncompleteOrInvalidExplicitResources(t *testing.T) {
	for _, test := range []struct {
		name   string
		fuel   *float64
		energy *OrbitCalculationVirtualEnergy
	}{
		{name: "negative fuel reserve", fuel: resourceValue(-1)},
		{name: "unknown VE", energy: &OrbitCalculationVirtualEnergy{Applicability: "unknown"}},
		{name: "applicable VE without capacity", energy: &OrbitCalculationVirtualEnergy{Applicability: "applicable", ReservePercent: resourceValue(2)}},
		{name: "applicable VE without reserve", energy: &OrbitCalculationVirtualEnergy{Applicability: "applicable", CapacityPercent: resourceValue(20)}},
		{name: "zero VE capacity", energy: &OrbitCalculationVirtualEnergy{Applicability: "applicable", CapacityPercent: resourceValue(0), ReservePercent: resourceValue(0)}},
		{name: "VE capacity over 100", energy: &OrbitCalculationVirtualEnergy{Applicability: "applicable", CapacityPercent: resourceValue(101), ReservePercent: resourceValue(0)}},
		{name: "negative VE reserve", energy: &OrbitCalculationVirtualEnergy{Applicability: "applicable", CapacityPercent: resourceValue(20), ReservePercent: resourceValue(-1)}},
		{name: "VE reserve over capacity", energy: &OrbitCalculationVirtualEnergy{Applicability: "applicable", CapacityPercent: resourceValue(20), ReservePercent: resourceValue(21)}},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := finalEvaluationInput()
			input.Event.FuelReserveLiters = test.fuel
			input.Event.VirtualEnergy = test.energy
			_, err := calculateOrbit(input)
			var applicationErr *ApplicationError
			if !errors.As(err, &applicationErr) || applicationErr.Code != ErrorCalculationInvalid {
				t.Fatalf("error = %#v", err)
			}
		})
	}
}

func resourceValue(value float64) *float64 { return &value }

func planningOverride(presence sp.Presence, value float64) *document.PlanningInputs {
	return &document.PlanningInputs{Overrides: map[document.PlanningInputField]document.NumericInputOverride{
		document.PlanningInputVEPerLap: {
			Value: value, Presence: presence,
			Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "test:ve-per-lap"},
			Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"},
		},
	}}
}

func resourceWeatherScenario() document.WeightedWeatherScenario {
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)
	nodes := [5]weather.WeatherNode{}
	for index, progress := range [5]weather.WeatherNodeProgress{weather.NodeStart, weather.Node25, weather.Node50, weather.Node75, weather.NodeFinish} {
		nodes[index] = weather.WeatherNode{Progress: progress, RainChance: 0, Sky: weather.SkyClear, AirTempC: 20, TrackTempC: 25}
	}
	return document.WeightedWeatherScenario{Weight: 1, Scenario: weather.WeatherScenarioV1{
		ContractVersion: weather.ContractVersionWeatherScenarioV1,
		ScenarioID:      "dry", CombinationID: "test:resources", GeneratedAt: now, Nodes: nodes,
		Provenance: weather.CaptureProvenance{Source: "manual", CapturedAt: now, FreshUntil: now.Add(time.Minute), SessionType: "race", SignalFreshness: "manual"},
	}}
}
