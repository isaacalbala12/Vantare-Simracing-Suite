package solver

import (
	"math"
	"testing"
)

func TestSolveV2UsesExactClockForDriverUnavailableTime(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 3
	input.Formation.Seconds = NewFallbackScalar(0, "test:formation")
	input.PitCost.TyreSeconds = NewFallbackScalar(0, "test:tyres")
	input.FuelCapacityLiters = NewFallbackScalar(3, "test:fuel-capacity")
	input.DriverProfiles = []DriverProfileInput{manualDriver("fast", 60, 1), manualDriver("slow", 120, 1)}
	input.EventRules.DriverLimits = map[string]DriverLimit{
		"fast": {UnavailableTime: []UnavailableTimeWindow{{FromSeconds: 60, ToSeconds: 200}}},
	}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || result.Expected.TotalSeconds != 260 || len(result.Best.Stints) != 3 {
		t.Fatalf("expected fast/slow/fast around unavailable window, got %+v", result)
	}
	for index, want := range []string{"fast", "slow", "fast"} {
		if result.Best.Stints[index].Driver != want || result.Best.Stints[index].Laps != 1 {
			t.Fatalf("stint %d = %+v; want one lap by %s", index, result.Best.Stints[index], want)
		}
	}
	replayed, err := ReplayDecisionV2(input, result.Best)
	if err != nil || !replayed.Feasible || replayed.Evaluation.TotalSeconds != result.Expected.TotalSeconds {
		t.Fatalf("solve/replay mismatch: replay=%+v err=%v", replayed, err)
	}
}

func TestReplayV2RejectsDriverUnavailableTimeOverlap(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 2
	input.Formation.Seconds = NewFallbackScalar(5, "test:formation")
	input.FuelCapacityLiters = NewFallbackScalar(2, "test:fuel-capacity")
	input.DriverProfiles = []DriverProfileInput{manualDriver("solo", 60, 1)}
	baseline, err := SolveV2(input)
	if err != nil || !baseline.Feasible {
		t.Fatalf("baseline solve: result=%+v err=%v", baseline, err)
	}
	input.EventRules.DriverLimits = map[string]DriverLimit{
		"solo": {UnavailableTime: []UnavailableTimeWindow{{FromSeconds: 65, ToSeconds: 125}}},
	}
	replayed, err := ReplayDecisionV2(input, baseline.Best)
	if err != nil || replayed.Feasible || len(replayed.Reasons) == 0 || replayed.Reasons[0].Code != "driver_unavailable_time" {
		t.Fatalf("overlapping stint should be rejected: replay=%+v err=%v", replayed, err)
	}
}

func TestSolveV2TimedDriverAvailabilityUsesPitAndFormationClock(t *testing.T) {
	input := timedInput(250)
	input.RaceLaps = 6
	input.FuelCapacityLiters = NewFallbackScalar(3, "test:fuel-capacity")
	input.PitCost.TransitSeconds = NewFallbackScalar(10, "test:pit")
	input.PitCost.TyreSeconds = NewFallbackScalar(0, "test:tyres")
	input.Formation.Seconds = NewFallbackScalar(5, "test:formation")
	input.DriverProfiles = []DriverProfileInput{manualDriver("fast", 60, 1), manualDriver("slow", 120, 1)}
	input.EventRules.DriverLimits = map[string]DriverLimit{
		"fast": {UnavailableTime: []UnavailableTimeWindow{{FromSeconds: 65, ToSeconds: 205}}},
	}
	result, err := SolveV2(input)
	if err != nil || !result.Feasible || timedDecisionLaps(result.Best) != 3 || result.Expected.TotalSeconds != 265 {
		t.Fatalf("timed solve should use formation and pits: result=%+v err=%v", result, err)
	}
	replayed, err := ReplayDecisionV2(input, result.Best)
	if err != nil || !replayed.Feasible || replayed.Evaluation.TotalSeconds != result.Expected.TotalSeconds {
		t.Fatalf("timed solve/replay mismatch: replay=%+v err=%v", replayed, err)
	}
}

func TestDriverUnavailableTimeWindowRejectsInvalidBounds(t *testing.T) {
	for _, window := range []UnavailableTimeWindow{
		{FromSeconds: -1, ToSeconds: 10},
		{FromSeconds: 10, ToSeconds: 10},
		{FromSeconds: 11, ToSeconds: 10},
		{FromSeconds: math.NaN(), ToSeconds: 10},
		{FromSeconds: 0, ToSeconds: math.Inf(1)},
	} {
		input := baseInputV2()
		input.DriverProfiles = []DriverProfileInput{manualDriver("solo", 60, 1)}
		input.EventRules.DriverLimits = map[string]DriverLimit{"solo": {UnavailableTime: []UnavailableTimeWindow{window}}}
		if err := input.Validate(); err == nil {
			t.Fatalf("accepted invalid unavailable time window: %+v", window)
		}
	}
}
