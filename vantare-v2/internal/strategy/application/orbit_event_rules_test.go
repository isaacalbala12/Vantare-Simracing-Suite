package application

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	"testing"
)

func TestOrbitAppliesSuppliedPitRules(t *testing.T) {
	for _, tc := range []struct {
		name, rules string
		wantError   error
		minStops    int64
	}{
		{"maximum", `{"maxPitStops":0}`, ErrCalculationInfeasible, 0},
		{"minimum", `{"minPitStops":3}`, nil, 3},
		{"negative", `{"minPitStops":-1}`, ErrCalculationInvalid, 0},
		{"unsupported driver", `{"driverLimits":{"d1":{"maxLaps":2}}}`, ErrCalculationInvalid, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			payload := `{"event":{"durationMinutes":6,"tankLiters":3,"pitLossSeconds":10,"rules":` + tc.rules + `},"drivers":[{"id":"d1","name":"Driver","dry":{"paceSeconds":60,"fuelLitersPerLap":1}}],"variants":[{"id":"base","mode":"dry","order":["d1"],"overrides":{}}],"activeVariantId":"base"}`
			var input OrbitCalculationInput
			if err := json.Unmarshal([]byte(payload), &input); err != nil {
				t.Fatal(err)
			}
			result, err := calculateOrbitContext(context.Background(), input)
			if tc.wantError != nil {
				if !errors.Is(err, tc.wantError) {
					t.Fatalf("rule error = %v, want %v", err, tc.wantError)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if result.Plans["base"].Stops < tc.minStops {
				t.Fatalf("minimum stops ignored: %+v", result.Plans["base"])
			}
		})
	}
}

func TestOrbitRechecksPitWindowAfterLapOverride(t *testing.T) {
	input := OrbitCalculationInput{
		Event:    OrbitCalculationEvent{DurationMinutes: 6, TankLiters: 3, PitLossSeconds: 10, Rules: &solver.EventRules{RequiredWindows: []solver.PitWindow{{FromLap: 2, ToLap: 2}}}},
		Drivers:  []OrbitCalculationDriver{{ID: "d1", Name: "Driver", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}}},
		Variants: []OrbitCalculationVariant{{ID: "base", Mode: "dry", Order: []string{"d1"}}}, ActiveVariantID: "base",
	}
	result, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, stop := range result.Plans["base"].StopDetails {
		if stop.Lap == 2 {
			found = true
		}
	}
	if !found {
		t.Fatal("required window not honored")
	}
	first := int64(1)
	input.Variants[0].Overrides = map[int]OrbitCalculationOverride{0: {Laps: &first}}
	_, err = calculateOrbitContext(context.Background(), input)
	if !errors.Is(err, ErrCalculationInfeasible) {
		t.Fatalf("override escaping window must be infeasible: %v", err)
	}
}
