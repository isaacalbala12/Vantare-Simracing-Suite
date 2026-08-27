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

func TestPublisherOverlayPullAndSSEUseIdenticalEventContract(t *testing.T) {
	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if err := publisher.PublishSnapshot(5, map[string]any{"revision": 5, "frame": map[string]any{"contract": 2}}); err != nil {
		t.Fatal(err)
	}
	pull := NewOverlayPullTransport(NewHub(HubConfig{Product: ProductOverlay}), registry)
	defer pull.CloseAll()
	response, deliver, err := pull.Pull("overlay-window", OverlayPullRequest{SessionID: "contract", Ack: 0})
	if err != nil || !deliver {
		t.Fatalf("Overlay pull response = %#v, deliver=%v, err=%v", response, deliver, err)
	}
	var pullEvent OverlayPullEvent
	for _, event := range response.Events {
		if event.Name == PublisherEventName(ProductOverlayV2, PublisherEventSnapshot) {
			pullEvent = event
			break
		}
	}
	if pullEvent.Name == "" {
		t.Fatalf("Overlay pull events = %#v", response.Events)
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
	if sseEvent.name != pullEvent.Name || !bytes.Equal(sseEvent.data, pullEvent.Data) {
		t.Fatalf("SSE=%q %s pull=%q %s", sseEvent.name, sseEvent.data, pullEvent.Name, pullEvent.Data)
	}
	cancelRequest()
	select {
	case <-sseDone:
	case <-time.After(time.Second):
		t.Fatal("Publisher SSE did not stop")
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
