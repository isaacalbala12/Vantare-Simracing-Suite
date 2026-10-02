package overlayv2

import (
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestStandingsClassReferenceTimingLineAndLapping(t *testing.T) {
	for _, test := range []struct {
		name                        string
		leaderLaps, rowLaps         int32
		leaderDistance, rowDistance float64
		wantLaps                    int32
		wantSeconds                 bool
	}{
		{"same lap", 10, 10, 800, 700, 0, true},
		{"timing line crossing", 10, 9, 10, 990, 0, true},
		{"full lap", 10, 9, 800, 700, 1, false},
		{"unlapping", 10, 9, 700, 800, 0, true},
		{"exact boundary", 10, 9, 800, 800, 1, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			final, _ := builderFinalState(t, 3).Value()
			final.Observed.TrackLength = builderPresent(standings.LapDistance(1000))
			leader, row := &final.Observed.Vehicles[1], &final.Observed.Vehicles[2]
			leader.VehicleClass = builderPresent(standings.VehicleClass("GT3"))
			row.VehicleClass = builderPresent(standings.VehicleClass("gt3"))
			leader.CompletedLaps = builderPresent(standings.CompletedLaps(test.leaderLaps))
			row.CompletedLaps = builderPresent(standings.CompletedLaps(test.rowLaps))
			leader.LapDistance = builderPresent(standings.LapDistance(test.leaderDistance))
			row.LapDistance = builderPresent(standings.LapDistance(test.rowDistance))
			leader.TimeBehindLeader = builderPresent(standings.TimeGap(80))
			row.TimeBehindLeader = builderPresent(standings.TimeGap(84))
			leader.LapsBehindLeader = builderPresent(standings.LapGap(0))
			row.LapsBehindLeader = builderPresent(standings.LapGap(0))
			rows := BuildStandings(final)
			got := rows[2]
			if got.ClassGapReferencePosition != rows[1].Position || got.ClassGapLaps != test.wantLaps || effectiveStandingQuality(got.Quality.ClassGapLaps, got.Quality.Q) != QualityFresh {
				t.Fatalf("bad class lap/reference: %+v", got)
			}
			if test.wantSeconds && (effectiveStandingQuality(got.Quality.ClassGap, got.Quality.Q) != QualityFresh || got.ClassGap != 4) {
				t.Fatalf("want 4 seconds, got %+v", got.ClassGap)
			}
			if !test.wantSeconds && effectiveStandingQuality(got.Quality.ClassGap, got.Quality.Q) != QualityMissing {
				t.Fatalf("lapped time is not comparable: %+v", got.ClassGap)
			}
			row.LapsBehindLeader = builderPresent(standings.LapGap(1))
			if got := BuildStandings(final)[2]; effectiveStandingQuality(got.Quality.ClassGap, got.Quality.Q) != QualityMissing {
				t.Fatalf("different native global lap reference must not be subtracted: %+v", got.ClassGap)
			}
			row.LapDistance = schema.MissingField[standings.LapDistance]()
			if got := BuildStandings(final)[2]; effectiveStandingQuality(got.Quality.ClassGapLaps, got.Quality.Q) != QualityMissing {
				t.Fatalf("missing physical progress invented class laps: %+v", got)
			}
		})
	}
}

func TestStandingsScalarQualityAndZeroSurviveSerialization(t *testing.T) {
	final, _ := builderFinalState(t, 4).Value()
	final.Observed.Vehicles[0].Position = schema.MissingField[standings.Position]()
	final.Observed.Vehicles[1].InPit = builderField(t, pit.InPit(true), schema.FreshnessInvalid)
	final.Observed.Vehicles[1].CompletedLaps = builderField(t, standings.CompletedLaps(7), schema.FreshnessStale)
	final.Observed.Vehicles[2].CompletedLaps = builderPresent(standings.CompletedLaps(0))
	final.Observed.Vehicles[2].TimeBehindNext = builderPresent(standings.TimeGap(1.25))
	final.Observed.Vehicles[2].LapsBehindNext = builderPresent(standings.LapGap(0))
	rows := BuildStandings(final)
	if rows[3].Position != 0 {
		t.Fatalf("fabricated position: %+v", rows[3])
	}
	if rows[0].PitState != "" || effectiveStandingQuality(rows[0].Quality.Pit, rows[0].Quality.Q) != QualityInvalid || effectiveStandingQuality(rows[0].Quality.Laps, rows[0].Quality.Q) != QualityStale {
		t.Fatalf("quality lost: %+v", rows[0])
	}
	raw, err := json.Marshal(rows[1])
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err = json.Unmarshal(raw, &wire); err != nil {
		t.Fatal(err)
	}
	if value, exists := wire["laps"]; !exists || value != float64(0) {
		t.Fatalf("fresh zero omitted: %s", raw)
	}
	if rows[1].Interval != 1.25 || effectiveStandingQuality(rows[1].Quality.IntervalLaps, rows[1].Quality.Q) != QualityFresh {
		t.Fatalf("native interval missing: %+v", rows[1])
	}
}

func effectiveStandingQuality(override, base Quality) Quality {
	if override != "" {
		return override
	}
	return base
}

func TestStandingsPopulatedContractBudget(t *testing.T) {
	for _, width := range []int{20, 32} {
		frame := syntheticFullFrame(104)
		withStringWidths(frame, width)
		frame.Delta.History = realisticDeltaHistory()
		if width == 32 {
			frame.Delta.History = adverseDeltaHistory()
		}
		for i := range frame.Standings {
			row := &frame.Standings[i]
			row.Quality = StandingQualityV2{Q: QualityFresh}
			row.ClassGap = float64(i) * 1.234
			row.ClassGapLaps = 0
			row.ClassGapReferencePosition = frame.Standings[0].Position
			row.Interval = 1.234
			row.IntervalLaps = 0
		}
		payload, err := json.Marshal(frame)
		if err != nil {
			t.Fatal(err)
		}
		limit := 64 * 1024
		if width == 32 {
			limit = 72 * 1024
		}
		t.Logf("populated standings, %d-char identities, 104 cars and120delta samples: %d bytes", width, len(payload))
		if len(payload) > limit {
			t.Errorf("populated frame=%d bytes exceeds %d", len(payload), limit)
		}
	}
}

func TestHorizontalCurrentLapUsesPlayerCanonicalNumber(t *testing.T) {
	final, _ := builderFinalState(t, 3).Value()
	final.Observed.Vehicles[0].CompletedLaps = builderPresent(standings.CompletedLaps(7))
	final.Observed.Vehicles[0].LapNumber = builderPresent(session.LapNumber(8))
	got := BuildPlayerInstruments(final, DefaultPreferencesV2())
	if got.LapNumber.Q != QualityFresh || got.LapNumber.V != 8 {
		t.Fatalf("current lap confused with completed laps: %+v", got.LapNumber)
	}
	final.Observed.Vehicles[0].LapNumber = schema.MissingField[session.LapNumber]()
	if got := BuildPlayerInstruments(final, DefaultPreferencesV2()); got.LapNumber.Q != QualityMissing {
		t.Fatalf("missing lap fabricated: %+v", got.LapNumber)
	}
}
