package application

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func TestOrbitLapHorizonKeepsExactDistanceAcrossPaces(t *testing.T) {
	for _, paceSeconds := range []float64{60, 95} {
		input := finalEvaluationInput()
		input.Event.RaceKind = "laps"
		input.Event.DurationMinutes = 0
		input.Event.TargetLaps = lapHorizon(12)
		input.Event.TankLiters = 100
		input.Drivers[0].Dry.PaceSeconds = paceSeconds

		result, err := calculateOrbit(input)
		if err != nil {
			t.Fatalf("pace %.0f: %v", paceSeconds, err)
		}
		plan := result.Plans["s1"]
		if got := plan.TotalLaps; got != 12 {
			t.Fatalf("pace %.0f: total laps = %d, want 12", paceSeconds, got)
		}
		var stintLaps int64
		for _, stint := range plan.Stints {
			stintLaps += stint.Laps
		}
		if stintLaps != 12 {
			t.Fatalf("pace %.0f: stint laps = %d, want 12", paceSeconds, stintLaps)
		}
	}
}

func TestJSONBridgeDispatchesLapHorizon(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.RaceKind = "laps"
	input.Event.DurationMinutes = 0
	input.Event.TargetLaps = lapHorizon(12)
	command := CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "orbit-laps-wire", Operation: OperationCalculateOrbit},
		Input:         input,
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
	if result.OrbitCalculation == nil || result.OrbitCalculation.Plans["s1"].TotalLaps != 12 {
		t.Fatalf("result = %#v", result)
	}
}

func TestOrbitExplicitTimeMatchesLegacyHorizon(t *testing.T) {
	legacy, err := calculateOrbit(finalEvaluationInput())
	if err != nil {
		t.Fatal(err)
	}
	explicitInput := finalEvaluationInput()
	explicitInput.Event.RaceKind = "time"
	explicit, err := calculateOrbit(explicitInput)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(explicit, legacy) {
		t.Fatalf("explicit time result differs from legacy: explicit=%+v legacy=%+v", explicit, legacy)
	}
}

func TestOrbitLapHorizonRejectsAmbiguousOrInvalidInput(t *testing.T) {
	for _, test := range []struct {
		name            string
		raceKind        string
		durationMinutes float64
		targetLaps      *int64
	}{
		{name: "time and laps", raceKind: "laps", durationMinutes: 4, targetLaps: lapHorizon(12)},
		{name: "missing laps", raceKind: "laps"},
		{name: "zero laps", raceKind: "laps", targetLaps: lapHorizon(0)},
		{name: "negative laps", raceKind: "laps", targetLaps: lapHorizon(-1)},
		{name: "laps in timed race", raceKind: "time", durationMinutes: 4, targetLaps: lapHorizon(12)},
		{name: "laps without kind", durationMinutes: 4, targetLaps: lapHorizon(12)},
		{name: "zero laps without kind", durationMinutes: 4, targetLaps: lapHorizon(0)},
		{name: "unknown kind", raceKind: "distance", targetLaps: lapHorizon(12)},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := finalEvaluationInput()
			input.Event.RaceKind = test.raceKind
			input.Event.DurationMinutes = test.durationMinutes
			input.Event.TargetLaps = test.targetLaps
			_, err := calculateOrbit(input)
			var applicationErr *ApplicationError
			if !errors.As(err, &applicationErr) || applicationErr.Code != ErrorCalculationInvalid {
				t.Fatalf("error = %#v", err)
			}
		})
	}
}

func lapHorizon(value int64) *int64 {
	return &value
}
