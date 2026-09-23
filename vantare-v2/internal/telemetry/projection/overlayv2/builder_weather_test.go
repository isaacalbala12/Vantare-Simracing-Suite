package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestBuildWeatherIsAlwaysMissingUntilADriverAdmitsIt(t *testing.T) {
	t.Parallel()
	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	weather := BuildWeather(final)
	fields := []Quality{weather.AmbientC.Q, weather.TrackC.Q, weather.RainPercent.Q, weather.WetnessPct.Q, weather.WindKph.Q, weather.WindDir.Q, weather.PressureHpa.Q}
	for _, quality := range fields {
		if quality != QualityMissing {
			t.Fatalf("weather field quality = %q, want missing until a canonical source exists", quality)
		}
	}
}

func TestBuildStandingsKeepsMapCoordinatesWithoutUnusedLapDistance(t *testing.T) {
	t.Parallel()
	final, ok := builderFinalState(t, 2).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	rows := BuildStandings(final)
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}
	for _, row := range rows {
		if row.LapDistance != nil {
			t.Fatalf("unused lap distance emitted: %+v", row.LapDistance)
		}
		if row.GroundPosition.Q != QualityFresh {
			t.Fatalf("row %q groundPosition quality = %q, want fresh", row.VehicleID, row.GroundPosition.Q)
		}
	}
	final.Observed.Vehicles[0].LapDistance = schema.MissingField[standings.LapDistance]()
	rows = BuildStandings(final)
	var target *StandingRowV2
	for index := range rows {
		if rows[index].VehicleID == "vehicle-000" {
			target = &rows[index]
			break
		}
	}
	if target == nil {
		t.Fatal("vehicle-000 not found")
	}
	if target.LapDistance != nil {
		t.Fatalf("missing lapDistance not preserved: %#v", target.LapDistance)
	}
}
