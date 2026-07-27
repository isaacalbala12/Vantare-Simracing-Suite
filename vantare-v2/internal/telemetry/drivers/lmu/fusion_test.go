package lmu

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/catalog"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestAuthorityMatrixV2ReferencesCanonicalCatalogExactlyOnce(t *testing.T) {
	want := []catalog.SignalID{
		catalog.SignalSessionSourceTime, catalog.SignalSessionTrackName, catalog.SignalSessionType,
		catalog.SignalSessionVehicleCount, catalog.SignalVehiclePlayerPresent, catalog.SignalVehicleName,
		catalog.SignalSessionLapNumber, catalog.SignalVehicleGear, catalog.SignalVehicleEngineRPM,
		catalog.SignalVehicleSpeedMPS, catalog.SignalControlsThrottle, catalog.SignalControlsBrake,
		catalog.SignalControlsClutch, catalog.SignalStandingsPosition, catalog.SignalStandingsCompletedLaps,
		catalog.SignalPitStopCount,
		catalog.SignalPitInPit,
	}
	first, second := AuthorityMatrix(), AuthorityMatrix()
	if MatrixVersion != 2 || len(first) != len(want) || !reflect.DeepEqual(first, second) {
		t.Fatalf("version=%d matrix=%#v", MatrixVersion, first)
	}
	seen := make(map[catalog.SignalID]bool, len(first))
	for index, rule := range first {
		if rule.Signal != want[index] || rule.PreferredTTL <= 0 || seen[rule.Signal] {
			t.Fatalf("rule %d = %#v seen=%v", index, rule, seen[rule.Signal])
		}
		seen[rule.Signal] = true
		if definition, ok := catalog.ByID(rule.Signal); !ok || definition.ID != rule.Signal {
			t.Fatalf("rule %d references non-canonical signal %d", index, rule.Signal)
		}
		if index < 5 {
			if rule.Preferred != SourceSharedMemory || rule.Alternative != SourceREST || !rule.Equivalent || rule.AlternativeTTL <= 0 {
				t.Fatalf("overlap rule %d = %#v", index, rule)
			}
		} else if rule.Alternative != SourceUnknown || rule.Equivalent {
			t.Fatalf("unique-source rule %d = %#v", index, rule)
		}
	}
	first[0].Preferred = SourceREST
	if AuthorityMatrix()[0].Preferred != SourceSharedMemory {
		t.Fatal("matrix leaked mutable storage")
	}
}

func TestFusionPublishesInPitOnlyFromSharedMemoryWithExplicitFalsePresence(t *testing.T) {
	shared := Observation{Source: SourceSharedMemory, InPit: fieldWithFreshness(pit.InPit(false), schema.FreshnessFresh)}
	rest := restObservation(time.Unix(0, 0), time.Second, "track")
	got := (&Fusion{}).Merge(time.Unix(0, 0), time.Second, shared, rest)
	value, present := got.InPit.Value()
	if !present || bool(value) || got.InPit.Freshness() != schema.FreshnessFresh {
		t.Fatalf("in_pit = (%v,%v,%v)", value, present, got.InPit.Freshness())
	}
	decision := got.Decisions[len(got.Decisions)-1]
	if decision.Signal != catalog.SignalPitInPit || decision.Source != SourceSharedMemory || decision.Fallback {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestFusionPreferredFallbackPartialRecoveryAndZero(t *testing.T) {
	wall := time.Unix(100, 0).UTC()
	shm := sharedObservation(wall, "SHM")
	rest := restObservation(wall, 0, "REST")
	var fusion Fusion
	batch := fusion.Merge(wall, 0, rest, shm)
	assertFieldValue(t, batch.TrackName, "SHM")
	assertFieldValue(t, batch.SourceTime, time.Duration(0))
	assertFieldValue(t, batch.VehicleCount, schema.Count(0))
	assertFieldValue(t, batch.PlayerPresent, false)
	assertFieldValue(t, batch.CompletedLaps, standings.CompletedLaps(0))
	if batch.Source != SourceCanonical || len(batch.Decisions) != len(AuthorityMatrix()) || batch.REST != (RESTObservation{}) {
		t.Fatalf("canonical metadata = %#v", batch)
	}

	batch = fusion.Merge(wall.Add(-time.Hour), defaultFreshnessLimit+time.Nanosecond)
	assertFieldValue(t, batch.TrackName, "REST")
	if decisionFor(t, batch, catalog.SignalSessionTrackName).Source != SourceREST {
		t.Fatalf("track decision = %#v", decisionFor(t, batch, catalog.SignalSessionTrackName))
	}

	partial := restObservation(wall.Add(10*time.Hour), defaultFreshnessLimit+time.Second, "")
	partial.REST.TrackName = timedMissingAt[string](wall, monotonicStamp{elapsed: defaultFreshnessLimit + time.Second, set: true})
	batch = fusion.Merge(wall.Add(10*time.Hour), defaultFreshnessLimit+time.Second, partial)
	if batch.TrackName.Freshness() != schema.FreshnessStale {
		t.Fatalf("track freshness = %v", batch.TrackName.Freshness())
	}

	recovered := sharedObservation(wall.Add(-24*time.Hour), "RECOVERED")
	batch = fusion.Merge(wall.Add(-24*time.Hour), 2*defaultFreshnessLimit, recovered)
	assertFieldValue(t, batch.TrackName, "RECOVERED")
	if decisionFor(t, batch, catalog.SignalSessionTrackName).Fallback {
		t.Fatal("later-arriving preferred source did not recover")
	}
}

func TestFusionUsesMonotonicAgeAndArrivalOrderNotWallClock(t *testing.T) {
	wall := time.Unix(500, 0).UTC()
	var fusion Fusion
	first := sharedObservation(wall, "first")
	batch := fusion.Merge(wall, 0, first)
	assertFieldValue(t, batch.TrackName, "first")

	batch = fusion.Merge(wall.Add(-48*time.Hour), defaultFreshnessLimit)
	if batch.TrackName.Freshness() != schema.FreshnessFresh {
		t.Fatalf("wall rollback changed freshness: %v", batch.TrackName.Freshness())
	}
	batch = fusion.Merge(wall.Add(48*time.Hour), defaultFreshnessLimit+time.Nanosecond)
	if batch.TrackName.Freshness() != schema.FreshnessStale {
		t.Fatalf("monotonic TTL did not expire: %v", batch.TrackName.Freshness())
	}

	laterArrival := sharedObservation(wall.Add(-365*24*time.Hour), "later")
	batch = fusion.Merge(wall.Add(365*24*time.Hour), defaultFreshnessLimit+time.Second, laterArrival)
	assertFieldValue(t, batch.TrackName, "later")
	if batch.TrackName.Freshness() != schema.FreshnessFresh {
		t.Fatalf("later arrival was not fresh: %v", batch.TrackName.Freshness())
	}
}

func TestConflictDiagnosticsCoverFreshAndStaleValues(t *testing.T) {
	qualities := []schema.Freshness{schema.FreshnessFresh, schema.FreshnessStale}
	for _, preferredQuality := range qualities {
		for _, alternativeQuality := range qualities {
			name := freshnessName(preferredQuality) + "_vs_" + freshnessName(alternativeQuality)
			t.Run(name, func(t *testing.T) {
				wall := time.Unix(600, 0)
				shm := Observation{Source: SourceSharedMemory, TrackName: fieldWithFreshness("SHM", preferredQuality)}
				rest := Observation{Source: SourceREST, REST: RESTObservation{
					TrackName: TimedField[string]{Field: fieldWithFreshness("REST", alternativeQuality), updatedMono: monotonicStamp{elapsed: 0, set: true}},
				}}
				var fusion Fusion
				batch := fusion.Merge(wall, 0, shm, rest)
				if len(batch.Conflicts) != 1 || batch.Conflicts[0].Signal != catalog.SignalSessionTrackName {
					t.Fatalf("conflicts = %#v", batch.Conflicts)
				}
				wantSource := SourceSharedMemory
				if preferredQuality == schema.FreshnessStale && alternativeQuality == schema.FreshnessFresh {
					wantSource = SourceREST
				}
				if got := decisionFor(t, batch, catalog.SignalSessionTrackName).Source; got != wantSource {
					t.Fatalf("selected source=%v want=%v", got, wantSource)
				}
			})
		}
	}
}

func TestConflictDiagnosticsClampAtFive(t *testing.T) {
	result := Observation{}
	for index := 0; index < maxConflictDiagnostics+3; index++ {
		appendConflict(&result, ConflictDiagnostic{Signal: catalog.SignalID(index + 1), Preferred: SourceSharedMemory, Alternative: SourceREST})
	}
	if len(result.Conflicts) != maxConflictDiagnostics {
		t.Fatalf("conflicts=%d want=%d", len(result.Conflicts), maxConflictDiagnostics)
	}
}

func TestOverlapNormalizationsAreEquivalent(t *testing.T) {
	t.Run("source time bounded conversion", func(t *testing.T) {
		for _, seconds := range []float64{0, 42.125, float64(int64(^uint64(0)>>1) / int64(time.Second))} {
			restValue, valid := durationFromSeconds(seconds)
			shmField := validateDuration(seconds)
			shmValue, present := shmField.Value()
			if !valid || !present || shmField.Freshness() != schema.FreshnessFresh || shmValue != restValue {
				t.Fatalf("seconds=%v SHM=(%v,%v,%v) REST=(%v,%v)", seconds, shmValue, present, shmField.Freshness(), restValue, valid)
			}
		}
		for _, seconds := range []float64{-1, 1e300} {
			_, restValid := durationFromSeconds(seconds)
			if restValid || validateDuration(seconds).Freshness() != schema.FreshnessInvalid {
				t.Fatalf("invalid seconds %v diverged", seconds)
			}
		}
	})
	t.Run("track name", func(t *testing.T) {
		for _, raw := range []string{"", "   ", " Circuit ", "\tTrack\n"} {
			restRaw := raw
			shmField := observed(normalizeTrackName(raw))
			restFields, err := validateSessionFields(
				restSessionInfo{TrackName: &restRaw, CurrentEventTime: 0},
				time.Time{},
				monotonicStamp{elapsed: 0, set: true},
			)
			if err != nil {
				t.Fatal(err)
			}
			shmValue, shmPresent := shmField.Value()
			restValue, restPresent := restFields.trackName.Field.Value()
			want := strings.TrimSpace(raw)
			if !shmPresent || !restPresent || shmValue != want || restValue != want {
				t.Fatalf("raw=%q SHM=(%q,%v) REST=(%q,%v) want=%q", raw, shmValue, shmPresent, restValue, restPresent, want)
			}
		}
		missing, err := validateSessionFields(restSessionInfo{CurrentEventTime: 0}, time.Time{}, monotonicStamp{elapsed: 0, set: true})
		if err != nil || missing.trackName.Field.Freshness() != schema.FreshnessMissing {
			t.Fatalf("omitted REST track name = %#v error=%v, want missing", missing.trackName, err)
		}
	})
	t.Run("session type", func(t *testing.T) {
		for _, pair := range []struct {
			shm  int32
			rest string
		}{
			{1, "PRACTICE1"}, {3, "QUALIFY"}, {4, "RACE1"}, {5, "RACE2"},
		} {
			shmValue, _ := validateSessionType(pair.shm).Value()
			restValue, _ := parseRESTSessionType(pair.rest).Value()
			if shmValue != restValue {
				t.Fatalf("SHM %d=%v REST %q=%v", pair.shm, shmValue, pair.rest, restValue)
			}
		}
	})
	t.Run("vehicle count", func(t *testing.T) {
		for _, count := range []int32{0, 1, maxVehicles} {
			shmValue, _ := validateCount(count, 0, maxVehicles).Value()
			restValue, _ := timedValidated[schema.Count](count, 0, maxVehicles, time.Time{}).Field.Value()
			if shmValue != restValue {
				t.Fatalf("count %d: SHM=%v REST=%v", count, shmValue, restValue)
			}
		}
	})
	t.Run("player present", func(t *testing.T) {
		for _, present := range []bool{false, true} {
			cache := restCache{}
			rows := []restStanding{}
			if present {
				rows = []restStanding{{Player: true, Position: 1}}
			}
			updateStandingsFields(&cache, rows, time.Time{}, monotonicStamp{elapsed: 0, set: true})
			restValue, _ := cache.playerPresent.Field.Value()
			shmValue, _ := observed(present).Value()
			if shmValue != restValue {
				t.Fatalf("present=%v SHM=%v REST=%v", present, shmValue, restValue)
			}
		}
	})
}

func FuzzFusionNeverPanics(f *testing.F) {
	f.Add(int64(0), int64(0), true)
	f.Fuzz(func(t *testing.T, elapsedNanos, value int64, present bool) {
		field := schema.MissingField[time.Duration]()
		if present {
			field = observed(time.Duration(value))
		}
		var fusion Fusion
		_ = fusion.Merge(time.Unix(1000, 0), time.Duration(elapsedNanos), Observation{Source: SourceSharedMemory, SourceTime: field})
	})
}

func BenchmarkFusion(b *testing.B) {
	input := sharedObservation(time.Unix(100, 0), "track")
	var fusion Fusion
	b.ReportAllocs()
	for b.Loop() {
		_ = fusion.Merge(time.Unix(100, 0), 0, input)
	}
}

func sharedObservation(wall time.Time, track string) Observation {
	return Observation{
		Source: SourceSharedMemory, ReceivedUTC: wall, Compatibility: CompatibilityKnown,
		SourceTime: observed(time.Duration(0)), TrackName: observed(track), SessionType: observed(session.TypeRace),
		VehicleCount: observed(schema.Count(0)), PlayerPresent: observed(false), LapNumber: observed(session.LapNumber(0)),
	}
}

func restObservation(wall time.Time, elapsed time.Duration, track string) Observation {
	stamp := monotonicStamp{elapsed: elapsed, set: true}
	return Observation{Source: SourceREST, ReceivedUTC: wall, REST: RESTObservation{
		TrackName: timedObservedAt(track, wall, stamp), SourceTime: timedObservedAt(time.Second, wall, stamp),
		SessionType: timedObservedAt(session.TypePractice, wall, stamp), VehicleCount: timedObservedAt(schema.Count(20), wall, stamp),
		PlayerPresent: timedObservedAt(true, wall, stamp), PlayerPosition: timedObservedAt(standings.Position(1), wall, stamp),
		CompletedLaps: timedObservedAt(standings.CompletedLaps(0), wall, stamp), PitStopCount: timedObservedAt(pit.StopCount(0), wall, stamp),
	}}
}

func fieldWithFreshness[T comparable](value T, freshness schema.Freshness) schema.Field[T] {
	field, _ := schema.NewField(value, schema.ProvenanceObserved, freshness)
	return field
}

func freshnessName(value schema.Freshness) string {
	if value == schema.FreshnessFresh {
		return "fresh"
	}
	return "stale"
}

func assertFieldValue[T comparable](t *testing.T, field schema.Field[T], want T) {
	t.Helper()
	got, present := field.Value()
	if !present || got != want {
		t.Fatalf("field=(%v,%v) want=%v", got, present, want)
	}
}

func decisionFor(t *testing.T, observation Observation, signal catalog.SignalID) FieldDecision {
	t.Helper()
	for _, decision := range observation.Decisions {
		if decision.Signal == signal {
			return decision
		}
	}
	t.Fatalf("missing decision for %d", signal)
	return FieldDecision{}
}
