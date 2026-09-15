package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// The order is resolved in Go, so a snapshot whose vehicles arrive in any
// order must produce the same rows. Overlay v1 left this to the widget.
func TestBuildStandingsOrdersByObservedPosition(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	reversed := make([]core.VehicleState, len(final.Observed.Vehicles))
	for index, current := range final.Observed.Vehicles {
		reversed[len(reversed)-1-index] = current
	}
	final.Observed.Vehicles = reversed

	rows := BuildStandings(final)
	if len(rows) != 20 {
		t.Fatalf("rows = %d, want 20", len(rows))
	}
	for index, row := range rows {
		if row.Position != int32(index+1) {
			t.Fatalf("row %d position = %d, want %d", index, row.Position, index+1)
		}
	}
}

// Overlay v1 fell back to `index+1` inside standings-view-model.ts without
// telling anybody. The fallback now lives in Go, is deterministic and keeps
// the rows without a usable position after the ones that have it.
func TestBuildStandingsResolvesTheFallbackOrderExplicitly(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 4).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].Position = schema.MissingField[standings.Position]()
	rows := BuildStandings(final)

	if len(rows) != 4 {
		t.Fatalf("rows = %d, want 4", len(rows))
	}
	last := rows[len(rows)-1]
	if last.VehicleID != "vehicle-000" {
		t.Fatalf("vehicle without position must sort last, got %q", last.VehicleID)
	}
	if last.Position != 4 {
		t.Fatalf("fallback position = %d, want the resolved order index 4", last.Position)
	}
	for index, row := range rows[:len(rows)-1] {
		if row.Position != int32(index+2) {
			t.Fatalf("row %d kept observed position %d", index, row.Position)
		}
	}
}

func TestBuildStandingsDerivesClassPositionFromTheResolvedOrder(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 9).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	rows := BuildStandings(final)
	perClass := map[string][]int32{}
	for _, row := range rows {
		perClass[row.ClassID] = append(perClass[row.ClassID], row.ClassPosition)
	}
	if len(perClass) != len(builderClasses) {
		t.Fatalf("classes = %d, want %d", len(perClass), len(builderClasses))
	}
	for class, positions := range perClass {
		for index, position := range positions {
			if position != int32(index+1) {
				t.Fatalf("class %q position %d at index %d", class, position, index)
			}
		}
	}
}

func TestBuildStandingsProjectsPitStateAndGapQuality(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 3).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].InPit = builderField(t, pit.InPit(false), schema.FreshnessFresh)
	final.Observed.Vehicles[1].InPit = builderField(t, pit.InPit(true), schema.FreshnessFresh)
	final.Observed.Vehicles[2].InPit = schema.MissingField[pit.InPit]()
	final.Observed.Vehicles[2].TimeBehindLeader = schema.MissingField[standings.TimeGap]()
	final.Observed.Vehicles[1].BestLapTime = builderField(t, standings.LapTime(240.123), schema.FreshnessFresh)
	rows := BuildStandings(final)

	if rows[0].PitState != PitStateTrack {
		t.Fatalf("row 0 pit = %q, want %q", rows[0].PitState, PitStateTrack)
	}
	if rows[1].PitState != PitStatePit {
		t.Fatalf("row 1 pit = %q, want %q", rows[1].PitState, PitStatePit)
	}
	if rows[2].PitState != "" {
		t.Fatalf("absent InPit must stay empty, got %q", rows[2].PitState)
	}
	if rows[2].GapSeconds.Q != QualityMissing || rows[2].GapSeconds.V != 0 {
		t.Fatalf("missing gap not preserved: %#v", rows[2].GapSeconds)
	}
	if rows[0].GapSeconds.Q != QualityFresh {
		t.Fatalf("fresh gap not preserved: %#v", rows[0].GapSeconds)
	}
	if rows[1].BestLapSeconds.Q != QualityFresh || rows[1].BestLapSeconds.V != 240.123 {
		t.Fatalf("best lap not projected: %#v", rows[1].BestLapSeconds)
	}
}

// The canonical VehicleState carries the REST-sourced car number. The builder
// projects it verbatim (ISA-1072), preserving strings like "007", and leaves
// it empty only when the producer did not supply one.
func TestBuildStandingsProjectsCarNumber(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 5).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].CarNumber = builderField(t, standings.CarNumber("007"), schema.FreshnessFresh)
	final.Observed.Vehicles[1].CarNumber = builderField(t, standings.CarNumber("91"), schema.FreshnessFresh)
	// The wire number carries no quality of its own, so only a fresh producer
	// value publishes: stale and invalid stay empty rather than leaking.
	final.Observed.Vehicles[2].CarNumber = builderField(t, standings.CarNumber("50"), schema.FreshnessStale)
	final.Observed.Vehicles[3].CarNumber = builderField(t, standings.CarNumber("66"), schema.FreshnessInvalid)
	for _, row := range BuildStandings(final) {
		switch row.VehicleID {
		case "vehicle-000":
			if row.CarNumber != "007" {
				t.Fatalf("car number = %q, want 007", row.CarNumber)
			}
		case "vehicle-001":
			if row.CarNumber != "91" {
				t.Fatalf("car number = %q, want 91", row.CarNumber)
			}
		default:
			if row.CarNumber != "" {
				t.Fatalf("car number invented for %q: %q", row.VehicleID, row.CarNumber)
			}
		}
		if row.DriverName == "" {
			t.Fatalf("driver name missing for %q", row.VehicleID)
		}
	}
}

// The builder never derives a number from the driver or vehicle name: without
// a producer-supplied CarNumber the wire field stays empty.
func TestBuildStandingsNeverInventsCarNumber(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 5).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	for _, row := range BuildStandings(final) {
		if row.CarNumber != "" {
			t.Fatalf("car number invented for %q: %q", row.VehicleID, row.CarNumber)
		}
		if row.DriverName == "" {
			t.Fatalf("driver name missing for %q", row.VehicleID)
		}
	}
}

func TestBuildStandingsDoesNotMutateTheSnapshotSlice(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 6).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	before := make([]string, len(final.Observed.Vehicles))
	for index, current := range final.Observed.Vehicles {
		before[index] = string(current.Identity.Vehicle)
	}
	BuildStandings(final)
	for index, current := range final.Observed.Vehicles {
		if string(current.Identity.Vehicle) != before[index] {
			t.Fatalf("snapshot slice reordered at %d", index)
		}
	}
}
