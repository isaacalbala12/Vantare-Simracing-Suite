package overlayv2

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestRelativeSparsePhysicalArcsThroughReducerAndDerive(t *testing.T) {
	for _, tc := range []struct {
		name                                 string
		player, rival, playerTime, rivalTime float64
		side                                 string
		gap                                  float64
	}{
		{"behind", 1000, 900, 50, 45, RelativeSideBehind, -5},
		{"ahead", 1000, 1100, 50, 55, RelativeSideAhead, 5},
		{"ahead wrap", 1900, 100, 95, 5, RelativeSideAhead, 10},
		{"behind wrap", 100, 1900, 5, 95, RelativeSideBehind, -10},
	} {
		t.Run(tc.name, func(t *testing.T) {
			batch := builderBatch(2, 1)
			batch.State.TrackLength = builderPresent(standings.LapDistance(2000))
			for i, distance := range []float64{tc.player, tc.rival} {
				batch.State.Vehicles[i].LapDistance = builderPresent(standings.LapDistance(distance))
			}
			batch.State.Vehicles[0].LapProgressTime = builderPresent(standings.LapProgressTime(tc.playerTime))
			batch.State.Vehicles[1].LapProgressTime = builderPresent(standings.LapProgressTime(tc.rivalTime))
			batch.State.Vehicles[0].EstimatedLapTime = builderPresent(standings.LapTime(100))
			observed, err := core.NewReducer().Apply(batch)
			if err != nil {
				t.Fatal(err)
			}
			snapshot, err := derive.NewPipeline(derive.Config{}).Apply(context.Background(), observed)
			if err != nil {
				t.Fatal(err)
			}
			final, ok := snapshot.Value()
			if !ok {
				t.Fatal("missing final")
			}
			rows := BuildRelative(final)
			if len(rows) != 2 {
				t.Fatalf("rows=%+v", rows)
			}
			for _, row := range rows {
				if row.Side != RelativeSidePlayer && (row.Side != tc.side || row.GapSeconds.Q != QualityFresh || row.GapSeconds.V != tc.gap) {
					t.Fatalf("rival=%+v want %s %v", row, tc.side, tc.gap)
				}
			}
		})
	}
}

func TestRelativeSameClassSelectsBeforeTruncation(t *testing.T) {
	final, ok := builderFinalState(t, 104).Value()
	if !ok {
		t.Fatal("missing final")
	}
	rows := BuildRelativeSameClass(final)
	if len(rows) != 17 {
		t.Fatalf("same class rows=%d want17", len(rows))
	}
	for i, row := range rows {
		if row.ClassID != "hypercar" {
			t.Fatalf("row=%+v", row)
		}
		if i < 8 && row.VehicleID != string(final.Observed.Vehicles[(i+1)*3].Identity.Vehicle) {
			t.Fatalf("ahead%d=%s", i, row.VehicleID)
		}
	}
}

func TestRelativeNoInventedArcWithoutValidLength(t *testing.T) {
	final, ok := builderFinalState(t, 44).Value()
	if !ok {
		t.Fatal("missing final")
	}
	for _, quality := range []schema.Freshness{schema.FreshnessMissing, schema.FreshnessInvalid} {
		final.Observed.TrackLength = schema.MissingField[standings.LapDistance]()
		if quality == schema.FreshnessInvalid {
			final.Observed.TrackLength = builderField(t, standings.LapDistance(2000), quality)
		}
		rows := BuildRelative(final)
		if len(rows) != 1 || rows[0].Side != RelativeSidePlayer {
			t.Fatalf("quality%v rows=%+v", quality, rows)
		}
	}
}

func TestRelativeCanonicalNumberBestLapAndCadence(t *testing.T) {
	final, ok := builderFinalState(t, 44).Value()
	if !ok {
		t.Fatal("missing final")
	}
	before := hashRelativeMark(final)
	final.Observed.Vehicles[1].CarNumber = builderPresent(standings.CarNumber("007"))
	final.Observed.Vehicles[1].BestLapTime = builderField(t, standings.LapTime(119.9999), schema.FreshnessStale)
	rows := BuildRelative(final)
	if rows[0].CarNumber != "007" || rows[0].BestLapSeconds.Q != QualityStale || rows[0].BestLapSeconds.V != 119.9999 {
		t.Fatalf("row=%+v", rows[0])
	}
	if hashRelativeMark(final) == before {
		t.Fatal("number/bestlap did not invalidate relative")
	}
	before = hashRelativeMark(final)
	final.Observed.Vehicles[9].BestLapTime = builderPresent(standings.LapTime(91))
	if hashRelativeMark(final) == before {
		t.Fatal("class-only neighbour did not invalidate relative")
	}
}

func TestRelativeSmallGridDoesNotRedistributeTrafficToEmptySide(t *testing.T) {
	final, ok := builderFinalState(t, 7).Value()
	if !ok {
		t.Fatal("missing final")
	}
	final.Observed.TrackLength = builderPresent(standings.LapDistance(5000))
	final.Observed.Vehicles[0].LapDistance = builderPresent(standings.LapDistance(1000))
	for i := 1; i < 7; i++ {
		final.Observed.Vehicles[i].LapDistance = builderPresent(standings.LapDistance(1000 + i*50))
	}
	rows := BuildRelative(final)
	if len(rows) != 7 || rows[6].Side != RelativeSidePlayer {
		t.Fatalf("six ahead+player=%+v", rows)
	}
	for i, row := range rows[:6] {
		if row.Side != RelativeSideAhead || row.VehicleID != string(final.Observed.Vehicles[i+1].Identity.Vehicle) {
			t.Fatalf("near-first %d=%+v", i, row)
		}
	}
}

func TestRelativeClassCaseAndUnknownAreExplicit(t *testing.T) {
	final, ok := builderFinalState(t, 44).Value()
	if !ok {
		t.Fatal("missing final")
	}
	final.Observed.Vehicles[3].VehicleClass = builderPresent(standings.VehicleClass(" HYPERCAR "))
	rows := BuildRelativeSameClass(final)
	if rows[0].VehicleID != "vehicle-003" {
		t.Fatalf("case-normalized class missing:%+v", rows)
	}
	final.Observed.Vehicles[0].VehicleClass = schema.MissingField[standings.VehicleClass]()
	rows = BuildRelativeSameClass(final)
	if len(rows) != 1 || rows[0].Side != RelativeSidePlayer {
		t.Fatalf("unknown class fabricated neighbours:%+v", rows)
	}
}
