package app

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

func TestRuntimeRestartsAfterTransientFailure(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104)); err != nil {
		t.Fatalf("transient failure escaped driver loop: %v", err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatalf("Start after transient failure = %v", err)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatalf("Stop after restart = %v", err)
	}
}

func TestDroppedFrameIncrementsCounterAndPublishesDegraded(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	subscription, err := runtime.Hub().Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104)); err != nil {
		t.Fatalf("transient failure escaped driver loop: %v", err)
	}
	metrics := runtime.Metrics()
	if metrics.FramesDropped["overlay-publish"] != 1 || metrics.PublishFailures["overlay"] != 1 ||
		metrics.FailStops != 0 {
		t.Fatalf("drop metrics = %+v", metrics)
	}

	event, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if event.Kind != telemetrytransport.EventStatus {
		t.Fatalf("event kind = %q, want status", event.Kind)
	}
	var status struct {
		Payload struct {
			State string `json:"state"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(event.Data, &status); err != nil {
		t.Fatal(err)
	}
	if status.Payload.State != "degraded" {
		t.Fatalf("published status = %q, want degraded", status.Payload.State)
	}
}

func TestPayloadLimitIsAContractNotAKillSwitch(t *testing.T) {
	if telemetrytransport.MaxPayloadBytes != 256*1024 {
		t.Fatalf("MaxPayloadBytes = %d, want unchanged 256 KiB contract", telemetrytransport.MaxPayloadBytes)
	}
	if got := classifyTelemetryError(telemetrytransport.ErrPayloadTooLarge); got != failureProductOrPayload {
		t.Fatalf("ErrPayloadTooLarge class = %d, want productOrPayload", got)
	}

	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	runtime.lifecycle = telemetryRuntimeRunning
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104)); err != nil {
		t.Fatalf("payload rejection escaped driver loop: %v", err)
	}
	metrics := runtime.Metrics()
	if runtime.lifecycle != telemetryRuntimeRunning || metrics.FailStops != 0 ||
		metrics.FramesDropped["overlay-publish"] != 1 || metrics.PublishFailures["overlay"] != 1 {
		t.Fatalf("payload contract killed runtime: lifecycle=%d metrics=%+v", runtime.lifecycle, metrics)
	}
}
