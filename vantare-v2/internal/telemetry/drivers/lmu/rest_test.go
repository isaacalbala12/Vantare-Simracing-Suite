package lmu

import (
	"context"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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
	observation, complete := pollREST(t.Context(), cfg, &restCache{})
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
			observation, _ := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
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
	observation, _ := pollREST(t.Context(), cfg, &restCache{})
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
	first, _ := pollREST(t.Context(), cfg, cache)
	if first.REST.Status != RESTStatusLive {
		t.Fatalf("first status = %v", first.REST.Status)
	}
	failing.Store(true)
	staleTime := firstTime.Add(cfg.ttl + time.Nanosecond)
	cfg.now = func() time.Time { return staleTime }
	second, _ := pollREST(t.Context(), cfg, cache)
	if second.REST.Status != RESTStatusStale || second.REST.Standings.Status != RESTEndpointStale || second.REST.SessionInfo.Status != RESTEndpointStale {
		t.Fatalf("stale REST = %#v", second.REST)
	}
	assertTimedValue(t, second.REST.TrackName, "Old Track", firstTime, schema.FreshnessStale)
	assertTimedValue(t, second.REST.PlayerPosition, 1, firstTime, schema.FreshnessStale)
}

func TestRESTSessionValidationIsTransactional(t *testing.T) {
	var cycle atomic.Int32
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path == standingsEndpoint {
			cycle.Add(1)
			_, _ = w.Write([]byte(`[]`))
			return
		}
		if cycle.Load() == 1 {
			_, _ = w.Write([]byte(`{"trackName":"Accepted Track","session":"RACE1","numberOfVehicles":10,"currentEventTime":50}`))
			return
		}
		_, _ = w.Write([]byte(`{"trackName":"Rejected Track","session":"PRACTICE1","numberOfVehicles":2,"currentEventTime":-1}`))
	})
	defer server.Close()

	firstTime := time.Unix(100, 0).UTC()
	secondTime := firstTime.Add(time.Second)
	current := atomic.Int64{}
	current.Store(firstTime.UnixNano())
	cfg := testRESTConfig(server, firstTime)
	cfg.now = func() time.Time { return time.Unix(0, current.Load()).UTC() }
	cache := &restCache{}
	first, _ := pollREST(t.Context(), cfg, cache)
	current.Store(secondTime.UnixNano())
	second, _ := pollREST(t.Context(), cfg, cache)

	if second.REST.SessionInfo.Status != RESTEndpointMalformed {
		t.Fatalf("session endpoint = %#v", second.REST.SessionInfo)
	}
	if second.REST.SessionInfo.LastSuccessUTC != first.REST.SessionInfo.LastSuccessUTC {
		t.Fatalf("invalid response recorded success: first=%v second=%v", first.REST.SessionInfo.LastSuccessUTC, second.REST.SessionInfo.LastSuccessUTC)
	}
	assertTimedValue(t, second.REST.TrackName, "Accepted Track", firstTime, schema.FreshnessFresh)
	assertTimedValue(t, second.REST.SourceTime, 50*time.Second, firstTime, schema.FreshnessFresh)
	for _, invalidTime := range []float64{-1, math.NaN()} {
		seed := restCache{
			sessionInfo: RESTEndpointSnapshot{LastSuccessUTC: firstTime},
			trackName:   timedObserved("Cached Track", firstTime),
			sourceTime:  timedObserved(50*time.Second, firstTime),
		}
		if err := seed.acceptSession(restSessionInfo{TrackName: "Must Not Commit", CurrentEventTime: invalidTime}, secondTime); err == nil {
			t.Fatalf("CurrentEventTime %v was accepted", invalidTime)
		}
		if seed.sessionInfo.LastSuccessUTC != firstTime {
			t.Fatalf("CurrentEventTime %v recorded success at %v", invalidTime, seed.sessionInfo.LastSuccessUTC)
		}
		assertTimedValue(t, seed.trackName, "Cached Track", firstTime, schema.FreshnessFresh)
		assertTimedValue(t, seed.sourceTime, 50*time.Second, firstTime, schema.FreshnessFresh)
	}
}

func TestRESTUsesPerResponseTimestampsAndFinalSnapshotTime(t *testing.T) {
	start := time.Unix(100, 0).UTC()
	clock := &lockedClock{now: start}
	client := doerFunc(func(request *http.Request) (*http.Response, error) {
		var body string
		switch request.URL.Path {
		case standingsEndpoint:
			clock.advance(time.Second)
			body = `[{"player":true,"position":2,"lapsCompleted":3,"pitstops":0}]`
		case sessionInfoEndpoint:
			clock.advance(2 * time.Second)
			body = `{"trackName":"Later Track","session":"RACE1","numberOfVehicles":4,"currentEventTime":20}`
		default:
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
		return responseFor(request, http.StatusOK, body), nil
	})
	cfg := normalizeRESTConfig(&restConfig{
		baseURL: "http://127.0.0.1:6397",
		client:  client,
		now:     clock.current,
		ttl:     1500 * time.Millisecond,
	}, clock.current)

	observation, _ := pollREST(t.Context(), cfg, &restCache{})
	standingsReceived := start.Add(time.Second)
	sessionReceived := start.Add(3 * time.Second)
	if observation.ReceivedUTC != sessionReceived {
		t.Fatalf("snapshot time = %v want %v", observation.ReceivedUTC, sessionReceived)
	}
	if observation.REST.Standings.LastAttemptUTC != start || observation.REST.Standings.LastSuccessUTC != standingsReceived {
		t.Fatalf("standings timestamps = %#v", observation.REST.Standings)
	}
	if observation.REST.SessionInfo.LastAttemptUTC != standingsReceived || observation.REST.SessionInfo.LastSuccessUTC != sessionReceived {
		t.Fatalf("session timestamps = %#v", observation.REST.SessionInfo)
	}
	assertTimedValue(t, observation.REST.PlayerPosition, 2, standingsReceived, schema.FreshnessStale)
	assertTimedValue(t, observation.REST.TrackName, "Later Track", sessionReceived, schema.FreshnessFresh)
	if observation.REST.Status != RESTStatusStale {
		t.Fatalf("REST status = %v", observation.REST.Status)
	}
}

func TestRESTRejectsRedirectBeforeExternalDestination(t *testing.T) {
	requests := atomic.Int32{}
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		http.Redirect(w, request, "http://example.invalid/escape", http.StatusFound)
	})
	defer server.Close()
	cfg := normalizeRESTConfig(&restConfig{baseURL: server.URL, client: newRESTHTTPClient(), now: time.Now}, time.Now)
	result := fetchREST(t.Context(), cfg, standingsEndpoint)
	if result.status != RESTEndpointMalformed || requests.Load() != 1 {
		t.Fatalf("redirect result=%#v requests=%d", result, requests.Load())
	}
}

func TestRESTRejectsNonLoopbackBaseBeforeTransport(t *testing.T) {
	calls := atomic.Int32{}
	client := doerFunc(func(request *http.Request) (*http.Response, error) {
		calls.Add(1)
		return responseFor(request, http.StatusOK, `[]`), nil
	})
	cfg := normalizeRESTConfig(&restConfig{baseURL: "http://example.invalid", client: client, now: time.Now}, time.Now)
	result := fetchREST(t.Context(), cfg, standingsEndpoint)
	if result.status != RESTEndpointMalformed || calls.Load() != 0 {
		t.Fatalf("non-loopback result=%#v calls=%d", result, calls.Load())
	}
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

func TestDriverDoesNotPublishOrMutateRESTAfterCancellation(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path == standingsEndpoint {
			_, _ = w.Write([]byte(`[]`))
			return
		}
		_, _ = w.Write([]byte(`{"currentEventTime":1,"numberOfVehicles":0}`))
	})
	defer server.Close()

	beforePublish := make(chan struct{})
	release := make(chan struct{})
	driver := newTestDriver(config{
		open: func() (memoryReader, error) { return &testReader{data: knownBuffer(t)}, nil },
		rest: testRESTConfig(server, time.Unix(100, 0)),
		beforeRESTPublish: func() {
			close(beforePublish)
			<-release
		},
	})
	sink := &countingSink{}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	<-beforePublish
	cancel()
	close(release)
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run error = %v", err)
	}
	if sink.calls.Load() != 1 {
		t.Fatalf("sink calls = %d, want only initial shared-memory observation", sink.calls.Load())
	}
	driver.mu.RLock()
	restStatus := driver.restStatus
	driver.mu.RUnlock()
	if restStatus != RESTStatusUnknown {
		t.Fatalf("REST runtime mutated after cancellation: %v", restStatus)
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
		fields, err := validateSessionFields(info, time.Time{})
		if err != nil {
			b.Fatal(err)
		}
		cache.applySession(fields)
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

type lockedClock struct {
	mu  sync.Mutex
	now time.Time
}

func (clock *lockedClock) current() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *lockedClock) advance(duration time.Duration) {
	clock.mu.Lock()
	clock.now = clock.now.Add(duration)
	clock.mu.Unlock()
}

func responseFor(request *http.Request, status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
		Request:    request,
	}
}
