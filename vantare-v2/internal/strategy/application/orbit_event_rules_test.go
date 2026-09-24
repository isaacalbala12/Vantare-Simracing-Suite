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
	if plan.Stints[1].DriverID != "slow" || plan.Stints[1].Laps != 2 || plan.Stints[1].Pace != 70 || math.Abs(plan.Stints[1].Fuel-3) > 1e-9 {
		t.Fatalf("slow stint = %+v", plan.Stints[1])
	}
	if plan.Optimality != "proven" {
		t.Fatalf("unaltered multi-driver decision lost proof: %+v", plan)
	}
}

func TestOrbitFreeDriverOrderLetsSolverChooseWithoutArtificialStop(t *testing.T) {
	targetLaps := int64(4)
	input := OrbitCalculationInput{
		Event: OrbitCalculationEvent{RaceKind: "laps", TargetLaps: &targetLaps, TankLiters: 10, PitLossSeconds: 10},
		Drivers: []OrbitCalculationDriver{
			{ID: "fast", Name: "Fast", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}},
			{ID: "slow", Name: "Slow", Dry: OrbitCalculationPace{PaceSeconds: 70, FuelLitersPerLap: 1}},
		},
		Variants: []OrbitCalculationVariant{{ID: "base", Mode: "dry", DriverOrderMode: "free", Order: []string{"slow", "fast"}}}, ActiveVariantID: "base",
	}

	result, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans["base"]
	if plan.Stops != 0 || len(plan.Stints) != 1 || plan.Stints[0].DriverID != "fast" || plan.Stints[0].Pace != 60 {
		t.Fatalf("free driver proposal = %+v", plan)
	}
	input.WeatherScenarios = []strategydocument.WeightedWeatherScenario{resourceWeatherScenario()}
	withWeather, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if withWeather.Weather == nil || len(withWeather.Weather.Plans) != 1 || len(withWeather.Weather.Plans[0].Stints) != 1 {
		t.Fatalf("free weather plan = %+v", withWeather.Weather)
	}
	input.WeatherScenarios = nil
	minimumSlowLaps := int64(1)
	input.Event.Rules = &solver.EventRules{DriverLimits: map[string]solver.DriverLimit{"slow": {MinLaps: &minimumSlowLaps}}}
	constrained, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	foundSlow := false
	for _, stint := range constrained.Plans["base"].Stints {
		foundSlow = foundSlow || stint.DriverID == "slow"
	}
	if !foundSlow {
		t.Fatalf("explicit slow-driver minimum ignored: %+v", constrained.Plans["base"])
	}

	input.Event.Rules = nil
	input.Variants[0].DriverOrderMode = ""
	legacy, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.Plans["base"].Stops != 1 || len(legacy.Plans["base"].Stints) != 2 {
		t.Fatalf("absent mode must preserve fixed legacy rotation: %+v", legacy.Plans["base"])
	}
	input.Variants[0].DriverOrderMode = "fixed"
	explicit, err := calculateOrbitContext(context.Background(), input)
	if err != nil || len(explicit.Plans["base"].Stints) != 2 {
		t.Fatalf("explicit fixed rotation = %+v, err=%v", explicit.Plans["base"], err)
	}

	input.Event = OrbitCalculationEvent{RaceKind: "time", DurationMinutes: 4, TankLiters: 10, PitLossSeconds: 10}
	input.Variants[0].DriverOrderMode = "free"
	timed, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatalf("free timed race error = %v", err)
	}
	if timed.Plans["base"].TotalLaps != 4 || len(timed.Plans["base"].Stints) != 1 || timed.Plans["base"].Stints[0].DriverID != "fast" {
		t.Fatalf("free timed plan = %+v", timed.Plans["base"])
	}
}

func TestOrbitTimedFreeOrderUsesDecisionClockAcrossPit(t *testing.T) {
	oneLap := int64(1)
	minimumStops := 1
	input := OrbitCalculationInput{
		Event: OrbitCalculationEvent{
			RaceKind: "time", DurationMinutes: 4, TankLiters: 10, PitLossSeconds: 100,
			Rules: &solver.EventRules{
				MinPitStops: &minimumStops,
				DriverLimits: map[string]solver.DriverLimit{
					"fast": {MaxLaps: &oneLap},
					"slow": {MaxLaps: &oneLap},
				},
			},
		},
		Drivers: []OrbitCalculationDriver{
			{ID: "fast", Name: "Fast", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}},
			{ID: "slow", Name: "Slow", Dry: OrbitCalculationPace{PaceSeconds: 120, FuelLitersPerLap: 1}},
		},
		Variants:        []OrbitCalculationVariant{{ID: "base", Mode: "dry", DriverOrderMode: "free", Order: []string{"fast", "slow"}}},
		ActiveVariantID: "base",
	}
	result, err := calculateOrbitContext(context.Background(), input)
	if err != nil {
		t.Fatalf("calculateOrbitContext: %v", err)
	}
	plan := result.Plans["base"]
	if plan.TotalLaps != 2 || plan.Stops != 1 || math.Abs(plan.TotalSeconds-280) > 1e-9 || plan.FinalLapStartSeconds >= 240 {
		t.Fatalf("timed free pit plan = %+v", plan)
	}
}

func TestOrbitFreeDriverOrderRejectsUnknownModeAndStintOverrides(t *testing.T) {
	targetLaps := int64(4)
	one := int64(1)
	input := OrbitCalculationInput{
		Event: OrbitCalculationEvent{RaceKind: "laps", TargetLaps: &targetLaps, TankLiters: 10, PitLossSeconds: 10},
		Drivers: []OrbitCalculationDriver{
			{ID: "fast", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}},
			{ID: "slow", Dry: OrbitCalculationPace{PaceSeconds: 70, FuelLitersPerLap: 1}},
		},
		Variants: []OrbitCalculationVariant{{ID: "base", Mode: "dry", DriverOrderMode: "unknown", Order: []string{"fast", "slow"}}}, ActiveVariantID: "base",
	}
	if _, err := calculateOrbitContext(context.Background(), input); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("unknown driver order mode error = %v", err)
	}
	input.Variants[0].DriverOrderMode = "free"
	input.Variants[0].Overrides = map[int]OrbitCalculationOverride{0: {Laps: &one}}
	if _, err := calculateOrbitContext(context.Background(), input); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("free lap override error = %v", err)
	}
	input.Variants[0].Overrides = nil
	input.Variants[0].Order = []string{"fast", "fast"}
	if _, err := calculateOrbitContext(context.Background(), input); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("duplicate free candidate error = %v", err)
	}
	input.Variants[0].Order = []string{"fast", "slow"}
	input.Variants[0].Overrides = map[int]OrbitCalculationOverride{1: {Fuel: resourceValue(2)}}
	if _, err := calculateOrbitContext(context.Background(), input); !errors.Is(err, ErrCalculationInvalid) {
		t.Fatalf("free fuel override error = %v", err)
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
	mapped, err = orbitVariantSolverInput(3, OrbitCalculationEvent{TankLiters: 3, PitLossSeconds: 1}, drivers,
		OrbitCalculationVariant{Mode: "dry", DriverOrderMode: "free", Order: []string{"a", "b"}}, "dry", 60, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(mapped.DriverProfiles) != 2 || len(mapped.DriverSequence) != 0 {
		t.Fatalf("free profiles=%+v sequence=%+v", mapped.DriverProfiles, mapped.DriverSequence)
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
