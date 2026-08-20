package telemetrytransport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

var (
	ErrPublisherProduct        = errors.New("unknown telemetry publisher product")
	ErrDeliveryRevision        = errors.New("invalid telemetry publisher delivery revision")
	ErrPublisherConsumerAbsent = errors.New("telemetry publisher has no active consumer")
)

const DefaultPublisherMaxPayloadBytes = 64 * 1024

// DefaultPublisherBytesWindow is the moving window used to report the outgoing
// byte rate. One second keeps the number readable next to a cadence in Hz.
const DefaultPublisherBytesWindow = time.Second

type PublisherProduct string

const ProductOverlayV2 PublisherProduct = "overlay-v2"

type PublisherEventKind string

const (
	PublisherEventSnapshot PublisherEventKind = "snapshot"
	PublisherEventStatus   PublisherEventKind = "status"
)

type PublisherEvent struct {
	Product PublisherProduct
	Kind    PublisherEventKind
	Data    json.RawMessage
}

type PublisherConfig struct {
	Product         PublisherProduct
	MaxPayloadBytes int
	MaxSubscribers  int
	// BytesWindow sizes the moving window behind BytesPerSecond. Zero uses
	// DefaultPublisherBytesWindow.
	BytesWindow time.Duration
	// Now injects the clock so the byte-rate window is testable without
	// sleeping. Zero uses time.Now.
	Now func() time.Time
}

type PublisherMetrics struct {
	CurrentSubscribers   int
	MaxSubscribers       int
	MaxPayloadBytes      int
	SnapshotPublications uint64
	SnapshotReplacements uint64
	StatusPublications   uint64
	DroppedFrames        uint64
	// SnapshotBytes is every byte accepted for delivery since the publisher
	// was created. BytesPerSecond is the same measure over the moving window,
	// which is what a cadence change is expected to move.
	SnapshotBytes  uint64
	BytesPerSecond uint64
}

type publisherSubscriber struct {
	signal          chan struct{}
	done            chan struct{}
	pendingStatus   bool
	pendingSnapshot bool
}

// Publisher is the compact v2 delivery boundary. It intentionally does not
// wrap Hub: Hub owns the v1 envelope, statusRevision coupling and canonical
// cursor validation that OverlayUpdate v2 removes. The same bounded
// latest-wins pending-bit pattern is retained here without duplicating queues.
type bytesSample struct {
	at    time.Time
	bytes int
}

type Publisher struct {
	mu sync.Mutex

	closed           bool
	product          PublisherProduct
	maxPayload       int
	bytesWindow      time.Duration
	now              func() time.Time
	bytesSamples     []bytesSample
	bytesInWindow    uint64
	maxSubscribers   int
	status           PublisherEvent
	hasStatus        bool
	latest           PublisherEvent
	hasSnapshot      bool
	statusRevision   uint64
	snapshotRevision uint64
	subscribers      map[*PublisherSubscription]*publisherSubscriber
	metrics          PublisherMetrics
}

func newPublisher(config PublisherConfig) (*Publisher, error) {
	if !knownPublisherProduct(config.Product) {
		return nil, ErrPublisherProduct
	}
	maximum := config.MaxPayloadBytes
	if maximum <= 0 || maximum > MaxPayloadBytes {
		maximum = DefaultPublisherMaxPayloadBytes
	}
	subscribers := config.MaxSubscribers
	if subscribers <= 0 || subscribers > MaxSubscribers {
		subscribers = DefaultMaxSubscribers
	}
	window := config.BytesWindow
	if window <= 0 {
		window = DefaultPublisherBytesWindow
	}
	clock := config.Now
	if clock == nil {
		clock = time.Now
	}
	return &Publisher{
		product: config.Product, maxPayload: maximum, maxSubscribers: subscribers,
		bytesWindow: window, now: clock,
		subscribers: make(map[*PublisherSubscription]*publisherSubscriber),
		metrics:     PublisherMetrics{MaxPayloadBytes: maximum, MaxSubscribers: subscribers},
	}, nil
}

func (publisher *Publisher) PublishSnapshot(deliveryRevision uint64, payload any) error {
	encoded, err := publisherPayload(payload)
	if err != nil {
		return err
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed {
		return ErrClosed
	}
	if len(encoded) > publisher.maxPayload {
		publisher.metrics.DroppedFrames++
		return fmt.Errorf("%w: %d > %d", ErrPayloadTooLarge, len(encoded), publisher.maxPayload)
	}
	if deliveryRevision == 0 || deliveryRevision <= publisher.snapshotRevision {
		return fmt.Errorf("%w: got %d after %d", ErrDeliveryRevision, deliveryRevision, publisher.snapshotRevision)
	}
	if publisher.hasSnapshot {
		publisher.metrics.SnapshotReplacements++
	}
	publisher.latest = PublisherEvent{Product: publisher.product, Kind: PublisherEventSnapshot, Data: encoded}
	publisher.hasSnapshot = true
	publisher.snapshotRevision = deliveryRevision
	publisher.metrics.SnapshotPublications++
	publisher.metrics.SnapshotBytes += uint64(len(encoded))
	publisher.recordBytes(len(encoded))
	for _, subscriber := range publisher.subscribers {
		subscriber.pendingSnapshot = true
		notifyPublisher(subscriber)
	}
	return nil
}

func (publisher *Publisher) PublishStatus(deliveryRevision uint64, payload any) error {
	encoded, err := publisherPayload(payload)
	if err != nil {
		return err
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed {
		return ErrClosed
	}
	if len(encoded) > publisher.maxPayload {
		return ErrPayloadTooLarge
	}
	if deliveryRevision == 0 || deliveryRevision <= publisher.statusRevision {
		return fmt.Errorf("%w: got %d after %d", ErrDeliveryRevision, deliveryRevision, publisher.statusRevision)
	}
	publisher.status = PublisherEvent{Product: publisher.product, Kind: PublisherEventStatus, Data: encoded}
	publisher.hasStatus = true
	publisher.statusRevision = deliveryRevision
	publisher.metrics.StatusPublications++
	for _, subscriber := range publisher.subscribers {
		subscriber.pendingStatus = true
		notifyPublisher(subscriber)
	}
	return nil
}

func (publisher *Publisher) Subscribe(ctx context.Context) (*PublisherSubscription, error) {
	if publisher == nil {
		return nil, ErrPublisherConsumerAbsent
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed {
		return nil, ErrClosed
	}
	if len(publisher.subscribers) >= publisher.maxSubscribers {
		return nil, ErrSubscriberLimit
	}
	state := &publisherSubscriber{
		signal: make(chan struct{}, 1), done: make(chan struct{}),
		pendingStatus: publisher.hasStatus, pendingSnapshot: publisher.hasSnapshot,
	}
	subscription := &PublisherSubscription{publisher: publisher, state: state}
	publisher.subscribers[subscription] = state
	if state.pendingStatus || state.pendingSnapshot {
		notifyPublisher(state)
	}
	return subscription, nil
}

func (publisher *Publisher) ReplayStatus() (PublisherEvent, bool) {
	if publisher == nil {
		return PublisherEvent{}, false
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed || !publisher.hasStatus {
		return PublisherEvent{}, false
	}
	return clonePublisherEvent(publisher.status), true
}

func (publisher *Publisher) ReplaySnapshot() (PublisherEvent, bool) {
	if publisher == nil {
		return PublisherEvent{}, false
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed || !publisher.hasSnapshot {
		return PublisherEvent{}, false
	}
	return clonePublisherEvent(publisher.latest), true
}

func (publisher *Publisher) Metrics() PublisherMetrics {
	if publisher == nil {
		return PublisherMetrics{}
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	publisher.pruneBytes(publisher.now())
	result := publisher.metrics
	result.CurrentSubscribers = len(publisher.subscribers)
	result.BytesPerSecond = publisher.bytesRate()
	return result
}

func (publisher *Publisher) Close() error {
	if publisher == nil {
		return nil
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed {
		return nil
	}
	publisher.closed = true
	for subscription, subscriber := range publisher.subscribers {
		close(subscriber.done)
		delete(publisher.subscribers, subscription)
	}
	return nil
}

// recordBytes adds one accepted payload to the moving window. Only snapshots
// count: status events are not regulated by any cadence.
func (publisher *Publisher) recordBytes(size int) {
	at := publisher.now()
	publisher.bytesSamples = append(publisher.bytesSamples, bytesSample{at: at, bytes: size})
	publisher.bytesInWindow += uint64(size)
	publisher.pruneBytes(at)
}

func (publisher *Publisher) pruneBytes(at time.Time) {
	cutoff := at.Add(-publisher.bytesWindow)
	dropped := 0
	for _, sample := range publisher.bytesSamples {
		if sample.at.After(cutoff) {
			break
		}
		publisher.bytesInWindow -= uint64(sample.bytes)
		dropped++
	}
	if dropped == 0 {
		return
	}
	publisher.bytesSamples = append(publisher.bytesSamples[:0], publisher.bytesSamples[dropped:]...)
}

// bytesRate normalizes the window to one second so a 500 ms window and a two
// second one are still comparable.
func (publisher *Publisher) bytesRate() uint64 {
	if publisher.bytesWindow <= 0 || publisher.bytesInWindow == 0 {
		return 0
	}
	return uint64(float64(publisher.bytesInWindow) * float64(time.Second) / float64(publisher.bytesWindow))
}

type PublisherSubscription struct {
	publisher *Publisher
	state     *publisherSubscriber
}

func (subscription *PublisherSubscription) Next(ctx context.Context) (PublisherEvent, error) {
	if subscription == nil || subscription.publisher == nil || subscription.state == nil {
		return PublisherEvent{}, ErrClosed
	}
	for {
		subscription.publisher.mu.Lock()
		if _, ok := subscription.publisher.subscribers[subscription]; !ok {
			subscription.publisher.mu.Unlock()
			return PublisherEvent{}, ErrClosed
		}
		if subscription.state.pendingStatus {
			subscription.state.pendingStatus = false
			event := clonePublisherEvent(subscription.publisher.status)
			subscription.publisher.mu.Unlock()
			return event, nil
		}
		if subscription.state.pendingSnapshot {
			subscription.state.pendingSnapshot = false
			event := clonePublisherEvent(subscription.publisher.latest)
			subscription.publisher.mu.Unlock()
			return event, nil
		}
		subscription.publisher.mu.Unlock()
		select {
		case <-ctx.Done():
			return PublisherEvent{}, ctx.Err()
		case <-subscription.state.done:
			return PublisherEvent{}, ErrClosed
		case <-subscription.state.signal:
		}
	}
}

func (subscription *PublisherSubscription) Close() error {
	if subscription == nil || subscription.publisher == nil || subscription.state == nil {
		return nil
	}
	subscription.publisher.mu.Lock()
	defer subscription.publisher.mu.Unlock()
	if _, ok := subscription.publisher.subscribers[subscription]; ok {
		delete(subscription.publisher.subscribers, subscription)
		close(subscription.state.done)
	}
	return nil
}

type PublisherRegistry struct {
	mu                    sync.Mutex
	configs               map[PublisherProduct]PublisherConfig
	publishers            map[PublisherProduct]*Publisher
	consumers             map[PublisherProduct]int
	releasedDroppedFrames map[PublisherProduct]uint64
}

func NewPublisherRegistry(configs ...PublisherConfig) (*PublisherRegistry, error) {
	registry := &PublisherRegistry{
		configs: make(map[PublisherProduct]PublisherConfig), publishers: make(map[PublisherProduct]*Publisher),
		consumers:             make(map[PublisherProduct]int),
		releasedDroppedFrames: make(map[PublisherProduct]uint64),
	}
	for _, config := range configs {
		if !knownPublisherProduct(config.Product) {
			return nil, ErrPublisherProduct
		}
		registry.configs[config.Product] = config
	}
	return registry, nil
}

// DroppedFrames includes both the active publisher and publishers released by
// earlier consumers, so disconnecting OBS does not erase diagnostics.
func (registry *PublisherRegistry) DroppedFrames(product PublisherProduct) uint64 {
	if registry == nil {
		return 0
	}
	registry.mu.Lock()
	defer registry.mu.Unlock()
	result := registry.releasedDroppedFrames[product]
	if publisher := registry.publishers[product]; publisher != nil {
		result += publisher.Metrics().DroppedFrames
	}
	return result
}

func (registry *PublisherRegistry) RegisterConsumer(product PublisherProduct) (*Publisher, func(), error) {
	if registry == nil {
		return nil, nil, ErrPublisherConsumerAbsent
	}
	registry.mu.Lock()
	config, configured := registry.configs[product]
	if !configured {
		registry.mu.Unlock()
		return nil, nil, ErrPublisherProduct
	}
	publisher := registry.publishers[product]
	if publisher == nil {
		var err error
		publisher, err = newPublisher(config)
		if err != nil {
			registry.mu.Unlock()
			return nil, nil, err
		}
		registry.publishers[product] = publisher
	}
	registry.consumers[product]++
	registry.mu.Unlock()

	var once sync.Once
	release := func() {
		once.Do(func() { registry.releaseConsumer(product, publisher) })
	}
	return publisher, release, nil
}

func (registry *PublisherRegistry) Lookup(product PublisherProduct) (*Publisher, bool) {
	if registry == nil {
		return nil, false
	}
	registry.mu.Lock()
	defer registry.mu.Unlock()
	publisher := registry.publishers[product]
	return publisher, publisher != nil && registry.consumers[product] > 0
}

func (registry *PublisherRegistry) releaseConsumer(product PublisherProduct, publisher *Publisher) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if registry.publishers[product] != publisher || registry.consumers[product] == 0 {
		return
	}
	registry.consumers[product]--
	if registry.consumers[product] == 0 {
		registry.releasedDroppedFrames[product] += publisher.Metrics().DroppedFrames
		delete(registry.publishers, product)
		delete(registry.consumers, product)
		_ = publisher.Close()
	}
}

func publisherPayload(payload any) (json.RawMessage, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPayload, err)
	}
	trimmed := bytes.TrimSpace(encoded)
	if len(trimmed) < 2 || trimmed[0] != '{' || trimmed[len(trimmed)-1] != '}' {
		return nil, ErrInvalidPayload
	}
	return append(json.RawMessage(nil), trimmed...), nil
}

func clonePublisherEvent(event PublisherEvent) PublisherEvent {
	event.Data = append(json.RawMessage(nil), event.Data...)
	return event
}

func notifyPublisher(subscriber *publisherSubscriber) {
	select {
	case subscriber.signal <- struct{}{}:
	default:
	}
}

func knownPublisherProduct(product PublisherProduct) bool {
	return product == ProductOverlayV2
}
