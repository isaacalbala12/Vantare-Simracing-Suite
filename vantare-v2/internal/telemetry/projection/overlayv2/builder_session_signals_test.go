package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

// ISA-1106: the session flag and the sessionInfo temperatures travel the
// canonical path into the shared ViewModel. Absence stays missing (never a
// green default), and each field keeps its own quality.
func TestBuildSessionProjectsTheCanonicalFlag(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.SessionFlag = builderField(t, session.FlagYellow, schema.FreshnessFresh)
	view := BuildSession(final)
	if view.Flag.Q != QualityFresh || view.Flag.V != "yellow" {
		t.Fatalf("flag = %#v, want fresh yellow", view.Flag)
	}
}

func TestBuildSessionNeverDefaultsTheFlagToGreen(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	view := BuildSession(final)
	if view.Flag.Q != QualityMissing || view.Flag.V != "" {
		t.Fatalf("flag must stay missing without positive evidence: %#v", view.Flag)
	}
	final.Observed.SessionFlag = builderField(t, session.FlagYellow, schema.FreshnessStale)
	view = BuildSession(final)
	if view.Flag.Q != QualityStale || view.Flag.V != "yellow" {
		t.Fatalf("stale flag not preserved: %#v", view.Flag)
	}
}

func TestBuildWeatherProjectsCanonicalTemperatures(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.AmbientTemp = builderField(t, weather.Temperature(22.5), schema.FreshnessFresh)
	final.Observed.TrackTemp = builderField(t, weather.Temperature(31.0), schema.FreshnessFresh)
	view := BuildWeather(final)
	if view.AmbientC.Q != QualityFresh || view.AmbientC.V != 22.5 {
		t.Fatalf("ambient = %#v", view.AmbientC)
	}
	if view.TrackC.Q != QualityFresh || view.TrackC.V != 31.0 {
		t.Fatalf("track = %#v", view.TrackC)
	}
	if view.RainPercent.Q != QualityMissing || view.WetnessPct.Q != QualityMissing ||
		view.WindKph.Q != QualityMissing || view.WindDir.Q != QualityMissing ||
		view.PressureHpa.Q != QualityMissing {
		t.Fatalf("rain/wetness/wind/pressure must stay missing: %#v", view)
	}
}

func TestBuildWeatherKeepsTemperatureQualityPerField(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.AmbientTemp = builderField(t, weather.Temperature(22.5), schema.FreshnessStale)
	final.Observed.TrackTemp = schema.MissingField[weather.Temperature]()
	view := BuildWeather(final)
	if view.AmbientC.Q != QualityStale || view.AmbientC.V != 22.5 {
		t.Fatalf("stale ambient not preserved: %#v", view.AmbientC)
	}
	if view.TrackC.Q != QualityMissing {
		t.Fatalf("missing track not preserved: %#v", view.TrackC)
	}
	final.Observed.AmbientTemp = schema.MissingField[weather.Temperature]()
	invalidTrack, _ := schema.NewField(weather.Temperature(0.0), schema.ProvenanceObserved, schema.FreshnessInvalid)
	final.Observed.TrackTemp = invalidTrack
	view = BuildWeather(final)
	if view.TrackC.Q != QualityInvalid {
		t.Fatalf("invalid track not preserved: %#v", view.TrackC)
	}
}
