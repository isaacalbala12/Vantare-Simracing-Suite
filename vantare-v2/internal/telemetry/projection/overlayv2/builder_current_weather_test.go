package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

func TestCurrentWeatherUnitsAndQuality(t *testing.T) {
	final := dirtyFinalState(1)
	final.Observed.RainFraction = builderField(t, weather.Fraction(0.25), schema.FreshnessFresh)
	final.Observed.WetnessFraction = builderField(t, weather.Fraction(0), schema.FreshnessFresh)
	view := BuildWeather(final)
	if view.RainPercent.V != 25 || view.WetnessPct.V != 0 || view.WetnessPct.Q != QualityFresh {
		t.Fatalf("units: %#v", view)
	}
	before := cloneFinalState(final)
	final.Observed.RainFraction = builderField(t, weather.Fraction(0.25), schema.FreshnessStale)
	view = BuildWeather(final)
	if view.RainPercent.Q != QualityStale || view.WetnessPct.Q != QualityFresh {
		t.Fatalf("independent quality: %#v", view)
	}
	if !dirtyDiff(before, final).Has(SectionWeather) {
		t.Fatal("rain quality did not dirty weather")
	}
	before = cloneFinalState(final)
	final.Observed.RainFraction = builderField(t, weather.Fraction(0.5), schema.FreshnessFresh)
	if !dirtyDiff(before, final).Has(SectionWeather) {
		t.Fatal("rain did not dirty weather")
	}
	before = cloneFinalState(final)
	final.Observed.WetnessFraction = builderField(t, weather.Fraction(0.1), schema.FreshnessFresh)
	if !dirtyDiff(before, final).Has(SectionWeather) {
		t.Fatal("wetness did not dirty weather")
	}
	if view.WindKph.Q != QualityMissing || view.WindDir.Q != QualityMissing || view.PressureHpa.Q != QualityMissing {
		t.Fatal("invented direction or pressure")
	}
}
