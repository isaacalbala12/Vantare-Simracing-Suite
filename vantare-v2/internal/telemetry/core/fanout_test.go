package core

import (
	"context"
	"errors"
	"math"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestFanoutInitialSnapshotAndStatusAreAtomic(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{})
	snapshot := fanoutSnapshot(t, 1, []int{10})
	status := FanoutStatus{State: driver.StateLive, ReconnectAttempt: 2}
	if err := fanout.PublishSnapshot(snapshot, status, 0, 7); err != nil {
		t.Fatalf("PublishSnapshot() error = %v", err)
	}

	subscription, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	t.Cleanup(func() {
		if err := subscription.Close(context.Background()); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	frame, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatalf("Next() error = %v", err)
	}
	value, ok := frame.Snapshot.Value()
	if !ok || !slices.Equal(value, []int{10}) {
		t.Fatalf("snapshot value = %v, %v", value, ok)
	}
	if frame.Snapshot.Header().Cursor != (schema.Cursor{Epoch: 1, Sequence: 1}) {
		t.Fatalf("cursor = %+v", frame.Snapshot.Header().Cursor)
	}
	if frame.Status != status || frame.Revision != 1 || frame.FactSequence != 0 {
		t.Fatalf("frame = %#v", frame)
	}
}

func TestFanoutSlowSnapshotSubscriberGetsLatestWithoutBlockingPublisher(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{})
	subscription, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	t.Cleanup(func() {
		if err := subscription.Close(context.Background()); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	const publications = 1_000
	for sequence := schema.Sequence(1); sequence <= publications; sequence++ {
		snapshot := fanoutSnapshot(t, sequence, []int{int(sequence)})
		if err := fanout.PublishSnapshot(snapshot, FanoutStatus{State: driver.StateLive}, 0, 1); err != nil {
			t.Fatalf("PublishSnapshot(%d) error = %v", sequence, err)
		}
	}

	frame, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatalf("Next() error = %v", err)
	}
	value, ok := frame.Snapshot.Value()
	if !ok || !slices.Equal(value, []int{publications}) {
		t.Fatalf("latest snapshot = %v, %v", value, ok)
	}
	metrics := fanout.Metrics()
	if metrics.SnapshotsPublished != publications ||
		metrics.SnapshotDeliveriesSuperseded != publications-1 ||
		metrics.CurrentMaxSnapshotLag != 0 {
		t.Fatalf("metrics = %#v", metrics)
	}
}

func TestFanoutFactsUseIndependentOrderedSequence(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{FactRetention: 4})
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}
	t.Cleanup(func() {
		if err := facts.Close(context.Background()); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	fact := fanoutFact(1, 7, FactLapCompleted)
	if err := fanout.WriteFacts(context.Background(), []envelope.Fact[SessionFact]{fact}); err != nil {
		t.Fatalf("WriteFacts() error = %v", err)
	}
	if err := fanout.PublishSnapshot(
		fanoutSnapshot(t, 1, []int{8}),
		FanoutStatus{State: driver.StateLive},
		1,
		1,
	); err != nil {
		t.Fatalf("PublishSnapshot() error = %v", err)
	}

	frame, err := fanout.Latest(context.Background())
	if err != nil {
		t.Fatalf("Latest() error = %v", err)
	}
	if frame.Snapshot.Header().Cursor.Sequence != 1 || frame.FactSequence != 1 {
		t.Fatalf("independent cursors = snapshot %d, facts %d",
			frame.Snapshot.Header().Cursor.Sequence, frame.FactSequence)
	}
	got, err := facts.Next(context.Background())
	if err != nil {
		t.Fatalf("Next() error = %v", err)
	}
	if got.Value().Sequence != 1 || got.Header().Cursor.Sequence != 7 {
		t.Fatalf("fact = %#v header=%+v", got.Value(), got.Header())
	}
}

func TestFanoutSnapshotFactCoverageDoesNotSkipLaterFacts(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{FactRetention: 4})
	if err := fanout.WriteFacts(
		context.Background(),
		[]envelope.Fact[SessionFact]{fanoutFact(1, 1, FactSessionStarted)},
	); err != nil {
		t.Fatalf("WriteFacts(first) error = %v", err)
	}
	if err := fanout.PublishSnapshot(
		fanoutSnapshot(t, 1, []int{1}),
		FanoutStatus{State: driver.StateLive},
		1,
		0,
	); err != nil {
		t.Fatalf("PublishSnapshot(first) error = %v", err)
	}

	if err := fanout.WriteFacts(
		context.Background(),
		[]envelope.Fact[SessionFact]{fanoutFact(2, 2, FactLapCompleted)},
	); err != nil {
		t.Fatalf("WriteFacts(later) error = %v", err)
	}
	if err := fanout.PublishSnapshot(
		fanoutSnapshot(t, 2, []int{1}),
		FanoutStatus{State: driver.StateLive},
		1,
		0,
	); err != nil {
		t.Fatalf("PublishSnapshot(older coverage) error = %v", err)
	}

	frame, err := fanout.Latest(context.Background())
	if err != nil {
		t.Fatalf("Latest() error = %v", err)
	}
	if frame.FactSequence != 1 {
		t.Fatalf("snapshot fact coverage = %d, want 1", frame.FactSequence)
	}
	resumed, err := fanout.SubscribeFacts(context.Background(), frame.FactSequence)
	if err != nil {
		t.Fatalf("SubscribeFacts(resume) error = %v", err)
	}
	t.Cleanup(func() {
		if err := resumed.Close(context.Background()); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})
	fact, err := resumed.Next(context.Background())
	if err != nil {
		t.Fatalf("Next() error = %v", err)
	}
	if fact.Value().Sequence != 2 {
		t.Fatalf("resumed fact = %d, want 2", fact.Value().Sequence)
	}

	err = fanout.PublishSnapshot(
		fanoutSnapshot(t, 3, []int{3}),
		FanoutStatus{State: driver.StateLive},
		3,
		0,
	)
	if !errors.Is(err, ErrFactSequenceGap) {
		t.Fatalf("PublishSnapshot(future coverage) error = %v, want %v", err, ErrFactSequenceGap)
	}
	err = fanout.PublishSnapshot(
		fanoutSnapshot(t, 3, []int{3}),
		FanoutStatus{State: driver.StateLive},
		0,
		0,
	)
	if !errors.Is(err, ErrFactSequenceGap) {
		t.Fatalf("PublishSnapshot(regressed coverage) error = %v, want %v", err, ErrFactSequenceGap)
	}
}

func TestFanoutRejectsFactSequenceGapAtomically(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{FactRetention: 4})
	if err := fanout.WriteFacts(
		context.Background(),
		[]envelope.Fact[SessionFact]{fanoutFact(1, 1, FactSessionStarted)},
	); err != nil {
		t.Fatalf("WriteFacts(first) error = %v", err)
	}
	err := fanout.WriteFacts(
		context.Background(),
		[]envelope.Fact[SessionFact]{
			fanoutFact(2, 2, FactLapCompleted),
			fanoutFact(4, 2, FactPitEntered),
		},
	)
	if !errors.Is(err, ErrFactSequenceGap) {
		t.Fatalf("WriteFacts(gap) error = %v, want %v", err, ErrFactSequenceGap)
	}

	metrics := fanout.Metrics()
	if metrics.FactsPublished != 1 || metrics.FactQueueDepth != 1 {
		t.Fatalf("metrics after rejected batch = %#v", metrics)
	}
}

func TestFanoutSlowFactSubscriberRequiresFullSnapshotResync(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{FactRetention: 2})
	subscription, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}
	t.Cleanup(func() {
		if err := subscription.Close(context.Background()); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	for sequence := FactSequence(1); sequence <= 3; sequence++ {
		if err := fanout.WriteFacts(
			context.Background(),
			[]envelope.Fact[SessionFact]{fanoutFact(sequence, schema.Sequence(sequence), FactLapCompleted)},
		); err != nil {
			t.Fatalf("WriteFacts(%d) error = %v", sequence, err)
		}
	}
	if err := fanout.PublishSnapshot(
		fanoutSnapshot(t, 1, []int{3}),
		FanoutStatus{State: driver.StateLive},
		3,
		1,
	); err != nil {
		t.Fatalf("PublishSnapshot() error = %v", err)
	}

	_, err = subscription.Next(context.Background())
	if !errors.Is(err, ErrFactResyncRequired) {
		t.Fatalf("Next() error = %v, want %v", err, ErrFactResyncRequired)
	}
	var gap *factResyncRequiredError
	if !errors.As(err, &gap) || gap.Previous != 0 || gap.Next != 2 {
		t.Fatalf("typed gap = %#v", gap)
	}

	full, err := fanout.Latest(context.Background())
	if err != nil {
		t.Fatalf("Latest() error = %v", err)
	}
	if full.FactSequence != 3 {
		t.Fatalf("full snapshot fact sequence = %d, want 3", full.FactSequence)
	}
	resumed, err := fanout.SubscribeFacts(context.Background(), full.FactSequence)
	if err != nil {
		t.Fatalf("SubscribeFacts(resume) error = %v", err)
	}
	if err := resumed.Close(context.Background()); err != nil {
		t.Fatalf("Close(resumed) error = %v", err)
	}

	metrics := fanout.Metrics()
	if metrics.FactQueueDepth != 2 || metrics.FactQueueCapacity != 2 ||
		metrics.FactsPublished != 3 || metrics.ResyncsRequired != 1 {
		t.Fatalf("metrics = %#v", metrics)
	}
}

func TestFanoutMetricsTrackLagLifecycleAndDerivationCost(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{})
	subscription, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	t.Cleanup(func() {
		if err := subscription.Close(context.Background()); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	publications := []struct {
		state     driver.State
		reconnect int
		cost      time.Duration
	}{
		{state: driver.StateLive, cost: 2 * time.Microsecond},
		{state: driver.StateStale, reconnect: 1, cost: 3 * time.Microsecond},
		{state: driver.StateStale, reconnect: 1, cost: 4 * time.Microsecond},
		{state: driver.StateLive, reconnect: 2, cost: 5 * time.Microsecond},
	}
	for index, publication := range publications {
		if err := fanout.PublishSnapshot(
			fanoutSnapshot(t, schema.Sequence(index+1), []int{index}),
			FanoutStatus{State: publication.state, ReconnectAttempt: publication.reconnect},
			0,
			publication.cost,
		); err != nil {
			t.Fatalf("PublishSnapshot(%d) error = %v", index+1, err)
		}
	}

	metrics := fanout.Metrics()
	if metrics.CurrentMaxSnapshotLag != 4 || metrics.StaleTransitions != 1 ||
		metrics.Reconnects != 2 || metrics.DerivationSamples != 4 ||
		metrics.DerivationTotal != 14*time.Microsecond ||
		metrics.DerivationMax != 5*time.Microsecond {
		t.Fatalf("metrics before read = %#v", metrics)
	}
	if _, err := subscription.Next(context.Background()); err != nil {
		t.Fatalf("Next() error = %v", err)
	}
	if lag := fanout.Metrics().CurrentMaxSnapshotLag; lag != 0 {
		t.Fatalf("lag after latest delivery = %d", lag)
	}
}

func TestFanoutSnapshotDeliveryMetricsArePerSubscriberAndCurrent(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{})
	first, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots(first) error = %v", err)
	}
	second, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots(second) error = %v", err)
	}
	t.Cleanup(func() {
		if err := first.Close(context.Background()); err != nil {
			t.Fatalf("first.Close() error = %v", err)
		}
		if err := second.Close(context.Background()); err != nil {
			t.Fatalf("second.Close() error = %v", err)
		}
	})

	for sequence := schema.Sequence(1); sequence <= 2; sequence++ {
		if err := fanout.PublishSnapshot(
			fanoutSnapshot(t, sequence, []int{int(sequence)}),
			FanoutStatus{State: driver.StateLive},
			0,
			0,
		); err != nil {
			t.Fatalf("PublishSnapshot(%d) error = %v", sequence, err)
		}
	}
	metrics := fanout.Metrics()
	if metrics.SnapshotDeliveriesSuperseded != 2 ||
		metrics.CurrentMaxSnapshotLag != 2 {
		t.Fatalf("metrics before delivery = %#v", metrics)
	}
	if _, err := first.Next(context.Background()); err != nil {
		t.Fatalf("first.Next() error = %v", err)
	}
	metrics = fanout.Metrics()
	if metrics.SnapshotDeliveriesSuperseded != 2 ||
		metrics.CurrentMaxSnapshotLag != 2 {
		t.Fatalf("metrics after one delivery = %#v", metrics)
	}
	if _, err := second.Next(context.Background()); err != nil {
		t.Fatalf("second.Next() error = %v", err)
	}
	if lag := fanout.Metrics().CurrentMaxSnapshotLag; lag != 0 {
		t.Fatalf("current lag after both deliveries = %d", lag)
	}
}

func TestFanoutRejectsInvalidSnapshotCursorAtomically(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{})
	if err := fanout.PublishSnapshot(
		fanoutSnapshot(t, 1, []int{1}),
		FanoutStatus{State: driver.StateLive},
		0,
		1,
	); err != nil {
		t.Fatalf("PublishSnapshot(first) error = %v", err)
	}
	err := fanout.PublishSnapshot(
		fanoutSnapshot(t, 3, []int{3}),
		FanoutStatus{State: driver.StateStale, ReconnectAttempt: 1},
		0,
		10,
	)
	if !errors.Is(err, ErrSequenceGap) {
		t.Fatalf("PublishSnapshot(gap) error = %v, want %v", err, ErrSequenceGap)
	}

	latest, err := fanout.Latest(context.Background())
	if err != nil {
		t.Fatalf("Latest() error = %v", err)
	}
	metrics := fanout.Metrics()
	if latest.Snapshot.Header().Cursor.Sequence != 1 ||
		latest.Status.State != driver.StateLive ||
		metrics.SnapshotsPublished != 1 ||
		metrics.StaleTransitions != 0 ||
		metrics.DerivationSamples != 1 {
		t.Fatalf("state changed after rejected snapshot: frame=%#v metrics=%#v", latest, metrics)
	}
}

func TestFanoutSubscriberBudgetsAreHardLimits(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{
		SnapshotSubscribers: 1,
		FactSubscribers:     1,
	})
	snapshot, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots(first) error = %v", err)
	}
	if _, err := fanout.SubscribeSnapshots(context.Background()); !errors.Is(err, ErrSubscriberLimit) {
		t.Fatalf("SubscribeSnapshots(second) error = %v, want %v", err, ErrSubscriberLimit)
	}
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts(first) error = %v", err)
	}
	if _, err := fanout.SubscribeFacts(context.Background(), 0); !errors.Is(err, ErrSubscriberLimit) {
		t.Fatalf("SubscribeFacts(second) error = %v, want %v", err, ErrSubscriberLimit)
	}
	if err := snapshot.Close(context.Background()); err != nil {
		t.Fatalf("snapshot Close() error = %v", err)
	}
	if err := facts.Close(context.Background()); err != nil {
		t.Fatalf("facts Close() error = %v", err)
	}
}

func TestFanoutTeardownUnblocksWaitersAndRejectsLateWrites(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{})
	snapshots, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}

	started := make(chan struct{}, 2)
	results := make(chan error, 2)
	go func() {
		started <- struct{}{}
		_, nextErr := snapshots.Next(context.Background())
		results <- nextErr
	}()
	go func() {
		started <- struct{}{}
		_, nextErr := facts.Next(context.Background())
		results <- nextErr
	}()
	<-started
	<-started

	if err := fanout.Close(context.Background()); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := fanout.Close(context.Background()); err != nil {
		t.Fatalf("Close(idempotent) error = %v", err)
	}
	for range 2 {
		if err := <-results; !errors.Is(err, ErrClosed) {
			t.Fatalf("waiter error = %v, want %v", err, ErrClosed)
		}
	}
	metrics := fanout.Metrics()
	if metrics.SnapshotSubscribers != 0 || metrics.FactSubscribers != 0 {
		t.Fatalf("subscriptions retained after teardown: %#v", metrics)
	}
	if err := fanout.PublishSnapshot(
		fanoutSnapshot(t, 1, []int{1}),
		FanoutStatus{State: driver.StateLive},
		0,
		0,
	); !errors.Is(err, ErrClosed) {
		t.Fatalf("late PublishSnapshot() error = %v, want %v", err, ErrClosed)
	}
	if err := fanout.WriteFacts(
		context.Background(),
		[]envelope.Fact[SessionFact]{fanoutFact(1, 1, FactLapCompleted)},
	); !errors.Is(err, ErrClosed) {
		t.Fatalf("late WriteFacts() error = %v, want %v", err, ErrClosed)
	}
}

func TestFanoutCloseWithCanceledContextStillReleasesOwnership(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{})
	snapshots, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}

	results := make(chan error, 2)
	go func() {
		_, nextErr := snapshots.Next(context.Background())
		results <- nextErr
	}()
	go func() {
		_, nextErr := facts.Next(context.Background())
		results <- nextErr
	}()

	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := fanout.Close(canceled); err != nil {
		t.Fatalf("Close(canceled) error = %v", err)
	}
	if err := fanout.Close(canceled); err != nil {
		t.Fatalf("Close(canceled, idempotent) error = %v", err)
	}
	for range 2 {
		if err := <-results; !errors.Is(err, ErrClosed) {
			t.Fatalf("waiter error = %v, want %v", err, ErrClosed)
		}
	}
	metrics := fanout.Metrics()
	if metrics.SnapshotSubscribers != 0 || metrics.FactSubscribers != 0 {
		t.Fatalf("subscriptions retained after canceled teardown: %#v", metrics)
	}
}

func TestSubscriptionCloseWithCanceledContextIsIdempotent(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{
		SnapshotSubscribers: 1,
		FactSubscribers:     1,
	})
	snapshots, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := snapshots.Close(canceled); err != nil {
		t.Fatalf("snapshots.Close(canceled) error = %v", err)
	}
	if err := facts.Close(canceled); err != nil {
		t.Fatalf("facts.Close(canceled) error = %v", err)
	}
	if err := snapshots.Close(canceled); err != nil {
		t.Fatalf("snapshots.Close(canceled, idempotent) error = %v", err)
	}
	if err := facts.Close(canceled); err != nil {
		t.Fatalf("facts.Close(canceled, idempotent) error = %v", err)
	}

	replacementSnapshots, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots(replacement) error = %v", err)
	}
	replacementFacts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts(replacement) error = %v", err)
	}
	if err := replacementSnapshots.Close(context.Background()); err != nil {
		t.Fatalf("replacementSnapshots.Close() error = %v", err)
	}
	if err := replacementFacts.Close(context.Background()); err != nil {
		t.Fatalf("replacementFacts.Close() error = %v", err)
	}
}

func TestFanoutAndSubscriptionsCanCloseConcurrently(t *testing.T) {
	t.Parallel()

	const iterations = 1_000
	for range iterations {
		fanout := NewFanout[[]int](FanoutConfig{})
		snapshots, err := fanout.SubscribeSnapshots(context.Background())
		if err != nil {
			t.Fatalf("SubscribeSnapshots() error = %v", err)
		}
		facts, err := fanout.SubscribeFacts(context.Background(), 0)
		if err != nil {
			t.Fatalf("SubscribeFacts() error = %v", err)
		}

		var wait sync.WaitGroup
		wait.Add(3)
		go func() {
			defer wait.Done()
			if closeErr := snapshots.Close(context.Background()); closeErr != nil {
				t.Errorf("snapshots.Close() error = %v", closeErr)
			}
		}()
		go func() {
			defer wait.Done()
			if closeErr := facts.Close(context.Background()); closeErr != nil {
				t.Errorf("facts.Close() error = %v", closeErr)
			}
		}()
		go func() {
			defer wait.Done()
			if closeErr := fanout.Close(context.Background()); closeErr != nil {
				t.Errorf("fanout.Close() error = %v", closeErr)
			}
		}()
		wait.Wait()
	}
}

func TestFactSubscriptionStopsAfterMaxSequence(t *testing.T) {
	t.Parallel()

	fanout := NewFanout[[]int](FanoutConfig{FactRetention: 2})
	fanout.lastFact = FactSequence(math.MaxUint64 - 1)
	subscription, err := fanout.SubscribeFacts(context.Background(), fanout.lastFact)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}
	t.Cleanup(func() {
		if err := subscription.Close(context.Background()); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})
	if err := fanout.WriteFacts(
		context.Background(),
		[]envelope.Fact[SessionFact]{
			fanoutFact(FactSequence(math.MaxUint64), 1, FactLapCompleted),
		},
	); err != nil {
		t.Fatalf("WriteFacts(max) error = %v", err)
	}
	fact, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatalf("Next(max) error = %v", err)
	}
	if fact.Value().Sequence != FactSequence(math.MaxUint64) {
		t.Fatalf("fact sequence = %d, want max", fact.Value().Sequence)
	}
	if _, err := subscription.Next(context.Background()); !errors.Is(err, ErrFactSequenceExhausted) {
		t.Fatalf("Next(after max) error = %v, want %v", err, ErrFactSequenceExhausted)
	}
}

func TestFanoutDeterministicSoakStaysBounded(t *testing.T) {
	t.Parallel()

	const (
		iterations = 20_000
		retention  = 64
	)
	fanout := NewFanout[[]int](FanoutConfig{FactRetention: retention})
	snapshots, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}

	for sequence := 1; sequence <= iterations; sequence++ {
		factSequence := FactSequence(sequence)
		if err := fanout.WriteFacts(
			context.Background(),
			[]envelope.Fact[SessionFact]{
				fanoutFact(factSequence, schema.Sequence(sequence), FactLapCompleted),
			},
		); err != nil {
			t.Fatalf("WriteFacts(%d) error = %v", sequence, err)
		}
		if err := fanout.PublishSnapshot(
			fanoutSnapshot(t, schema.Sequence(sequence), []int{sequence}),
			FanoutStatus{State: driver.StateLive},
			factSequence,
			1,
		); err != nil {
			t.Fatalf("PublishSnapshot(%d) error = %v", sequence, err)
		}
	}

	latest, err := snapshots.Next(context.Background())
	if err != nil {
		t.Fatalf("snapshot Next() error = %v", err)
	}
	value, ok := latest.Snapshot.Value()
	if !ok || !slices.Equal(value, []int{iterations}) ||
		latest.Revision != iterations || latest.FactSequence != iterations {
		t.Fatalf("latest frame = %#v, value=%v present=%v", latest, value, ok)
	}
	if _, err := facts.Next(context.Background()); !errors.Is(err, ErrFactResyncRequired) {
		t.Fatalf("fact Next() error = %v, want %v", err, ErrFactResyncRequired)
	}

	metrics := fanout.Metrics()
	if metrics.FactQueueDepth != retention ||
		metrics.FactQueueCapacity != retention ||
		metrics.SnapshotDeliveriesSuperseded != iterations-1 ||
		metrics.ResyncsRequired != 1 {
		t.Fatalf("bounded soak metrics = %#v", metrics)
	}
	if err := fanout.Close(context.Background()); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestFanoutConcurrentReadersPreserveFactsAndReachLatestSnapshot(t *testing.T) {
	t.Parallel()

	const publications = 500
	fanout := NewFanout[[]int](FanoutConfig{FactRetention: publications})
	snapshots, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		t.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	facts, err := fanout.SubscribeFacts(context.Background(), 0)
	if err != nil {
		t.Fatalf("SubscribeFacts() error = %v", err)
	}

	factResult := make(chan error, 1)
	go func() {
		for want := FactSequence(1); want <= publications; want++ {
			fact, nextErr := facts.Next(context.Background())
			if nextErr != nil {
				factResult <- nextErr
				return
			}
			if fact.Value().Sequence != want {
				factResult <- errors.New("fact sequence changed")
				return
			}
		}
		factResult <- nil
	}()
	snapshotResult := make(chan error, 1)
	go func() {
		for {
			frame, nextErr := snapshots.Next(context.Background())
			if nextErr != nil {
				snapshotResult <- nextErr
				return
			}
			if frame.Revision == publications {
				snapshotResult <- nil
				return
			}
		}
	}()

	for sequence := 1; sequence <= publications; sequence++ {
		if err := fanout.WriteFacts(
			context.Background(),
			[]envelope.Fact[SessionFact]{
				fanoutFact(FactSequence(sequence), schema.Sequence(sequence), FactLapCompleted),
			},
		); err != nil {
			t.Fatalf("WriteFacts(%d) error = %v", sequence, err)
		}
		if err := fanout.PublishSnapshot(
			fanoutSnapshot(t, schema.Sequence(sequence), []int{sequence}),
			FanoutStatus{State: driver.StateLive},
			FactSequence(sequence),
			0,
		); err != nil {
			t.Fatalf("PublishSnapshot(%d) error = %v", sequence, err)
		}
	}
	if err := <-factResult; err != nil {
		t.Fatalf("fact reader error = %v", err)
	}
	if err := <-snapshotResult; err != nil {
		t.Fatalf("snapshot reader error = %v", err)
	}
	if err := fanout.Close(context.Background()); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func BenchmarkFanoutPublishSnapshot64Vehicles(b *testing.B) {
	state := ObservedState{Vehicles: make([]VehicleState, 64)}
	for index := range state.Vehicles {
		state.Vehicles[index].Identity = identity.RunIdentity{
			Event:   "event",
			Session: "session",
			Vehicle: identity.VehicleID(string(rune(index + 1))),
		}
	}
	fanout := NewFanout[ObservedState](FanoutConfig{})
	subscription, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		b.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	b.Cleanup(func() {
		if err := subscription.Close(context.Background()); err != nil {
			b.Fatalf("Close() error = %v", err)
		}
	})

	var sequence schema.Sequence
	b.ReportAllocs()
	for b.Loop() {
		sequence++
		snapshot, snapshotErr := envelope.NewSnapshot(
			envelope.Header{
				Cursor: schema.Cursor{Epoch: 1, Sequence: sequence},
				Identity: identity.RunIdentity{
					Event:   "event",
					Session: "session",
					Vehicle: state.Vehicles[0].Identity.Vehicle,
				},
			},
			state,
			cloneObservedState,
		)
		if snapshotErr != nil {
			b.Fatalf("NewSnapshot() error = %v", snapshotErr)
		}
		if err := fanout.PublishSnapshot(
			snapshot,
			FanoutStatus{State: driver.StateLive},
			0,
			0,
		); err != nil {
			b.Fatalf("PublishSnapshot() error = %v", err)
		}
	}
}

func BenchmarkFanoutPublishSnapshotScalar(b *testing.B) {
	fanout := NewFanout[int](FanoutConfig{})
	subscription, err := fanout.SubscribeSnapshots(context.Background())
	if err != nil {
		b.Fatalf("SubscribeSnapshots() error = %v", err)
	}
	b.Cleanup(func() {
		if err := subscription.Close(context.Background()); err != nil {
			b.Fatalf("Close() error = %v", err)
		}
	})

	var sequence schema.Sequence
	b.ReportAllocs()
	for b.Loop() {
		sequence++
		snapshot, snapshotErr := envelope.NewSnapshot(
			envelope.Header{
				Cursor: schema.Cursor{Epoch: 1, Sequence: sequence},
				Identity: identity.RunIdentity{
					Event:   "event",
					Session: "session",
					Vehicle: "vehicle",
				},
			},
			int(sequence),
			func(value int) int { return value },
		)
		if snapshotErr != nil {
			b.Fatalf("NewSnapshot() error = %v", snapshotErr)
		}
		if err := fanout.PublishSnapshot(
			snapshot,
			FanoutStatus{State: driver.StateLive},
			0,
			0,
		); err != nil {
			b.Fatalf("PublishSnapshot() error = %v", err)
		}
	}
}

func BenchmarkFanoutWriteFact(b *testing.B) {
	fanout := NewFanout[int](FanoutConfig{FactRetention: MaxFactRetention})
	var (
		sequence FactSequence
		batch    [1]envelope.Fact[SessionFact]
	)

	b.ReportAllocs()
	for b.Loop() {
		sequence++
		batch[0] = fanoutFact(sequence, schema.Sequence(sequence), FactLapCompleted)
		if err := fanout.WriteFacts(context.Background(), batch[:]); err != nil {
			b.Fatalf("WriteFacts() error = %v", err)
		}
	}
}

func fanoutSnapshot(t testing.TB, sequence schema.Sequence, value []int) envelope.Snapshot[[]int] {
	t.Helper()
	snapshot, err := envelope.NewSnapshot(
		envelope.Header{
			Cursor: schema.Cursor{Epoch: 1, Sequence: sequence},
			Identity: identity.RunIdentity{
				Event:   "event",
				Session: "session",
				Vehicle: "vehicle",
			},
		},
		value,
		slices.Clone,
	)
	if err != nil {
		t.Fatalf("NewSnapshot() error = %v", err)
	}
	return snapshot
}

func fanoutFact(
	sequence FactSequence,
	snapshotSequence schema.Sequence,
	kind FactKind,
) envelope.Fact[SessionFact] {
	header := envelope.Header{Cursor: schema.Cursor{Epoch: 1, Sequence: snapshotSequence}}
	return envelope.NewFact(header, SessionFact{Sequence: sequence, Kind: kind})
}
