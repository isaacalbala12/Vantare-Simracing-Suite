package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/recording"
	recordingsqlite "github.com/vantare/overlays/v2/internal/telemetry/recording/sqlite"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

const (
	hardeningSoakVehicles                  = 64
	hardeningSoakSubscribersPerProduct     = 6
	hardeningSoakFastSubscribersPerProduct = hardeningSoakSubscribersPerProduct - 1
	hardeningSoakSamples                   = 121 // one-minute samples cover exactly two logical hours
	hardeningSampleInterval                = time.Minute
)

func TestTelemetryCoreTwoHourLogicalSoakIsBoundedAndPayloadFree(t *testing.T) {
	consumer := &countingEngineerConsumer{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}

	overlaySubscriptions := subscribeHardeningProduct(t, runtime.Hub())
	strategySubscriptions := subscribeHardeningProduct(t, runtime.StrategyHub())

	root := t.TempDir()
	const sessionID = "session-local-hardening"
	ref := recording.SessionRef{Root: root, SessionID: sessionID}
	manifest := recording.NewSessionManifest(sessionID, "lmu", "hardening-test", hardeningSoakStart)
	recorder, err := recording.NewCoordinator(
		logicalSoakStore{HistoricalStore: recordingsqlite.New(recordingsqlite.Options{})},
		ref,
		manifest,
		recording.CoordinatorConfig{
			QueueCapacity: 1024,
			// This is a logical soak, not a wall-clock disk benchmark. Keep the
			// production commit budget while making elapsed-time checks immune to
			// pauses on shared CI runners.
			Clock: fixedRecordingClock{now: hardeningSoakStart},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	soakContext, cancelSoak := context.WithTimeout(context.Background(), 30*time.Second)
	if err := recorder.Start(soakContext); err != nil {
		cancelSoak()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupContext, cancelCleanup := context.WithTimeout(context.Background(), 15*time.Second)
		err := recorder.Stop(cleanupContext)
		cancelCleanup()
		cancelSoak()
		if err != nil {
			t.Errorf("cleanup recording coordinator: %v", err)
		}
	})
	mapper := recording.NewMapper()

	for sequence := uint64(1); sequence <= hardeningSoakSamples; sequence++ {
		batch := hardeningBatch(sequence, hardeningSoakVehicles)
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); err != nil {
			t.Fatalf("pipeline sequence %d: %v", sequence, err)
		}
		observed, ok := runtime.reducer.Current()
		if !ok {
			t.Fatalf("observed sequence %d unavailable", sequence)
		}
		payload, mapErr := mapper.Payload(observed)
		if mapErr != nil {
			t.Fatalf("recording map sequence %d: %v", sequence, mapErr)
		}
		if err := recorder.TryAccept(recording.RecordingBatch{
			Observed: []recording.RecordingPayloadV1{payload},
			Accepted: payload.Cursor(),
		}); err != nil {
			t.Fatalf("recording sequence %d: %v", sequence, err)
		}

		for index := range hardeningSoakFastSubscribersPerProduct {
			if sequence == 1 {
				assertHardeningStatusEvent(t, overlaySubscriptions[index], telemetrytransport.ProductOverlay)
				assertHardeningStatusEvent(t, strategySubscriptions[index], telemetrytransport.ProductStrategy)
			}
			assertHardeningSnapshotEvent(t, overlaySubscriptions[index], telemetrytransport.ProductOverlay, 1, schema.Sequence(sequence), telemetrytransport.Full)
			assertHardeningSnapshotEvent(t, strategySubscriptions[index], telemetrytransport.ProductStrategy, 1, schema.Sequence(sequence), telemetrytransport.Full)
		}
	}

	// Each product keeps one intentionally slow subscriber. Latest-wins
	// coalescing must preserve status plus the final full, never a backlog.
	overlaySlow := overlaySubscriptions[hardeningSoakFastSubscribersPerProduct]
	strategySlow := strategySubscriptions[hardeningSoakFastSubscribersPerProduct]
	assertHardeningStatusEvent(t, overlaySlow, telemetrytransport.ProductOverlay)
	assertHardeningStatusEvent(t, strategySlow, telemetrytransport.ProductStrategy)
	assertHardeningSnapshotEvent(t, overlaySlow, telemetrytransport.ProductOverlay, 1, hardeningSoakSamples, telemetrytransport.Full)
	assertHardeningSnapshotEvent(t, strategySlow, telemetrytransport.ProductStrategy, 1, hardeningSoakSamples, telemetrytransport.Full)
	assertHardeningQueueEmpty(t, overlaySlow, telemetrytransport.ProductOverlay)
	assertHardeningQueueEmpty(t, strategySlow, telemetrytransport.ProductStrategy)

	stopContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := recorder.Stop(stopContext); err != nil {
		t.Fatal(err)
	}
	status := recorder.Status()
	if status.State != recording.StateComplete || status.AcceptedBatches != hardeningSoakSamples ||
		status.CommittedBatches != hardeningSoakSamples || status.QueueDepth != 0 ||
		status.RejectedBatches != 0 || status.QueueCapacity != 1024 {
		t.Fatalf("recorder status = %#v", status)
	}

	metrics := runtime.Metrics()
	if metrics.ObservationsRejected != 0 ||
		metrics.BatchesApplied != hardeningSoakSamples ||
		metrics.ProjectionsPublished != hardeningSoakSamples ||
		metrics.OverlayProjectionsPublished != hardeningSoakSamples ||
		metrics.StrategyProjectionsPublished != hardeningSoakSamples ||
		metrics.EngineerStatusesDelivered != hardeningSoakSamples ||
		metrics.EngineerObservations != hardeningSoakSamples ||
		metrics.EngineerFacts == 0 || metrics.EngineerFacts != consumer.facts ||
		metrics.EngineerDeliveryFailures != 0 ||
		metrics.Transport.CurrentSubscribers != hardeningSoakSubscribersPerProduct ||
		metrics.StrategyTransport.CurrentSubscribers != hardeningSoakSubscribersPerProduct ||
		metrics.Transport.StatusPublications != 1 ||
		metrics.StrategyTransport.StatusPublications != 1 ||
		metrics.Transport.SnapshotPublications != hardeningSoakSamples ||
		metrics.StrategyTransport.SnapshotPublications != hardeningSoakSamples ||
		metrics.Transport.SnapshotReplacements != hardeningSoakSamples-1 ||
		metrics.StrategyTransport.SnapshotReplacements != hardeningSoakSamples-1 ||
		metrics.Transport.DeltasRetained != 0 || metrics.StrategyTransport.DeltasRetained != 0 {
		t.Fatalf("runtime metrics = %#v", metrics)
	}
	if consumer.statuses != hardeningSoakSamples || consumer.observations != hardeningSoakSamples ||
		consumer.facts == 0 || consumer.failures != 0 {
		t.Fatalf("Engineer counts = statuses %d observations %d facts %d failures %d", consumer.statuses, consumer.observations, consumer.facts, consumer.failures)
	}
	assertMetricsContainNoPersonalPayload(t, metrics)

	for _, subscriptions := range [][]*telemetrytransport.Subscription{overlaySubscriptions, strategySubscriptions} {
		for _, subscription := range subscriptions {
			if err := subscription.Close(); err != nil {
				t.Fatal(err)
			}
		}
	}
	metrics = runtime.Metrics()
	if metrics.Transport.CurrentSubscribers != 0 || metrics.StrategyTransport.CurrentSubscribers != 0 {
		t.Fatalf("subscribers after teardown: Overlay=%d Strategy=%d", metrics.Transport.CurrentSubscribers, metrics.StrategyTransport.CurrentSubscribers)
	}
}

func TestTelemetryCoreMetricsCountRejectedObservationWithoutPayload(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	// El frame se cuenta como rechazado pero no se propaga: llegar hasta
	// DriverManager lo convertia en un error terminal y apagaba la telemetria
	// hasta reiniciar la aplicacion. Rechazado no es fatal.
	err = (runtimeObservationSink{runtime: runtime}).WriteObservation(
		context.Background(),
		structuralInvalidObservation(),
	)
	if err != nil {
		t.Fatalf("unmappable observation must not be fatal, got %v", err)
	}
	metrics := runtime.Metrics()
	if metrics.ObservationsReceived != 1 || metrics.ObservationsRejected != 1 {
		t.Fatalf("metrics = %#v", metrics)
	}
	assertMetricsContainNoPersonalPayload(t, metrics)
}

func BenchmarkTelemetryCoreCombined64Vehicles(b *testing.B) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: &countingEngineerConsumer{}})
	if err != nil {
		b.Fatal(err)
	}
	batch := hardeningBatch(1, hardeningSoakVehicles)
	var sequence uint64
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		sequence++
		batch.Header.Cursor.Sequence = schema.Sequence(sequence)
		batch.Header.Clock = hardeningClock(sequence)
		batch.State.SourceTime = runtimePresent(time.Duration(sequence-1) * hardeningSampleInterval)
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); err != nil {
			b.Fatal(err)
		}
	}
	b.StopTimer()
	// This historical combined benchmark is the regression signal for the
	// complete Overlay + Engineer + Strategy fan-out. Keep the counter guard so
	// Strategy cannot be removed while the benchmark still appears healthy.
	metrics := runtime.Metrics()
	if metrics.BatchesApplied != sequence || metrics.ProjectionsPublished != sequence ||
		metrics.OverlayProjectionsPublished != sequence || metrics.StrategyProjectionsPublished != sequence ||
		metrics.EngineerObservations != sequence || metrics.EngineerDeliveryFailures != 0 {
		b.Fatalf("combined runtime metrics = %#v, iterations = %d", metrics, sequence)
	}
}

var hardeningSoakStart = time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)

type fixedRecordingClock struct{ now time.Time }

func (c fixedRecordingClock) Now() time.Time { return c.now }

// logicalSoakStore keeps the real storage implementation but makes its writer
// use the scenario-wide deadline received by Begin. The coordinator's 500 ms
// operation deadline belongs to production hardening and has focused tests of
// its own; this soak verifies two logical hours under one explicit 30 s bound.
type logicalSoakStore struct {
	recording.HistoricalStore
}

func (s logicalSoakStore) Begin(
	ctx context.Context,
	ref recording.SessionRef,
	manifest recording.SessionManifest,
) (recording.SessionWriter, error) {
	writer, err := s.HistoricalStore.Begin(ctx, ref, manifest)
	if err != nil {
		return nil, err
	}
	return logicalSoakWriter{SessionWriter: writer, ctx: ctx}, nil
}

type logicalSoakWriter struct {
	recording.SessionWriter
	ctx context.Context
}

func (w logicalSoakWriter) Append(_ context.Context, batch recording.RecordingBatch) (recording.Cursor, error) {
	return w.SessionWriter.Append(w.ctx, batch)
}

func (w logicalSoakWriter) Checkpoint(context.Context) (recording.PersistedWatermark, error) {
	return w.SessionWriter.Checkpoint(w.ctx)
}

func (w logicalSoakWriter) Complete(context.Context) (recording.PersistedWatermark, error) {
	return w.SessionWriter.Complete(w.ctx)
}

func (w logicalSoakWriter) Abort(
	_ context.Context,
	reason recording.IncompleteReason,
	accepted recording.Cursor,
) error {
	return w.SessionWriter.Abort(w.ctx, reason, accepted)
}

func hardeningBatch(sequence uint64, vehicles int) telemetrycore.Batch {
	base := engineerRuntimeBatch()
	result := base
	result.Header.Cursor = schema.Cursor{Epoch: 1, Sequence: schema.Sequence(sequence)}
	result.Header.Clock = hardeningClock(sequence)
	result.State.SourceTime = runtimePresent(time.Duration(sequence-1) * hardeningSampleInterval)
	result.State.VehicleCount = runtimePresent(schema.Count(vehicles))
	result.State.Vehicles = make([]telemetrycore.VehicleState, vehicles)

	completed := standings.CompletedLaps((sequence - 1) / 90)
	for index := range vehicles {
		vehicle := base.State.Vehicles[0]
		run := identity.RunIdentity{
			Event:   base.Header.Identity.Event,
			Session: base.Header.Identity.Session,
			Vehicle: identity.VehicleID(fmt.Sprintf("private-vehicle-%02d", index)),
			Team:    identity.TeamID(fmt.Sprintf("private-team-%02d", index)),
			Driver:  identity.DriverID(fmt.Sprintf("private-driver-%02d", index)),
		}
		vehicle.Identity = run
		vehicle.DriverName = runtimePresent(identity.DriverName(fmt.Sprintf("Private Driver %02d", index)))
		vehicle.Player = runtimePresent(index == 0)
		vehicle.Position = runtimePresent(standings.Position(index + 1))
		vehicle.CompletedLaps = runtimePresent(completed)
		vehicle.LapNumber = runtimePresent(session.LapNumber(completed + 1))
		vehicle.TimeBehindNext = runtimePresent(standings.TimeGap(float64(index) * 0.25))
		vehicle.WorldPosition = runtimePresent(spatial.Position{X: float64(index) * 3, Y: 0, Z: float64(sequence)})
		result.State.Vehicles[index] = vehicle
		if index == 0 {
			result.Header.Identity = run
		}
	}
	result.State.TrackName = runtimePresent("private-track")
	return result
}

func hardeningClock(sequence uint64) schema.Clock {
	elapsed := time.Duration(sequence-1) * hardeningSampleInterval
	return schema.NewClock(runtimePresent(elapsed), runtimePresent(elapsed), hardeningSoakStart.Add(elapsed))
}

func subscribeHardeningProduct(
	t *testing.T,
	hub *telemetrytransport.Hub,
) []*telemetrytransport.Subscription {
	t.Helper()
	subscriptions := make([]*telemetrytransport.Subscription, 0, hardeningSoakSubscribersPerProduct)
	for range hardeningSoakSubscribersPerProduct {
		subscription, err := hub.Subscribe(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := subscription.Close(); err != nil {
				t.Errorf("cleanup telemetry subscription: %v", err)
			}
		})
		subscriptions = append(subscriptions, subscription)
	}
	return subscriptions
}

func assertHardeningStatusEvent(
	t *testing.T,
	subscription *telemetrytransport.Subscription,
	product telemetrytransport.ProductID,
) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	event, err := subscription.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if event.Product != product || event.Kind != telemetrytransport.EventStatus {
		t.Fatalf("status event = product %q kind %q, want product %q kind %q", event.Product, event.Kind, product, telemetrytransport.EventStatus)
	}
	var status telemetrytransport.StatusEnvelope
	if err := json.Unmarshal(event.Data, &status); err != nil {
		t.Fatal(err)
	}
	if status.Product != product {
		t.Fatalf("status product = %q, want %q", status.Product, product)
	}
}

func assertHardeningSnapshotEvent(
	t *testing.T,
	subscription *telemetrytransport.Subscription,
	product telemetrytransport.ProductID,
	epoch schema.Epoch,
	sequence schema.Sequence,
	kind telemetrytransport.SnapshotKind,
) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	event, err := subscription.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if event.Product != product || event.Kind != telemetrytransport.EventSnapshot {
		t.Fatalf("snapshot event = product %q kind %q, want product %q kind %q", event.Product, event.Kind, product, telemetrytransport.EventSnapshot)
	}
	var snapshot telemetrytransport.Envelope
	if err := json.Unmarshal(event.Data, &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Product != product || snapshot.Epoch != epoch || snapshot.Sequence != sequence || snapshot.Kind != kind {
		t.Fatalf("snapshot = product %q cursor %d/%d kind %q, want product %q cursor %d/%d kind %q", snapshot.Product, snapshot.Epoch, snapshot.Sequence, snapshot.Kind, product, epoch, sequence, kind)
	}
}

func assertHardeningQueueEmpty(
	t *testing.T,
	subscription *telemetrytransport.Subscription,
	product telemetrytransport.ProductID,
) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	event, err := subscription.Next(ctx)
	if err == nil {
		var cursor schema.Cursor
		if event.Kind == telemetrytransport.EventSnapshot {
			var snapshot telemetrytransport.Envelope
			if decodeErr := json.Unmarshal(event.Data, &snapshot); decodeErr != nil {
				t.Fatalf("unexpected queued event for %q has invalid snapshot: %v", product, decodeErr)
			}
			cursor = schema.Cursor{Epoch: snapshot.Epoch, Sequence: snapshot.Sequence}
		}
		t.Fatalf("unexpected queued event: product=%q kind=%q cursor=%d/%d", event.Product, event.Kind, cursor.Epoch, cursor.Sequence)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("empty queue Next(%q) error = %v, want %v", product, err, context.DeadlineExceeded)
	}
}

func assertMetricsContainNoPersonalPayload(t *testing.T, metrics TelemetryCoreMetrics) {
	t.Helper()
	encoded, err := json.Marshal(metrics)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range [][]byte{
		[]byte("Private Driver"),
		[]byte("private-driver"),
		[]byte("private-vehicle"),
		[]byte("private-track"),
	} {
		if bytes.Contains(encoded, forbidden) {
			t.Fatalf("metrics leaked personal payload %q: %s", forbidden, encoded)
		}
	}
}

type countingEngineerConsumer struct {
	statuses     uint64
	observations uint64
	facts        uint64
	failures     uint64
}

func (consumer *countingEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error {
	consumer.statuses++
	return nil
}

func (consumer *countingEngineerConsumer) ConsumeObservation(engineerprojection.ObservationSnapshotV1) error {
	consumer.observations++
	return nil
}

func (consumer *countingEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error {
	consumer.facts++
	return nil
}

func structuralInvalidObservation() lmu.Observation {
	return lmu.Observation{
		Source:        lmu.SourceCanonical,
		ReceivedUTC:   hardeningSoakStart,
		Compatibility: lmu.CompatibilityKnown,
		TrackName:     runtimePresent("private-track"),
		SessionType:   runtimePresent(session.TypeRace),
		VehicleCount:  runtimePresent(schema.Count(1)),
		PlayerPresent: runtimePresent(false),
	}
}
