package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestBuildFuelPublishesTheCanonicalTankAndTheSessionProjection(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	view := BuildFuel(final, DefaultPreferencesV2())
	if view.Remaining.Q != QualityFresh || view.Remaining.V != 42 {
		t.Fatalf("remaining = %#v, want the canonical amount", view.Remaining)
	}
	if view.Capacity.Q != QualityFresh || view.Capacity.V != 100 {
		t.Fatalf("capacity = %#v, want the canonical capacity", view.Capacity)
	}
	// The fixture leaves 7198 s of session at a 91.234 s last lap.
	remaining, _ := final.Derived.SessionRemaining.Value()
	lastLap, _ := final.Observed.Vehicles[0].LastLapTime.Value()
	if remaining <= 0 || lastLap <= 0 {
		t.Fatalf("fixture must carry both projection inputs: %v / %v", remaining, lastLap)
	}
	if view.EstimatedLaps.Q != QualityFresh || view.EstimatedLaps.V != 79 {
		t.Fatalf("estimatedLaps = %#v, want ceil(%v/%v)", view.EstimatedLaps, remaining, lastLap)
	}
}

func TestBuildFuelLeavesPerLapMissingBecauseNoCanonicalHistoryExists(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	view := BuildFuel(final, DefaultPreferencesV2())
	if view.PerLap.Q != QualityMissing || view.PerLap.V != 0 {
		t.Fatalf("per-lap consumption has no canonical authority and must stay missing: %#v", view.PerLap)
	}
}

func TestBuildFuelAppliesTheUnitPreferenceWithoutTouchingQuality(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	preferences := DefaultPreferencesV2()
	preferences.Fuel = FuelUnitGallonsUS
	view := BuildFuel(final, preferences)
	if view.Remaining.Q != QualityFresh {
		t.Fatalf("unit conversion must not change quality: %#v", view.Remaining)
	}
	if want := convertFuel(42, FuelUnitGallonsUS); view.Remaining.V != want {
		t.Fatalf("remaining = %v gal, want %v", view.Remaining.V, want)
	}
	if view.Remaining.V >= 42 {
		t.Fatalf("US gallons must be fewer than litres: %v", view.Remaining.V)
	}
}

func TestBuildFuelKeepsTheWorstQualityOfTheProjectionInputs(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].LastLapTime = builderField(t, standings.LapTime(90), schema.FreshnessStale)
	if BuildFuel(final, DefaultPreferencesV2()).EstimatedLaps.Q != QualityStale {
		t.Fatal("an estimate built on a stale lap time must be published as stale")
	}

	final.Observed.Vehicles[0].LastLapTime = builderField(t, standings.LapTime(0), schema.FreshnessFresh)
	if BuildFuel(final, DefaultPreferencesV2()).EstimatedLaps.Q != QualityMissing {
		t.Fatal("a zero lap time cannot project laps and must stay missing")
	}

	final.Derived.SessionRemaining = schema.MissingField[session.RemainingTime]()
	if BuildFuel(final, DefaultPreferencesV2()).EstimatedLaps.Q != QualityMissing {
		t.Fatal("without a session remaining there is no projection")
	}
}

func TestBuildFuelWithoutAPlayerIsEntirelyMissing(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	for index := range final.Observed.Vehicles {
		final.Observed.Vehicles[index].Player = builderField(t, false, schema.FreshnessFresh)
	}
	view := BuildFuel(final, DefaultPreferencesV2())
	for name, value := range map[string]QValue[float64]{
		"remaining": view.Remaining, "capacity": view.Capacity,
		"perLap": view.PerLap, "estimatedLaps": view.EstimatedLaps,
	} {
		if value.Q != QualityMissing || value.V != 0 {
			t.Fatalf("%s invented a value without a player: %#v", name, value)
		}
	}
}

func TestBuildFuelPreservesAnEmptyTankAsAFreshZero(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].Fuel = builderField(t, energy.Fuel{Amount: 0, Capacity: 100}, schema.FreshnessFresh)
	view := BuildFuel(final, DefaultPreferencesV2())
	if view.Remaining.Q != QualityFresh || view.Remaining.V != 0 {
		t.Fatalf("an empty tank is a legitimate fresh zero, not a missing value: %#v", view.Remaining)
	}
}
