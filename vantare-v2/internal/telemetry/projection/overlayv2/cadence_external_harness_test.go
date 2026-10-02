package overlayv2

import (
	"strconv"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// TestCadenceExternalHarness keeps campaign instrumentation out of production.
// Builder counters observe skipped/rebuilt work, while allocation samples from
// the standalone standings/relative builders provide a comparable proxy for
// their sort/map/copy work on base and candidate.
func TestCadenceExternalHarness(t *testing.T) {
	for _, count := range []int{1, 44, 104} {
		for _, player := range []bool{true, false} {
			for _, dynamic := range []bool{false, true} {
				name := "n" + strconv.Itoa(count)
				if !player {
					name += "_no_player"
				}
				if dynamic {
					name += "_dynamic"
				} else {
					name += "_static"
				}
				t.Run(name, func(t *testing.T) {
					snapshot := builderFinalState(t, count)
					final, ok := snapshot.Value()
					if !ok {
						t.Fatal("missing final state")
					}
					if !player {
						for index := range final.Observed.Vehicles {
							final.Observed.Vehicles[index].Player = builderPresent(false)
						}
					}
					source := builderSourceContext()
					defaults := DefaultSectionBuilders()
					builds := map[Section]int{}
					projector := NewCachedProjectorWithBuilders(
						SectionCadence{Fast: 50 * time.Millisecond, Mid: 100 * time.Millisecond, Slow: 250 * time.Millisecond, DirtyCeiling: time.Second},
						SectionBuilders{
							Relative: func(value derive.FinalState, preferences PreferencesV2, source SourceContextV2) []RelativeRowV2 {
								builds[SectionRelative]++
								return defaults.Relative(value, preferences, source)
							},
							Standings: func(value derive.FinalState, preferences PreferencesV2, source SourceContextV2) []StandingRowV2 {
								builds[SectionStandings]++
								return defaults.Standings(value, preferences, source)
							},
						},
					)
					started := time.Now()
					for tick := 0; tick < 4; tick++ {
						if dynamic && tick == 3 && len(final.Observed.Vehicles) > 0 {
							final.Observed.Vehicles[len(final.Observed.Vehicles)-1].CarNumber = builderPresent(standings.CarNumber("007"))
						}
						header := snapshot.Header()
						header.Cursor.Sequence = schema.Sequence(tick + 1)
						input, err := envelope.NewSnapshot(header, final, cloneFinalState)
						if err != nil {
							t.Fatal(err)
						}
						when := [...]time.Duration{0, 10 * time.Millisecond, 20 * time.Millisecond, 300 * time.Millisecond}
						if _, err := projector.Project(input, source, DefaultPreferencesV2(), uint64(tick+1), cadenceOrigin.Add(when[tick])); err != nil {
							t.Fatal(err)
						}
					}
					standingAllocs := testing.AllocsPerRun(3, func() { _ = BuildStandings(final) })
					relativeAllocs := testing.AllocsPerRun(3, func() { _ = BuildRelative(final) })
					metrics := projector.Metrics()
					t.Logf("vehicles=%d player=%t dynamic=%t elapsed=%s standingsAllocs=%.0f relativeAllocs=%.0f builds=%v skips=%v", count, player, dynamic, time.Since(started), standingAllocs, relativeAllocs, builds, metrics.DirtySkips)
					if metrics.Ticks != 4 || builds[SectionStandings] == 0 || builds[SectionRelative] == 0 {
						t.Fatalf("harness did not observe builders: ticks=%d builds=%v", metrics.Ticks, builds)
					}
					if dynamic && builds[SectionStandings] < 2 {
						t.Fatalf("dynamic harness did not observe a rebuild: builds=%v", builds)
					}
				})
			}
		}
	}
}
