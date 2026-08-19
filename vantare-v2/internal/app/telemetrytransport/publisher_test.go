package telemetrytransport

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPublisherIsInstantiatedOnlyForActiveConsumers(t *testing.T) {
	t.Parallel()

	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	if _, ok := registry.Lookup(ProductOverlayV2); ok {
		t.Fatal("publisher exists before a consumer is registered")
	}
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	if current, ok := registry.Lookup(ProductOverlayV2); !ok || current != publisher {
		t.Fatal("active consumer did not instantiate its publisher")
	}
	release()
	if _, ok := registry.Lookup(ProductOverlayV2); ok {
		t.Fatal("publisher survived after its last consumer stopped")
	}
}

func TestPublisherReplaySnapshotServesLateJoiner(t *testing.T) {
	t.Parallel()

	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	want := map[string]any{"revision": 7, "frame": map[string]any{"contract": 2}}
	if err := publisher.PublishSnapshot(7, want); err != nil {
		t.Fatal(err)
	}
	replay, ok := publisher.ReplaySnapshot()
	if !ok || replay.Kind != PublisherEventSnapshot || !bytes.Contains(replay.Data, []byte(`"contract":2`)) {
		t.Fatalf("ReplaySnapshot = %#v, %v", replay, ok)
	}
	late, err := publisher.Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer late.Close()
	event, err := late.Next(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if event.Kind != PublisherEventSnapshot || !bytes.Equal(event.Data, replay.Data) {
		t.Fatalf("late join event = %#v, replay = %#v", event, replay)
	}
}

func TestPublisherDropsAndCountsOversizedFrame(t *testing.T) {
	t.Parallel()

	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2, MaxPayloadBytes: 64})
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	err = publisher.PublishSnapshot(1, map[string]any{"frame": strings.Repeat("x", 128)})
	if !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("oversized error = %v", err)
	}
	metrics := publisher.Metrics()
	if metrics.DroppedFrames != 1 || metrics.SnapshotPublications != 0 {
		t.Fatalf("metrics after drop = %#v", metrics)
	}
	if _, ok := publisher.ReplaySnapshot(); ok {
		t.Fatal("oversized frame was retained")
	}
}

func TestPublisherAcceptsGreaterNonContiguousDeliveryRevision(t *testing.T) {
	t.Parallel()

	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if err := publisher.PublishSnapshot(1, map[string]any{"revision": 1}); err != nil {
		t.Fatal(err)
	}
	if err := publisher.PublishSnapshot(99, map[string]any{"revision": 99}); err != nil {
		t.Fatalf("non-contiguous greater revision: %v", err)
	}
	if err := publisher.PublishSnapshot(98, map[string]any{"revision": 98}); !errors.Is(err, ErrDeliveryRevision) {
		t.Fatalf("regressed revision error = %v", err)
	}
}

func TestPublisherWailsAndSSEUseIdenticalEventContract(t *testing.T) {
	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	emitter := &captureEmitter{events: make(chan capturedEvent, 2)}
	wailsContext, cancelWails := context.WithCancel(context.Background())
	wailsDone := make(chan error, 1)
	go func() {
		wailsDone <- ServeWailsPublisher(wailsContext, registry, ProductOverlayV2, emitter)
	}()
	if err := publisher.PublishSnapshot(5, map[string]any{"revision": 5, "frame": map[string]any{"contract": 2}}); err != nil {
		t.Fatal(err)
	}
	wailsEvent := <-emitter.events
	if wailsEvent.name != "telemetry:overlay-v2:snapshot" {
		t.Fatalf("Wails event = %q", wailsEvent.name)
	}

	requestContext, cancelRequest := context.WithCancel(context.Background())
	request := httptest.NewRequest(http.MethodGet, PublisherProjectionRoute(ProductOverlayV2), nil).WithContext(requestContext)
	request.RemoteAddr = "127.0.0.1:45678"
	writer := newStreamingRecorder()
	sseDone := make(chan struct{})
	go func() {
		PublisherSSEHandler(registry, ProductOverlayV2).ServeHTTP(writer, request)
		close(sseDone)
	}()
	writer.waitEvents(t, 1)
	sseEvent := writer.events()[0]
	if sseEvent.name != wailsEvent.name || !bytes.Equal(sseEvent.data, wailsEvent.data) {
		t.Fatalf("SSE=%q %s Wails=%q %s", sseEvent.name, sseEvent.data, wailsEvent.name, wailsEvent.data)
	}
	cancelRequest()
	select {
	case <-sseDone:
	case <-time.After(time.Second):
		t.Fatal("Publisher SSE did not stop")
	}
	cancelWails()
	if err := <-wailsDone; !errors.Is(err, context.Canceled) && !errors.Is(err, ErrClosed) {
		t.Fatalf("ServeWailsPublisher error = %v", err)
	}
}

func mustPublisherRegistry(t *testing.T, config PublisherConfig) *PublisherRegistry {
	t.Helper()
	registry, err := NewPublisherRegistry(config)
	if err != nil {
		t.Fatal(err)
	}
	return registry
}
