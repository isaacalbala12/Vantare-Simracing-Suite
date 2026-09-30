package application

import (
	"math"
	"testing"
)

func TestOrbitComparesExactBaseWithConstrainedStints(t *testing.T) {
	targetLaps := int64(4)
	firstLaps := int64(1)
	input := OrbitCalculationInput{
		Event: OrbitCalculationEvent{RaceKind: "laps", TargetLaps: &targetLaps, TankLiters: 10, PitLossSeconds: 10},
		Drivers: []OrbitCalculationDriver{
			{ID: "fast", Name: "Fast", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1}},
			{ID: "slow", Name: "Slow", Dry: OrbitCalculationPace{PaceSeconds: 70, FuelLitersPerLap: 1}},
		},
		Variants: []OrbitCalculationVariant{
			{ID: "recorded-main", Mode: "dry", DriverOrderMode: "free", Order: []string{"fast", "slow"}},
			{ID: "recorded-stint-edit", Mode: "dry", DriverOrderMode: "fixed", Order: []string{"fast", "slow"}, Overrides: map[int]OrbitCalculationOverride{0: {Laps: &firstLaps}}},
		},
		ActiveVariantID: "recorded-stint-edit",
	}

	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	base := result.Plans["recorded-main"]
	constrained := result.Plans["recorded-stint-edit"]
	if len(base.Stints) != 1 || base.Stints[0].DriverID != "fast" {
		t.Fatalf("base proposal changed: %+v", base)
	}
	if len(constrained.Stints) != 2 || constrained.Stints[0].Laps != 1 || constrained.Stints[1].Laps != 3 || constrained.Stints[1].DriverID != "slow" {
		t.Fatalf("stint constraints not preserved: %+v", constrained)
	}
	comparison, ok := result.Comparisons["recorded-main"]
	if !ok || math.Abs(comparison.TotalDeltaSeconds-(base.TotalSeconds-constrained.TotalSeconds)) > 1e-9 {
		t.Fatalf("comparison=%+v base=%v constrained=%v", comparison, base.TotalSeconds, constrained.TotalSeconds)
	}
	if constrained.Optimality != "not_proven" {
		t.Fatalf("constrained plan claimed optimality: %+v", constrained)
	}
}
