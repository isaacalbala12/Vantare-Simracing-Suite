package application

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

func TestRecordedImolaCalculationCompletes(t *testing.T) {
	data, err := os.ReadFile("testdata/recorded-imola-input.json")
	if err != nil {
		t.Fatal(err)
	}
	var input OrbitCalculationInput
	if err := json.Unmarshal(data, &input); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), orbitCalculationDeadline)
	defer cancel()
	result, err := calculateOrbitContext(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans[input.ActiveVariantID]
	if plan.TotalLaps <= 0 || plan.TotalSeconds < input.Event.DurationMinutes*60 ||
		plan.FinalLapStartSeconds >= input.Event.DurationMinutes*60 || !plan.ReserveSatisfied {
		t.Fatalf("incomplete race: %+v", plan)
	}
	t.Logf("laps=%d seconds=%f", plan.TotalLaps, plan.TotalSeconds)
}
