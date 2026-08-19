package app

import (
	"context"
	"errors"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
)

func TestTelemetryCoreMetricsCounters(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}

	runtime.metricStore.dropFrame("payload-too-large")
	runtime.metricStore.publishFailure("Overlay")
	runtime.metricStore.consumerPanic("engineer.observation")
	runtime.metricStore.observePayload("Overlay", 100)
	runtime.metricStore.observePayload("Overlay", 70*1024)
	runtime.metricStore.rejectFrame("reduce", "sequence-gap")
	runtime.metricStore.observeApplyDuration(80 * time.Microsecond)
	runtime.metricStore.observeApplyDuration(800 * time.Microsecond)
	runtime.metricStore.observeOverlayV2BuildDuration(80 * time.Microsecond)
	runtime.metricStore.observeOverlayV2Payload(104, 34*1024)
	runtime.lifecycleMu.Lock()
	runtime.transitionLifecycleLocked(telemetryRuntimeStarting)
	runtime.transitionLifecycleLocked(telemetryRuntimeRunning)
	runtime.lifecycleMu.Unlock()
	runtime.failStop(errors.New("injected programming failure"))

	metrics := runtime.Metrics()
	if metrics.FramesDropped["payload-too-large"] != 1 ||
		metrics.FramesRejected["reduce.sequence-gap"] != 1 ||
		metrics.PublishFailures["Overlay"] != 1 ||
		metrics.ConsumerPanics["engineer.observation"] != 1 ||
		metrics.FailStops != 1 {
		t.Fatalf("unexpected counters: %+v", metrics)
	}
	if metrics.ApplyDurationUs.Count != 2 || metrics.ApplyDurationUs.P50 != 100 || metrics.ApplyDurationUs.P99 != 1_000 {
		t.Fatalf("apply duration histogram = %+v", metrics.ApplyDurationUs)
	}
	if metrics.OverlayV2BuildDurationUs.Count != 1 || metrics.OverlayV2BuildDurationUs.P99 != 100 ||
		metrics.OverlayV2PayloadBytes["104"].P99 != 64*1024 {
		t.Fatalf("Overlay v2 histograms = duration %+v payload %+v", metrics.OverlayV2BuildDurationUs, metrics.OverlayV2PayloadBytes)
	}
	payload := metrics.PayloadBytes["Overlay"]
	if payload.Count != 2 || payload.P50 != 1024 || payload.P95 != 128*1024 || payload.P99 != 128*1024 {
		t.Fatalf("payload histogram = %+v", payload)
	}
	if metrics.LifecycleTransitions["new->starting"] != 1 ||
		metrics.LifecycleTransitions["starting->running"] != 1 ||
		metrics.LifecycleTransitions["running->terminal"] != 1 {
		t.Fatalf("lifecycle transitions = %+v", metrics.LifecycleTransitions)
	}

	metrics.FramesDropped["payload-too-large"] = 99
	if runtime.Metrics().FramesDropped["payload-too-large"] != 1 {
		t.Fatal("Metrics returned mutable counter state")
	}
}

func TestTelemetryEngineMetricsTrackSequenceDurationAndRejection(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{TelemetryShadowBudget: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	batch := engineerRuntimeBatch()
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); err != nil {
		t.Fatal(err)
	}
	batch.Header.Cursor.Sequence = 3
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); !errors.Is(err, telemetrycore.ErrSequenceGap) {
		t.Fatalf("gap error = %v, want %v", err, telemetrycore.ErrSequenceGap)
	}

	metrics := runtime.Metrics()
	if metrics.EngineSequence != 1 || metrics.ApplyDurationUs.Count != 2 || metrics.FramesRejected["reduce.sequence-gap"] != 1 {
		t.Fatalf("engine metrics = %+v", metrics)
	}
}
