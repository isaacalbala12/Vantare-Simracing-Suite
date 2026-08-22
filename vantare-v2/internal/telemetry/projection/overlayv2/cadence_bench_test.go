package overlayv2

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
)

// benchmarkTickRate is the acquisition rate the runtime publishes at today.
const benchmarkTickRate = 60

// BenchmarkOverlayV2ByCadence measures the full 104-car frame under a flat
// cadence (the defaults, no regulation) and under a regulated one. Each
// iteration is one 60 Hz tick that is projected and marshalled, so the
// reported rates are per simulated second.
func BenchmarkOverlayV2ByCadence(b *testing.B) {
	final := builderFinalState(b, 104)
	source := builderSourceContext()

	cases := []struct {
		name    string
		cadence SectionCadence
	}{
		{"plana", SectionCadence{}},
		{"regulada_20hz_4hz", DefaultSectionCadence()},
	}
	for _, current := range cases {
		b.Run(current.name, func(b *testing.B) {
			builds := 0
			defaults := DefaultSectionBuilders()
			counted := SectionBuilders{
				Player: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) PlayerInstrumentsV2 {
					builds++
					return defaults.Player(final, preferences, source)
				},
				Delta: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) DeltaViewV2 {
					builds++
					return defaults.Delta(final, preferences, source)
				},
				Relative: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) []RelativeRowV2 {
					builds++
					return defaults.Relative(final, preferences, source)
				},
				Spotter: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) SpotterViewV2 {
					builds++
					return defaults.Spotter(final, preferences, source)
				},
				Session: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) SessionV2 {
					builds++
					return defaults.Session(final, preferences, source)
				},
				Standings: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) []StandingRowV2 {
					builds++
					return defaults.Standings(final, preferences, source)
				},
				Fuel: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) FuelViewV2 {
					builds++
					return defaults.Fuel(final, preferences, source)
				},
				Capabilities: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) CapabilitiesV2 {
					builds++
					return defaults.Capabilities(final, preferences, source)
				},
			}
			projector := NewCachedProjectorWithBuilders(current.cadence, counted)
			origin := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
			bytes := 0
			marshals := 0

			b.ReportAllocs()
			b.ResetTimer()
			for tick := 0; tick < b.N; tick++ {
				now := origin.Add(time.Duration(tick) * time.Second / benchmarkTickRate)
				update, err := projector.Project(final, source, DefaultPreferencesV2(), uint64(tick+1), now)
				if err != nil {
					b.Fatalf("tick %d: %v", tick, err)
				}
				encoded, err := json.Marshal(update)
				if err != nil {
					b.Fatalf("marshal tick %d: %v", tick, err)
				}
				bytes += len(encoded)
				marshals++
			}
			b.StopTimer()

			seconds := float64(b.N) / benchmarkTickRate
			if seconds > 0 {
				b.ReportMetric(float64(builds)/seconds, "builds/s")
				b.ReportMetric(float64(marshals)/seconds, "marshals/s")
				b.ReportMetric(float64(bytes)/seconds, "B/s")
			}
		})
	}
}
