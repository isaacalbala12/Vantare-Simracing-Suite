package lmu

import (
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestAuthorityMatrixV1IsCompleteAndDeterministic(t *testing.T) {
	want := []FieldID{
		FieldSourceTime, FieldTrackName, FieldSessionType, FieldVehicleCount, FieldPlayerPresent,
		FieldVehicleName, FieldLapNumber, FieldGear, FieldEngineRPM, FieldSpeedMPS, FieldControls,
		FieldPlayerPosition, FieldCompletedLaps, FieldPitStopCount,
	}
	first := AuthorityMatrix()
	second := AuthorityMatrix()
	if MatrixVersion != 1 || len(first) != len(want) || !reflect.DeepEqual(first, second) {
		t.Fatalf("version=%d matrix=%#v", MatrixVersion, first)
	}
	for index, rule := range first {
		if rule.Field != want[index] || rule.PreferredTTL <= 0 {
			t.Fatalf("rule %d = %#v", index, rule)
		}
		if index < 5 {
			if rule.Preferred != SourceSharedMemory || rule.Alternative != SourceREST || !rule.Equivalent || rule.AlternativeTTL <= 0 {
				t.Fatalf("overlap rule %d = %#v", index, rule)
			}
		} else if index < 11 {
			if rule.Preferred != SourceSharedMemory || rule.Alternative != SourceUnknown || rule.Equivalent {
				t.Fatalf("SHM-only rule %d = %#v", index, rule)
			}
		} else if rule.Preferred != SourceREST || rule.Alternative != SourceUnknown || rule.Equivalent {
			t.Fatalf("REST-only rule %d = %#v", index, rule)
		}
	}
	first[0].Preferred = SourceREST
	if AuthorityMatrix()[0].Preferred != SourceSharedMemory {
		t.Fatal("matrix leaked mutable storage")
	}
}

func TestFusionPreferredFallbackPartialRecoveryZeroAndConflict(t *testing.T) {
	now := time.Unix(100, 0).UTC()
	shm := Observation{
		Source: SourceSharedMemory, ReceivedUTC: now,
		Compatibility: CompatibilityKnown,
		SourceTime:    observed(time.Duration(0)), TrackName: observed("SHM"),
		SessionType: observed(session.TypeRace), VehicleCount: observed(schema.Count(0)),
		PlayerPresent: observed(false), LapNumber: observed(session.LapNumber(0)),
	}
	rest := Observation{Source: SourceREST, ReceivedUTC: now, REST: RESTObservation{
		TrackName: timedObserved("REST", now), SourceTime: timedObserved(time.Second, now),
		SessionType: timedObserved(session.TypePractice, now), VehicleCount: timedObserved(schema.Count(20), now),
		PlayerPresent: timedObserved(true, now), PlayerPosition: timedObserved(standings.Position(1), now),
		CompletedLaps: timedObserved(standings.CompletedLaps(0), now), PitStopCount: timedObserved(pit.StopCount(0), now),
	}}
	var fusion Fusion
	batch := fusion.Merge(now, rest, shm)
	assertFieldValue(t, batch.TrackName, "SHM")
	assertFieldValue(t, batch.SourceTime, time.Duration(0))
	assertFieldValue(t, batch.VehicleCount, schema.Count(0))
	assertFieldValue(t, batch.PlayerPresent, false)
	assertFieldValue(t, batch.CompletedLaps, standings.CompletedLaps(0))
	if batch.Source != SourceCanonical || batch.MatrixVersion != MatrixVersion || len(batch.Decisions) != len(AuthorityMatrix()) || len(batch.Conflicts) != 5 {
		t.Fatalf("canonical metadata = %#v", batch)
	}
	if batch.REST != (RESTObservation{}) {
		t.Fatalf("canonical output leaked REST acquisition snapshot: %#v", batch.REST)
	}

	staleSHM := shm
	staleSHM.ReceivedUTC = now.Add(-defaultFreshnessLimit - time.Nanosecond)
	batch = fusion.Merge(now.Add(time.Second), staleSHM, rest)
	assertFieldValue(t, batch.TrackName, "REST")
	if decisionFor(t, batch, FieldTrackName).Source != SourceREST || !decisionFor(t, batch, FieldTrackName).Fallback {
		t.Fatalf("track decision = %#v", decisionFor(t, batch, FieldTrackName))
	}

	partialREST := rest
	partialREST.REST.TrackName = timedMissing[string](now)
	batch = fusion.Merge(now.Add(2*time.Second), partialREST)
	if batch.TrackName.Freshness() != schema.FreshnessStale {
		t.Fatalf("track freshness = %v", batch.TrackName.Freshness())
	}
	assertFieldValue(t, batch.PlayerPosition, standings.Position(1))

	recovered := shm
	recovered.ReceivedUTC = now.Add(3 * time.Second)
	recovered.TrackName = observed("RECOVERED")
	batch = fusion.Merge(now.Add(3*time.Second), recovered)
	assertFieldValue(t, batch.TrackName, "RECOVERED")
	if decisionFor(t, batch, FieldTrackName).Fallback {
		t.Fatal("recovered preferred source remained fallback")
	}
}

func TestFusionInvalidAndMissingPreferredUseEquivalentAlternative(t *testing.T) {
	now := time.Unix(200, 0).UTC()
	for name, preferred := range map[string]schema.Field[string]{
		"invalid": invalid[string](),
		"missing": schema.MissingField[string](),
	} {
		t.Run(name, func(t *testing.T) {
			var fusion Fusion
			batch := fusion.Merge(now,
				Observation{Source: SourceSharedMemory, ReceivedUTC: now, TrackName: preferred},
				Observation{Source: SourceREST, ReceivedUTC: now, REST: RESTObservation{TrackName: timedObserved("REST", now)}},
			)
			assertFieldValue(t, batch.TrackName, "REST")
		})
	}

	t.Run("stale valid alternative beats invalid preferred", func(t *testing.T) {
		var fusion Fusion
		batch := fusion.Merge(now,
			Observation{Source: SourceSharedMemory, ReceivedUTC: now, TrackName: invalid[string]()},
			Observation{Source: SourceREST, ReceivedUTC: now, REST: RESTObservation{
				TrackName: TimedField[string]{Field: copyFreshness(observed("REST"), schema.FreshnessStale), UpdatedUTC: now},
			}},
		)
		assertFieldValue(t, batch.TrackName, "REST")
		if batch.TrackName.Freshness() != schema.FreshnessStale {
			t.Fatalf("freshness = %v", batch.TrackName.Freshness())
		}
	})
}

func TestFusionTTLBoundaryIsInclusive(t *testing.T) {
	now := time.Unix(250, 0).UTC()
	var fusion Fusion
	input := Observation{Source: SourceSharedMemory, ReceivedUTC: now, TrackName: observed("track")}
	atLimit := fusion.Merge(now.Add(defaultFreshnessLimit), input)
	if atLimit.TrackName.Freshness() != schema.FreshnessFresh {
		t.Fatalf("field at TTL = %v", atLimit.TrackName.Freshness())
	}
	expired := fusion.Merge(now.Add(defaultFreshnessLimit + time.Nanosecond))
	if expired.TrackName.Freshness() != schema.FreshnessStale {
		t.Fatalf("field after TTL = %v", expired.TrackName.Freshness())
	}
}

func TestFusionTieBreakAndDiagnosticsAreBoundedAndValueFree(t *testing.T) {
	now := time.Unix(300, 0).UTC()
	var fusion Fusion
	first := Observation{Source: SourceSharedMemory, ReceivedUTC: now, TrackName: observed("first")}
	second := Observation{Source: SourceSharedMemory, ReceivedUTC: now, TrackName: observed("second")}
	batch := fusion.Merge(now, second, first)
	assertFieldValue(t, batch.TrackName, "first")
	for _, conflict := range batch.Conflicts {
		if conflict.Field == "" || conflict.Preferred == SourceUnknown || conflict.Alternative == SourceUnknown {
			t.Fatalf("unsafe conflict diagnostic = %#v", conflict)
		}
	}
	if len(batch.Conflicts) > 5 {
		t.Fatalf("unbounded conflicts: %d", len(batch.Conflicts))
	}
}

func FuzzFusionNeverPanics(f *testing.F) {
	f.Add(int64(0), int64(0), true)
	f.Fuzz(func(t *testing.T, ageNanos, value int64, present bool) {
		now := time.Unix(1000, 0).UTC()
		field := schema.MissingField[time.Duration]()
		if present {
			field = observed(time.Duration(value))
		}
		var fusion Fusion
		_ = fusion.Merge(now, Observation{Source: SourceSharedMemory, ReceivedUTC: now.Add(-time.Duration(ageNanos)), SourceTime: field})
	})
}

func BenchmarkFusion(b *testing.B) {
	now := time.Unix(100, 0).UTC()
	input := Observation{Source: SourceSharedMemory, ReceivedUTC: now, SourceTime: observed(time.Second), TrackName: observed("track")}
	var fusion Fusion
	b.ReportAllocs()
	for b.Loop() {
		_ = fusion.Merge(now, input)
	}
}

func assertFieldValue[T comparable](t *testing.T, field schema.Field[T], want T) {
	t.Helper()
	got, present := field.Value()
	if !present || got != want {
		t.Fatalf("field=(%v,%v) want=%v", got, present, want)
	}
}

func decisionFor(t *testing.T, observation Observation, field FieldID) FieldDecision {
	t.Helper()
	for _, decision := range observation.Decisions {
		if decision.Field == field {
			return decision
		}
	}
	t.Fatalf("missing decision for %s", field)
	return FieldDecision{}
}
