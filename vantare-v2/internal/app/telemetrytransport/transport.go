// Package telemetrytransport carries versioned product projections to local
// Wails and SSE consumers. It owns transport semantics only: product payloads
// remain defined by internal/telemetry/projection.
package telemetrytransport

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/analysis"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
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
	ErrDeltaMismatch       = errors.New("telemetry projection delta does not reconstruct full payload")
	ErrSequenceGap         = errors.New("telemetry projection publication sequence gap")
	ErrStatusRevision      = errors.New("invalid telemetry projection status revision")
	ErrFactSequence        = errors.New("invalid telemetry projection fact sequence")
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
	Full  SnapshotKind = "full"
	Delta SnapshotKind = "delta"
)

type EventKind string

const (
	EventSnapshot EventKind = "projection"
	EventStatus   EventKind = "status"
	EventFact     EventKind = "fact"
)

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
	seal              [sha256.Size]byte
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
	seal           [sha256.Size]byte
}

// FactEnvelope keeps the ordered fact cursor independent from snapshot and
// status cursors. Facts are not coalesced by Hub.
type FactEnvelope struct {
	Product           ProductID          `json:"product"`
	ProjectionVersion projection.Version `json:"projectionVersion"`
	Epoch             schema.Epoch       `json:"epoch"`
	Sequence          schema.Sequence    `json:"sequence"`
	FactSequence      uint64             `json:"factSequence"`
	CapturedAt        string             `json:"capturedAt"`
	StatusRevision    uint64             `json:"statusRevision"`
	Payload           json.RawMessage    `json:"payload"`
	seal              [sha256.Size]byte
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

type pendingSubscriber struct {
	signal          chan struct{}
	done            chan struct{}
	pendingStatus   bool
	pendingSnapshot bool
	delivered       schema.Cursor
	deliveredAny    bool
}

type publication struct {
	full      Envelope
	delta     *Envelope
	deltaBase schema.Cursor
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
}

func NewHub(config HubConfig) *Hub {
	versions := config.Versions
	if versions.Current == 0 && versions.MinimumSupported == 0 {
		versions = projection.VersionPolicy{Current: 1, MinimumSupported: 1}
	}
	return &Hub{
		maxPayload:     bounded(config.MaxPayloadBytes, DefaultMaxPayloadBytes, MaxPayloadBytes),
		maxSubscribers: bounded(config.MaxSubscribers, DefaultMaxSubscribers, MaxSubscribers),
		product:        config.Product,
		versions:       versions,
		subscribers:    make(map[*Subscription]*pendingSubscriber),
	}
}

func NewOverlayFull(
	metadata projection.Metadata,
	statusRevision uint64,
	payload overlay.PayloadV1,
) (Envelope, error) {
	return newFull(ProductOverlay, metadata, statusRevision, payload)
}

func NewEngineerFull(
	metadata projection.Metadata,
	statusRevision uint64,
	payload engineer.PayloadV1,
) (Envelope, error) {
	return newFull(ProductEngineer, metadata, statusRevision, payload)
}

func NewStrategyFull(
	metadata projection.Metadata,
	statusRevision uint64,
	payload strategy.PayloadV1,
) (Envelope, error) {
	return newFull(ProductStrategy, metadata, statusRevision, payload)
}

func NewAnalysisFull(
	metadata projection.Metadata,
	statusRevision uint64,
	payload analysis.PayloadV1,
) (Envelope, error) {
	return newFull(ProductAnalysis, metadata, statusRevision, payload)
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
	result.seal = envelopeSeal(result)
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
	result.seal = statusSeal(result)
	if err := validateStatus(result, DefaultMaxPayloadBytes); err != nil {
		return StatusEnvelope{}, err
	}
	return result, nil
}

func NewEngineerFact(
	metadata projection.Metadata,
	statusRevision uint64,
	payload engineer.FactV1,
) (FactEnvelope, error) {
	return newFact(ProductEngineer, metadata, uint64(payload.Sequence), statusRevision, payload)
}

func newFact(
	product ProductID,
	metadata projection.Metadata,
	factSequence uint64,
	statusRevision uint64,
	payload any,
) (FactEnvelope, error) {
	if factSequence == 0 {
		return FactEnvelope{}, ErrFactSequence
	}
	full, err := newFull(product, metadata, statusRevision, payload)
	if err != nil {
		return FactEnvelope{}, err
	}
	result := FactEnvelope{
		Product:           product,
		ProjectionVersion: full.ProjectionVersion,
		Epoch:             full.Epoch,
		Sequence:          full.Sequence,
		FactSequence:      factSequence,
		CapturedAt:        full.CapturedAt,
		StatusRevision:    full.StatusRevision,
		Payload:           full.Payload,
	}
	result.seal = factSeal(result)
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
	if hub.hasStatus && status.StatusRevision != hub.status.StatusRevision+1 {
		return fmt.Errorf("%w: got %d after %d", ErrStatusRevision,
			status.StatusRevision, hub.status.StatusRevision)
	}
	hub.status = cloneStatus(status)
	hub.hasStatus = true
	for _, subscriber := range hub.subscribers {
		subscriber.pendingStatus = true
		if hub.hasSnapshot && hub.latest.full.StatusRevision != status.StatusRevision {
			subscriber.pendingSnapshot = false
		}
		notify(subscriber)
	}
	return nil
}

// PublishSnapshot atomically retains a mandatory full and an optional RFC 7396
// merge patch. The patch is accepted only when it reconstructs the full.
func (hub *Hub) PublishSnapshot(full Envelope, delta json.RawMessage) error {
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
	contiguous := false
	if hub.hasSnapshot {
		var valid bool
		contiguous, valid = cursorRelation(hub.latest.full, full)
		if !valid {
			return fmt.Errorf("%w: got %d/%d after %d/%d", ErrSequenceGap,
				full.Epoch, full.Sequence, hub.latest.full.Epoch, hub.latest.full.Sequence)
		}
	}

	next := publication{full: cloneEnvelope(full)}
	if len(delta) > 0 && contiguous {
		if validatePayload(delta, hub.maxPayload) == nil {
			reconstructed, err := ApplyMergePatch(hub.latest.full.Payload, delta)
			if err == nil && semanticJSONEqual(reconstructed, full.Payload) {
				deltaFrame := cloneEnvelope(full)
				deltaFrame.Kind = Delta
				deltaFrame.Payload = append(json.RawMessage{}, delta...)
				deltaFrame.seal = envelopeSeal(deltaFrame)
				next.delta = &deltaFrame
				next.deltaBase = schema.Cursor{
					Epoch:    hub.latest.full.Epoch,
					Sequence: hub.latest.full.Sequence,
				}
			}
		}
	}

	hub.latest = next
	hub.hasSnapshot = true
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
		close(subscriber.done)
		delete(hub.subscribers, subscription)
	}
	return nil
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

func (subscription *Subscription) Close() error {
	if subscription == nil || subscription.hub == nil || subscription.state == nil {
		return nil
	}
	subscription.hub.mu.Lock()
	defer subscription.hub.mu.Unlock()
	if _, exists := subscription.hub.subscribers[subscription]; exists {
		delete(subscription.hub.subscribers, subscription)
		close(subscription.state.done)
	}
	return nil
}

func (hub *Hub) snapshotFor(subscriber *pendingSubscriber) Envelope {
	if !subscriber.deliveredAny || hub.latest.delta == nil {
		return cloneEnvelope(hub.latest.full)
	}
	if subscriber.delivered != hub.latest.deltaBase {
		return cloneEnvelope(hub.latest.full)
	}
	return cloneEnvelope(*hub.latest.delta)
}

func validateEnvelope(frame Envelope, maximum int) error {
	if frame.seal != envelopeSeal(frame) ||
		!knownProduct(frame.Product) ||
		frame.ProjectionVersion == 0 || frame.Epoch == 0 || frame.Sequence == 0 ||
		frame.StatusRevision == 0 || frame.Kind != Full && frame.Kind != Delta {
		return ErrInvalidEnvelope
	}
	if err := validateTimestamp(frame.CapturedAt); err != nil {
		return err
	}
	return validatePayload(frame.Payload, maximum)
}

func validateStatus(status StatusEnvelope, maximum int) error {
	if status.seal != statusSeal(status) || !knownProduct(status.Product) ||
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
	if !json.Valid(payload) {
		return ErrInvalidPayload
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(payload, &object); err != nil || object == nil {
		return ErrInvalidPayload
	}
	if hasForbiddenKey(object) {
		return ErrInvalidPayload
	}
	return nil
}

func hasForbiddenKey(object map[string]json.RawMessage) bool {
	for key, child := range object {
		switch strings.ToLower(key) {
		case "raw", "source", "clock", "observed", "derived", "finalstate",
			"canonicalversion":
			return true
		}
		var nestedObject map[string]json.RawMessage
		if json.Unmarshal(child, &nestedObject) == nil && nestedObject != nil &&
			hasForbiddenKey(nestedObject) {
			return true
		}
		var nestedArray []json.RawMessage
		if json.Unmarshal(child, &nestedArray) == nil {
			for _, item := range nestedArray {
				var itemObject map[string]json.RawMessage
				if json.Unmarshal(item, &itemObject) == nil && itemObject != nil &&
					hasForbiddenKey(itemObject) {
					return true
				}
			}
		}
	}
	return false
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

func envelopeSeal(frame Envelope) [sha256.Size]byte {
	return sha256.Sum256([]byte(fmt.Sprintf(
		"%s\x00%d\x00%d\x00%d\x00%s\x00%s\x00%d\x00%s",
		frame.Product,
		frame.ProjectionVersion,
		frame.Epoch,
		frame.Sequence,
		frame.Kind,
		frame.CapturedAt,
		frame.StatusRevision,
		frame.Payload,
	)))
}

func statusSeal(status StatusEnvelope) [sha256.Size]byte {
	return sha256.Sum256([]byte(fmt.Sprintf(
		"%s\x00%d\x00%s\x00%s",
		status.Product,
		status.StatusRevision,
		status.CapturedAt,
		status.Payload,
	)))
}

func factSeal(fact FactEnvelope) [sha256.Size]byte {
	return sha256.Sum256([]byte(fmt.Sprintf(
		"%s\x00%d\x00%d\x00%d\x00%d\x00%s\x00%d\x00%s",
		fact.Product,
		fact.ProjectionVersion,
		fact.Epoch,
		fact.Sequence,
		fact.FactSequence,
		fact.CapturedAt,
		fact.StatusRevision,
		fact.Payload,
	)))
}

func bounded(value, fallback, maximum int) int {
	if value <= 0 || value > maximum {
		return fallback
	}
	return value
}
