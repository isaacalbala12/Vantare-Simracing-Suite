package app

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

func TestFailurePolicyFlagRestoresLegacyBehaviour(t *testing.T) {
	disabled := false
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{TelemetryFailurePolicyV2: &disabled})
	if err != nil {
		t.Fatal(err)
	}
	runtime.lifecycle = telemetryRuntimeRunning
	err = (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104))
	if !errors.Is(err, telemetrytransport.ErrPayloadTooLarge) {
		t.Fatalf("legacy publication error = %v, want ErrPayloadTooLarge", err)
	}
	if runtime.lifecycle != telemetryRuntimeTerminal || runtime.Metrics().FailStops != 1 {
		t.Fatalf("legacy policy did not fail-stop: lifecycle=%d metrics=%+v", runtime.lifecycle, runtime.Metrics())
	}
	if err := runtime.Start(context.Background()); !errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("legacy restart = %v, want ErrClosed", err)
	}
}

func TestPublishFailureIsNotTerminal(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	runtime.lifecycle = telemetryRuntimeRunning
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104)); err != nil {
		t.Fatalf("transient publish failure escaped driver loop: %v", err)
	}
	if runtime.lifecycle != telemetryRuntimeRunning {
		t.Fatalf("lifecycle = %d, want running", runtime.lifecycle)
	}
	metrics := runtime.Metrics()
	if metrics.FramesDropped["overlay-publish"] != 1 || metrics.PublishFailures["overlay"] != 1 {
		t.Fatalf("publish failure metrics = %+v", metrics)
	}
}

func TestConsumerPanicDoesNotKillProcess(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: panicEngineerConsumer{}})
	if err != nil {
		t.Fatal(err)
	}
	runtime.lifecycle = telemetryRuntimeRunning
	panicValue := make(chan any, 1)
	go func() {
		defer func() { panicValue <- recover() }()
		_ = (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1))
	}()
	if got := <-panicValue; got != nil {
		t.Fatalf("Engineer panic escaped consumer boundary: %v", got)
	}
	metrics := runtime.Metrics()
	if metrics.ConsumerPanics["engineer.observation"] != 1 || metrics.FailStops != 0 ||
		runtime.lifecycle != telemetryRuntimeRunning {
		t.Fatalf("recovered panic metrics/lifecycle = %+v / %d", metrics, runtime.lifecycle)
	}
}

func TestSlowEngineerDoesNotBlockDriverLoop(t *testing.T) {
	consumer := &slowEngineerConsumer{delay: 50 * time.Millisecond}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	defer func() {
		if err := runtime.engineerPort.Stop(context.Background()); err != nil {
			t.Fatal(err)
		}
	}()
	starts := make([]time.Time, 0, 2)
	for sequence := uint64(1); sequence <= 2; sequence++ {
		starts = append(starts, time.Now())
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(sequence, 1)); err != nil {
			t.Fatal(err)
		}
	}
	// A 60 Hz driver has a 16.67 ms period; 20 ms is the allowed +20% ceiling.
	if interval := starts[1].Sub(starts[0]); interval > 20*time.Millisecond {
		t.Fatalf("driver-facing interval = %v, want <= 20ms", interval)
	} else {
		t.Logf("driver-facing interval with 50ms Engineer = %v", interval)
	}
	waitForEngineerObservations(t, consumer, 1)
}

func TestEngineerLatestWinsDropsIntermediateStates(t *testing.T) {
	consumer := newBlockingEngineerConsumer()
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	defer func() {
		if err := runtime.engineerPort.Stop(context.Background()); err != nil {
			t.Fatal(err)
		}
	}()
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(1)})
	<-consumer.started
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(2)})
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(3)})
	close(consumer.release)
	waitForEngineerSequences(t, consumer, []uint64{1, 3})
	if dropped := runtime.Metrics().EngineerStatesDropped; dropped != 1 {
		t.Fatalf("EngineerStatesDropped = %d, want 1", dropped)
	}
}

func TestEngineerTimeoutIsBoundedAndCounted(t *testing.T) {
	consumer := newBlockingEngineerConsumer()
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Engineer: consumer, EngineerConsumeTimeout: 20 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	started := time.Now()
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{})
	<-consumer.started
	deadline := time.Now().Add(200 * time.Millisecond)
	for runtime.Metrics().EngineerTimeouts != 1 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	close(consumer.release)
	if err := runtime.engineerPort.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	metrics := runtime.Metrics()
	if metrics.EngineerTimeouts != 1 || metrics.EngineerConsumeLatencyMs.Count != 1 ||
		time.Since(started) > 150*time.Millisecond {
		t.Fatalf("timeout metrics = %+v", metrics)
	}
}

func TestEngineerAsyncPortFlagCanRollbackToSynchronousDelivery(t *testing.T) {
	disabled := false
	consumer := &slowEngineerConsumer{delay: 25 * time.Millisecond}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer, EngineerAsyncPort: &disabled})
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
		t.Fatal(err)
	}
	if elapsed := time.Since(started); elapsed < consumer.delay {
		t.Fatalf("synchronous rollback returned in %v, want >= %v", elapsed, consumer.delay)
	}
}

func TestEngineerFactsAreOrderedAndNeverDropped(t *testing.T) {
	consumer := newFactRecordingEngineerConsumer(false)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer, EngineerFactQueueCapacity: 4})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	defer func() {
		if err := runtime.engineerPort.Stop(context.Background()); err != nil {
			t.Fatal(err)
		}
	}()
	for sequence := telemetrycore.FactSequence(1); sequence <= 2; sequence++ {
		if _, err := runtime.engineerPort.EnqueueFact(engineerFact(1, sequence)); err != nil {
			t.Fatal(err)
		}
	}
	waitForEngineerFactSequences(t, consumer, []uint64{1, 2})
	_, err = runtime.engineerPort.EnqueueFact(engineerFact(1, 4))
	if !errors.Is(err, engineerprojection.ErrFactResyncRequired) {
		t.Fatalf("fact gap error = %v, want ErrFactResyncRequired", err)
	}
	metrics := runtime.Metrics()
	if metrics.EngineerFactResync != 1 || metrics.EngineerFactsDropped != 0 {
		t.Fatalf("fact gap metrics = %+v", metrics)
	}
}

func TestFactQueueOverflowDeclaresResync(t *testing.T) {
	consumer := newFactRecordingEngineerConsumer(true)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer, EngineerFactQueueCapacity: 1})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	if _, err := runtime.engineerPort.EnqueueFact(engineerFact(1, 1)); err != nil {
		t.Fatal(err)
	}
	<-consumer.started
	if _, err := runtime.engineerPort.EnqueueFact(engineerFact(1, 2)); err != nil {
		t.Fatal(err)
	}
	_, overflowErr := runtime.engineerPort.EnqueueFact(engineerFact(1, 3))
	if !errors.Is(overflowErr, engineerprojection.ErrFactResyncRequired) {
		t.Fatalf("overflow error = %v, want ErrFactResyncRequired", overflowErr)
	}
	if _, err := runtime.engineerPort.ResyncFacts(1); !errors.Is(err, engineerprojection.ErrFactResyncRequired) {
		t.Fatalf("ResyncFacts after overflow = %v, want ErrFactResyncRequired", err)
	}
	metrics := runtime.Metrics()
	if metrics.EngineerFactResync != 1 || metrics.EngineerFactsDropped != 2 || metrics.EngineerFactQueueDepth != 0 {
		t.Fatalf("overflow metrics = %+v", metrics)
	}
	close(consumer.release)
	if err := runtime.engineerPort.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestFactProjectionFailureIsBoundaryNotSkip(t *testing.T) {
	consumer := newFactRecordingEngineerConsumer(false)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	result, err := runtime.engine.Apply(context.Background(), hardeningBatch(1, 1))
	if err != nil {
		t.Fatal(err)
	}
	header := result.Facts[0].Header()
	invalid := envelope.NewFact(header, telemetrycore.SessionFact{
		Sequence: 1,
		Kind:     telemetrycore.FactKind(255),
	})
	validAfterGap := envelope.NewFact(header, telemetrycore.SessionFact{
		Sequence: 2,
		Kind:     telemetrycore.FactSessionEnded,
	})
	runtime.engineerPort.Start()
	runtime.deliverEngineer(result.State, []envelope.Fact[telemetrycore.SessionFact]{invalid, validAfterGap})
	if err := runtime.EngineerError(); !errors.Is(err, engineerprojection.ErrFactResyncRequired) {
		t.Fatalf("EngineerError() = %v, want ErrFactResyncRequired", err)
	}
	metrics := runtime.Metrics()
	if metrics.EngineerFactResync != 1 || metrics.FramesDropped["engineer-fact-projection"] != 1 ||
		metrics.PublishFailures["engineer"] != 1 {
		t.Fatalf("fact projection boundary metrics = %+v", metrics)
	}
	if got := consumer.sequences(); len(got) != 0 {
		t.Fatalf("facts after projection boundary = %v, want none", got)
	}
	if err := runtime.engineerPort.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func projectionMetadata(sequence uint64) telemetryprojection.Metadata {
	return telemetryprojection.Metadata{Sequence: schema.Sequence(sequence)}
}

type panicEngineerConsumer struct{}

func (panicEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error { return nil }
func (panicEngineerConsumer) ConsumeObservation(engineerprojection.ObservationSnapshotV1) error {
	panic("engineer consumer panic")
}
func (panicEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error { return nil }

type slowEngineerConsumer struct {
	delay time.Duration
	mu    sync.Mutex
	start []time.Time
}

func (consumer *slowEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error {
	return nil
}
func (consumer *slowEngineerConsumer) ConsumeObservation(engineerprojection.ObservationSnapshotV1) error {
	consumer.mu.Lock()
	consumer.start = append(consumer.start, time.Now())
	consumer.mu.Unlock()
	time.Sleep(consumer.delay)
	return nil
}
func (consumer *slowEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error {
	return nil
}
func (consumer *slowEngineerConsumer) observationStarts() []time.Time {
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	return append([]time.Time(nil), consumer.start...)
}

func waitForEngineerObservations(t *testing.T, consumer *slowEngineerConsumer, want int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for len(consumer.observationStarts()) < want && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if got := len(consumer.observationStarts()); got < want {
		t.Fatalf("Engineer observations = %d, want at least %d", got, want)
	}
}

type blockingEngineerConsumer struct {
	started  chan struct{}
	release  chan struct{}
	start    sync.Once
	mu       sync.Mutex
	sequence []uint64
}

func newBlockingEngineerConsumer() *blockingEngineerConsumer {
	return &blockingEngineerConsumer{started: make(chan struct{}), release: make(chan struct{})}
}

func (*blockingEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error {
	return nil
}

func (consumer *blockingEngineerConsumer) ConsumeObservation(value engineerprojection.ObservationSnapshotV1) error {
	consumer.mu.Lock()
	consumer.sequence = append(consumer.sequence, uint64(value.Sequence))
	consumer.mu.Unlock()
	consumer.start.Do(func() { close(consumer.started) })
	<-consumer.release
	return nil
}

func (*blockingEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error { return nil }

func (consumer *blockingEngineerConsumer) sequences() []uint64 {
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	return append([]uint64(nil), consumer.sequence...)
}

func waitForEngineerSequences(t *testing.T, consumer *blockingEngineerConsumer, want []uint64) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for len(consumer.sequences()) < len(want) && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	got := consumer.sequences()
	if len(got) != len(want) {
		t.Fatalf("Engineer sequences = %v, want %v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("Engineer sequences = %v, want %v", got, want)
		}
	}
}

type factRecordingEngineerConsumer struct {
	block    bool
	started  chan struct{}
	release  chan struct{}
	start    sync.Once
	mu       sync.Mutex
	sequence []uint64
}

func newFactRecordingEngineerConsumer(block bool) *factRecordingEngineerConsumer {
	return &factRecordingEngineerConsumer{block: block, started: make(chan struct{}), release: make(chan struct{})}
}

func (*factRecordingEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error {
	return nil
}

func (*factRecordingEngineerConsumer) ConsumeObservation(engineerprojection.ObservationSnapshotV1) error {
	return nil
}

func (consumer *factRecordingEngineerConsumer) ConsumeFact(value engineerprojection.FactEnvelopeV1) error {
	consumer.mu.Lock()
	consumer.sequence = append(consumer.sequence, uint64(value.Fact.Sequence))
	consumer.mu.Unlock()
	consumer.start.Do(func() { close(consumer.started) })
	if consumer.block {
		<-consumer.release
	}
	return nil
}

func (consumer *factRecordingEngineerConsumer) sequences() []uint64 {
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	return append([]uint64(nil), consumer.sequence...)
}

func waitForEngineerFactSequences(t *testing.T, consumer *factRecordingEngineerConsumer, want []uint64) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for len(consumer.sequences()) < len(want) && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	got := consumer.sequences()
	if len(got) != len(want) {
		t.Fatalf("Engineer fact sequences = %v, want %v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("Engineer fact sequences = %v, want %v", got, want)
		}
	}
}

func engineerFact(epoch schema.Epoch, sequence telemetrycore.FactSequence) engineerprojection.FactEnvelopeV1 {
	return engineerprojection.FactEnvelopeV1{
		Metadata: telemetryprojection.Metadata{Epoch: epoch},
		Fact:     engineerprojection.FactV1{Sequence: sequence},
	}
}
