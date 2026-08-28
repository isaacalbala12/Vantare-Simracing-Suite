package telemetrytransport

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestOverlayPullSlowConsumerKeepsOneDeliveryInFlightAndLatestWins(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(
		mustSnapshot(t, 1, 1, Full, 1, map[string]any{"sequence": 1}),
		nil,
	); err != nil {
		t.Fatal(err)
	}
	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	transport := NewOverlayPullTransport(hub, registry)

	if _, active := registry.Lookup(ProductOverlayV2); active {
		t.Fatal("overlay v2 publisher active before an overlay consumer requested telemetry")
	}

	first, deliver, err := transport.Pull("overlay-window", OverlayPullRequest{
		SessionID: "session-1",
		Ack:       0,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !deliver || first.Delivery != 1 || first.SessionID != "session-1" {
		t.Fatalf("first response = %#v, deliver=%v", first, deliver)
	}
	if _, active := registry.Lookup(ProductOverlayV2); !active {
		t.Fatal("overlay v2 publisher inactive while an overlay consumer is active")
	}
	assertPullEventContains(t, first.Events, EventName(ProductOverlay, EventSnapshot), `"sequence":1`)

	// The WebView has not acknowledged delivery 1. Publishing many newer
	// frames must not create another response or queue every intermediate
	// payload behind ExecuteScript.
	for sequence := schema.Sequence(2); sequence <= 100; sequence++ {
		if err := hub.PublishSnapshot(
			mustSnapshot(t, 1, sequence, Full, 1, map[string]any{"sequence": sequence}),
			nil,
		); err != nil {
			t.Fatal(err)
		}
		publisher, active := registry.Lookup(ProductOverlayV2)
		if !active {
			t.Fatal("overlay v2 publisher disappeared while consumer is active")
		}
		if err := publisher.PublishSnapshot(uint64(sequence), map[string]any{"revision": sequence}); err != nil {
			t.Fatal(err)
		}
		if response, duplicate, pullErr := transport.Pull("overlay-window", OverlayPullRequest{
			SessionID: "session-1",
			Ack:       0,
		}); pullErr != nil || duplicate {
			t.Fatalf("unacknowledged pull = %#v, deliver=%v, err=%v", response, duplicate, pullErr)
		}
	}

	latest, deliver, err := transport.Pull("overlay-window", OverlayPullRequest{
		SessionID: "session-1",
		Ack:       first.Delivery,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !deliver || latest.Delivery != 2 {
		t.Fatalf("latest response = %#v, deliver=%v", latest, deliver)
	}
	assertPullEventContains(t, latest.Events, EventName(ProductOverlay, EventSnapshot), `"sequence":100`)
	assertPullEventContains(t, latest.Events, PublisherEventName(ProductOverlayV2, PublisherEventSnapshot), `"revision":100`)
	assertPullEventNotContains(t, latest.Events, `"sequence":99`)
	assertPullEventNotContains(t, latest.Events, `"revision":99`)

	transport.Close("overlay-window", "another-session")
	if _, active := registry.Lookup(ProductOverlayV2); !active {
		t.Fatal("stale cleanup released the active overlay session")
	}
	transport.Close("overlay-window", "session-1")
	if _, active := registry.Lookup(ProductOverlayV2); active {
		t.Fatal("overlay v2 publisher survived after the overlay consumer closed")
	}
}

func TestOverlayPullDoesNotDeliverWithoutAConsumerOrForInvalidRequests(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	transport := NewOverlayPullTransport(hub, registry)

	for _, testCase := range []struct {
		name   string
		sender string
		input  OverlayPullRequest
	}{
		{name: "missing sender", input: OverlayPullRequest{SessionID: "session", Ack: 0}},
		{name: "missing session", sender: "overlay-window", input: OverlayPullRequest{Ack: 0}},
		{name: "oversized session", sender: "overlay-window", input: OverlayPullRequest{SessionID: string(bytes.Repeat([]byte("x"), 129)), Ack: 0}},
		{name: "new session cannot acknowledge", sender: "overlay-window", input: OverlayPullRequest{SessionID: "session", Ack: 7}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			response, deliver, err := transport.Pull(testCase.sender, testCase.input)
			if err != nil {
				t.Fatal(err)
			}
			if deliver || response.Delivery != 0 {
				t.Fatalf("invalid request delivered %#v", response)
			}
		})
	}
	if _, active := registry.Lookup(ProductOverlayV2); active {
		t.Fatal("invalid requests activated overlay v2")
	}
	if _, deliver, err := NewOverlayPullTransport(nil, nil).Pull(
		"overlay-window",
		OverlayPullRequest{SessionID: "session", Ack: 0},
	); err != nil || deliver {
		t.Fatalf("missing dependencies delivered=%v, err=%v", deliver, err)
	}
}

func TestOverlayPullLateConsumerReceivesV2StatusWithoutSnapshot(t *testing.T) {
	t.Parallel()

	hub := NewHub(HubConfig{Product: ProductOverlay})
	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	if err := registry.PublishStatus(ProductOverlayV2, 3, map[string]any{
		"revision": 3,
		"source":   map[string]any{"state": "stopped"},
		"frame":    nil,
	}); err != nil {
		t.Fatal(err)
	}
	transport := NewOverlayPullTransport(hub, registry)
	defer transport.CloseAll()

	response, deliver, err := transport.Pull("studio-window", OverlayPullRequest{
		SessionID: "late-studio",
		Ack:       0,
	})
	if err != nil || !deliver {
		t.Fatalf("late pull = %#v, deliver=%v, err=%v", response, deliver, err)
	}
	assertPullEventContains(t, response.Events, PublisherEventName(ProductOverlayV2, PublisherEventStatus), `"stopped"`)
	assertPullEventNotContains(t, response.Events, `"contract":2`)
}

func TestOverlayPullDoesNotDeliverEmptyEventsAndPicksUpTheNextChange(t *testing.T) {
	hub := NewHub(HubConfig{Product: ProductOverlay})
	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	if err := registry.PublishStatus(ProductOverlayV2, 1, map[string]any{
		"revision": 1,
		"source":   map[string]any{"state": "stale"},
		"frame":    nil,
	}); err != nil {
		t.Fatal(err)
	}
	transport := NewOverlayPullTransport(hub, registry)
	defer transport.CloseAll()

	first, deliver, err := transport.Pull("studio-window", OverlayPullRequest{
		SessionID: "stale-studio",
		Ack:       0,
	})
	if err != nil || !deliver || first.Delivery != 1 || len(first.Events) != 1 {
		t.Fatalf("first pull = %#v, deliver=%v, err=%v", first, deliver, err)
	}

	empty, deliver, err := transport.Pull("studio-window", OverlayPullRequest{
		SessionID: "stale-studio",
		Ack:       first.Delivery,
	})
	if err != nil || deliver || empty.Delivery != 0 || len(empty.Events) != 0 {
		t.Fatalf("unchanged pull = %#v, deliver=%v, err=%v", empty, deliver, err)
	}

	if err := registry.PublishStatus(ProductOverlayV2, 2, map[string]any{
		"revision": 2,
		"source":   map[string]any{"state": "live"},
		"frame":    nil,
	}); err != nil {
		t.Fatal(err)
	}
	next, deliver, err := transport.Pull("studio-window", OverlayPullRequest{
		SessionID: "stale-studio",
		Ack:       first.Delivery,
	})
	if err != nil || !deliver || next.Delivery != 2 {
		t.Fatalf("changed pull = %#v, deliver=%v, err=%v", next, deliver, err)
	}
	assertPullEventContains(t, next.Events, PublisherEventName(ProductOverlayV2, PublisherEventStatus), `"live"`)
}

func assertPullEventContains(t *testing.T, events []OverlayPullEvent, name, fragment string) {
	t.Helper()
	for _, event := range events {
		if event.Name == name && bytes.Contains(event.Data, []byte(fragment)) {
			return
		}
	}
	encoded, _ := json.Marshal(events)
	t.Fatalf("event %q containing %q not found in %s", name, fragment, encoded)
}

func assertPullEventNotContains(t *testing.T, events []OverlayPullEvent, fragment string) {
	t.Helper()
	for _, event := range events {
		if bytes.Contains(event.Data, []byte(fragment)) {
			t.Fatalf("unexpected %q in event %q: %s", fragment, event.Name, event.Data)
		}
	}
}
