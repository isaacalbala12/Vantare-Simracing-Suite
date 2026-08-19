// Package telemetrytransport carries versioned product projections to local
// Wails and SSE consumers. It owns transport semantics only: product payloads
// remain defined by internal/telemetry/projection.
package telemetrytransport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

var (
	ErrClosed              = errors.New("telemetry projection transport closed")
	ErrSubscriberLimit     = errors.New("telemetry projection transport subscriber limit reached")
	ErrInvalidEnvelope     = errors.New("invalid telemetry projection transport envelope")
	ErrInvalidPayload      = errors.New("invalid telemetry projection transport payload")
	ErrPayloadTooLarge     = errors.New("telemetry projection transport payload exceeds limit")
	ErrDeltaUnsupported    = errors.New("telemetry projection deltas are unsupported")
	ErrSequenceGap         = errors.New("telemetry projection publication sequence gap")
	ErrStatusRevision      = errors.New("invalid telemetry projection status revision")
	ErrProductMismatch     = errors.New("telemetry projection product mismatch")
	ErrUnsupportedProtocol = errors.New("telemetry projection streaming unsupported")
)

const (
	DefaultMaxPayloadBytes = 256 * 1024
	DefaultMaxSubscribers  = 32
	MaxPayloadBytes        = DefaultMaxPayloadBytes
	MaxSubscribers         = 64
)

type SnapshotKind string

type ProductID string

const (
	ProductOverlay  ProductID = "overlay"
	ProductEngineer ProductID = "engineer"
	ProductStrategy ProductID = "strategy"
	ProductAnalysis ProductID = "analysis"
)

const (
	Full SnapshotKind = "full"
)

type EventKind string

const (
	EventSnapshot EventKind = "projection"
	EventStatus   EventKind = "status"
)

// Deprecated: reserved contract name for the F7 Engineer facts port; there is
// no live fact transport in F4.
const EventFact EventKind = "fact"

// Envelope wraps one product payload. Payload contains only the projection's
// local JSON contract; canonical/core/derive state is never accepted.
type Envelope struct {
	Product           ProductID          `json:"product"`
	ProjectionVersion projection.Version `json:"projectionVersion"`
	Epoch             schema.Epoch       `json:"epoch"`
	Sequence          schema.Sequence    `json:"sequence"`
	Kind              SnapshotKind       `json:"kind"`
	CapturedAt        string             `json:"capturedAt"`
	StatusRevision    uint64             `json:"statusRevision"`
	Payload           json.RawMessage    `json:"payload"`
}

type StatusPayload struct {
	State            string `json:"state"`
	ReconnectAttempt int    `json:"reconnectAttempt"`
}

// StatusEnvelope is intentionally separate from high-frequency snapshots.
type StatusEnvelope struct {
	Product        ProductID       `json:"product"`
	StatusRevision uint64          `json:"statusRevision"`
	CapturedAt     string          `json:"capturedAt"`
	Payload        json.RawMessage `json:"payload"`
}

type Event struct {
	Product ProductID
	Kind    EventKind
	Data    json.RawMessage
}

type HubConfig struct {
	Product         ProductID
	MaxPayloadBytes int
	MaxSubscribers  int
	Versions        projection.VersionPolicy
}

// HubMetrics exposes bounded operational state only. It deliberately omits
// projection payloads and simulator/user identifiers so it is safe for local
// diagnostics and support exports.
type HubMetrics struct {
	CurrentSubscribers   int
	MaxSubscribers       int
	MaxPayloadBytes      int
	StatusPublications   uint64
	SnapshotPublications uint64
	SnapshotReplacements uint64
	// Deprecated: RFC 7396 was retired in ISA-372/F4; this remains zero until
	// F1 releases the runtime metrics compatibility check.
	DeltasRetained uint64
}

type pendingSubscriber struct {
	signal          chan struct{}
	done            chan struct{}
	pendingStatus   bool
	pendingSnapshot bool
	terminalStatus  *StatusEnvelope
	delivered       schema.Cursor
	deliveredAny    bool
}

type publication struct {
	full Envelope
}

// Hub is bounded and starts no goroutines. Snapshot publications are
// latest-wins. A subscriber that misses a cursor receives the retained full.
type Hub struct {
	mu sync.Mutex

	closed         bool
	product        ProductID
	maxPayload     int
	maxSubscribers int
	versions       projection.VersionPolicy
	status         StatusEnvelope
	hasStatus      bool
	latest         publication
	hasSnapshot    bool
	subscribers    map[*Subscription]*pendingSubscriber
	metrics        HubMetrics
}

func NewHub(config HubConfig) *Hub {
	versions := config.Versions
	if versions.Current == 0 && versions.MinimumSupported == 0 {
		versions = projection.VersionPolicy{Current: 1, MinimumSupported: 1}
	}
	maxPayload := bounded(config.MaxPayloadBytes, DefaultMaxPayloadBytes, MaxPayloadBytes)
	maxSubscribers := bounded(config.MaxSubscribers, DefaultMaxSubscribers, MaxSubscribers)
	return &Hub{
		maxPayload:     maxPayload,
		maxSubscribers: maxSubscribers,
		product:        config.Product,
		versions:       versions,
		subscribers:    make(map[*Subscription]*pendingSubscriber),
		metrics: HubMetrics{
			MaxSubscribers:  maxSubscribers,
			MaxPayloadBytes: maxPayload,
		},
	}
}

func NewOverlayFull(
	metadata projection.Metadata,
	statusRevision uint64,
	payload overlay.PayloadV1,
) (Envelope, error) {
	return newFull(ProductOverlay, metadata, statusRevision, payload)
}

func NewStrategyFull(
	metadata projection.Metadata,
	statusRevision uint64,
	payload strategy.PayloadV1,
) (Envelope, error) {
	return newFull(ProductStrategy, metadata, statusRevision, payload)
}

func newFull(
	product ProductID,
	metadata projection.Metadata,
	statusRevision uint64,
	payload any,
) (Envelope, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, fmt.Errorf("%w: %v", ErrInvalidPayload, err)
	}
	result := Envelope{
		Product:           product,
		ProjectionVersion: metadata.ProjectionVersion,
		Epoch:             metadata.Epoch,
		Sequence:          metadata.Sequence,
		Kind:              Full,
		CapturedAt:        metadata.CapturedAt,
		StatusRevision:    statusRevision,
		Payload:           encoded,
	}
	if err := validateEnvelope(result, DefaultMaxPayloadBytes); err != nil {
		return Envelope{}, err
	}
	return result, nil
}

func NewStatus(
	product ProductID,
	revision uint64,
	capturedAt time.Time,
	payload StatusPayload,
) (StatusEnvelope, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return StatusEnvelope{}, fmt.Errorf("%w: %v", ErrInvalidPayload, err)
	}
	result := StatusEnvelope{
		Product:        product,
		StatusRevision: revision,
		CapturedAt:     capturedAt.Round(0).UTC().Format(time.RFC3339Nano),
		Payload:        encoded,
	}
	if err := validateStatus(result, DefaultMaxPayloadBytes); err != nil {
		return StatusEnvelope{}, err
	}
	return result, nil
}

func (hub *Hub) PublishStatus(status StatusEnvelope) error {
	if err := validateStatus(status, hub.maxPayload); err != nil {
		return err
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return ErrClosed
	}
	if !knownProduct(hub.product) || status.Product != hub.product {
		return ErrProductMismatch
	}
	if hub.hasStatus && status.StatusRevision <= hub.status.StatusRevision {
		return fmt.Errorf("%w: got %d after %d", ErrStatusRevision,
			status.StatusRevision, hub.status.StatusRevision)
	}
	hub.status = cloneStatus(status)
	hub.hasStatus = true
	hub.metrics.StatusPublications++
	for _, subscriber := range hub.subscribers {
		subscriber.pendingStatus = true
		if hub.hasSnapshot && hub.latest.full.StatusRevision != status.StatusRevision {
			subscriber.pendingSnapshot = false
		}
		notify(subscriber)
	}
	return nil
}

// PublishSnapshot atomically retains a mandatory full. The delta parameter is
// kept only until F1 releases its runtime callers; non-nil values fail closed.
func (hub *Hub) PublishSnapshot(full Envelope, delta json.RawMessage) error {
	if delta != nil {
		return ErrDeltaUnsupported
	}
	if err := validateEnvelope(full, hub.maxPayload); err != nil {
		return err
	}
	if err := hub.versions.Validate(full.ProjectionVersion); err != nil {
		return err
	}
	if full.Kind != Full {
		return ErrInvalidEnvelope
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return ErrClosed
	}
	if !knownProduct(hub.product) || full.Product != hub.product {
		return ErrProductMismatch
	}
	if !hub.hasStatus || full.StatusRevision != hub.status.StatusRevision {
		return fmt.Errorf("%w: snapshot references %d, current is %d",
			ErrStatusRevision, full.StatusRevision, hub.status.StatusRevision)
	}
	if hub.hasSnapshot {
		_, valid := cursorRelation(hub.latest.full, full)
		if !valid {
			return fmt.Errorf("%w: got %d/%d after %d/%d", ErrSequenceGap,
				full.Epoch, full.Sequence, hub.latest.full.Epoch, hub.latest.full.Sequence)
		}
	}

	next := publication{full: cloneEnvelope(full)}

	if hub.hasSnapshot {
		hub.metrics.SnapshotReplacements++
	}
	hub.latest = next
	hub.hasSnapshot = true
	hub.metrics.SnapshotPublications++
	for _, subscriber := range hub.subscribers {
		subscriber.pendingSnapshot = true
		notify(subscriber)
	}
	return nil
}

func (hub *Hub) Subscribe(ctx context.Context) (*Subscription, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return nil, ErrClosed
	}
	if len(hub.subscribers) >= hub.maxSubscribers {
		return nil, ErrSubscriberLimit
	}
	state := &pendingSubscriber{
		signal:        make(chan struct{}, 1),
		done:          make(chan struct{}),
		pendingStatus: hub.hasStatus,
		pendingSnapshot: hub.hasSnapshot &&
			hub.hasStatus &&
			hub.latest.full.StatusRevision == hub.status.StatusRevision,
	}
	subscription := &Subscription{hub: hub, state: state}
	hub.subscribers[subscription] = state
	// Un suscriptor que entra sin snapshot pendiente se queda a oscuras hasta
	// la siguiente publicacion. Se registran las tres condiciones por separado
	// para poder distinguir "aun no hay snapshot" de "las revisiones no
	// coinciden", que es la ventana sospechosa al cambiar de widget o al abrir
	// un overlay con la hotkey. Solo metadatos de transporte: ningun payload.
	log.Printf("transport subscribe: subscribers=%d hasSnapshot=%v hasStatus=%v fullStatusRev=%d statusRev=%d pendingSnapshot=%v",
		len(hub.subscribers), hub.hasSnapshot, hub.hasStatus,
		hub.latest.full.StatusRevision, hub.status.StatusRevision, state.pendingSnapshot)
	if state.pendingStatus || state.pendingSnapshot {
		notify(state)
	}
	return subscription, nil
}

func (hub *Hub) Close() error {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return nil
	}
	hub.closed = true
	for subscription, subscriber := range hub.subscribers {
		if subscriber.pendingStatus {
			status := cloneStatus(hub.status)
			subscriber.terminalStatus = &status
		}
		close(subscriber.done)
		delete(hub.subscribers, subscription)
	}
	return nil
}

// Metrics returns a value copy of bounded transport counters. Payload content
// never participates in these metrics.
func (hub *Hub) Metrics() HubMetrics {
	if hub == nil {
		return HubMetrics{}
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	result := hub.metrics
	result.CurrentSubscribers = len(hub.subscribers)
	return result
}

type Subscription struct {
	hub   *Hub
	state *pendingSubscriber
}

func (subscription *Subscription) Next(ctx context.Context) (Event, error) {
	if subscription == nil || subscription.hub == nil || subscription.state == nil {
		return Event{}, ErrClosed
	}
	for {
		subscription.hub.mu.Lock()
		if subscription.state.terminalStatus != nil {
			status := cloneStatus(*subscription.state.terminalStatus)
			subscription.state.terminalStatus = nil
			subscription.hub.mu.Unlock()
			return marshalEvent(subscription.hub.product, EventStatus, status)
		}
		if _, exists := subscription.hub.subscribers[subscription]; !exists {
			subscription.hub.mu.Unlock()
			return Event{}, ErrClosed
		}
		if subscription.state.pendingStatus {
			subscription.state.pendingStatus = false
			status := cloneStatus(subscription.hub.status)
			subscription.hub.mu.Unlock()
			return marshalEvent(subscription.hub.product, EventStatus, status)
		}
		if subscription.state.pendingSnapshot {
			subscription.state.pendingSnapshot = false
			frame := subscription.hub.snapshotFor(subscription.state)
			subscription.state.delivered = schema.Cursor{
				Epoch:    frame.Epoch,
				Sequence: frame.Sequence,
			}
			subscription.state.deliveredAny = true
			subscription.hub.mu.Unlock()
			return marshalEvent(subscription.hub.product, EventSnapshot, frame)
		}
		subscription.hub.mu.Unlock()

		select {
		case <-ctx.Done():
			return Event{}, ctx.Err()
		case <-subscription.state.done:
			return Event{}, ErrClosed
		case <-subscription.state.signal:
		}
	}
}

// StatusRequestEventName nombra la peticion de reenvio de estado, simetrica a
// telemetry-core:source-status:get, que el Hub ya usaba para lo mismo.
func StatusRequestEventName(product ProductID) string {
	return EventName(product, EventStatus) + ":get"
}

// ReplayStatus devuelve el ultimo estado publicado, listo para emitir.
//
// El estado solo se publica cuando cambia, y el puente Wails comparte una unica
// suscripcion para todas las ventanas: los eventos ya emitidos no se repiten.
// Un consumidor que aparece a mitad de sesion -- un overlay abierto con la
// hotkey, o un cambio de diseno desde la preview -- se quedaba por tanto sin
// estado, y el observador del frontend exige estado ademas de snapshot para
// pintar. El resultado era un widget en blanco hasta que algo forzara una
// transicion, tipicamente entrar y salir de boxes.
func (hub *Hub) ReplayStatus() (Event, bool, error) {
	if hub == nil {
		return Event{}, false, nil
	}
	hub.mu.Lock()
	if hub.closed || !hub.hasStatus {
		hub.mu.Unlock()
		return Event{}, false, nil
	}
	status := cloneStatus(hub.status)
	product := hub.product
	hub.mu.Unlock()
	event, err := marshalEvent(product, EventStatus, status)
	if err != nil {
		return Event{}, false, err
	}
	return event, true, nil
}

func (subscription *Subscription) Close() error {
	if subscription == nil || subscription.hub == nil || subscription.state == nil {
		return nil
	}
	subscription.hub.mu.Lock()
	defer subscription.hub.mu.Unlock()
	if _, exists := subscription.hub.subscribers[subscription]; exists {
		delete(subscription.hub.subscribers, subscription)
		close(subscription.state.done)
		// deliveredAny distingue "se cerro sin haber recibido nunca nada" de un
		// cierre normal: lo primero es el sintoma de un widget que se quedo en
		// blanco desde que se abrio.
		log.Printf("transport unsubscribe: subscribers=%d deliveredAny=%v delivered=%d",
			len(subscription.hub.subscribers), subscription.state.deliveredAny, subscription.state.delivered)
	}
	return nil
}

func (hub *Hub) snapshotFor(_ *pendingSubscriber) Envelope {
	return cloneEnvelope(hub.latest.full)
}

func validateEnvelope(frame Envelope, maximum int) error {
	if !knownProduct(frame.Product) ||
		frame.ProjectionVersion == 0 || frame.Epoch == 0 || frame.Sequence == 0 ||
		frame.StatusRevision == 0 || frame.Kind != Full {
		return ErrInvalidEnvelope
	}
	if err := validateTimestamp(frame.CapturedAt); err != nil {
		return err
	}
	return validatePayload(frame.Payload, maximum)
}

func validateStatus(status StatusEnvelope, maximum int) error {
	if !knownProduct(status.Product) ||
		status.StatusRevision == 0 {
		return ErrStatusRevision
	}
	if err := validateTimestamp(status.CapturedAt); err != nil {
		return err
	}
	if err := validatePayload(status.Payload, maximum); err != nil {
		return err
	}
	var payload StatusPayload
	if err := json.Unmarshal(status.Payload, &payload); err != nil ||
		!knownStatusState(payload.State) || payload.ReconnectAttempt < 0 {
		return ErrInvalidPayload
	}
	return nil
}

func knownStatusState(state string) bool {
	switch state {
	case "stopped", "detecting", "connecting", "live", "degraded", "stale",
		"error", "stopping":
		return true
	default:
		return false
	}
}

func validateTimestamp(value string) error {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || parsed.Location() != time.UTC {
		return ErrInvalidEnvelope
	}
	return nil
}

func validatePayload(payload json.RawMessage, maximum int) error {
	if len(payload) > maximum {
		return ErrPayloadTooLarge
	}
	trimmed := bytes.TrimSpace(payload)
	if len(trimmed) < 2 || trimmed[0] != '{' || trimmed[len(trimmed)-1] != '}' ||
		!json.Valid(trimmed) {
		return ErrInvalidPayload
	}
	return nil
}

func cursorRelation(previous, next Envelope) (contiguous bool, valid bool) {
	if previous.Epoch == next.Epoch {
		if next.Sequence <= previous.Sequence {
			return false, false
		}
		return previous.Sequence < ^schema.Sequence(0) &&
			next.Sequence == previous.Sequence+1, true
	}
	return false, next.Epoch > previous.Epoch && next.Sequence == 1
}

func knownProduct(product ProductID) bool {
	switch product {
	case ProductOverlay, ProductEngineer, ProductStrategy, ProductAnalysis:
		return true
	default:
		return false
	}
}

func notify(subscriber *pendingSubscriber) {
	select {
	case subscriber.signal <- struct{}{}:
	default:
	}
}

func marshalEvent(product ProductID, kind EventKind, value any) (Event, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return Event{}, fmt.Errorf("%w: %v", ErrInvalidEnvelope, err)
	}
	return Event{Product: product, Kind: kind, Data: encoded}, nil
}

func cloneEnvelope(frame Envelope) Envelope {
	frame.Payload = append(json.RawMessage{}, frame.Payload...)
	return frame
}

func cloneStatus(status StatusEnvelope) StatusEnvelope {
	status.Payload = append(json.RawMessage{}, status.Payload...)
	return status
}

func bounded(value, fallback, maximum int) int {
	if value <= 0 || value > maximum {
		return fallback
	}
	return value
}
