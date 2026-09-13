package overlayv2

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

// B4: temperature value and quality changes must invalidate SectionWeather
// like every other projected signal, so the regulated scheduler rebuilds the
// section within the existing policy instead of waiting for the ceiling.
func TestWeatherDirtySignalMarksSectionWeather(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		mutate func(state *derive.FinalState)
		dirty  bool
	}{
		{name: "identical frame", mutate: func(*derive.FinalState) {}},
		{
			name: "ambient value changes",
			mutate: func(state *derive.FinalState) {
				state.Observed.AmbientTemp = builderField(t, weather.Temperature(23.5), schema.FreshnessFresh)
			},
			dirty: true,
		},
		{
			name: "track value changes",
			mutate: func(state *derive.FinalState) {
				state.Observed.TrackTemp = builderField(t, weather.Temperature(33.0), schema.FreshnessFresh)
			},
			dirty: true,
		},
		{
			name: "ambient quality degrades",
			mutate: func(state *derive.FinalState) {
				state.Observed.AmbientTemp = builderField(t, weather.Temperature(22.5), schema.FreshnessStale)
			},
			dirty: true,
		},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			before := dirtyFinalState(3)
			before.Observed.AmbientTemp = builderField(t, weather.Temperature(22.5), schema.FreshnessFresh)
			before.Observed.TrackTemp = builderField(t, weather.Temperature(31.0), schema.FreshnessFresh)
			after := cloneFinalState(before)
			test.mutate(&after)
			diff := dirtyDiff(before, after)
			if test.dirty && !diff.Has(SectionWeather) {
				t.Fatalf("weather change did not mark SectionWeather dirty: %v", diff)
			}
			if !test.dirty && diff.Has(SectionWeather) {
				t.Fatalf("unrelated stasis marked SectionWeather dirty: %v", diff)
			}
		})
	}
}

func TestWeatherReachesFrameBeforeCeilingUnderRegulatedCadence(t *testing.T) {
	t.Parallel()

	cadence := SectionCadence{
		Fast: 10 * time.Millisecond, Mid: 10 * time.Millisecond,
		Slow: 250 * time.Millisecond, DirtyCeiling: time.Second,
	}
	regulated := NewCachedProjector(cadence)
	baseSnapshot := builderFinalState(t, 1)
	baseHeader := baseSnapshot.Header()
	baseFinal, ok := baseSnapshot.Value()
	if !ok {
		t.Fatal("missing final state")
	}
	source := builderSourceContext()
	preferences := DefaultPreferencesV2()
	origin := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)

	project := func(sequence uint64, now time.Time, ambient weather.Temperature) WeatherV2 {
		t.Helper()
		current := cloneFinalState(baseFinal)
		current.Observed.AmbientTemp = builderField(t, ambient, schema.FreshnessFresh)
		current.Observed.TrackTemp = builderField(t, weather.Temperature(31.0), schema.FreshnessFresh)
		header := baseHeader
		header.Cursor.Sequence = schema.Sequence(sequence)
		snapshot, err := envelope.NewSnapshot(header, current, func(value derive.FinalState) derive.FinalState {
			return cloneFinalState(value)
		})
		if err != nil {
			t.Fatalf("sequence %d snapshot: %v", sequence, err)
		}
		update, err := regulated.Project(snapshot, source, preferences, sequence, now)
		if err != nil {
			t.Fatalf("sequence %d project: %v", sequence, err)
		}
		return update.Frame.Weather
	}

	first := project(1, origin, weather.Temperature(22.5))
	if first.AmbientC.V != 22.5 {
		t.Fatalf("first ambient = %#v", first.AmbientC)
	}
	// 300 ms later: the slow tier interval (250 ms) elapsed for the dirty
	// section while the ceiling (1 s) is far away. The fresh temperature
	// must already be on the frame, within the existing policy.
	second := project(2, origin.Add(300*time.Millisecond), weather.Temperature(23.5))
	if second.AmbientC.V != 23.5 || second.AmbientC.Q != QualityFresh {
		t.Fatalf("weather missed its update before the ceiling: %#v", second.AmbientC)
	}
}
