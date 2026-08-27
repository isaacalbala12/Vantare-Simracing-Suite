package telemetrytransport

import (
	"bytes"
	"encoding/json"
	"sync"
)

const (
	OverlayPullServiceRoute  = "/_vantare/overlay-telemetry"
	OverlayPullRequestRoute  = OverlayPullServiceRoute + "/pull"
	OverlayPullResponseEvent = "telemetry:overlay:pulled"
	OverlayPullCloseRoute    = OverlayPullServiceRoute + "/close"
	maxOverlayPullSessionID  = 128
)

// OverlayPullRequest acknowledges the last response processed by the
// WebView. Ack zero starts a fresh session. A new response is legal only after
// the previous delivery has been acknowledged.
type OverlayPullRequest struct {
	SessionID string `json:"sessionId"`
	Ack       uint64 `json:"ack"`
}

type OverlayPullEvent struct {
	Name string          `json:"name"`
	Data json.RawMessage `json:"data"`
}

type OverlayPullResponse struct {
	SessionID string             `json:"sessionId"`
	Delivery  uint64             `json:"delivery"`
	Events    []OverlayPullEvent `json:"events"`
}

type overlayPullSession struct {
	id          string
	publisher   *Publisher
	release     func()
	awaitingAck uint64
	next        uint64
	last        map[string]json.RawMessage
}

// OverlayPullTransport converts the retained v1/v2 projections into an
// acknowledged, latest-wins exchange. It does not emit or start goroutines;
// the Wails composition root targets the response to the requesting window.
type OverlayPullTransport struct {
	mu       sync.Mutex
	hub      *Hub
	registry *PublisherRegistry
	sessions map[string]*overlayPullSession
}

func NewOverlayPullTransport(hub *Hub, registry *PublisherRegistry) *OverlayPullTransport {
	return &OverlayPullTransport{
		hub: hub, registry: registry, sessions: make(map[string]*overlayPullSession),
	}
}

// Pull returns at most one response for the acknowledged delivery. Repeated,
// stale or out-of-order requests are ignored, so a slow WebView cannot create
// a second ExecuteScript delivery while the first one remains unprocessed.
func (transport *OverlayPullTransport) Pull(
	sender string,
	request OverlayPullRequest,
) (OverlayPullResponse, bool, error) {
	if transport == nil || transport.hub == nil || transport.registry == nil ||
		sender == "" || request.SessionID == "" || len(request.SessionID) > maxOverlayPullSessionID {
		return OverlayPullResponse{}, false, nil
	}

	transport.mu.Lock()
	defer transport.mu.Unlock()

	session := transport.sessions[sender]
	if session == nil || session.id != request.SessionID {
		if request.Ack != 0 {
			return OverlayPullResponse{}, false, nil
		}
		if session != nil {
			session.release()
		}
		publisher, release, err := transport.registry.RegisterConsumer(ProductOverlayV2)
		if err != nil {
			return OverlayPullResponse{}, false, err
		}
		session = &overlayPullSession{
			id: request.SessionID, publisher: publisher, release: release,
			last: make(map[string]json.RawMessage),
		}
		transport.sessions[sender] = session
	}
	if request.Ack != session.awaitingAck {
		return OverlayPullResponse{}, false, nil
	}

	events, err := transport.currentEvents(session)
	if err != nil {
		return OverlayPullResponse{}, false, err
	}
	session.next++
	session.awaitingAck = session.next
	return OverlayPullResponse{
		SessionID: session.id,
		Delivery:  session.next,
		Events:    events,
	}, true, nil
}

func (transport *OverlayPullTransport) currentEvents(session *overlayPullSession) ([]OverlayPullEvent, error) {
	candidates := make([]OverlayPullEvent, 0, 4)
	if event, ok, err := transport.hub.ReplayStatus(); err != nil {
		return nil, err
	} else if ok {
		candidates = append(candidates, OverlayPullEvent{
			Name: EventName(event.Product, event.Kind), Data: event.Data,
		})
	}
	if event, ok, err := transport.hub.ReplaySnapshot(); err != nil {
		return nil, err
	} else if ok {
		candidates = append(candidates, OverlayPullEvent{
			Name: EventName(event.Product, event.Kind), Data: event.Data,
		})
	}
	if event, ok := session.publisher.ReplayStatus(); ok {
		candidates = append(candidates, OverlayPullEvent{
			Name: PublisherEventName(event.Product, event.Kind), Data: event.Data,
		})
	}
	if event, ok := session.publisher.ReplaySnapshot(); ok {
		candidates = append(candidates, OverlayPullEvent{
			Name: PublisherEventName(event.Product, event.Kind), Data: event.Data,
		})
	}

	changed := make([]OverlayPullEvent, 0, len(candidates))
	for _, event := range candidates {
		if bytes.Equal(session.last[event.Name], event.Data) {
			continue
		}
		data := append(json.RawMessage(nil), event.Data...)
		session.last[event.Name] = data
		changed = append(changed, OverlayPullEvent{Name: event.Name, Data: data})
	}
	return changed, nil
}

// Close releases only the matching frontend generation. This makes cleanup
// safe when React remounts and a delayed close from the old effect arrives
// after the new session has started.
func (transport *OverlayPullTransport) Close(sender, sessionID string) {
	if transport == nil || sender == "" || sessionID == "" {
		return
	}
	transport.mu.Lock()
	defer transport.mu.Unlock()
	session := transport.sessions[sender]
	if session == nil || session.id != sessionID {
		return
	}
	delete(transport.sessions, sender)
	session.release()
}

// CloseSender is the native-window teardown path when JavaScript cannot send
// its normal cleanup event.
func (transport *OverlayPullTransport) CloseSender(sender string) {
	if transport == nil || sender == "" {
		return
	}
	transport.mu.Lock()
	defer transport.mu.Unlock()
	session := transport.sessions[sender]
	if session == nil {
		return
	}
	delete(transport.sessions, sender)
	session.release()
}

// CloseAll releases all consumers during application shutdown.
func (transport *OverlayPullTransport) CloseAll() {
	if transport == nil {
		return
	}
	transport.mu.Lock()
	defer transport.mu.Unlock()
	for sender, session := range transport.sessions {
		delete(transport.sessions, sender)
		session.release()
	}
}
