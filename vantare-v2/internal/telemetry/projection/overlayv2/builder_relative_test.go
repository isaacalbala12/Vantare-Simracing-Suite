package overlayv2

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestBuildRelativeWrapsThePhysicalWindowAroundThePlayer(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 44).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	rows := BuildRelative(final)
	if len(rows) != MaxRelativeAhead+MaxRelativeBehind+1 {
		t.Fatalf("window = %d rows, want %d+player+%d", len(rows), MaxRelativeAhead, MaxRelativeBehind)
	}
	if rows[MaxRelativeAhead].VehicleID != "vehicle-000" || rows[MaxRelativeAhead].Side != RelativeSidePlayer {
		t.Fatalf("player must anchor the circular window: %#v", rows)
	}
	for index, row := range rows[:MaxRelativeAhead] {
		if row.Side != RelativeSideAhead || row.GapSeconds.Q != QualityFresh || row.GapSeconds.V <= 0 {
			t.Fatalf("row %d before player must be a physical car ahead: %#v", index, row)
		}
	}
	for index, row := range rows[MaxRelativeAhead+1:] {
		if row.Side != RelativeSideBehind || row.GapSeconds.Q != QualityFresh || row.GapSeconds.V >= 0 {
			t.Fatalf("row %d after player must be a physical car behind: %#v", index, row)
		}
		if row.Authority != AuthorityDerived {
			t.Fatalf("the canonical relative gap is reconstructed: %#v", row)
		}
		if row.DisplayName == "" || row.ClassID == "" {
			t.Fatalf("row %d lost its identity: %#v", index, row)
		}
	}
}

func TestBuildRelativePlacesVehiclesAheadOfThePlayerBeforeIt(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	// Move the player to the middle of the field so the window has both sides.
	final.Observed.Vehicles[0].Player = builderField(t, false, schema.FreshnessFresh)
	final.Observed.Vehicles[10].Player = builderField(t, true, schema.FreshnessFresh)
	final.Derived.Gaps = rebuildGaps(t, final, "vehicle-010")

	rows := BuildRelative(final)
	player := -1
	for index, row := range rows {
		if row.Side == RelativeSidePlayer {
			player = index
		}
	}
	if player <= 0 || player == len(rows)-1 {
		t.Fatalf("player must sit between the two sides: index %d of %d", player, len(rows))
	}
	for _, row := range rows[:player] {
		if row.Side != RelativeSideAhead || row.GapSeconds.V <= 0 {
			t.Fatalf("row before the player must be ahead with a positive gap: %#v", row)
		}
	}
	for _, row := range rows[player+1:] {
		if row.Side != RelativeSideBehind || row.GapSeconds.V >= 0 {
			t.Fatalf("row after the player must be behind with a negative gap: %#v", row)
		}
	}
	// The window is bounded on both sides regardless of the grid size.
	if player > MaxRelativeAhead || len(rows)-player-1 > MaxRelativeBehind {
		t.Fatalf("window is not bounded: %d ahead, %d behind", player, len(rows)-player-1)
	}
}

func TestBuildRelativeWithoutAPlayerIsEmptyAndNeverNull(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	for index := range final.Observed.Vehicles {
		final.Observed.Vehicles[index].Player = builderField(t, false, schema.FreshnessFresh)
	}
	rows := BuildRelative(final)
	if rows == nil || len(rows) != 0 {
		t.Fatalf("without a player the window is empty, not null and not a fallback: %#v", rows)
	}
}

func TestBuildRelativeKeepsPhysicalNeighborWithoutAUsableCanonicalGap(t *testing.T) {
	t.Parallel()

	// A grid smaller than the window so dropping a vehicle really shortens it
	// instead of pulling the next candidate in.
	final, ok := builderFinalState(t, 5).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.Gaps = rebuildGaps(t, final, "vehicle-000")
	before := len(BuildRelative(final))
	if before != 5 {
		t.Fatalf("window = %d rows, want the whole grid", before)
	}
	// A vehicle on another lap has Laps set and Time missing in the canonical
	// state: it leaves the window instead of showing a blank gap.
	for index := range final.Derived.Gaps.Vehicles {
		if string(final.Derived.Gaps.Vehicles[index].Vehicle) == "vehicle-001" {
			final.Derived.Gaps.Vehicles[index].Time = schema.MissingField[standings.RelativeTime]()
		}
	}
	rows := BuildRelative(final)
	if len(rows) != before {
		t.Fatalf("window = %d rows, want the same %d physical neighbors", len(rows), before)
	}
	for _, row := range rows {
		if row.VehicleID == "vehicle-001" {
			if row.GapSeconds.Q != QualityMissing {
				t.Fatalf("physical neighbor must remain with an explicit missing gap: %#v", row)
			}
			return
		}
	}
	t.Fatal("physical neighbor vehicle-001 disappeared")
}

func TestBuildRelativeUsesLapDistanceInsteadOfGapForPhysicalOrder(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 5).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].Player = builderField(t, false, schema.FreshnessFresh)
	final.Observed.Vehicles[2].Player = builderField(t, true, schema.FreshnessFresh)
	final.Derived.Gaps = rebuildGaps(t, final, "vehicle-002")
	for index := range final.Derived.Gaps.Vehicles {
		gap := &final.Derived.Gaps.Vehicles[index]
		switch gap.Vehicle {
		case "vehicle-001":
			gap.Time = builderField(t, standings.RelativeTime(100), schema.FreshnessFresh)
		case "vehicle-003":
			gap.Time = builderField(t, standings.RelativeTime(-100), schema.FreshnessFresh)
		}
	}

	rows := BuildRelative(final)
	want := []struct {
		id   string
		side string
	}{
		{id: "vehicle-004", side: RelativeSideAhead},
		{id: "vehicle-003", side: RelativeSideAhead},
		{id: "vehicle-002", side: RelativeSidePlayer},
		{id: "vehicle-001", side: RelativeSideBehind},
		{id: "vehicle-000", side: RelativeSideBehind},
	}
	if len(rows) != len(want) {
		t.Fatalf("window = %#v, want %d rows", rows, len(want))
	}
	for index, expected := range want {
		if rows[index].VehicleID != expected.id || rows[index].Side != expected.side {
			t.Fatalf("row %d = %#v, want id=%s side=%s", index, rows[index], expected.id, expected.side)
		}
		if expected.side == RelativeSideAhead && rows[index].GapSeconds.V < 0 {
			t.Fatalf("ahead row %d kept a contradictory negative gap: %#v", index, rows[index])
		}
		if expected.side == RelativeSideBehind && rows[index].GapSeconds.V > 0 {
			t.Fatalf("behind row %d kept a contradictory positive gap: %#v", index, rows[index])
		}
	}
}

func rebuildGaps(tb testing.TB, final derive.FinalState, player string) derive.GapSet {
	tb.Helper()
	result := derive.GapSet{Freshness: schema.FreshnessFresh}
	var anchor float64
	var period float64
	for _, current := range final.Observed.Vehicles {
		if string(current.Identity.Vehicle) == player {
			value, _ := current.LapProgressTime.Value()
			anchor = float64(value)
			lapTime, _ := current.EstimatedLapTime.Value()
			period = float64(lapTime)
		}
	}
	for _, current := range final.Observed.Vehicles {
		value, _ := current.LapProgressTime.Value()
		delta := float64(value) - anchor
		delta -= math.Round(delta/period) * period
		field, err := schema.NewField(standings.RelativeTime(delta), schema.ProvenanceDerived, schema.FreshnessFresh)
		if err != nil {
			tb.Fatal(err)
		}
		result.Vehicles = append(result.Vehicles, derive.VehicleGap{Vehicle: current.Identity.Vehicle, Time: field})
	}
	return result
}
