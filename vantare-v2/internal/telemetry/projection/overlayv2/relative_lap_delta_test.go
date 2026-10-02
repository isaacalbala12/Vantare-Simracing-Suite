package overlayv2

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func relativeLapField(t *testing.T, value int32, freshness schema.Freshness) schema.Field[standings.RelativeLaps] {
	t.Helper()
	field, err := schema.NewField(standings.RelativeLaps(value), schema.ProvenanceDerived, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return field
}

func setRelativeLapField(t *testing.T, final *derive.FinalState, id string, field schema.Field[standings.RelativeLaps]) {
	t.Helper()
	for index := range final.Derived.Gaps.Vehicles {
		if string(final.Derived.Gaps.Vehicles[index].Vehicle) == id {
			final.Derived.Gaps.Vehicles[index].Laps = field
			return
		}
	}
	t.Fatalf("canonical gap for %s not found", id)
}

func relativeRowFor(t *testing.T, rows []RelativeRowV2, id string) RelativeRowV2 {
	t.Helper()
	for _, row := range rows {
		if row.VehicleID == id {
			return row
		}
	}
	t.Fatalf("relative row %s not found", id)
	return RelativeRowV2{}
}

func TestRelativeLapDeltaPreservesCanonicalSignAndQualityWithoutTemporalGap(t *testing.T) {
	t.Parallel()
	base, ok := builderFinalState(t, 5).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	for _, testCase := range []struct {
		name  string
		field schema.Field[standings.RelativeLaps]
		want  QValue[int32]
	}{
		{name: "rival more laps", field: relativeLapField(t, 2, schema.FreshnessFresh), want: QValue[int32]{V: 2, Q: QualityFresh}},
		{name: "rival fewer laps", field: relativeLapField(t, -1, schema.FreshnessFresh), want: QValue[int32]{V: -1, Q: QualityFresh}},
		{name: "same lap", field: relativeLapField(t, 0, schema.FreshnessFresh), want: QValue[int32]{Q: QualityFresh}},
		{name: "stale", field: relativeLapField(t, -2, schema.FreshnessStale), want: QValue[int32]{V: -2, Q: QualityStale}},
		{name: "invalid", field: relativeLapField(t, 3, schema.FreshnessInvalid), want: QValue[int32]{V: 3, Q: QualityInvalid}},
		{name: "missing", field: schema.MissingField[standings.RelativeLaps](), want: QValue[int32]{Q: QualityMissing}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			final := cloneFinalState(base)
			setRelativeLapField(t, &final, "vehicle-001", testCase.field)
			for index := range final.Derived.Gaps.Vehicles {
				if string(final.Derived.Gaps.Vehicles[index].Vehicle) == "vehicle-001" {
					final.Derived.Gaps.Vehicles[index].Time = schema.MissingField[standings.RelativeTime]()
				}
			}
			row := relativeRowFor(t, BuildRelative(final), "vehicle-001")
			if row.LapDelta != testCase.want || row.GapSeconds.Q != QualityMissing {
				t.Fatalf("canonical laps must survive absent temporal gap: lap=%#v gap=%#v", row.LapDelta, row.GapSeconds)
			}
			final.Observed.Vehicles[1].CompletedLaps = builderPresent(standings.CompletedLaps(500))
			if got := relativeRowFor(t, BuildRelative(final), "vehicle-001").LapDelta; got != testCase.want {
				t.Fatalf("completed lap counter inferred over canonical difference: got=%#v want=%#v", got, testCase.want)
			}
		})
	}
}

func TestRelativeLapDeltaAloneInvalidatesRelativeSection(t *testing.T) {
	t.Parallel()
	base, ok := builderFinalState(t, 5).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	before := cloneFinalState(base)
	setRelativeLapField(t, &before, "vehicle-001", relativeLapField(t, 1, schema.FreshnessFresh))
	for _, testCase := range []struct {
		name  string
		field schema.Field[standings.RelativeLaps]
	}{
		{name: "value", field: relativeLapField(t, 2, schema.FreshnessFresh)},
		{name: "sign", field: relativeLapField(t, -1, schema.FreshnessFresh)},
		{name: "quality", field: relativeLapField(t, 1, schema.FreshnessStale)},
		{name: "missing", field: schema.MissingField[standings.RelativeLaps]()},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			after := cloneFinalState(before)
			setRelativeLapField(t, &after, "vehicle-001", testCase.field)
			if !relativeDirtyDiff(before, after).Has(SectionRelative) {
				t.Fatal("lap difference changed without invalidating Relative")
			}
		})
	}
}

func TestRelativeLapDeltaDoesNotFollowPhysicalSide(t *testing.T) {
	t.Parallel()
	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].Player = builderField(t, false, schema.FreshnessFresh)
	final.Observed.Vehicles[10].Player = builderField(t, true, schema.FreshnessFresh)
	setRelativeLapField(t, &final, "vehicle-011", relativeLapField(t, 1, schema.FreshnessFresh))
	before := relativeRowFor(t, BuildRelative(final), "vehicle-011")
	if before.Side != RelativeSideAhead || before.LapDelta.V != 1 {
		t.Fatalf("expected canonical +1 ahead of player, got %#v", before)
	}
	final.Observed.Vehicles[11].LapDistance = builderPresent(standings.LapDistance(8.5 * 42.5))
	after := relativeRowFor(t, BuildRelative(final), "vehicle-011")
	if after.Side != RelativeSideBehind || after.LapDelta != before.LapDelta {
		t.Fatalf("physical side altered canonical lap difference: before=%#v after=%#v", before, after)
	}
}

func TestRelativeSettlerRefreshesLapDeltaWithoutMembershipDelay(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 5)
	base, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final state")
	}
	setRelativeLapField(t, &base, "vehicle-001", relativeLapField(t, 1, schema.FreshnessFresh))
	settler := relativeSettler{}
	first := BuildRelative(base)
	settler.project(base, first, snapshot.Header(), cadenceOrigin)

	next := cloneFinalState(base)
	setRelativeLapField(t, &next, "vehicle-001", relativeLapField(t, -2, schema.FreshnessFresh))
	got := settler.project(next, BuildRelative(next), snapshot.Header(), cadenceOrigin.Add(time.Millisecond))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("lap difference alone changed accepted membership: %v", relativeIDs(got))
	}
	if lap := relativeRowFor(t, got, "vehicle-001").LapDelta; lap != (QValue[int32]{V: -2, Q: QualityFresh}) {
		t.Fatalf("settled lap difference waited for membership hold: %#v", lap)
	}
}
