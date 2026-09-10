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
// temperatures and the session flag never reach the canonical state and both
// Overlay v2 builders stay missing. These tests lock the target contract:
// normal, absent, null/malformed, stale, reconnect/reset, no contamination
// between sessions and per-field invalidation independence.
func TestRESTSessionSignalsCarryTempsAndFlag(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42,"ambientTemp":22.5,"trackTemp":31.0,"yellowFlagState":1,"sectorFlag":0,"gamePhase":"GPHASE_GREEN"}`))
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
	rest.REST.SessionFlag = timedObservedAt(session.FlagYellow, wall, stamp)
	merged := new(Fusion).Merge(wall, 0, shared, rest)
	assertFieldValue(t, merged.AmbientTemp, 22.5)
	assertFieldValue(t, merged.TrackTemp, 31.0)
	assertFieldValue(t, merged.SessionFlag, session.FlagYellow)
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
