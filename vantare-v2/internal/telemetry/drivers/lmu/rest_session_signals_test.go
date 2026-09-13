package lmu

import (
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

// Characterization for ISA-1106: the REST sessionInfo endpoint already carries
// the session signals the Efficiency widget needs, but the driver decodes only
// trackName/session/numberOfVehicles/currentEventTime, so ambient/track
// temperatures never reach the canonical state and the weather builder stays
// missing. Correction B2: the session flag stays missing for every shape —
// no yellow vocabulary is demonstrated — so these tests lock temperatures as
// fresh plus flag missing, with absence/null/malformed/stale/reconnect,
// no-contamination and per-field independence.
func TestRESTSessionSignalsCarryTempsAndFlag(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42,"ambientTemp":22.5,"trackTemp":31.0,"yellowFlagState":3,"sectorFlag":0,"gamePhase":"GPHASE_GREEN"}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(100, 123).UTC()
	cfg := testRESTConfig(server, now)
	observation, complete := pollREST(t.Context(), cfg, &restCache{})
	if !complete || observation.REST.Status != RESTStatusLive {
		t.Fatalf("observation = %#v complete=%v", observation, complete)
	}
	assertTimedValue(t, observation.REST.AmbientTemp, 22.5, now, schema.FreshnessFresh)
	assertTimedValue(t, observation.REST.TrackTemp, 31.0, now, schema.FreshnessFresh)
	// B2 candidate mapping: the documented full-course integer 3 asserts.
	assertTimedValue(t, observation.REST.SessionFlag, session.FlagYellow, now, schema.FreshnessFresh)
}

func TestRESTSessionSignalsStayMissingWhenAbsent(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(200, 0).UTC()
	observation, complete := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	if !complete {
		t.Fatalf("observation = %#v complete=%v", observation, complete)
	}
	for name, field := range map[string]schema.Freshness{
		"ambient": observation.REST.AmbientTemp.Field.Freshness(),
		"track":   observation.REST.TrackTemp.Field.Freshness(),
		"flag":    observation.REST.SessionFlag.Field.Freshness(),
	} {
		if field != schema.FreshnessMissing {
			t.Fatalf("%s freshness = %v, want missing", name, field)
		}
	}
}

func TestRESTSessionSignalsInvalidateIndependently(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`))
		case sessionInfoEndpoint:
			// NaN ambient is invalid but track stays usable; an unknown flag
			// vocabulary is invalid, never a silent green.
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42,"ambientTemp":"hot","trackTemp":31.0,"yellowFlagState":0,"sectorFlag":0,"gamePhase":"SOMETHING_NEW"}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(300, 0).UTC()
	observation, _ := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	if got := observation.REST.AmbientTemp.Field.Freshness(); got != schema.FreshnessInvalid {
		t.Fatalf("ambient freshness = %v, want invalid", got)
	}
	assertTimedValue(t, observation.REST.TrackTemp, 31.0, now, schema.FreshnessFresh)
	if got := observation.REST.SessionFlag.Field.Freshness(); got != schema.FreshnessMissing {
		t.Fatalf("flag freshness = %v, want missing (no positive yellow evidence, never green)", got)
	}
	// The pre-existing session fields keep working when the new ones fail.
	assertTimedValue(t, observation.REST.TrackName, "Test Circuit", now, schema.FreshnessFresh)
}

func TestRESTSessionSignalsNullIsMissing(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42,"ambientTemp":null,"trackTemp":null,"yellowFlagState":null}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(400, 0).UTC()
	observation, complete := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	if !complete {
		t.Fatalf("observation = %#v complete=%v", observation, complete)
	}
	for name, field := range map[string]schema.Freshness{
		"ambient": observation.REST.AmbientTemp.Field.Freshness(),
		"track":   observation.REST.TrackTemp.Field.Freshness(),
		"flag":    observation.REST.SessionFlag.Field.Freshness(),
	} {
		if field != schema.FreshnessMissing {
			t.Fatalf("%s freshness = %v, want missing", name, field)
		}
	}
}

func TestRESTSessionSignalsGoStaleAndRecover(t *testing.T) {
	failing := atomic.Bool{}
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		if failing.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		if request.URL.Path == standingsEndpoint {
			_, _ = w.Write([]byte(`[{"player":true,"position":1,"lapsCompleted":2,"pitstops":0}]`))
			return
		}
		_, _ = w.Write([]byte(`{"trackName":"Old Track","session":"RACE1","numberOfVehicles":4,"currentEventTime":10,"ambientTemp":20.0,"trackTemp":30.0,"yellowFlagState":2}`))
	})
	defer server.Close()

	firstTime := time.Unix(500, 0).UTC()
	cfg := testRESTConfig(server, firstTime)
	var elapsed atomic.Int64
	cfg.elapsed = func() time.Duration { return time.Duration(elapsed.Load()) }
	cache := &restCache{}
	first, _ := pollREST(t.Context(), cfg, cache)
	assertTimedValue(t, first.REST.AmbientTemp, 20.0, firstTime, schema.FreshnessFresh)
	assertTimedValue(t, first.REST.TrackTemp, 30.0, firstTime, schema.FreshnessFresh)
	assertTimedValue(t, first.REST.SessionFlag, session.FlagYellow, firstTime, schema.FreshnessFresh)

	failing.Store(true)
	staleTime := firstTime.Add(cfg.ttl + time.Nanosecond)
	cfg.now = func() time.Time { return staleTime }
	elapsed.Store(int64(cfg.ttl + time.Nanosecond))
	second, _ := pollREST(t.Context(), cfg, cache)
	if second.REST.Status != RESTStatusStale {
		t.Fatalf("REST status = %v, want stale", second.REST.Status)
	}
	assertTimedValue(t, second.REST.AmbientTemp, 20.0, firstTime, schema.FreshnessStale)
	assertTimedValue(t, second.REST.TrackTemp, 30.0, firstTime, schema.FreshnessStale)
	assertTimedValue(t, second.REST.SessionFlag, session.FlagYellow, firstTime, schema.FreshnessStale)

	failing.Store(false)
	recoveredTime := staleTime.Add(time.Second)
	cfg.now = func() time.Time { return recoveredTime }
	elapsed.Store(int64(2 * (cfg.ttl + time.Nanosecond)))
	recovered, _ := pollREST(t.Context(), cfg, cache)
	if recovered.REST.Status != RESTStatusLive {
		t.Fatalf("REST status = %v, want live after reconnect", recovered.REST.Status)
	}
	assertTimedValue(t, recovered.REST.AmbientTemp, 20.0, recoveredTime, schema.FreshnessFresh)
}

func TestRESTSessionSignalsDoNotContaminateAcrossInvalidSession(t *testing.T) {
	var cycle atomic.Int32
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path == standingsEndpoint {
			cycle.Add(1)
			_, _ = w.Write([]byte(`[{"player":true,"position":1,"lapsCompleted":2,"pitstops":0}]`))
			return
		}
		if cycle.Load() == 1 {
			_, _ = w.Write([]byte(`{"trackName":"Accepted Track","session":"RACE1","numberOfVehicles":10,"currentEventTime":50,"ambientTemp":21.0,"trackTemp":32.0,"yellowFlagState":0}`))
			return
		}
		_, _ = w.Write([]byte(`{"trackName":"Rejected Track","session":"PRACTICE1","numberOfVehicles":2,"currentEventTime":-1,"ambientTemp":99.0,"trackTemp":99.0,"yellowFlagState":5}`))
	})
	defer server.Close()

	firstTime := time.Unix(600, 0).UTC()
	secondTime := firstTime.Add(time.Second)
	current := atomic.Int64{}
	current.Store(firstTime.UnixNano())
	cfg := testRESTConfig(server, firstTime)
	cfg.now = func() time.Time { return time.Unix(0, current.Load()).UTC() }
	cache := &restCache{}
	first, _ := pollREST(t.Context(), cfg, cache)
	assertTimedValue(t, first.REST.AmbientTemp, 21.0, firstTime, schema.FreshnessFresh)
	current.Store(secondTime.UnixNano())
	second, _ := pollREST(t.Context(), cfg, cache)
	if second.REST.SessionInfo.Status != RESTEndpointMalformed {
		t.Fatalf("session endpoint = %#v", second.REST.SessionInfo)
	}
	// The rejected poll commits nothing: previous values survive untouched.
	assertTimedValue(t, second.REST.AmbientTemp, 21.0, firstTime, schema.FreshnessFresh)
	assertTimedValue(t, second.REST.TrackTemp, 32.0, firstTime, schema.FreshnessFresh)
	if got := second.REST.SessionFlag.Field.Freshness(); got != schema.FreshnessMissing {
		t.Fatalf("flag freshness = %v, want missing (previous poll had no yellow evidence)", got)
	}
}

func TestFusionCarriesRESTSessionSignalsToCanonical(t *testing.T) {
	wall := time.Unix(700, 0).UTC()
	stamp := monotonicStamp{elapsed: 0, set: true}
	shared := sharedObservation(wall, "Test Circuit")
	rest := restObservation(wall, 0, "Test Circuit")
	rest.REST.AmbientTemp = timedObservedAt(weather.Temperature(22.5), wall, stamp)
	rest.REST.TrackTemp = timedObservedAt(weather.Temperature(31.0), wall, stamp)
	merged := new(Fusion).Merge(wall, 0, shared, rest)
	assertFieldValue(t, merged.AmbientTemp, 22.5)
	assertFieldValue(t, merged.TrackTemp, 31.0)
	if got := merged.SessionFlag.Freshness(); got != schema.FreshnessMissing {
		t.Fatalf("flag freshness = %v, want missing (B2)", got)
	}
	if merged.AmbientTemp.Freshness() != schema.FreshnessFresh {
		t.Fatalf("ambient freshness = %v, want fresh", merged.AmbientTemp.Freshness())
	}
}

func TestFusionSessionSignalsStayIndependentFromGrid(t *testing.T) {
	wall := time.Unix(800, 0).UTC()
	rest := restObservation(wall, 0, "Test Circuit")
	rest.REST.AmbientTemp = TimedField[weather.Temperature]{Field: schema.MissingField[weather.Temperature](), UpdatedUTC: wall, updatedMono: monotonicStamp{elapsed: 0, set: true}}
	merged := new(Fusion).Merge(wall, 0, sharedObservation(wall, "Test Circuit"), rest)
	if got := merged.AmbientTemp.Freshness(); got != schema.FreshnessMissing {
		t.Fatalf("ambient freshness = %v, want missing", got)
	}
	// Track and flag keep their own values when ambient is absent.
	if _, present := merged.TrackTemp.Value(); present {
		t.Fatalf("track should stay absent when never observed: %#v", merged.TrackTemp)
	}
}

// B1: gamePhase is an ignored field: whatever shape it arrives in (number,
// string, null, object) it must never block track/count/temps from the same
// poll.
func TestRESTSessionSignalsIgnoreGamePhaseShapes(t *testing.T) {
	for _, shape := range []string{`5`, `"GPHASE_GREEN"`, `null`, `{"phase":5}`} {
		t.Run(shape, func(t *testing.T) {
			server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
				switch request.URL.Path {
				case standingsEndpoint:
					_, _ = w.Write([]byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`))
				case sessionInfoEndpoint:
					_, _ = w.Write([]byte(`{"trackName":"T","session":"RACE1","numberOfVehicles":4,"currentEventTime":7,"ambientTemp":20.0,"trackTemp":30.0,"gamePhase":` + shape + `}`))
				default:
					http.NotFound(w, request)
				}
			})
			defer server.Close()

			now := time.Unix(100, 0).UTC()
			observation, complete := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
			if !complete || observation.REST.Status != RESTStatusLive {
				t.Fatalf("gamePhase %s blocked the session poll: %#v complete=%v", shape, observation.REST, complete)
			}
			assertTimedValue(t, observation.REST.TrackName, "T", now, schema.FreshnessFresh)
			assertTimedValue(t, observation.REST.VehicleCount, 4, now, schema.FreshnessFresh)
			assertTimedValue(t, observation.REST.AmbientTemp, 20.0, now, schema.FreshnessFresh)
			assertTimedValue(t, observation.REST.TrackTemp, 30.0, now, schema.FreshnessFresh)
		})
	}
}

// B2: the session flag follows the documented candidate allowlist only.
// The value vocabulary is adopted provisionally from the official
// LMU-distributed SDK header (full-course yellow states) and the REST
// equivalence is still pending verification, so: integers 2, 3, 4, 5 assert
// FlagYellow; 1 (Pending) and 6 (Resume) stay neutral as ambiguous; every
// other shape (-1, 0, 7, other integers, fractions, strings, bool, arrays,
// objects, null) stays missing. No != 0 shortcut, no coercions or aliases,
// no default green.
func TestRESTSessionFlagCandidateAllowlist(t *testing.T) {
	positives := []string{`2`, `3`, `4`, `5`, `3.0`}
	for _, shape := range positives {
		t.Run("yellowFlagState="+shape, func(t *testing.T) {
			observation := pollSessionFlag(t, shape)
			assertTimedValue(t, observation.REST.SessionFlag, session.FlagYellow, time.Unix(100, 0).UTC(), schema.FreshnessFresh)
		})
	}
	negatives := []string{`-1`, `0`, `1`, `6`, `7`, `99`, `0.5`, `"1"`, `"yellow"`, `true`, `null`, `[]`, `{"state":2}`}
	for _, shape := range negatives {
		t.Run("yellowFlagState="+shape, func(t *testing.T) {
			observation := pollSessionFlag(t, shape)
			if got := observation.REST.SessionFlag.Field.Freshness(); got != schema.FreshnessMissing {
				t.Fatalf("yellowFlagState %s asserted flag %v, want missing", shape, observation.REST.SessionFlag)
			}
		})
	}
}

func pollSessionFlag(t *testing.T, shape string) Observation {
	t.Helper()
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"T","session":"RACE1","numberOfVehicles":4,"currentEventTime":7,"ambientTemp":20.0,"trackTemp":30.0,"yellowFlagState":` + shape + `}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(100, 0).UTC()
	observation, complete := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	if !complete {
		t.Fatalf("yellowFlagState %s blocked the session poll: %#v", shape, observation.REST)
	}
	assertTimedValue(t, observation.REST.AmbientTemp, 20.0, now, schema.FreshnessFresh)
	return observation
}

// B3: a session boundary (fresh SHM signature change) must scope the
// REST-joined session signals like the car-number grid: values polled before
// the boundary go missing even within the REST TTL, and only a new REST poll
// recovers them.
func TestFusionSessionSignalsRespectSessionBoundary(t *testing.T) {
	fusion := new(Fusion)
	wall := time.Unix(900, 0).UTC()
	rest := restObservation(wall, 0, "Track-A")
	rest.REST.AmbientTemp = timedObservedAt(weather.Temperature(22.5), wall, monotonicStamp{elapsed: 0, set: true})
	rest.REST.TrackTemp = timedObservedAt(weather.Temperature(31.0), wall, monotonicStamp{elapsed: 0, set: true})
	first := fusion.Merge(wall, 0, sharedObservation(wall, "Track-A"), rest)
	assertFieldValue(t, first.AmbientTemp, weather.Temperature(22.5))
	assertFieldValue(t, first.TrackTemp, weather.Temperature(31.0))

	second := fusion.Merge(wall, time.Second, sharedObservation(wall, "Track-B"))
	if got := second.AmbientTemp.Freshness(); got != schema.FreshnessMissing {
		t.Fatalf("ambient after session boundary = %v, want missing (previous-session value)", second.AmbientTemp.Freshness())
	}
	if got := second.TrackTemp.Freshness(); got != schema.FreshnessMissing {
		t.Fatalf("track after session boundary = %v, want missing (previous-session value)", second.TrackTemp.Freshness())
	}
	if got := second.SessionFlag.Freshness(); got != schema.FreshnessMissing {
		t.Fatalf("flag after session boundary = %v, want missing", second.SessionFlag.Freshness())
	}

	recovered := restObservation(wall, 2*time.Second, "Track-B")
	recovered.REST.AmbientTemp = timedObservedAt(weather.Temperature(23.0), wall, monotonicStamp{elapsed: 2 * time.Second, set: true})
	recovered.REST.TrackTemp = timedObservedAt(weather.Temperature(32.0), wall, monotonicStamp{elapsed: 2 * time.Second, set: true})
	third := fusion.Merge(wall, 2*time.Second, sharedObservation(wall, "Track-B"), recovered)
	assertFieldValue(t, third.AmbientTemp, weather.Temperature(23.0))
	assertFieldValue(t, third.TrackTemp, weather.Temperature(32.0))
}

func TestBatchMapperCarriesSessionSignals(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	observation := trackObservation(7)
	observation.AmbientTemp = observed(weather.Temperature(21.5))
	observation.TrackTemp = observed(weather.Temperature(32.5))
	observation.SessionFlag = observed(session.FlagYellow)
	writeMapped(t, mapper, observation, sink)
	batch := sink.last(t)
	assertFieldValue(t, batch.State.AmbientTemp, weather.Temperature(21.5))
	assertFieldValue(t, batch.State.TrackTemp, weather.Temperature(32.5))
	assertFieldValue(t, batch.State.SessionFlag, session.FlagYellow)
}
