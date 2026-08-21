package application

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
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
	want := []int64{28, 28, 28, 28, 27}
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
