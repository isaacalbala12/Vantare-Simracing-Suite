package telemetrytransport

import (
	"bytes"
	"encoding/json"
	"sync"
)

const (
	OverlayPullServiceRoute = "/_vantare/overlay-telemetry"
	overlayPullRequestRoute = OverlayPullServiceRoute + "/pull"
	overlayPullCloseRoute   = OverlayPullServiceRoute + "/close"
	maxOverlayPullSessionID = 128
	// A stopped frontend generation can leave one request in flight. Remember
	// a small fixed number so delayed traffic cannot replace the current one.
	maxRetiredOverlayPullSessions = 32
)

// OverlayPullRequest acknowledges the last response processed by the
// WebView. Ack zero starts a fresh session. A new response is legal only after
// the previous delivery has been acknowledged.
type OverlayPullRequest struct {
	Sections  uint8  `json:"sections,omitempty"`
	SessionID string `json:"sessionId"`
	Ack       uint64 `json:"ack"`
}

type OverlayPullEvent struct {
	BaseRevision uint64 `json:"baseRevision,omitempty"`
	sections     *overlaySections
	Name         string          `json:"name"`
	Data         json.RawMessage `json:"data"`
}

type OverlayPullResponse struct {
	SessionID string             `json:"sessionId"`
	Delivery  uint64             `json:"delivery"`
	Events    []OverlayPullEvent `json:"events"`
}

type overlayPullSession struct {
	sections     uint8
	lastSections map[string]*overlaySections
	id           string
	publisher    *Publisher
	release      func()
	awaitingAck  uint64
	next         uint64
	pending      OverlayPullResponse
	last         map[string]json.RawMessage
}

// OverlayPullTransport converts the retained v2 projections into an
// acknowledged, latest-wins exchange. It does not emit or start goroutines;
// the Wails asset server returns the response to the requesting window.
type OverlayPullTransport struct {
	mu       sync.Mutex
	registry *PublisherRegistry
	sessions map[string]*overlayPullSession
	retired  map[string][]string
}

func NewOverlayPullTransport(registry *PublisherRegistry) *OverlayPullTransport {
	return &OverlayPullTransport{
		registry: registry, sessions: make(map[string]*overlayPullSession),
		retired: make(map[string][]string),
	}
}

// Pull returns at most one response for the acknowledged delivery. The single
// pending response is replayed when its HTTP exchange is lost; newer snapshots
// continue to replace each other until that response is acknowledged.
func (transport *OverlayPullTransport) Pull(
	sender string,
	request OverlayPullRequest,
) (OverlayPullResponse, bool, error) {
	if transport == nil || transport.registry == nil ||
		sender == "" || request.SessionID == "" || len(request.SessionID) > maxOverlayPullSessionID {
		return OverlayPullResponse{}, false, nil
	}

	transport.mu.Lock()
	defer transport.mu.Unlock()
	if request.Sections > 1 {
		return OverlayPullResponse{}, false, ErrInvalidPayload
	}

	session := transport.sessions[sender]
	if session == nil || session.id != request.SessionID {
		if request.Ack != 0 {
			return OverlayPullResponse{}, false, nil
		}
		if transport.isRetiredLocked(sender, request.SessionID) {
			return OverlayPullResponse{}, false, nil
		}
		if session != nil {
			transport.retireLocked(sender, session.id)
			session.release()
		}
		publisher, release, err := transport.registry.RegisterConsumer(ProductOverlayV2)
		if err != nil {
			return OverlayPullResponse{}, false, err
		}
		session = &overlayPullSession{
			sections: request.Sections, lastSections: make(map[string]*overlaySections),
			id: request.SessionID, publisher: publisher, release: release,
			last: make(map[string]json.RawMessage),
		}
		transport.sessions[sender] = session
	}
	if session.sections != request.Sections {
		return OverlayPullResponse{}, false, ErrInvalidPayload
	}
	if request.Ack < session.awaitingAck {
		if session.pending.Delivery == session.awaitingAck && request.Ack+1 == session.awaitingAck {
			return cloneOverlayPullResponse(session.pending), true, nil
		}
		return OverlayPullResponse{}, false, nil
	}
	if request.Ack != session.awaitingAck {
		return OverlayPullResponse{}, false, nil
	}
	session.pending = OverlayPullResponse{}

	events := transport.currentEvents(session)
	if len(events) == 0 {
		return OverlayPullResponse{}, false, nil
	}
	session.next++
	session.awaitingAck = session.next
	response := OverlayPullResponse{
		SessionID: session.id,
		Delivery:  session.next,
		Events:    events,
	}
	// Retain our owned replay bytes. Only the caller receives a defensive copy:
	// mutating a returned response must not change pending ACK or dirty state.
	session.pending = response
	return cloneOverlayPullResponse(response), true, nil
}

func (transport *OverlayPullTransport) currentEvents(session *overlayPullSession) []OverlayPullEvent {
	candidates := make([]OverlayPullEvent, 0, 2)
	if event, ok := session.publisher.ReplayStatus(); ok {
		candidates = append(candidates, OverlayPullEvent{
			Name: PublisherEventName(event.Product, event.Kind), Data: event.Data,
		})
	}
	if event, ok := session.publisher.ReplaySnapshot(); ok {
		candidates = append(candidates, OverlayPullEvent{
			Name: PublisherEventName(event.Product, event.Kind), Data: event.Data, sections: event.sections,
		})
	}

	changed := make([]OverlayPullEvent, 0, len(candidates))
	for _, event := range candidates {
		if bytes.Equal(session.last[event.Name], event.Data) {
			continue
		}
		// Publisher replay already gives this session an owned copy. These bytes
		// stay private in last/pending and are never modified by the transport.
		session.last[event.Name] = event.Data
		if session.sections == 1 {
			base, current := session.lastSections[event.Name], event.sections
			if base != nil && current != nil && base.epoch == current.epoch && base.session == current.session && base.revision < current.revision {
				patch := current.difference(base)
				if len(patch) < len(event.Data) {
					event.Data, event.BaseRevision = patch, base.revision
				}
			}
			if current == nil {
				delete(session.lastSections, event.Name)
			} else {
				session.lastSections[event.Name] = current
			}
		}
		changed = append(changed, event)
	}
	return changed
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
		transport.retireLocked(sender, sessionID)
		return
	}
	delete(transport.sessions, sender)
	transport.retireLocked(sender, sessionID)
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
	delete(transport.retired, sender)
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
	clear(transport.retired)
}

func (transport *OverlayPullTransport) isRetiredLocked(sender, sessionID string) bool {
	for _, retired := range transport.retired[sender] {
		if retired == sessionID {
			return true
		}
	}
	return false
}

func (transport *OverlayPullTransport) retireLocked(sender, sessionID string) {
	if sessionID == "" || transport.isRetiredLocked(sender, sessionID) {
		return
	}
	retired := append(transport.retired[sender], sessionID)
	if len(retired) > maxRetiredOverlayPullSessions {
		copy(retired, retired[len(retired)-maxRetiredOverlayPullSessions:])
		retired = retired[:maxRetiredOverlayPullSessions]
	}
	transport.retired[sender] = retired
}

func cloneOverlayPullResponse(response OverlayPullResponse) OverlayPullResponse {
	cloned := response
	cloned.Events = make([]OverlayPullEvent, len(response.Events))
	for index, event := range response.Events {
		cloned.Events[index] = OverlayPullEvent{
			BaseRevision: event.BaseRevision,
			Name:         event.Name,
			Data:         append(json.RawMessage(nil), event.Data...),
		}
	}
	return cloned
}
