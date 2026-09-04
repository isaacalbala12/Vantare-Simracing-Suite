package telemetrytransport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestLateJoinReconnectAndGapAlwaysStartWithFull(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	status := mustStatus(t, 1, map[string]any{"state": "live"})
	if err := hub.PublishStatus(status); err != nil {
		t.Fatal(err)
	}
	first := mustSnapshot(t, 1, 1, Full, 1, map[string]any{"speed": 10, "gear": 2})
	if err := hub.PublishSnapshot(first, nil); err != nil {
		t.Fatal(err)
	}

	late := mustSubscribe(t, hub)
	assertEventKind(t, mustNext(t, late), EventStatus)
	assertSnapshot(t, mustNext(t, late), Full, 1)
	if err := late.Close(); err != nil {
		t.Fatal(err)
	}

	second := mustSnapshot(t, 1, 2, Full, 1, map[string]any{"speed": 11, "gear": 2})
	if err := hub.PublishSnapshot(second, nil); err != nil {
		t.Fatal(err)
	}
	reconnected := mustSubscribe(t, hub)
	assertEventKind(t, mustNext(t, reconnected), EventStatus)
	assertSnapshot(t, mustNext(t, reconnected), Full, 2)

	third := mustSnapshot(t, 1, 3, Full, 1, map[string]any{"speed": 12, "gear": 3})
	if err := hub.PublishSnapshot(third, nil); err != nil {
		t.Fatal(err)
	}
	fourth := mustSnapshot(t, 1, 4, Full, 1, map[string]any{"speed": 13, "gear": 3})
	if err := hub.PublishSnapshot(fourth, nil); err != nil {
		t.Fatal(err)
	}
	assertSnapshot(t, mustNext(t, reconnected), Full, 4)
}

func TestInvalidOversizedAndDeltaPayloadsAreRejectedAtomically(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay, MaxPayloadBytes: 32})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	valid := mustSnapshot(t, 1, 1, Full, 1, map[string]any{"speed": 1})
	if err := hub.PublishSnapshot(valid, nil); err != nil {
		t.Fatal(err)
	}

	invalid := valid
	invalid.Sequence = 2
	invalid.Payload = json.RawMessage(`{"speed":`)
	if err := hub.PublishSnapshot(invalid, nil); !errors.Is(err, ErrInvalidPayload) {
		t.Fatalf("invalid payload error = %v", err)
	}
	oversized := valid
	oversized.Sequence = 2
	oversized.Payload = json.RawMessage(`{"value":"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz"}`)
	if err := hub.PublishSnapshot(oversized, nil); !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("oversized payload error = %v", err)
	}
	next := mustSnapshot(t, 1, 2, Full, 1, map[string]any{"speed": 2})
	if err := hub.PublishSnapshot(next, json.RawMessage(`{"speed":2}`)); !errors.Is(err, ErrDeltaUnsupported) {
		t.Fatalf("delta error = %v, want %v", err, ErrDeltaUnsupported)
	}
	if err := hub.PublishSnapshot(next, nil); err != nil {
		t.Fatalf("full after rejected delta: %v", err)
	}

	subscription := mustSubscribe(t, hub)
	_ = mustNext(t, subscription)
	assertSnapshot(t, mustNext(t, subscription), Full, 2)
}

func TestPayloadValidationRequiresJSONObject(t *testing.T) {
	for _, payload := range []json.RawMessage{
		json.RawMessage(`{"value":`),
		json.RawMessage(`[]`),
		json.RawMessage(`null`),
	} {
		if err := validatePayload(payload, MaxPayloadBytes); !errors.Is(err, ErrInvalidPayload) {
			t.Fatalf("payload %s error = %v", payload, err)
		}
	}
	for _, payload := range []json.RawMessage{
		json.RawMessage(`{"raw":{"source":"typed-constructor-owned"}}`),
		json.RawMessage(`{"vehicles":[{"driverName":"Private Driver"}]}`),
		json.RawMessage(`{}`),
	} {
		if err := validatePayload(payload, MaxPayloadBytes); err != nil {
			t.Fatalf("payload %s error = %v", payload, err)
		}
	}
}

func TestPublisherGapAcceptsFull(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 1, 1, Full, 1, map[string]any{"speed": 1}),
		nil,
	); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 1, 4, Full, 1, map[string]any{"speed": 4}),
		nil,
	); err != nil {
		t.Fatalf("full after publisher gap: %v", err)
	}
	subscription := mustSubscribe(t, hub)
	_ = mustNext(t, subscription)
	assertSnapshot(t, mustNext(t, subscription), Full, 4)
}

func TestUnknownProjectionVersionIsRejected(t *testing.T) {
	hub := NewHub(HubConfig{
		Product:  ProductOverlay,
		Versions: projection.VersionPolicy{Current: 2, MinimumSupported: 1},
	})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	future := mustSnapshot(t, 1, 1, Full, 1, map[string]any{"speed": 1})
	future.ProjectionVersion = 3
	if err := hub.PublishSnapshot(future, nil); !errors.Is(err, projection.ErrUnknownProjectionVersion) {
		t.Fatalf("future version error = %v", err)
	}
}

func TestStatusIsLowRateAndIndependentFromSnapshotSequence(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "connecting"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 2, 10, Full, 1, map[string]any{"speed": 1}),
		nil,
	); err != nil {
		t.Fatal(err)
	}
	subscription := mustSubscribe(t, hub)
	assertEventKind(t, mustNext(t, subscription), EventStatus)
	assertSnapshot(t, mustNext(t, subscription), Full, 10)

	if err := hub.PublishStatus(mustStatus(t, 2, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	assertEventKind(t, mustNext(t, subscription), EventStatus)
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 2, 11, Full, 2, map[string]any{"speed": 2}),
		nil,
	); err != nil {
		t.Fatal(err)
	}
	assertSnapshot(t, mustNext(t, subscription), Full, 11)
}

func TestStatusRevisionGapIsAccepted(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "connecting"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishStatus(mustStatus(t, 4, map[string]any{"state": "live"})); err != nil {
		t.Fatalf("status revision gap: %v", err)
	}
	if err := hub.PublishStatus(mustStatus(t, 3, map[string]any{"state": "connecting"})); !errors.Is(err, ErrStatusRevision) {
		t.Fatalf("retrograde status revision error = %v, want %v", err, ErrStatusRevision)
	}

	subscription := mustSubscribe(t, hub)
	event := mustNext(t, subscription)
	var retained StatusEnvelope
	if err := json.Unmarshal(event.Data, &retained); err != nil {
		t.Fatal(err)
	}
	if retained.StatusRevision != 4 {
		t.Fatalf("retained status revision = %d, want 4", retained.StatusRevision)
	}
}

func TestLateJoinNeverPairsNewStatusWithOldSnapshot(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "connecting"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 2, 10, Full, 1, map[string]any{"speed": 1}),
		nil,
	); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishStatus(mustStatus(t, 2, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}

	subscription := mustSubscribe(t, hub)
	assertEventKind(t, mustNext(t, subscription), EventStatus)
	waitCtx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := subscription.Next(waitCtx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Next before matching full error = %v, want deadline", err)
	}

	if err := hub.PublishSnapshot(
		mustSnapshot(t, 2, 11, Full, 2, map[string]any{"speed": 2}),
		nil,
	); err != nil {
		t.Fatal(err)
	}
	assertSnapshot(t, mustNext(t, subscription), Full, 11)
}

func TestExportedSnapshotConstructorsAreProductTyped(t *testing.T) {
	// R6a.1: NewOverlayFull esta retirado; solo queda el constructor
	// tipado de Strategy. La garantia de tipado por producto se conserva
	// sobre el unico constructor exportado vivo.
	signature := reflect.TypeOf(NewStrategyFull)
	if got := signature.In(2); got != reflect.TypeFor[strategy.PayloadV1]() {
		t.Fatalf("constructor payload = %v, want %v", got, reflect.TypeFor[strategy.PayloadV1]())
	}
}

func TestTypedSnapshotConstructorRejectsInvalidMetadata(t *testing.T) {
	_, err := NewStrategyFull(
		projection.Metadata{
			ProjectionVersion: strategy.VersionV1,
			Epoch:             1,
			Sequence:          0,
			CapturedAt:        "2026-07-29T10:00:00Z",
		},
		1,
		strategy.PayloadV1{},
	)
	if !errors.Is(err, ErrInvalidEnvelope) {
		t.Fatalf("constructor error = %v, want %v", err, ErrInvalidEnvelope)
	}
}

func TestFourProductHubsRemainIsolated(t *testing.T) {
	products := []ProductID{
		ProductOverlay,
		ProductEngineer,
		ProductStrategy,
		ProductAnalysis,
	}
	hubs := make(map[ProductID]*Hub, len(products))
	for _, product := range products {
		hub := NewHub(HubConfig{Product: product})
		if err := hub.PublishStatus(mustProductStatus(t, product, 1)); err != nil {
			t.Fatalf("%s status: %v", product, err)
		}
		frame := mustProductSnapshot(t, product, 1, 1, Full, 1, map[string]any{"value": product})
		if err := hub.PublishSnapshot(frame, nil); err != nil {
			t.Fatalf("%s snapshot: %v", product, err)
		}
		hubs[product] = hub
	}

	for _, product := range products {
		hub := hubs[product]
		other := ProductOverlay
		if product == ProductOverlay {
			other = ProductEngineer
		}
		if err := hub.PublishSnapshot(
			mustProductSnapshot(t, other, 1, 2, Full, 1, map[string]any{"value": other}),
			nil,
		); !errors.Is(err, ErrProductMismatch) {
			t.Fatalf("%s accepted %s snapshot: %v", product, other, err)
		}
		subscription := mustSubscribe(t, hub)
		status := mustNext(t, subscription)
		snapshot := mustNext(t, subscription)
		if status.Product != product || snapshot.Product != product {
			t.Fatalf("%s events escaped as %s/%s", product, status.Product, snapshot.Product)
		}
		if got := EventName(product, EventSnapshot); got !=
			"telemetry:"+string(product)+":projection" {
			t.Fatalf("%s event name = %q", product, got)
		}
		if got := ProjectionRoute(product); got !=
			"/telemetry/"+string(product)+"/projection" {
			t.Fatalf("%s route = %q", product, got)
		}
	}
}

func TestEpochMustAdvanceAndRestartAtSequenceOne(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 5, 10, Full, 1, map[string]any{"value": 1}),
		nil,
	); err != nil {
		t.Fatal(err)
	}
	for _, cursor := range []schema.Cursor{
		{Epoch: 4, Sequence: 1},
		{Epoch: 5, Sequence: 9},
		{Epoch: 6, Sequence: 2},
	} {
		err := hub.PublishSnapshot(
			mustSnapshot(t, cursor.Epoch, cursor.Sequence, Full, 1, map[string]any{"value": 2}),
			nil,
		)
		if !errors.Is(err, ErrSequenceGap) {
			t.Fatalf("cursor %d/%d error = %v", cursor.Epoch, cursor.Sequence, err)
		}
	}
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 6, 1, Full, 1, map[string]any{"value": 3}),
		nil,
	); err != nil {
		t.Fatalf("higher epoch sequence one: %v", err)
	}
}

func TestSlowWailsConsumerDoesNotBlockPublisherAndResyncsFull(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(mustSnapshot(t, 1, 1, Full, 1, map[string]any{"v": 1}), nil); err != nil {
		t.Fatal(err)
	}

	emitter := newBlockingEmitter()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- ServeWails(ctx, hub, emitter)
	}()
	emitter.waitBlocked(t)

	for sequence := schema.Sequence(2); sequence <= 100; sequence++ {
		full := mustSnapshot(t, 1, sequence, Full, 1, map[string]any{"v": sequence})
		if err := hub.PublishSnapshot(full, nil); err != nil {
			t.Fatalf("publish %d: %v", sequence, err)
		}
	}
	emitter.release()
	emitter.waitSnapshots(t, 1)
	if got := emitter.lastSnapshot(); got.Kind != Full || got.Sequence != 100 {
		t.Fatalf("last Wails snapshot = %s %d, want full 100", got.Kind, got.Sequence)
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("ServeWails error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("ServeWails did not stop after cancellation")
	}
}

func TestSSEAndWailsPublishIdenticalJSONAndSSELifecycle(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(mustSnapshot(t, 1, 1, Full, 1, map[string]any{"speed": 4}), nil); err != nil {
		t.Fatal(err)
	}

	emitter := &captureEmitter{events: make(chan capturedEvent, 4)}
	wailsCtx, cancelWails := context.WithCancel(context.Background())
	wailsDone := make(chan error, 1)
	go func() { wailsDone <- ServeWails(wailsCtx, hub, emitter) }()
	wailsStatus := <-emitter.events
	wailsSnapshot := <-emitter.events
	if wailsStatus.name != EventName(ProductOverlay, EventStatus) ||
		wailsSnapshot.name != EventName(ProductOverlay, EventSnapshot) {
		t.Fatalf("Wails event order = %q, %q", wailsStatus.name, wailsSnapshot.name)
	}

	requestCtx, cancelRequest := context.WithCancel(context.Background())
	request := httptest.NewRequest(
		http.MethodGet,
		ProjectionRoute(ProductOverlay),
		nil,
	).WithContext(requestCtx)
	request.RemoteAddr = "127.0.0.1:45678"
	writer := newStreamingRecorder()
	sseDone := make(chan struct{})
	go func() {
		SSEHandler(hub).ServeHTTP(writer, request)
		close(sseDone)
	}()
	writer.waitEvents(t, 2)
	sseEvents := writer.events()
	if sseEvents[0].name != wailsStatus.name ||
		sseEvents[1].name != wailsSnapshot.name ||
		!bytes.Equal(sseEvents[0].data, wailsStatus.data) ||
		!bytes.Equal(sseEvents[1].data, wailsSnapshot.data) {
		t.Fatalf(
			"SSE and Wails events differ:\nSSE=%q %s\nWails=%q %s",
			sseEvents[1].name,
			sseEvents[1].data,
			wailsSnapshot.name,
			wailsSnapshot.data,
		)
	}

	cancelRequest()
	select {
	case <-sseDone:
	case <-time.After(time.Second):
		t.Fatal("SSE handler did not stop after request cancellation")
	}
	cancelWails()
	<-wailsDone
}

func TestSubscriberLimitLoopbackRoutesAndConcurrentClose(t *testing.T) {
	limited := NewHub(HubConfig{Product: ProductOverlay, MaxSubscribers: 1})
	first := mustSubscribe(t, limited)
	if _, err := limited.Subscribe(context.Background()); !errors.Is(err, ErrSubscriberLimit) {
		t.Fatalf("second subscription error = %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}

	if !isLoopback("[::1]:45678") || !isLoopback("127.0.0.1:45678") {
		t.Fatal("valid IPv4/IPv6 loopback rejected")
	}
	if isLoopback("192.0.2.1:45678") {
		t.Fatal("non-loopback accepted")
	}

	hub := NewHub(HubConfig{Product: ProductOverlay})
	nonLoopback := httptest.NewRequest(
		http.MethodGet,
		ProjectionRoute(ProductOverlay),
		nil,
	)
	nonLoopback.RemoteAddr = "192.0.2.1:45678"
	recorder := httptest.NewRecorder()
	SSEHandler(hub).ServeHTTP(recorder, nonLoopback)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("non-loopback status = %d", recorder.Code)
	}
	wrongRoute := httptest.NewRequest(http.MethodGet, "/telemetry/engineer/projection", nil)
	wrongRoute.RemoteAddr = "127.0.0.1:45678"
	recorder = httptest.NewRecorder()
	SSEHandler(hub).ServeHTTP(recorder, wrongRoute)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("wrong product route status = %d", recorder.Code)
	}

	closeHub := NewHub(HubConfig{Product: ProductOverlay, MaxSubscribers: MaxSubscribers})
	subscriptions := make([]*Subscription, 0, MaxSubscribers)
	for range MaxSubscribers {
		subscriptions = append(subscriptions, mustSubscribe(t, closeHub))
	}
	var wait sync.WaitGroup
	wait.Add(len(subscriptions) + 1)
	for _, subscription := range subscriptions {
		go func(subscription *Subscription) {
			defer wait.Done()
			_ = subscription.Close()
		}(subscription)
	}
	go func() {
		defer wait.Done()
		_ = closeHub.Close()
	}()
	wait.Wait()
	if _, err := closeHub.Subscribe(context.Background()); !errors.Is(err, ErrClosed) {
		t.Fatalf("subscribe after close error = %v", err)
	}
}

func TestHubMetricsStayBoundedAndContainNoPayload(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay, MaxSubscribers: 6, MaxPayloadBytes: 1024})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	first := mustSnapshot(t, 1, 1, Full, 1, map[string]any{"driverName": "Private Driver"})
	if err := hub.PublishSnapshot(first, nil); err != nil {
		t.Fatal(err)
	}
	second := mustSnapshot(t, 1, 2, Full, 1, map[string]any{"driverName": "Private Driver"})
	if err := hub.PublishSnapshot(second, nil); err != nil {
		t.Fatal(err)
	}
	subscription := mustSubscribe(t, hub)

	metrics := hub.Metrics()
	if metrics.CurrentSubscribers != 1 || metrics.MaxSubscribers != 6 ||
		metrics.MaxPayloadBytes != 1024 || metrics.StatusPublications != 1 ||
		metrics.SnapshotPublications != 2 || metrics.SnapshotReplacements != 1 {
		t.Fatalf("metrics = %#v", metrics)
	}
	encoded, err := json.Marshal(metrics)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encoded, []byte("Private Driver")) || bytes.Contains(encoded, first.Payload) {
		t.Fatalf("metrics leaked payload: %s", encoded)
	}
	if err := subscription.Close(); err != nil {
		t.Fatal(err)
	}
	if current := hub.Metrics().CurrentSubscribers; current != 0 {
		t.Fatalf("subscribers after close = %d", current)
	}
}

func FuzzTransportEnvelopeValidationNeverPanics(f *testing.F) {
	f.Add([]byte(`{"speed":50,"vehicles":[]}`))
	f.Add([]byte(`{"raw":{"driverName":"private"}}`))
	f.Add([]byte(`{"nested":[[[[{"value":1}]]]]}`))
	f.Fuzz(func(t *testing.T, payload []byte) {
		frame := Envelope{
			Product:           ProductOverlay,
			ProjectionVersion: 1,
			Epoch:             1,
			Sequence:          1,
			Kind:              Full,
			CapturedAt:        "2026-08-01T12:00:00Z",
			StatusRevision:    1,
			Payload:           append(json.RawMessage(nil), payload...),
		}
		if err := validateEnvelope(frame, MaxPayloadBytes); err == nil {
			if !json.Valid(payload) || len(payload) > MaxPayloadBytes {
				t.Fatalf("accepted invalid payload of %d bytes", len(payload))
			}
		}
	})
}

func BenchmarkHubPublishSnapshot(b *testing.B) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(b, 1, map[string]any{"state": "live"})); err != nil {
		b.Fatal(err)
	}
	payload := map[string]any{"vehicles": make([]map[string]any, 64)}
	for index := range payload["vehicles"].([]map[string]any) {
		payload["vehicles"].([]map[string]any)[index] = map[string]any{"id": index, "speed": index}
	}
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		full := mustSnapshot(b, 1, schema.Sequence(index+1), Full, 1, payload)
		if err := hub.PublishSnapshot(full, nil); err != nil {
			b.Fatal(err)
		}
	}
}

type testingTB interface {
	Helper()
	Fatal(args ...any)
}

func mustSnapshot(
	t testingTB,
	epoch schema.Epoch,
	sequence schema.Sequence,
	kind SnapshotKind,
	statusRevision uint64,
	payload any,
) Envelope {
	return mustProductSnapshot(t, ProductOverlay, epoch, sequence, kind, statusRevision, payload)
}

func mustProductSnapshot(
	t testingTB,
	product ProductID,
	epoch schema.Epoch,
	sequence schema.Sequence,
	kind SnapshotKind,
	statusRevision uint64,
	payload any,
) Envelope {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	result := Envelope{
		Product:           product,
		ProjectionVersion: 1,
		Epoch:             epoch,
		Sequence:          sequence,
		Kind:              kind,
		CapturedAt:        "2026-07-29T10:00:00Z",
		StatusRevision:    statusRevision,
		Payload:           encoded,
	}
	return result
}

func mustStatus(t testingTB, revision uint64, payload any) StatusEnvelope {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	result := StatusEnvelope{
		Product:        ProductOverlay,
		StatusRevision: revision,
		CapturedAt:     "2026-07-29T10:00:00Z",
		Payload:        encoded,
	}
	return result
}

func mustProductStatus(t testingTB, product ProductID, revision uint64) StatusEnvelope {
	t.Helper()
	result := mustStatus(t, revision, map[string]any{"state": "live"})
	result.Product = product
	return result
}

func mustSubscribe(t testingTB, hub *Hub) *Subscription {
	t.Helper()
	subscription, err := hub.Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return subscription
}

func mustNext(t testingTB, subscription *Subscription) Event {
	t.Helper()
	event, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return event
}

func assertEventKind(t *testing.T, event Event, kind EventKind) {
	t.Helper()
	if event.Kind != kind {
		t.Fatalf("event kind = %q, want %q", event.Kind, kind)
	}
}

func assertSnapshot(t *testing.T, event Event, kind SnapshotKind, sequence schema.Sequence) {
	t.Helper()
	assertEventKind(t, event, EventSnapshot)
	var frame Envelope
	if err := json.Unmarshal(event.Data, &frame); err != nil {
		t.Fatal(err)
	}
	if frame.Kind != kind || frame.Sequence != sequence {
		t.Fatalf("snapshot = %s %d, want %s %d", frame.Kind, frame.Sequence, kind, sequence)
	}
}

func jsonEqual(left, right []byte) bool {
	var leftValue any
	var rightValue any
	return json.Unmarshal(left, &leftValue) == nil &&
		json.Unmarshal(right, &rightValue) == nil &&
		jsonValuesEqual(leftValue, rightValue)
}

func jsonValuesEqual(left, right any) bool {
	leftJSON, _ := json.Marshal(left)
	rightJSON, _ := json.Marshal(right)
	return bytes.Equal(leftJSON, rightJSON)
}

type capturedEvent struct {
	name string
	data []byte
}

type captureEmitter struct {
	events chan capturedEvent
}

func (emitter *captureEmitter) Emit(name string, data any) {
	encoded, _ := json.Marshal(data)
	emitter.events <- capturedEvent{name: name, data: encoded}
}

type blockingEmitter struct {
	once      sync.Once
	blocked   chan struct{}
	releaseCh chan struct{}
	mu        sync.Mutex
	snapshots []Envelope
	snapshot  chan struct{}
}

func newBlockingEmitter() *blockingEmitter {
	return &blockingEmitter{
		blocked:   make(chan struct{}),
		releaseCh: make(chan struct{}),
		snapshots: make([]Envelope, 0, 2),
		snapshot:  make(chan struct{}, 2),
	}
}

func (emitter *blockingEmitter) Emit(name string, data any) {
	if name == EventName(ProductOverlay, EventStatus) {
		emitter.once.Do(func() {
			close(emitter.blocked)
			<-emitter.releaseCh
		})
		return
	}
	encoded, _ := json.Marshal(data)
	var frame Envelope
	_ = json.Unmarshal(encoded, &frame)
	emitter.mu.Lock()
	emitter.snapshots = append(emitter.snapshots, frame)
	emitter.mu.Unlock()
	select {
	case emitter.snapshot <- struct{}{}:
	default:
	}
}

func (emitter *blockingEmitter) waitBlocked(t *testing.T) {
	t.Helper()
	select {
	case <-emitter.blocked:
	case <-time.After(time.Second):
		t.Fatal("emitter did not block")
	}
}

func (emitter *blockingEmitter) release() {
	close(emitter.releaseCh)
}

func (emitter *blockingEmitter) waitSnapshots(t *testing.T, count int) {
	t.Helper()
	for seen := 0; seen < count; seen++ {
		select {
		case <-emitter.snapshot:
		case <-time.After(time.Second):
			emitter.mu.Lock()
			got := len(emitter.snapshots)
			emitter.mu.Unlock()
			t.Fatalf("got %d snapshots, want %d", got, count)
		}
	}
	emitter.mu.Lock()
	got := len(emitter.snapshots)
	emitter.mu.Unlock()
	if got < count {
		t.Fatalf("got %d snapshots, want %d", got, count)
	}
}

func (emitter *blockingEmitter) lastSnapshot() Envelope {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return emitter.snapshots[len(emitter.snapshots)-1]
}

type sseEvent struct {
	name string
	data []byte
}

type streamingRecorder struct {
	header http.Header
	mu     sync.Mutex
	buffer bytes.Buffer
	notify chan struct{}
}

func newStreamingRecorder() *streamingRecorder {
	return &streamingRecorder{
		header: make(http.Header),
		notify: make(chan struct{}, 8),
	}
}

func (writer *streamingRecorder) Header() http.Header { return writer.header }
func (writer *streamingRecorder) WriteHeader(int)     {}
func (writer *streamingRecorder) Write(data []byte) (int, error) {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	count, err := writer.buffer.Write(data)
	select {
	case writer.notify <- struct{}{}:
	default:
	}
	return count, err
}
func (writer *streamingRecorder) Flush() {}

func (writer *streamingRecorder) events() []sseEvent {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	lines := bytes.Split(writer.buffer.Bytes(), []byte("\n"))
	result := make([]sseEvent, 0, 2)
	var current sseEvent
	for _, line := range lines {
		switch {
		case bytes.HasPrefix(line, []byte("event: ")):
			current.name = string(bytes.TrimPrefix(line, []byte("event: ")))
		case bytes.HasPrefix(line, []byte("data: ")):
			current.data = append([]byte(nil), bytes.TrimPrefix(line, []byte("data: "))...)
		case len(line) == 0 && current.name != "":
			result = append(result, current)
			current = sseEvent{}
		}
	}
	return result
}

func (writer *streamingRecorder) waitEvents(t *testing.T, count int) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		if len(writer.events()) >= count {
			return
		}
		select {
		case <-writer.notify:
		case <-deadline:
			t.Fatalf("got %d SSE events, want %d", len(writer.events()), count)
		}
	}
}
