package application

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"testing"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
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
		{"driver maximum", `{"driverLimits":{"d1":{"maxLaps":2}}}`, ErrCalculationInfeasible, 0},
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

func TestOrbitAppliesSingleDriverLimitsBeforeOptimization(t *testing.T) {
	maxLaps := int64(4)
	maxSeconds := 240.0
	input := OrbitCalculationInput{
		Event: OrbitCalculationEvent{
			RaceKind: "laps", DurationMinutes: 0, TargetLaps: &maxLaps,
			TankLiters: 4, PitLossSeconds: 10,
			Rules: &solver.EventRules{DriverLimits: map[string]solver.DriverLimit{
				"d1": {MaxLaps: &maxLaps, MaxTotalTimeSeconds: &maxSeconds},
			}},
		},
		Drivers:  []OrbitCalculationDriver{{ID: "d1", Name: "Driver", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}}},
		Variants: []OrbitCalculationVariant{{ID: "base", Mode: "dry", Order: []string{"d1"}}}, ActiveVariantID: "base",
	}

	result, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	total := int64(0)
	for _, stint := range result.Plans["base"].Stints {
		if stint.DriverID != "d1" {
			t.Fatalf("single-driver plan lost its constrained identity: %+v", result.Plans["base"].Stints)
		}
		total += stint.Laps
	}
	if total != 4 {
		t.Fatalf("single-driver plan laps = %d, want 4", total)
	}

	tooFew := int64(3)
	input.Event.Rules.DriverLimits["d1"] = solver.DriverLimit{MaxLaps: &tooFew}
	_, err = calculateOrbitContext(context.Background(), input)
	if !errors.Is(err, ErrCalculationInfeasible) {
		t.Fatalf("driver maximum must make the plan infeasible: %v", err)
	}
}

func TestOrbitAppliesMultiDriverProfilesAndSequenceBeforeOptimization(t *testing.T) {
	targetLaps := int64(4)
	maxLaps := int64(2)
	input := OrbitCalculationInput{
		Event: OrbitCalculationEvent{
			RaceKind: "laps", TargetLaps: &targetLaps, TankLiters: 4, PitLossSeconds: 10,
			Rules: &solver.EventRules{DriverLimits: map[string]solver.DriverLimit{
				"fast": {MaxLaps: &maxLaps},
				"slow": {MaxLaps: &maxLaps},
			}},
		},
		Drivers: []OrbitCalculationDriver{
			{ID: "fast", Name: "Fast", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 2}},
			{ID: "slow", Name: "Slow", Dry: OrbitCalculationPace{PaceSeconds: 70, FuelLitersPerLap: 1}},
		},
		Variants: []OrbitCalculationVariant{{ID: "base", Mode: "dry", Order: []string{"fast", "slow"}}}, ActiveVariantID: "base",
	}

	result, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["base"]
	if len(plan.Stints) != 2 {
		t.Fatalf("stints = %+v, want two constrained stints", plan.Stints)
	}
	if plan.Stints[0].DriverID != "fast" || plan.Stints[0].Laps != 2 || plan.Stints[0].Pace != 60 || plan.Stints[0].Fuel != 4 {
		t.Fatalf("fast stint = %+v", plan.Stints[0])
	}
	if plan.Stints[1].DriverID != "slow" || plan.Stints[1].Laps != 2 || plan.Stints[1].Pace != 70 || math.Abs(plan.Stints[1].Fuel-2.8) > 1e-9 {
		t.Fatalf("slow stint = %+v", plan.Stints[1])
	}
}

func TestOrbitVariantSolverInputKeepsUniqueProfilesAndFullSequence(t *testing.T) {
	drivers := map[string]OrbitCalculationDriver{
		"a": {ID: "a", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}},
		"b": {ID: "b", Dry: OrbitCalculationPace{PaceSeconds: 61, FuelLitersPerLap: 1}},
	}
	mapped, err := orbitVariantSolverInput(3, OrbitCalculationEvent{TankLiters: 3, PitLossSeconds: 1}, drivers,
		OrbitCalculationVariant{Mode: "dry", Order: []string{"a", "a", "b"}}, "dry", 60, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(mapped.DriverProfiles) != 2 || len(mapped.DriverSequence) != 3 {
		t.Fatalf("profiles=%+v sequence=%+v", mapped.DriverProfiles, mapped.DriverSequence)
	}
}

func TestOrbitWeatherProfilesUseDryBaseInsteadOfActiveVariantMode(t *testing.T) {
	drivers := map[string]OrbitCalculationDriver{
		"a": {
			ID:  "a",
			Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1},
			Wet: OrbitCalculationPace{PaceSeconds: 70, FuelLitersPerLap: 1},
		},
		"b": {
			ID:  "b",
			Dry: OrbitCalculationPace{PaceSeconds: 61, FuelLitersPerLap: 1},
			Wet: OrbitCalculationPace{PaceSeconds: 71, FuelLitersPerLap: 1},
		},
	}
	mapped, err := orbitVariantSolverInput(4, OrbitCalculationEvent{TankLiters: 4, PitLossSeconds: 1}, drivers,
		OrbitCalculationVariant{Mode: "wet", Order: []string{"a", "b"}}, "dry", 60.5, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := mapped.DriverProfiles[0].Manual.BaseLapSeconds; got != 60 {
		t.Fatalf("weather base pace = %v, want dry 60 before weather delta", got)
	}
}

func TestOrbitSingleDriverLimitPreservesProjectedVirtualEnergy(t *testing.T) {
	input := isa825OrbitInput()
	targetLaps := int64(4)
	capacity, reserve := 10.0, 0.0
	input.Event.RaceKind = "laps"
	input.Event.DurationMinutes = 0
	input.Event.TargetLaps = &targetLaps
	input.Event.VirtualEnergy = &OrbitCalculationVirtualEnergy{
		Applicability: "applicable", CapacityPercent: &capacity, ReservePercent: &reserve,
	}
	input.PlanningInputs.Overrides[strategydocument.PlanningInputVEPerLap] = strategydocument.NumericInputOverride{
		Value: 1, Presence: sp.PresenceValid,
		Provenance: sp.Provenance{Kind: sp.ProvenanceReference, SourceID: "reference-ve"},
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "reference.v1"},
	}

	baseline, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	maxLaps := int64(4)
	input.Event.Rules = &solver.EventRules{DriverLimits: map[string]solver.DriverLimit{
		input.Drivers[0].ID: {MaxLaps: &maxLaps},
	}}
	constrained, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := constrained.Plans[input.ActiveVariantID].Stops, baseline.Plans[input.ActiveVariantID].Stops; got != want {
		t.Fatalf("driver identity changed projected VE stops: got %d, want %d", got, want)
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
