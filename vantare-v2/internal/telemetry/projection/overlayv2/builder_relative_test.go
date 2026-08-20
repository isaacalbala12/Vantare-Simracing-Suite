package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// The fixture places the player at vehicle-000, which is the leader, so every
// other vehicle is behind it: TimeBehindLeader grows with the index and the
// derived gap is negative for everybody else.
func TestBuildRelativeOrdersTheWindowAheadPlayerBehind(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 44).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	rows := BuildRelative(final)
	if len(rows) != MaxRelativeBehind+1 {
		t.Fatalf("window = %d rows, want the player plus %d behind", len(rows), MaxRelativeBehind)
	}
	if rows[0].VehicleID != "vehicle-000" || rows[0].Side != RelativeSidePlayer {
		t.Fatalf("the leader is the player and must anchor the window: %#v", rows[0])
	}
	previous := 0.0
	for index, row := range rows[1:] {
		if row.Side != RelativeSideBehind {
			t.Fatalf("row %d after the player must be behind: %#v", index, row)
		}
		if row.GapSeconds.Q != QualityFresh || row.GapSeconds.V >= previous {
			t.Fatalf("rows behind must run near to far: row %d = %#v after %v", index, row.GapSeconds, previous)
		}
		previous = row.GapSeconds.V
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

func TestBuildRelativeExcludesVehiclesWithoutAUsableCanonicalGap(t *testing.T) {
	t.Parallel()

	// A grid smaller than the window so dropping a vehicle really shortens it
	// instead of pulling the next candidate in.
	final, ok := builderFinalState(t, 5).Value()
	if !ok {
		t.Fatal("missing final state")
	}
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
	if len(rows) != before-1 {
		t.Fatalf("window = %d rows, want %d after dropping the lapped vehicle", len(rows), before-1)
	}
	for _, row := range rows {
		if row.VehicleID == "vehicle-001" {
			t.Fatalf("a vehicle without a canonical gap must not be published: %#v", row)
		}
	}
}

func rebuildGaps(tb testing.TB, final derive.FinalState, player string) derive.GapSet {
	tb.Helper()
	result := derive.GapSet{Freshness: schema.FreshnessFresh}
	var anchor float64
	for _, current := range final.Observed.Vehicles {
		if string(current.Identity.Vehicle) == player {
			value, _ := current.TimeBehindLeader.Value()
			anchor = float64(value)
		}
	}
	for _, current := range final.Observed.Vehicles {
		value, _ := current.TimeBehindLeader.Value()
		field, err := schema.NewField(standings.RelativeTime(anchor-float64(value)), schema.ProvenanceDerived, schema.FreshnessFresh)
		if err != nil {
			tb.Fatal(err)
		}
		result.Vehicles = append(result.Vehicles, derive.VehicleGap{Vehicle: current.Identity.Vehicle, Time: field})
	}
	return result
}
