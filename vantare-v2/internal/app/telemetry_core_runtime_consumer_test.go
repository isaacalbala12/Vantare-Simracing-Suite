package app

import (
	"context"
	"sync"
	"testing"
	"time"

	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

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
	t.Skip("ISA-371 06§13#13: activar en F7")
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
}

func TestSlowEngineerDoesNotBlockDriverLoop(t *testing.T) {
	t.Skip("ISA-371 consumidor Engineer síncrono: activar en F7; no existe inyección de driver")
	consumer := &slowEngineerConsumer{delay: 50 * time.Millisecond}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	for sequence := uint64(1); sequence <= 2; sequence++ {
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(sequence, 1)); err != nil {
			t.Fatal(err)
		}
	}
	starts := consumer.observationStarts()
	if len(starts) != 2 {
		t.Fatalf("Engineer observations = %d, want 2", len(starts))
	}
	// A 60 Hz driver has a 16.67 ms period; 20 ms is the allowed +20% ceiling.
	if interval := starts[1].Sub(starts[0]); interval > 20*time.Millisecond {
		t.Fatalf("driver-facing interval = %v, want <= 20ms", interval)
	}
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
