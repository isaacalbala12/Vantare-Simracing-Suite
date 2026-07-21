package lmu

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

func TestRESTPollProducesTimestampedFieldObservations(t *testing.T) {
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

	now := time.Unix(100, 123).UTC()
	cfg := testRESTConfig(server, now)
	observation, complete := pollREST(t.Context(), cfg, &restCache{}, now)
	if !complete || observation.Source != SourceREST || observation.REST.Status != RESTStatusLive {
		t.Fatalf("observation = %#v complete=%v", observation, complete)
	}
	if observation.REST.Standings.LastAttemptUTC != now || observation.REST.Standings.LastSuccessUTC != now {
		t.Fatalf("standings timestamps = %#v", observation.REST.Standings)
	}
	assertTimedValue(t, observation.REST.TrackName, "Test Circuit", now, schema.FreshnessFresh)
	assertTimedValue(t, observation.REST.SessionType, session.TypeRace, now, schema.FreshnessFresh)
	assertTimedValue(t, observation.REST.PlayerPresent, true, now, schema.FreshnessFresh)
	assertTimedValue(t, observation.REST.PlayerPosition, 3, now, schema.FreshnessFresh)
	assertTimedValue(t, observation.REST.CompletedLaps, 8, now, schema.FreshnessFresh)
	assertTimedValue(t, observation.REST.PitStopCount, 1, now, schema.FreshnessFresh)
}

func TestRESTPollKeepsIndependentEndpointHealth(t *testing.T) {
	tests := []struct {
		name          string
		standingsCode int
		standingsBody string
		sessionCode   int
		sessionBody   string
		wantStatus    RESTStatus
		wantStandings RESTEndpointStatus
		wantSession   RESTEndpointStatus
	}{
		{"partial malformed", http.StatusOK, `[]`, http.StatusOK, `{broken`, RESTStatusPartial, RESTEndpointFresh, RESTEndpointMalformed},
		{"empty is explicit", http.StatusOK, ``, http.StatusOK, ` `, RESTStatusPartial, RESTEndpointEmpty, RESTEndpointEmpty},
		{"unsupported", http.StatusNotFound, ``, http.StatusNotImplemented, ``, RESTStatusUnsupported, RESTEndpointUnsupported, RESTEndpointUnsupported},
		{"offline", http.StatusServiceUnavailable, ``, http.StatusBadGateway, ``, RESTStatusOffline, RESTEndpointOffline, RESTEndpointOffline},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
				if request.URL.Path == standingsEndpoint {
					w.WriteHeader(test.standingsCode)
					_, _ = w.Write([]byte(test.standingsBody))
					return
				}
				w.WriteHeader(test.sessionCode)
				_, _ = w.Write([]byte(test.sessionBody))
			})
			defer server.Close()
			now := time.Unix(100, 0)
			observation, _ := pollREST(t.Context(), testRESTConfig(server, now), &restCache{}, now)
			if observation.REST.Status != test.wantStatus || observation.REST.Standings.Status != test.wantStandings || observation.REST.SessionInfo.Status != test.wantSession {
				t.Fatalf("REST = %#v", observation.REST)
			}
		})
	}
}

func TestRESTPollClassifiesDeadlineAndPreservesCancellation(t *testing.T) {
	active := atomic.Int32{}
	client := doerFunc(func(request *http.Request) (*http.Response, error) {
		active.Add(1)
		defer active.Add(-1)
		<-request.Context().Done()
		return nil, request.Context().Err()
	})
	now := time.Unix(100, 0)
	cfg := normalizeRESTConfig(&restConfig{client: client, now: func() time.Time { return now }}, time.Now)
	cfg.deadline = 20 * time.Millisecond
	observation, _ := pollREST(t.Context(), cfg, &restCache{}, now)
	if observation.REST.Status != RESTStatusTimeout || observation.REST.Standings.Status != RESTEndpointTimeout || observation.REST.SessionInfo.Status != RESTEndpointTimeout {
		t.Fatalf("REST = %#v", observation.REST)
	}
	if active.Load() != 0 {
		t.Fatalf("active handlers = %d", active.Load())
	}
}

func TestRESTCacheMarksResponsesAndFieldsStaleWithoutRefreshingTimestamp(t *testing.T) {
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
		_, _ = w.Write([]byte(`{"trackName":"Old Track","session":"PRACTICE1","numberOfVehicles":4,"currentEventTime":10}`))
	})
	defer server.Close()

	firstTime := time.Unix(100, 0).UTC()
	cfg := testRESTConfig(server, firstTime)
	cache := &restCache{}
	first, _ := pollREST(t.Context(), cfg, cache, firstTime)
	if first.REST.Status != RESTStatusLive {
		t.Fatalf("first status = %v", first.REST.Status)
	}
	failing.Store(true)
	staleTime := firstTime.Add(cfg.ttl + time.Nanosecond)
	second, _ := pollREST(t.Context(), cfg, cache, staleTime)
	if second.REST.Status != RESTStatusStale || second.REST.Standings.Status != RESTEndpointStale || second.REST.SessionInfo.Status != RESTEndpointStale {
		t.Fatalf("stale REST = %#v", second.REST)
	}
	assertTimedValue(t, second.REST.TrackName, "Old Track", firstTime, schema.FreshnessStale)
	assertTimedValue(t, second.REST.PlayerPosition, 1, firstTime, schema.FreshnessStale)
}

func TestDriverOwnsRESTPollerAndWaitsForItsCancellation(t *testing.T) {
	requestStarted := make(chan struct{}, 2)
	requestStopped := make(chan struct{}, 2)
	client := doerFunc(func(request *http.Request) (*http.Response, error) {
		requestStarted <- struct{}{}
		<-request.Context().Done()
		requestStopped <- struct{}{}
		return nil, request.Context().Err()
	})

	reader := &testReader{data: knownBuffer(t)}
	ticks := &manualTicker{ticks: make(chan time.Time)}
	cfg := normalizeRESTConfig(&restConfig{client: client, now: func() time.Time { return time.Unix(100, 0) }}, time.Now)
	cfg.deadline = time.Minute
	driver := newTestDriver(config{
		open:      func() (memoryReader, error) { return reader, nil },
		newTicker: func(time.Duration) ticker { return ticks },
		rest:      cfg,
	})
	sink := &collectingSink{values: make(chan Observation, 4)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	if first := <-sink.values; first.Source != SourceSharedMemory {
		t.Fatalf("first source = %v", first.Source)
	}
	<-requestStarted
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run error = %v", err)
	}
	select {
	case <-requestStopped:
	default:
		t.Fatal("Run returned before the REST request goroutine stopped")
	}
	if reader.closes != 1 || ticks.stops != 1 {
		t.Fatalf("reader closes=%d ticker stops=%d", reader.closes, ticks.stops)
	}
}

func TestDriverPublishesBothInternalChannelsAndReportsCapabilities(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path == standingsEndpoint {
			_, _ = w.Write([]byte(`[]`))
			return
		}
		_, _ = w.Write([]byte(`{"currentEventTime":1,"numberOfVehicles":0}`))
	})
	defer server.Close()

	rest := testRESTConfig(server, time.Unix(100, 0))
	rest.wait = waitContext
	rest.interval = time.Hour
	driver := newTestDriver(config{
		open: func() (memoryReader, error) { return &testReader{data: knownBuffer(t)}, nil },
		rest: rest,
	})
	sink := &collectingSink{values: make(chan Observation, 4)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	sources := map[ObservationSource]bool{}
	for len(sources) < 2 {
		sources[(<-sink.values).Source] = true
	}
	snapshot := driver.RuntimeSnapshot()
	if snapshot.State != drivercontract.StateLive || len(snapshot.Capabilities) != 2 || snapshot.Capabilities[0] != CapabilitySharedMemory || snapshot.Capabilities[1] != CapabilityREST {
		t.Fatalf("runtime snapshot = %#v", snapshot)
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run error = %v", err)
	}
}

func TestCombinedRuntimeStateKeepsRESTFailureHonest(t *testing.T) {
	for _, test := range []struct {
		name string
		rest RESTStatus
		want drivercontract.State
	}{
		{"not polled yet", RESTStatusUnknown, drivercontract.StateLive},
		{"live", RESTStatusLive, drivercontract.StateLive},
		{"partial", RESTStatusPartial, drivercontract.StateDegraded},
		{"unsupported", RESTStatusUnsupported, drivercontract.StateDegraded},
		{"offline", RESTStatusOffline, drivercontract.StateDegraded},
		{"timeout", RESTStatusTimeout, drivercontract.StateDegraded},
		{"stale", RESTStatusStale, drivercontract.StateDegraded},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := combinedRuntimeState(drivercontract.StateLive, test.rest); got != test.want {
				t.Fatalf("state = %s want %s", got, test.want)
			}
		})
	}
}

func TestRESTBackoffIsBoundedAndResetsAfterRecovery(t *testing.T) {
	calls := atomic.Int32{}
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		cycle := (calls.Add(1) + 1) / 2
		if cycle <= 2 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		if request.URL.Path == standingsEndpoint {
			_, _ = w.Write([]byte(`[]`))
			return
		}
		_, _ = w.Write([]byte(`{"currentEventTime":1,"numberOfVehicles":0}`))
	})
	defer server.Close()

	waits := make(chan time.Duration, 3)
	cfg := testRESTConfig(server, time.Unix(100, 0))
	cfg.interval = 10 * time.Millisecond
	cfg.maximumBackoff = 25 * time.Millisecond
	ctx, cancel := context.WithCancel(t.Context())
	cfg.wait = func(ctx context.Context, delay time.Duration) error {
		waits <- delay
		if len(waits) == cap(waits) {
			cancel()
		}
		return nil
	}
	output := make(chan Observation, 3)
	err := runREST(ctx, cfg, output)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("runREST error = %v", err)
	}
	got := []time.Duration{<-waits, <-waits, <-waits}
	want := []time.Duration{20 * time.Millisecond, 25 * time.Millisecond, 10 * time.Millisecond}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("waits = %v want %v", got, want)
		}
	}
}

func FuzzRESTDecodersDoNotPanic(f *testing.F) {
	f.Add([]byte(`[]`))
	f.Add([]byte(`{"trackName":"x"}`))
	f.Add([]byte(`{broken`))
	f.Fuzz(func(t *testing.T, body []byte) {
		_, _ = decodeStandings(body)
		_, _ = decodeSessionInfo(body)
	})
}

func BenchmarkRESTDecodeObservations(b *testing.B) {
	standingsBody := []byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`)
	sessionBody := []byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}`)
	b.ReportAllocs()
	for range b.N {
		rows, err := decodeStandings(standingsBody)
		if err != nil {
			b.Fatal(err)
		}
		info, err := decodeSessionInfo(sessionBody)
		if err != nil {
			b.Fatal(err)
		}
		cache := restCache{}
		updateStandingsFields(&cache, rows, time.Time{})
		updateSessionFields(&cache, info, time.Time{})
	}
}

func newRESTServer(t *testing.T, handler func(http.ResponseWriter, *http.Request)) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(handler))
}

func testRESTConfig(server *httptest.Server, now time.Time) *restConfig {
	return normalizeRESTConfig(&restConfig{
		baseURL: server.URL,
		client:  server.Client(),
		now:     func() time.Time { return now },
		wait:    func(context.Context, time.Duration) error { return nil },
	}, func() time.Time { return now })
}

func assertTimedValue[T comparable](t *testing.T, field TimedField[T], want T, updated time.Time, freshness schema.Freshness) {
	t.Helper()
	got, present := field.Field.Value()
	if !present || got != want || field.UpdatedUTC != updated || field.Field.Freshness() != freshness {
		t.Fatalf("timed field = %#v value=%v present=%v, want value=%v updated=%v freshness=%v", field, got, present, want, updated, freshness)
	}
}

var _ drivercontract.Capability = CapabilityREST

type doerFunc func(*http.Request) (*http.Response, error)

func (function doerFunc) Do(request *http.Request) (*http.Response, error) {
	return function(request)
}
