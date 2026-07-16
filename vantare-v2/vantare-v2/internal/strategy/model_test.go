package strategy

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestDraftRoundTripPreservesOptionalResource(t *testing.T) {
	in := Draft{
		ID:        "draft",
		Name:      "LMU endurance",
		Simulator: "lmu",
		Vehicle:   "Hypercar",
		Track:     "Le Mans",
		Race: RaceInput{
			Kind:           RaceByTime,
			DurationSeconds: 3600,
			ExtraLap:       true,
			FormationLaps:  1.5,
			LapTimeSeconds: 220.125,
		},
		Fuel: ResourceInput{
			Enabled:           true,
			Capacity:          100,
			UsableCapacity:    95,
			StartAmount:       42.5,
			ConsumptionPerLap: 4.1,
			Margin:            MarginInput{Kind: "percent", Value: 5},
		},
		VirtualEnergy: ResourceInput{Enabled: true, Capacity: 100, StartAmount: 80, ConsumptionPerLap: 2.5},
		Confidence:    ConfidenceMedium,
	}

	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("marshal draft: %v", err)
	}

	var out Draft
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal draft: %v", err)
	}

	if !reflect.DeepEqual(in, out) {
		t.Fatalf("round-trip changed draft:\nwant %#v\n got %#v", in, out)
	}
}

func TestCanonicalEnums(t *testing.T) {
	if RaceByLaps != RaceKind("laps") || RaceByTime != RaceKind("time") {
		t.Fatalf("unexpected race kinds: %q, %q", RaceByLaps, RaceByTime)
	}
	if ConfidenceLow != Confidence("low") || ConfidenceMedium != Confidence("medium") || ConfidenceHigh != Confidence("high") {
		t.Fatalf("unexpected confidence values: %q, %q, %q", ConfidenceLow, ConfidenceMedium, ConfidenceHigh)
	}
}
