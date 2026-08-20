package overlayv2

import (
	"encoding/json"
	"fmt"
	"go/parser"
	"go/token"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
)

// TestCachedProjectorMatchesProjectV2ByteForByte is the identity gate: with
// the defaults the regulated path must be indistinguishable on the wire from
// the current one. It is also the tripwire that fires when F8 fills a builder
// in ProjectV2 without teaching DefaultSectionBuilders about it.
func TestCachedProjectorMatchesProjectV2ByteForByte(t *testing.T) {
	t.Parallel()

	for _, count := range []int{1, 20, 44, 104} {
		final := builderFinalState(t, count)
		source := builderSourceContext()
		projector := NewCachedProjector(DefaultSectionCadence())
		for tick := range 5 {
			revision := uint64(tick + 1)
			want, err := ProjectV2(final, source, DefaultPreferencesV2(), revision)
			if err != nil {
				t.Fatalf("ProjectV2(%d): %v", count, err)
			}
			got, err := projector.Project(final, source, DefaultPreferencesV2(), revision, cadenceOrigin.Add(time.Duration(tick)*(time.Second/60)))
			if err != nil {
				t.Fatalf("CachedProjector.Project(%d): %v", count, err)
			}
			wantJSON, err := json.Marshal(want)
			if err != nil {
				t.Fatalf("marshal ProjectV2: %v", err)
			}
			gotJSON, err := json.Marshal(got)
			if err != nil {
				t.Fatalf("marshal CachedProjector: %v", err)
			}
			if string(gotJSON) != string(wantJSON) {
				t.Fatalf("vehicles=%d tick=%d payload differs\n got: %s\nwant: %s", count, tick, gotJSON, wantJSON)
			}
		}
		metrics := projector.Metrics()
		if metrics.FullRebuilds != metrics.Ticks {
			t.Fatalf("defaults skipped work: %d full rebuilds out of %d ticks", metrics.FullRebuilds, metrics.Ticks)
		}
	}
}

func TestCachedProjectorKeepsFullFrameWhenSlowSectionsAreSkipped(t *testing.T) {
	t.Parallel()

	final := builderFinalState(t, 44)
	source := builderSourceContext()
	cadence := SectionCadence{Fast: time.Second / 20, Mid: time.Second / 10, Slow: time.Second / 4, DirtyCeiling: 2 * time.Second}
	projector := NewCachedProjectorWithBuilders(cadence, SectionBuilders{})

	first, err := projector.Project(final, source, DefaultPreferencesV2(), 1, cadenceOrigin)
	if err != nil {
		t.Fatalf("first project: %v", err)
	}
	second, err := projector.Project(final, source, DefaultPreferencesV2(), 2, cadenceOrigin.Add(time.Second/60))
	if err != nil {
		t.Fatalf("second project: %v", err)
	}
	if second.Frame == nil || first.Frame == nil {
		t.Fatalf("regulated frames must never be nil")
	}
	if projector.Metrics().SectionSkips["standings"] != 1 {
		t.Fatalf("standings should have been skipped once: %#v", projector.Metrics().SectionSkips)
	}
	// The frame stays full and the skipped sections reuse the memoized value.
	if second.Frame.Standings == nil || second.Frame.Relative == nil || second.Frame.Delta.Available == nil {
		t.Fatalf("skipped sections must reuse the previous value, not become null: %#v", second.Frame)
	}
	if second.Frame.Session != first.Frame.Session || second.Frame.Fuel != first.Frame.Fuel {
		t.Fatalf("skipped slow sections must keep the previous value")
	}
	// Header metadata is never regulated.
	if second.DeliveryRevision != 2 {
		t.Fatalf("delivery revision must follow the tick, got %d", second.DeliveryRevision)
	}
}

func TestSkippedSectionReusesTheSameSliceBacking(t *testing.T) {
	t.Parallel()

	final := builderFinalState(t, 20)
	source := builderSourceContext()
	standingsBuilds := 0
	projector := NewCachedProjectorWithBuilders(
		SectionCadence{Slow: time.Second, DirtyCeiling: time.Hour},
		SectionBuilders{
			Standings: func(derive.FinalState, PreferencesV2, SourceContextV2) []StandingRowV2 {
				standingsBuilds++
				return []StandingRowV2{{VehicleID: fmt.Sprintf("row-%d", standingsBuilds)}}
			},
		},
	)
	first, err := projector.Project(final, source, DefaultPreferencesV2(), 1, cadenceOrigin)
	if err != nil {
		t.Fatalf("first project: %v", err)
	}
	second, err := projector.Project(final, source, DefaultPreferencesV2(), 2, cadenceOrigin.Add(100*time.Millisecond))
	if err != nil {
		t.Fatalf("second project: %v", err)
	}
	if standingsBuilds != 1 {
		t.Fatalf("standings builder ran %d times, want 1", standingsBuilds)
	}
	if second.Frame.Standings[0].VehicleID != first.Frame.Standings[0].VehicleID {
		t.Fatalf("skipped section changed value: %q vs %q", second.Frame.Standings[0].VehicleID, first.Frame.Standings[0].VehicleID)
	}
}

// TestRegulationHappensBeforeMarshal counts builder invocations per section
// over one simulated second. Counting builds (not marshals) is the
// point: regulating after projecting would save transport only.
func TestRegulationHappensBeforeMarshal(t *testing.T) {
	t.Parallel()

	final := builderFinalState(t, 104)
	source := builderSourceContext()
	counters := map[Section]int{}
	defaults := DefaultSectionBuilders()
	builders := SectionBuilders{
		Player: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) PlayerInstrumentsV2 {
			counters[SectionPlayer]++
			return defaults.Player(final, preferences, source)
		},
		Standings: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) []StandingRowV2 {
			counters[SectionStandings]++
			return defaults.Standings(final, preferences, source)
		},
		Relative: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) []RelativeRowV2 {
			counters[SectionRelative]++
			return defaults.Relative(final, preferences, source)
		},
		Session: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) SessionV2 {
			counters[SectionSession]++
			return defaults.Session(final, preferences, source)
		},
	}
	cadence := SectionCadence{Fast: time.Second / 20, Mid: time.Second / 10, Slow: time.Second / 4, DirtyCeiling: time.Second / 4}
	projector := NewCachedProjectorWithBuilders(cadence, builders)

	// 100 Hz keeps the simulated second an exact multiple of every interval, so
	// the expected counts are aliasing-free.
	marshals := 0
	for tick := range 100 {
		update, err := projector.Project(final, source, DefaultPreferencesV2(), uint64(tick+1), cadenceOrigin.Add(time.Duration(tick)*10*time.Millisecond))
		if err != nil {
			t.Fatalf("tick %d: %v", tick, err)
		}
		if _, err := json.Marshal(update); err != nil {
			t.Fatalf("marshal tick %d: %v", tick, err)
		}
		marshals++
	}
	if marshals != 100 {
		t.Fatalf("every tick still publishes a full frame, got %d marshals", marshals)
	}
	// One simulated second at 100 Hz: 20 Hz fast, 10 Hz mid, 4 Hz slow.
	want := map[Section]int{SectionPlayer: 20, SectionRelative: 10, SectionStandings: 4, SectionSession: 4}
	for section, expected := range want {
		if counters[section] != expected {
			t.Fatalf("%s built %d times in one second, want %d", section, counters[section], expected)
		}
	}
	if counters[SectionPlayer] >= marshals {
		t.Fatalf("regulation must cut builder work below the marshal count: %d builds vs %d marshals", counters[SectionPlayer], marshals)
	}
}

func TestDirtySlowSectionPublishesBeforeTheCeiling(t *testing.T) {
	t.Parallel()

	source := builderSourceContext()
	quiet := builderFinalState(t, 20)
	changed := builderFinalState(t, 21)
	builds := 0
	projector := NewCachedProjectorWithBuilders(
		SectionCadence{Slow: 100 * time.Millisecond, DirtyCeiling: 5 * time.Second},
		SectionBuilders{
			Standings: func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) []StandingRowV2 {
				builds++
				return DefaultSectionBuilders().Standings(final, preferences, source)
			},
		},
	)
	if _, err := projector.Project(quiet, source, DefaultPreferencesV2(), 1, cadenceOrigin); err != nil {
		t.Fatalf("first project: %v", err)
	}
	if _, err := projector.Project(quiet, source, DefaultPreferencesV2(), 2, cadenceOrigin.Add(200*time.Millisecond)); err != nil {
		t.Fatalf("quiet project: %v", err)
	}
	if builds != 1 {
		t.Fatalf("a clean standings section rebuilt %d times before the ceiling", builds)
	}
	if _, err := projector.Project(changed, source, DefaultPreferencesV2(), 3, cadenceOrigin.Add(400*time.Millisecond)); err != nil {
		t.Fatalf("dirty project: %v", err)
	}
	if builds != 2 {
		t.Fatalf("a material change must publish before the ceiling, builds=%d", builds)
	}
}

// TestCadenceDoesNotDelayFacts is a non-regression guard over the F7 port:
// the cadence code must have no way to observe or hold back Engineer facts.
func TestCadenceDoesNotDelayFacts(t *testing.T) {
	t.Parallel()

	fileSet := token.NewFileSet()
	parsed, err := parser.ParseFile(fileSet, "cadence.go", nil, parser.ImportsOnly)
	if err != nil {
		t.Fatalf("parse cadence.go: %v", err)
	}
	for _, current := range parsed.Imports {
		path := strings.Trim(current.Path.Value, `"`)
		if strings.Contains(path, "engineer") || strings.Contains(path, "fact") ||
			strings.Contains(path, "telemetrytransport") || strings.Contains(path, "messagepolicy") {
			t.Fatalf("cadence.go imports %q: facts must never cross the scheduler", path)
		}
	}
	// The regulated projector only ever returns an Overlay v2 update: it has no
	// fact channel, no queue and no timer that could hold one back.
	projector := NewCachedProjector(SectionCadence{Fast: time.Hour, Mid: time.Hour, Slow: time.Hour, DirtyCeiling: time.Hour})
	final := builderFinalState(t, 20)
	for tick := range 10 {
		update, err := projector.Project(final, builderSourceContext(), DefaultPreferencesV2(), uint64(tick+1), cadenceOrigin.Add(time.Duration(tick)*time.Second))
		if err != nil {
			t.Fatalf("tick %d: %v", tick, err)
		}
		if update.Frame == nil || update.DeliveryRevision != uint64(tick+1) {
			t.Fatalf("even fully throttled, every tick publishes a full frame with its own revision: %#v", update)
		}
	}
}
