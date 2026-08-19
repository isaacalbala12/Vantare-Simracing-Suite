package core

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

var (
	ErrFanoutStatus       = errors.New("invalid telemetry fan-out status")
	ErrSubscriberLimit    = errors.New("telemetry fan-out subscriber limit reached")
	ErrInvalidFact        = errors.New("invalid telemetry fan-out fact")
	ErrFactSequenceGap    = errors.New("telemetry fan-out fact sequence gap")
	ErrFactResyncRequired = errors.New("telemetry fact subscriber requires a full snapshot resync")
)

const (
	DefaultFactRetention       = 1_024
	DefaultSnapshotSubscribers = 32
	DefaultFactSubscribers     = 32
	MaxFactRetention           = 4_096
	MaxFanoutSubscribers       = 64
)

// FanoutStatus is the small, value-semantic lifecycle status paired atomically
// with every complete snapshot. Product-specific status remains a projection.
type FanoutStatus struct {
	State            driver.State
	ReconnectAttempt int
}

// SnapshotFrame is one complete latest-wins state publication. FactSequence is
// an independent cursor: it must never be inferred from the snapshot cursor.
type SnapshotFrame[S any] struct {
	Snapshot     envelope.Snapshot[S]
	Status       FanoutStatus
	Revision     uint64
	FactSequence FactSequence
}

type FanoutConfig struct {
	FactRetention       int
	SnapshotSubscribers int
	FactSubscribers     int
}

// FanoutMetrics is an immutable, low-cardinality view of fan-out health and
// cost. Durations are observed by the caller; fan-out does not read a clock in
// the hot path.
type FanoutMetrics struct {
	SnapshotsPublished           uint64
	SnapshotDeliveriesSuperseded uint64
	SnapshotSubscribers          int
	CurrentMaxSnapshotLag        uint64
	FactsPublished               uint64
	FactQueueDepth               int
	FactQueueCapacity            int
	FactSubscribers              int
	ResyncsRequired              uint64
	StaleTransitions             uint64
	Reconnects                   uint64
	DerivationSamples            uint64
	DerivationTotal              time.Duration
	DerivationMax                time.Duration
}

type snapshotSubscriber[S any] struct {
	updates   chan SnapshotFrame[S]
	done      chan struct{}
	delivered uint64
}

type factSubscriber struct {
	next      FactSequence
	exhausted bool
	signal    chan struct{}
	done      chan struct{}
	resync    *factResyncRequiredError
}

// factResyncRequiredError keeps the disconnected Fanout compiling until F4.3
// removes it. The exported contract now belongs to projection/engineer.
type factResyncRequiredError struct {
	Previous FactSequence
	Next     FactSequence
}

func (err *factResyncRequiredError) Error() string {
	return fmt.Sprintf("%v: fact %d followed by retained fact %d",
		ErrFactResyncRequired, err.Previous, err.Next)
}

func (err *factResyncRequiredError) Unwrap() error { return ErrFactResyncRequired }

// Fanout owns only bounded in-memory delivery state. It starts no goroutines;
// publishers never wait for consumers, and every subscription has one explicit
// close path.
type Fanout[S any] struct {
	mu sync.Mutex

	closed bool
	done   chan struct{}

	factRetention      int
	maxSnapshotReaders int
	maxFactReaders     int

	initialized bool
	latest      SnapshotFrame[S]
	status      FanoutStatus
	revision    uint64

	snapshotReaders map[*SnapshotSubscription[S]]*snapshotSubscriber[S]
	factReaders     map[*FactSubscription[S]]*factSubscriber

	facts    []envelope.Fact[SessionFact]
	factHead int
	factLen  int
	lastFact FactSequence

	metrics FanoutMetrics
}

func NewFanout[S any](config FanoutConfig) *Fanout[S] {
	factRetention := boundedConfig(config.FactRetention, DefaultFactRetention, MaxFactRetention)
	snapshotReaders := boundedConfig(
		config.SnapshotSubscribers,
		DefaultSnapshotSubscribers,
		MaxFanoutSubscribers,
	)
	factReaders := boundedConfig(config.FactSubscribers, DefaultFactSubscribers, MaxFanoutSubscribers)

	return &Fanout[S]{
		done:               make(chan struct{}),
		factRetention:      factRetention,
		maxSnapshotReaders: snapshotReaders,
		maxFactReaders:     factReaders,
		snapshotReaders:    make(map[*SnapshotSubscription[S]]*snapshotSubscriber[S], snapshotReaders),
		factReaders:        make(map[*FactSubscription[S]]*factSubscriber, factReaders),
		facts:              make([]envelope.Fact[SessionFact], factRetention),
		metrics: FanoutMetrics{
			FactQueueCapacity: factRetention,
		},
	}
}

func (fanout *Fanout[S]) PublishSnapshot(
	snapshot envelope.Snapshot[S],
	status FanoutStatus,
	coveredFacts FactSequence,
	derivationCost time.Duration,
) error {
	if !status.State.Known() || status.ReconnectAttempt < 0 || derivationCost < 0 {
		return ErrFanoutStatus
	}

	fanout.mu.Lock()
	defer fanout.mu.Unlock()
	if fanout.closed {
		return ErrClosed
	}
	if err := validateBatchHeader(
		fanout.latest.Snapshot.Header(),
		fanout.initialized,
		snapshot.Header(),
	); err != nil {
		return fmt.Errorf("publish complete telemetry snapshot: %w", err)
	}
	if coveredFacts > fanout.lastFact {
		return fmt.Errorf(
			"%w: snapshot covers fact %d, latest accepted fact is %d",
			ErrFactSequenceGap,
			coveredFacts,
			fanout.lastFact,
		)
	}
	if fanout.initialized && coveredFacts < fanout.latest.FactSequence {
		return fmt.Errorf(
			"%w: snapshot fact coverage regressed from %d to %d",
			ErrFactSequenceGap,
			fanout.latest.FactSequence,
			coveredFacts,
		)
	}

	fanout.observeStatus(status)
	fanout.revision++
	frame := SnapshotFrame[S]{
		Snapshot:     snapshot,
		Status:       status,
		Revision:     fanout.revision,
		FactSequence: coveredFacts,
	}
	fanout.initialized = true
	fanout.latest = frame
	fanout.metrics.SnapshotsPublished++
	fanout.metrics.DerivationSamples++
	fanout.metrics.DerivationTotal += derivationCost
	if derivationCost > fanout.metrics.DerivationMax {
		fanout.metrics.DerivationMax = derivationCost
	}

	for _, subscriber := range fanout.snapshotReaders {
		select {
		case <-subscriber.updates:
			fanout.metrics.SnapshotDeliveriesSuperseded++
		default:
		}
		subscriber.updates <- frame
	}
	return nil
}

func (fanout *Fanout[S]) SubscribeSnapshots(ctx context.Context) (*SnapshotSubscription[S], error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	fanout.mu.Lock()
	defer fanout.mu.Unlock()
	if fanout.closed {
		return nil, ErrClosed
	}
	if len(fanout.snapshotReaders) >= fanout.maxSnapshotReaders {
		return nil, ErrSubscriberLimit
	}

	state := &snapshotSubscriber[S]{
		updates: make(chan SnapshotFrame[S], 1),
		done:    make(chan struct{}),
	}
	subscription := &SnapshotSubscription[S]{fanout: fanout, state: state}
	fanout.snapshotReaders[subscription] = state
	if fanout.initialized {
		state.updates <- fanout.latest
	}
	return subscription, nil
}

// Latest returns the same atomic frame contract used for initial subscription.
// It never combines a snapshot with a status from another publication.
func (fanout *Fanout[S]) Latest(ctx context.Context) (SnapshotFrame[S], error) {
	if err := ctx.Err(); err != nil {
		return SnapshotFrame[S]{}, err
	}
	fanout.mu.Lock()
	defer fanout.mu.Unlock()
	if fanout.closed {
		return SnapshotFrame[S]{}, ErrClosed
	}
	if !fanout.initialized {
		return SnapshotFrame[S]{}, ErrInvalidInitialCursor
	}
	return fanout.latest, nil
}

// WriteFacts implements FactBatchSink. It appends a complete, strictly ordered
// batch to bounded retention or rejects the whole batch. Slow subscribers are
// marked for full resync and never apply backpressure to the publisher.
func (fanout *Fanout[S]) WriteFacts(
	ctx context.Context,
	facts []envelope.Fact[SessionFact],
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if len(facts) == 0 {
		return nil
	}

	fanout.mu.Lock()
	defer fanout.mu.Unlock()
	if fanout.closed {
		return ErrClosed
	}
	if len(facts) > fanout.factRetention {
		return ErrFactBatchOverflow
	}
	if fanout.lastFact == FactSequence(math.MaxUint64) {
		return ErrFactSequenceExhausted
	}

	expected := fanout.lastFact + 1
	for index, fact := range facts {
		value := fact.Value()
		if !value.Kind.Known() || value.Sequence == 0 {
			return ErrInvalidFact
		}
		if value.Sequence != expected {
			return fmt.Errorf("%w: got %d, want %d", ErrFactSequenceGap, value.Sequence, expected)
		}
		if index == len(facts)-1 {
			continue
		}
		if expected == FactSequence(math.MaxUint64) {
			return ErrFactSequenceExhausted
		}
		expected++
	}

	for _, fact := range facts {
		fanout.appendFact(fact)
	}
	fanout.lastFact = facts[len(facts)-1].Value().Sequence
	fanout.metrics.FactsPublished += uint64(len(facts))
	oldest := fanout.oldestFactSequence()
	for _, subscriber := range fanout.factReaders {
		if subscriber.resync == nil && subscriber.next < oldest {
			subscriber.resync = &factResyncRequiredError{
				Previous: subscriber.next - 1,
				Next:     oldest,
			}
			fanout.metrics.ResyncsRequired++
		}
		select {
		case subscriber.signal <- struct{}{}:
		default:
		}
	}
	return nil
}

func (fanout *Fanout[S]) SubscribeFacts(
	ctx context.Context,
	after FactSequence,
) (*FactSubscription[S], error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	fanout.mu.Lock()
	defer fanout.mu.Unlock()
	if fanout.closed {
		return nil, ErrClosed
	}
	if len(fanout.factReaders) >= fanout.maxFactReaders {
		return nil, ErrSubscriberLimit
	}
	if after > fanout.lastFact {
		return nil, fmt.Errorf("%w: resume after %d, latest is %d",
			ErrFactSequenceGap, after, fanout.lastFact)
	}
	if after == FactSequence(math.MaxUint64) {
		return nil, ErrFactSequenceExhausted
	}

	next := after + 1
	oldest := fanout.oldestFactSequence()
	if fanout.factLen > 0 && next < oldest {
		fanout.metrics.ResyncsRequired++
		return nil, &factResyncRequiredError{Previous: after, Next: oldest}
	}

	state := &factSubscriber{
		next:   next,
		signal: make(chan struct{}, 1),
		done:   make(chan struct{}),
	}
	subscription := &FactSubscription[S]{fanout: fanout, state: state}
	fanout.factReaders[subscription] = state
	if next <= fanout.lastFact {
		state.signal <- struct{}{}
	}
	return subscription, nil
}

func (fanout *Fanout[S]) Metrics() FanoutMetrics {
	fanout.mu.Lock()
	defer fanout.mu.Unlock()

	result := fanout.metrics
	result.SnapshotSubscribers = len(fanout.snapshotReaders)
	result.FactSubscribers = len(fanout.factReaders)
	result.FactQueueDepth = fanout.factLen
	for _, subscriber := range fanout.snapshotReaders {
		lag := fanout.revision - subscriber.delivered
		if lag > result.CurrentMaxSnapshotLag {
			result.CurrentMaxSnapshotLag = lag
		}
	}
	return result
}

func (fanout *Fanout[S]) Close(_ context.Context) error {
	fanout.mu.Lock()
	if fanout.closed {
		fanout.mu.Unlock()
		return nil
	}
	fanout.closed = true
	close(fanout.done)
	for subscription, subscriber := range fanout.snapshotReaders {
		close(subscriber.done)
		delete(fanout.snapshotReaders, subscription)
	}
	for subscription, subscriber := range fanout.factReaders {
		close(subscriber.done)
		delete(fanout.factReaders, subscription)
	}
	fanout.mu.Unlock()
	return nil
}

func (fanout *Fanout[S]) observeStatus(status FanoutStatus) {
	if fanout.initialized && fanout.status.State != driver.StateStale && status.State == driver.StateStale {
		fanout.metrics.StaleTransitions++
	}
	if status.ReconnectAttempt > fanout.status.ReconnectAttempt {
		fanout.metrics.Reconnects += uint64(status.ReconnectAttempt - fanout.status.ReconnectAttempt)
	}
	fanout.status = status
}

func (fanout *Fanout[S]) appendFact(fact envelope.Fact[SessionFact]) {
	if fanout.factLen < len(fanout.facts) {
		index := (fanout.factHead + fanout.factLen) % len(fanout.facts)
		fanout.facts[index] = fact
		fanout.factLen++
		return
	}
	fanout.facts[fanout.factHead] = fact
	fanout.factHead = (fanout.factHead + 1) % len(fanout.facts)
}

func (fanout *Fanout[S]) oldestFactSequence() FactSequence {
	if fanout.factLen == 0 {
		return fanout.lastFact + 1
	}
	return fanout.facts[fanout.factHead].Value().Sequence
}

func (fanout *Fanout[S]) fact(sequence FactSequence) envelope.Fact[SessionFact] {
	oldest := fanout.oldestFactSequence()
	offset := int(sequence - oldest)
	index := (fanout.factHead + offset) % len(fanout.facts)
	return fanout.facts[index]
}

func boundedConfig(value, fallback, maximum int) int {
	if value <= 0 || value > maximum {
		return fallback
	}
	return value
}

// SnapshotSubscription receives one complete initial frame and then only the
// newest complete frame. A slow reader never blocks publication.
type SnapshotSubscription[S any] struct {
	fanout *Fanout[S]
	state  *snapshotSubscriber[S]
}

func (subscription *SnapshotSubscription[S]) Next(ctx context.Context) (SnapshotFrame[S], error) {
	if subscription == nil || subscription.fanout == nil || subscription.state == nil {
		return SnapshotFrame[S]{}, ErrClosed
	}
	select {
	case <-ctx.Done():
		return SnapshotFrame[S]{}, ctx.Err()
	case <-subscription.fanout.done:
		return SnapshotFrame[S]{}, ErrClosed
	case <-subscription.state.done:
		return SnapshotFrame[S]{}, ErrClosed
	case frame := <-subscription.state.updates:
		subscription.fanout.mu.Lock()
		if _, exists := subscription.fanout.snapshotReaders[subscription]; !exists {
			subscription.fanout.mu.Unlock()
			return SnapshotFrame[S]{}, ErrClosed
		}
		subscription.state.delivered = frame.Revision
		subscription.fanout.mu.Unlock()
		return frame, nil
	}
}

func (subscription *SnapshotSubscription[S]) Close(_ context.Context) error {
	if subscription == nil || subscription.fanout == nil || subscription.state == nil {
		return nil
	}
	subscription.fanout.mu.Lock()
	if _, exists := subscription.fanout.snapshotReaders[subscription]; exists {
		delete(subscription.fanout.snapshotReaders, subscription)
		close(subscription.state.done)
	}
	subscription.fanout.mu.Unlock()
	return nil
}

// FactSubscription is pull-based over one bounded shared log. Next either
// returns the exact next fact, cancellation/closure, or an explicit resync
// error. It never skips a fact silently.
type FactSubscription[S any] struct {
	fanout *Fanout[S]
	state  *factSubscriber
}

func (subscription *FactSubscription[S]) Next(
	ctx context.Context,
) (envelope.Fact[SessionFact], error) {
	if subscription == nil || subscription.fanout == nil || subscription.state == nil {
		return envelope.Fact[SessionFact]{}, ErrClosed
	}
	for {
		subscription.fanout.mu.Lock()
		if _, exists := subscription.fanout.factReaders[subscription]; !exists {
			subscription.fanout.mu.Unlock()
			return envelope.Fact[SessionFact]{}, ErrClosed
		}
		if subscription.state.resync != nil {
			err := subscription.state.resync
			subscription.fanout.mu.Unlock()
			return envelope.Fact[SessionFact]{}, err
		}
		if subscription.state.exhausted {
			subscription.fanout.mu.Unlock()
			return envelope.Fact[SessionFact]{}, ErrFactSequenceExhausted
		}
		if subscription.state.next <= subscription.fanout.lastFact {
			fact := subscription.fanout.fact(subscription.state.next)
			if subscription.state.next == FactSequence(math.MaxUint64) {
				subscription.state.exhausted = true
			} else {
				subscription.state.next++
			}
			subscription.fanout.mu.Unlock()
			return fact, nil
		}
		subscription.fanout.mu.Unlock()

		select {
		case <-ctx.Done():
			return envelope.Fact[SessionFact]{}, ctx.Err()
		case <-subscription.fanout.done:
			return envelope.Fact[SessionFact]{}, ErrClosed
		case <-subscription.state.done:
			return envelope.Fact[SessionFact]{}, ErrClosed
		case <-subscription.state.signal:
		}
	}
}

func (subscription *FactSubscription[S]) Close(_ context.Context) error {
	if subscription == nil || subscription.fanout == nil || subscription.state == nil {
		return nil
	}
	subscription.fanout.mu.Lock()
	if _, exists := subscription.fanout.factReaders[subscription]; exists {
		delete(subscription.fanout.factReaders, subscription)
		close(subscription.state.done)
	}
	subscription.fanout.mu.Unlock()
	return nil
}

func (metrics FanoutMetrics) String() string {
	return fmt.Sprintf(
		"snapshots=%d superseded=%d facts=%d queue=%d/%d resyncs=%d",
		metrics.SnapshotsPublished,
		metrics.SnapshotDeliveriesSuperseded,
		metrics.FactsPublished,
		metrics.FactQueueDepth,
		metrics.FactQueueCapacity,
		metrics.ResyncsRequired,
	)
}
