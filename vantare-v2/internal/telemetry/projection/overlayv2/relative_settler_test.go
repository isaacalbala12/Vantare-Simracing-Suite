package overlayv2

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestRelativeSettlerHoldsBoundedMembershipUntilSevenSeconds(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	first := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	second := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	third := settledRows("vehicle-027", "vehicle-004", "vehicle-000", "vehicle-018", "vehicle-036")
	if got := settler.project(final, first, header, start); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("first=%v", relativeIDs(got))
	}
	if got := settler.project(final, second, header, start.Add(time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("early replacement=%v", relativeIDs(got))
	}
	if got := settler.project(final, third, header, start.Add(2*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("candidate change must restart hold=%v", relativeIDs(got))
	}
	if got := settler.project(final, third, header, start.Add(8*time.Second+999*time.Millisecond)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("6.999s must hold=%v", relativeIDs(got))
	}
	if got := settler.project(final, third, header, start.Add(9*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(third)) {
		t.Fatalf("7.000s must accept=%v", relativeIDs(got))
	}
}

func TestRelativeSettlerRehydratesEvictedObservedIDAndResetsOnRealAbsence(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	accepted := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	candidate := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	settler.project(final, accepted, header, start)
	// vehicle-022 is no longer in the immediate candidate but remains observed:
	// it must stay, in accepted order, with fields rebuilt from this final state.
	final.Observed.Vehicles[22].Position = builderField(t, standings.Position(77), schema.FreshnessFresh)
	got := settler.project(final, candidate, header, start.Add(time.Second))
	if got[0].VehicleID != "vehicle-022" || got[0].Position != 77 {
		t.Fatalf("evicted observed row was stale or replaced: %#v", got)
	}
	// Missing Position must use the same sorted canonical fallback as
	// BuildRelative, not the source slice index; live row fields also refresh.
	final.Observed.Vehicles[22].Position = schema.MissingField[standings.Position]()
	final.Observed.Vehicles[22].LastLapTime = builderField(t, standings.LapTime(123.456), schema.FreshnessFresh)
	settler.project(final, accepted, header, start.Add(3*time.Second))
	got = settler.project(final, candidate, header, start.Add(4*time.Second))
	wantPosition := resolvedRelativePositions(final.Observed.Vehicles)["vehicle-022"]
	if got[0].Position != wantPosition || got[0].LastLapSeconds.V != 123.456 {
		t.Fatalf("rehydration diverged from canonical position/live fields: got=%#v wantPosition=%d", got[0], wantPosition)
	}
	final.Observed.Vehicles = append(final.Observed.Vehicles[:22], final.Observed.Vehicles[23:]...)
	got = settler.project(final, candidate, header, start.Add(5*time.Second))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(candidate)) {
		t.Fatalf("real disappearance must reset immediately: %v", relativeIDs(got))
	}
}

func TestRelativeSettlerIsPerInstanceAndBoundsItsOutput(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	first := BuildRelative(final)
	if len(first) > MaxRelativeAhead+1+MaxRelativeBehind {
		t.Fatalf("unbounded=%d", len(first))
	}
	left, right := relativeSettler{}, relativeSettler{}
	left.project(final, first, header, cadenceOrigin)
	changed := append([]RelativeRowV2(nil), first...)
	changed[0].VehicleID = "vehicle-020"
	rightGot := right.project(final, changed, header, cadenceOrigin)
	if !sameRelativeIDs(relativeIDs(rightGot), relativeIDs(changed)) {
		t.Fatal("projector state leaked between instances")
	}
}

func TestProjectV2SettledIsPureImmediateBootstrapAndNoPlayerResets(t *testing.T) {
	t.Parallel()
	for _, count := range []int{1, 20, 44, 104} {
		snapshot := builderFinalState(t, count)
		update, err := ProjectV2(snapshot, builderSourceContext(), DefaultPreferencesV2(), 1)
		if err != nil || update.Frame == nil {
			t.Fatalf("ProjectV2(%d): %v", count, err)
		}
		if !sameRelativeIDs(relativeIDs(update.Frame.RelativeSettled), relativeIDs(update.Frame.Relative)) {
			t.Fatalf("bootstrap differs at %d", count)
		}
	}
	snapshot := builderFinalState(t, 20)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	for i := range final.Observed.Vehicles {
		final.Observed.Vehicles[i].Player = builderField(t, false, schema.FreshnessFresh)
	}
	settler := relativeSettler{}
	if got := settler.project(final, BuildRelative(final), snapshot.Header(), cadenceOrigin); len(got) != 0 {
		t.Fatalf("no player must reset immediately: %#v", got)
	}
}

func TestCachedProjectorSettledResetsPerSessionEpochAndPlayer(t *testing.T) {
	t.Parallel()
	base := builderFinalState(t, 37)
	state, ok := base.Value()
	if !ok {
		t.Fatal("missing final")
	}
	projector := NewCachedProjector(SectionCadence{})
	project := func(header envelope.Header, value derive.FinalState, now time.Time) UpdateV2 {
		snapshot, err := envelope.NewSnapshot(header, value, cloneFinalState)
		if err != nil {
			t.Fatal(err)
		}
		update, err := projector.Project(snapshot, builderSourceContext(), DefaultPreferencesV2(), uint64(header.Cursor.Sequence), now)
		if err != nil {
			t.Fatal(err)
		}
		return update
	}
	first := project(base.Header(), state, cadenceOrigin)
	for _, mutate := range []func(*envelope.Header, *derive.FinalState){
		func(h *envelope.Header, _ *derive.FinalState) { h.Identity.Session = "new-session" },
		func(h *envelope.Header, _ *derive.FinalState) { h.Cursor.Epoch++ },
		func(_ *envelope.Header, s *derive.FinalState) {
			s.Observed.Vehicles[0].Player = builderField(t, false, schema.FreshnessFresh)
			s.Observed.Vehicles[1].Player = builderField(t, true, schema.FreshnessFresh)
		},
	} {
		header, value := base.Header(), cloneFinalState(state)
		header.Cursor.Sequence++
		mutate(&header, &value)
		got := project(header, value, cadenceOrigin.Add(time.Second))
		if got.Frame == nil || !sameRelativeIDs(relativeIDs(got.Frame.RelativeSettled), relativeIDs(got.Frame.Relative)) {
			t.Fatalf("reset did not bootstrap: first=%#v got=%#v", first.Frame, got.Frame)
		}
	}
}

func settledRows(ids ...string) []RelativeRowV2 {
	sides := []string{RelativeSideAhead, RelativeSideAhead, RelativeSidePlayer, RelativeSideBehind, RelativeSideBehind}
	rows := make([]RelativeRowV2, len(ids))
	for i, id := range ids {
		rows[i] = RelativeRowV2{VehicleID: id, Side: sides[i], GapSeconds: QValue[float64]{Q: QualityFresh}}
	}
	return rows
}
