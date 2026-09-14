package overlayv2

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

// TestBuildFuelPublishesTheMeasuredHistory is the A2 projection RED: the wire
// history carries one lap number plus one litre figure per measured lap,
// index-aligned, with the history quality, never a browser-side series.
func TestBuildFuelPublishesTheMeasuredHistory(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.Fuel = builderFuelUsage(t, 3.5, schema.FreshnessFresh)
	final.Derived.Fuel.History = derive.FuelHistory{
		Freshness: schema.FreshnessFresh,
		Samples: []derive.FuelLapSample{
			{Lap: session.LapNumber(5), Consumed: energy.FuelAmount(3)},
			{Lap: session.LapNumber(6), Consumed: energy.FuelAmount(3.5)},
		},
	}
	view := BuildFuel(final, DefaultPreferencesV2())
	if view.History.Q != QualityFresh {
		t.Fatalf("history quality = %q, want fresh", view.History.Q)
	}
	if len(view.History.Lap) != 2 || len(view.History.Consumed) != 2 {
		t.Fatalf("history arrays = %d/%d entries, want 2/2 aligned",
			len(view.History.Lap), len(view.History.Consumed))
	}
	if view.History.Lap[0] != 5 || view.History.Lap[1] != 6 {
		t.Fatalf("history laps = %v, want [5 6]", view.History.Lap)
	}
	if math.Abs(view.History.Consumed[0]-3) > 1e-9 || math.Abs(view.History.Consumed[1]-3.5) > 1e-9 {
		t.Fatalf("history consumed = %v litres, want [3 3.5]", view.History.Consumed)
	}
}

// TestBuildFuelPublishesSessionLapsAndRequiredFuel is the A2 projection RED
// for the session projection: SessionLaps is always published from
// SessionRemaining + player LastLapTime even when the fuel basis wins, and
// RequiredFuel is PerLap x SessionLaps, never derived from EstimatedLaps.
func TestBuildFuelPublishesSessionLapsAndRequiredFuel(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.Fuel = builderFuelUsage(t, 3.5, schema.FreshnessFresh)
	view := BuildFuel(final, DefaultPreferencesV2())
	// The fixture leaves 7198 s of session at a 91.234 s last lap: ceil = 79.
	// The tank allows floor(42/3.5) = 12, so the fuel basis wins EstimatedLaps.
	if view.Basis != FuelBasisFuel || view.EstimatedLaps.V != 12 {
		t.Fatalf("estimatedLaps = %#v basis %q, want 12 on the fuel basis", view.EstimatedLaps, view.Basis)
	}
	if view.SessionLaps.Q != QualityFresh || view.SessionLaps.V != 79 {
		t.Fatalf("sessionLaps = %#v, want 79 even when the fuel basis wins", view.SessionLaps)
	}
	if view.RequiredFuel.Q != QualityFresh || math.Abs(view.RequiredFuel.V-276.5) > 1e-9 {
		t.Fatalf("requiredFuel = %#v, want 3.5x79 = 276.5, never 3.5x12", view.RequiredFuel)
	}
}

// TestBuildFuelKeepsTheWorstQualityOfTheRequiredFuelInputs is the A2
// projection RED for quality: RequiredFuel carries the worst of PerLap and
// SessionLaps, and a missing input keeps it missing without inventing.
func TestBuildFuelKeepsTheWorstQualityOfTheRequiredFuelInputs(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.Fuel = builderFuelUsage(t, 3.5, schema.FreshnessStale)
	view := BuildFuel(final, DefaultPreferencesV2())
	if view.RequiredFuel.Q != QualityStale {
		t.Fatalf("requiredFuel = %#v, want stale from a stale per-lap", view.RequiredFuel)
	}

	final.Derived.Fuel = builderFuelUsage(t, 3.5, schema.FreshnessFresh)
	final.Derived.SessionRemaining = schema.MissingField[session.RemainingTime]()
	view = BuildFuel(final, DefaultPreferencesV2())
	if view.SessionLaps.Q != QualityMissing || view.SessionLaps.V != 0 {
		t.Fatalf("sessionLaps = %#v without a session remaining, want missing", view.SessionLaps)
	}
	if view.RequiredFuel.Q != QualityMissing || view.RequiredFuel.V != 0 {
		t.Fatalf("requiredFuel = %#v without session laps, want missing", view.RequiredFuel)
	}
}

// TestBuildFuelConvertsHistoryAndRequiredFuelToThePreferredUnit is the A2
// projection RED for units: litres stay canonical in derive, gallons only in
// the presentation; laps are unit agnostic.
func TestBuildFuelConvertsHistoryAndRequiredFuelToThePreferredUnit(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.Fuel = builderFuelUsage(t, 3.5, schema.FreshnessFresh)
	final.Derived.Fuel.History = derive.FuelHistory{
		Freshness: schema.FreshnessFresh,
		Samples:   []derive.FuelLapSample{{Lap: session.LapNumber(6), Consumed: energy.FuelAmount(3.5)}},
	}
	preferences := DefaultPreferencesV2()
	preferences.Fuel = FuelUnitGallonsUS
	view := BuildFuel(final, preferences)
	if want := convertFuel(3.5, FuelUnitGallonsUS); math.Abs(view.History.Consumed[0]-want) > 1e-12 {
		t.Fatalf("history consumed = %v gal, want %v", view.History.Consumed[0], want)
	}
	if want := convertFuel(3.5*79, FuelUnitGallonsUS); math.Abs(view.RequiredFuel.V-want) > 1e-9 {
		t.Fatalf("requiredFuel = %v gal, want %v", view.RequiredFuel.V, want)
	}
	if view.SessionLaps.V != 79 {
		t.Fatalf("sessionLaps = %v, want the same 79 laps in any unit", view.SessionLaps.V)
	}
}

// TestBuildFuelWithoutAPlayerLeavesTheSessionProjectionMissing is the A2
// projection RED for absence: no player means no history, no session laps and
// no required fuel, all missing with no zero values.
func TestBuildFuelWithoutAPlayerLeavesTheSessionProjectionMissing(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	for index := range final.Observed.Vehicles {
		final.Observed.Vehicles[index].Player = builderField(t, false, schema.FreshnessFresh)
	}
	view := BuildFuel(final, DefaultPreferencesV2())
	if view.History.Q != QualityMissing || len(view.History.Lap) != 0 || len(view.History.Consumed) != 0 {
		t.Fatalf("history without a player must be missing and empty: %#v", view.History)
	}
	for name, value := range map[string]QValue[float64]{
		"sessionLaps": view.SessionLaps, "requiredFuel": view.RequiredFuel,
	} {
		if value.Q != QualityMissing || value.V != 0 {
			t.Fatalf("%s invented a value without a player: %#v", name, value)
		}
	}
}
