package application

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestCalculateOrbitUsesGoEngineForGoldenPlan(t *testing.T) {
	t.Parallel()
	service := NewService[json.RawMessage](nil)
	result, err := service.CalculateOrbit(context.Background(), CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "orbit-golden", Operation: OperationCalculateOrbit},
		Input: OrbitCalculationInput{
			Event: OrbitCalculationEvent{DurationMinutes: 240, TankLiters: 90, PitLossSeconds: 64},
			Drivers: []OrbitCalculationDriver{
				{ID: "isaac", Name: "Isaac Albala", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
				{ID: "sol", Name: "Sol Martin", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
				{ID: "diego", Name: "Diego Ferrer", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
				{ID: "marta", Name: "Marta Ruiz", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
			},
			Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"isaac", "sol", "diego", "marta"}, Overrides: map[int]OrbitCalculationOverride{}}},
			ActiveVariantID: "s1",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	plan := result.OrbitCalculation.Plans["s1"]
	if plan.TotalLaps != 139 || plan.Stops != 4 || len(plan.Stints) != 5 {
		t.Fatalf("plan = %#v", plan)
	}
	// SolveV2 minimiza cinco stints bajo el limite de 32 vueltas. Sin coste por
	// peso Fuel, las particiones factibles empatan y el orden determinista de
	// busqueda conserva primero el stint corto: 11 + 4*32 = 139.
	want := []int64{11, 32, 32, 32, 32}
	for index := range want {
		if plan.Stints[index].Laps != want[index] {
			t.Fatalf("stint %d laps = %d, want %d", index, plan.Stints[index].Laps, want[index])
		}
	}
	if plan.TotalSeconds != 139*104+4*64 {
		t.Fatalf("total seconds = %v", plan.TotalSeconds)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "frontend", "src", "hub", "strategy-orbit", "testdata", "orbit-go-golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden OrbitCalculationResult
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*result.OrbitCalculation, golden) {
		t.Fatalf("Go result differs from shared frontend golden\ngot: %#v\nwant: %#v", *result.OrbitCalculation, golden)
	}
}

func TestCalculateOrbitDerivedOverrideRevertKeepsProjectionAndChangesPlan(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "telemetryanalysis", "strategyprojection", "testdata", "strategyinputprojection_v2_new.json"))
	if err != nil {
		t.Fatal(err)
	}
	var projection strategyprojection.StrategyInputProjectionV2
	if err := json.Unmarshal(raw, &projection); err != nil {
		t.Fatal(err)
	}
	input := OrbitCalculationInput{
		Event:           OrbitCalculationEvent{DurationMinutes: 10, TankLiters: 10, PitLossSeconds: 30},
		Drivers:         []OrbitCalculationDriver{{ID: "driver-1", Name: "Driver", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 2}}},
		Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"driver-1"}, Overrides: map[int]OrbitCalculationOverride{}}},
		ActiveVariantID: "s1",
		PlanningInputs:  &strategydocument.PlanningInputs{Projection: &projection, Overrides: map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{}},
	}
	derived, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	input.PlanningInputs.Overrides[strategydocument.PlanningInputFuelPerLap] = strategydocument.NumericInputOverride{
		Value: 5, Presence: strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: "orbit:event-1"},
		Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-input.v1"},
	}
	overridden, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	if input.PlanningInputs.Projection.FuelConsumption.MeanPerLap != 3.047 {
		t.Fatal("manual override destroyed the derived projection")
	}
	overriddenSolver, err := solver.SolveV2(orbitSolverInput(10, input.Event, 60, 2, input.PlanningInputs))
	if err != nil {
		t.Fatalf("SolveV2(overridden adapter): %v", err)
	}
	if got := overriddenSolver.ResolvedInputs.FuelPerLapLiters; got.Value != 5 || got.Role != solver.ScalarRoleUserOverride || got.Provenance.SourceID != "orbit:event-1" {
		t.Fatalf("override did not reach SolveV2 intact: %+v", got)
	}
	delete(input.PlanningInputs.Overrides, strategydocument.PlanningInputFuelPerLap)
	reverted, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	if derived.Plans["s1"].MaxLaps == overridden.Plans["s1"].MaxLaps || reverted.Plans["s1"].MaxLaps != derived.Plans["s1"].MaxLaps {
		t.Fatalf("max laps derived=%d override=%d reverted=%d", derived.Plans["s1"].MaxLaps, overridden.Plans["s1"].MaxLaps, reverted.Plans["s1"].MaxLaps)
	}
	revertedSolver, err := solver.SolveV2(orbitSolverInput(10, input.Event, 60, 2, input.PlanningInputs))
	if err != nil {
		t.Fatalf("SolveV2(reverted adapter): %v", err)
	}
	if got := revertedSolver.ResolvedInputs.FuelPerLapLiters; got.Value != projection.FuelConsumption.MeanPerLap || got.Provenance.SourceID != projection.FuelConsumption.Provenance.SourceID {
		t.Fatalf("revert did not restore derived source: %+v", got)
	}
}

func TestCalculateOrbitRejectsDanglingDriverAsTypedError(t *testing.T) {
	t.Parallel()
	service := NewService[json.RawMessage](nil)
	_, err := service.CalculateOrbit(context.Background(), CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "orbit-dangling", Operation: OperationCalculateOrbit},
		Input: OrbitCalculationInput{
			Event:           OrbitCalculationEvent{DurationMinutes: 60, TankLiters: 90, PitLossSeconds: 60},
			Drivers:         []OrbitCalculationDriver{{ID: "driver-1", Dry: OrbitCalculationPace{PaceSeconds: 100, FuelLitersPerLap: 2}}},
			Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"driver-1", "deleted"}}},
			ActiveVariantID: "s1",
		},
	})
	var applicationErr *ApplicationError
	if !errors.As(err, &applicationErr) || applicationErr.Code != ErrorCalculationInvalid || applicationErr.Field != "input.variants.0.order.1" {
		t.Fatalf("error = %#v", err)
	}
}

func TestJSONBridgeDispatchesOrbitCalculation(t *testing.T) {
	t.Parallel()
	command := CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "orbit-wire", Operation: OperationCalculateOrbit},
		Input: OrbitCalculationInput{
			Event: OrbitCalculationEvent{DurationMinutes: 20, TankLiters: 70, PitLossSeconds: 60},
			Drivers: []OrbitCalculationDriver{{
				ID: "driver-1", Name: "Driver", Dry: OrbitCalculationPace{PaceSeconds: 120, FuelLitersPerLap: 2},
			}},
			Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"driver-1"}, Overrides: map[int]OrbitCalculationOverride{}}},
			ActiveVariantID: "s1",
		},
	}
	document, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := NewJSONBridge(NewService[json.RawMessage](nil)).Execute(context.Background(), document)
	if err != nil {
		t.Fatal(err)
	}
	var result Result[json.RawMessage]
	if err := json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	if result.CommandID != "orbit-wire" || result.OrbitCalculation == nil || result.OrbitCalculation.Plans["s1"].TotalLaps != 10 {
		t.Fatalf("result = %#v", result)
	}
}
