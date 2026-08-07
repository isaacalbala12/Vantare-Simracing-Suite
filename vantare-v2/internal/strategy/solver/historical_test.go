package solver

import (
	"math"
	"testing"
)

// The historical Product A generator is quarantined and must not be imported,
// so its two defects are reproduced here as formulas. These tests pin the
// difference: they fail if the new solver ever drifts back toward either.
//
// Rescue matrix, solver.go: REWRITE, P1 — "omite degradación y suma Fuel+VE".

// historicalTotal is what Product A called the total race time. Note what is
// missing: TyreDegradationPerLap was an input, but never reached this line.
func historicalTotal(raceLaps int64, lapSeconds float64, stops int64, pitLoss float64) float64 {
	return float64(raceLaps)*lapSeconds + float64(stops)*pitLoss
}

func TestHistoricalTotalIgnoredDegradation(t *testing.T) {
	input := Input{
		RaceLaps:                 78,
		BaseLapSeconds:           100,
		DegradationPerLapSeconds: 0.08,
		PitLossSeconds:           22,
		Fuel:                     fuel(100, 5), // 20 laps
	}
	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}

	historical := historicalTotal(input.RaceLaps, input.BaseLapSeconds, result.Best.Stops, input.PitLossSeconds)
	// The old figure equals the new one with the degradation term deleted.
	if math.Abs(historical-(result.Best.TotalSeconds-result.Best.DegradationSeconds)) > epsilon {
		t.Fatalf("the difference from the historical total should be exactly the degradation term: "+
			"historical %.3f, new %.3f, degradation %.3f",
			historical, result.Best.TotalSeconds, result.Best.DegradationSeconds)
	}
	// The omission is not rounding: it is worth more than a pit stop, so it can
	// flip the decision the solver exists to make.
	if result.Best.DegradationSeconds <= input.PitLossSeconds {
		t.Fatalf("expected the omitted degradation (%.1fs) to exceed a pit stop (%.1fs)",
			result.Best.DegradationSeconds, input.PitLossSeconds)
	}
}

// Product A ranked plans by `Fuel.AvailableAmount + VE.AvailableAmount`, adding
// litres to percent. The new solver never combines the two: it compares only
// how many laps each allows, which is a lap count on both sides.
func TestResourcesAreComparedAsLapsNotAddedAsUnits(t *testing.T) {
	// Litres and percent that would sum to a flattering number but are, in
	// truth, two different limits.
	litres := fuel(100, 5)          // 20 laps
	percent := virtualEnergy(60, 4) // 15 laps

	input := baseInput()
	input.Fuel = litres
	input.VirtualEnergy = percent
	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}

	historicalMargin := litres.UsableCapacity + percent.UsableCapacity // 160 of nothing
	if float64(result.MaxStintLaps) == historicalMargin {
		t.Fatal("the solver must not treat the summed capacities as a quantity")
	}
	if result.MaxStintLaps != 15 {
		t.Fatalf("the binding resource decides the stint, expected 15 laps, got %d", result.MaxStintLaps)
	}

	// Swapping only the units, with the same numbers, must not change anything:
	// the solver reads laps, not raw capacity.
	swapped := input
	swapped.Fuel = Resource{Kind: ResourceFuel, Used: true, UsableCapacity: 60, PerLap: 4}
	swapped.VirtualEnergy = Resource{Kind: ResourceVirtualEnergy, Used: true, UsableCapacity: 100, PerLap: 5}
	mirrored, err := Solve(swapped)
	if err != nil {
		t.Fatalf("Solve swapped: %v", err)
	}
	if mirrored.MaxStintLaps != result.MaxStintLaps {
		t.Fatalf("the same lap limits must give the same plan regardless of which resource carries them: %d vs %d",
			mirrored.MaxStintLaps, result.MaxStintLaps)
	}
	if mirrored.Binding != ResourceFuel {
		t.Fatalf("the binding resource must follow the laps, got %s", mirrored.Binding)
	}
}

// Product A emitted four to six fixed shapes with hardcoded splits such as
// "first stint takes half the race", and fractional lap counts. Neither is
// acceptable: a plan must be runnable.
func TestPlansUseWholeLapsAndAreNotFixedShapes(t *testing.T) {
	input := Input{
		RaceLaps:                 61, // prime, so no split divides evenly
		BaseLapSeconds:           95,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     fuel(100, 6), // 16 laps
	}
	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}

	var laps int64
	for _, stint := range result.Best.Stints {
		if stint.Laps < 1 {
			t.Fatalf("a stint must be at least one whole lap: %+v", stint)
		}
		laps += stint.Laps
	}
	if laps != input.RaceLaps {
		t.Fatalf("whole laps must account for the race exactly: %d of %d", laps, input.RaceLaps)
	}

	// The historical "front-loaded" shape gave the first stint half the race.
	if result.Best.Stints[0].Laps*2 >= input.RaceLaps && result.Best.Stops > 0 {
		t.Fatalf("the first stint should not be a fixed half of the race: %+v", result.Best.Stints)
	}
}
