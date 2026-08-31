package overlayv2

import (
	"testing"
	"time"
)

func TestRelativeSettlerHoldsBoundedMembershipUntilSevenSeconds(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok { t.Fatal("missing final") }
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	first := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	second := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	third := settledRows("vehicle-027", "vehicle-004", "vehicle-000", "vehicle-018", "vehicle-036")
	if got := settler.project(final, first, header, start); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) { t.Fatalf("first=%v", relativeIDs(got)) }
	if got := settler.project(final, second, header, start.Add(time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) { t.Fatalf("early replacement=%v", relativeIDs(got)) }
	if got := settler.project(final, third, header, start.Add(2*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) { t.Fatalf("candidate change must restart hold=%v", relativeIDs(got)) }
	if got := settler.project(final, third, header, start.Add(8*time.Second+999*time.Millisecond)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) { t.Fatalf("6.999s must hold=%v", relativeIDs(got)) }
	if got := settler.project(final, third, header, start.Add(9*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(third)) { t.Fatalf("7.000s must accept=%v", relativeIDs(got)) }
}

func settledRows(ids ...string) []RelativeRowV2 {
	sides := []string{RelativeSideAhead, RelativeSideAhead, RelativeSidePlayer, RelativeSideBehind, RelativeSideBehind}
	rows := make([]RelativeRowV2, len(ids))
	for i, id := range ids { rows[i] = RelativeRowV2{VehicleID: id, Side: sides[i], GapSeconds: QValue[float64]{Q: QualityFresh}} }
	return rows
}
