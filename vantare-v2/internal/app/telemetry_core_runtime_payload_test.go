package app

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

func TestRuntimeStartsAfterLargeGridBatchWithoutOverlayV1Failure(t *testing.T) {
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

func TestLargeGridPublishesStrategyWithoutDegrading(t *testing.T) {
	// R6a: sin la proyeccion Overlay V1, 104 vehiculos ya no superan el
	// limite de payload: Strategy publica sin degradar. El fallo de
	// publicacion sigue cubierto en los tests de failure-policy.
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{StrategyPublicTransport: true})
	if err != nil {
		t.Fatal(err)
	}
	subscription, err := runtime.StrategyHub().Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104)); err != nil {
		t.Fatalf("transient failure escaped driver loop: %v", err)
	}
	metrics := runtime.Metrics()
	if len(metrics.FramesDropped) != 0 || len(metrics.PublishFailures) != 0 ||
		metrics.FailStops != 0 {
		t.Fatalf("drop metrics = %#v", metrics)
	}
	if metrics.StrategyProjectionsPublished != 1 {
		t.Fatalf("strategy publications = %#v", metrics)
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
	if status.Payload.State != "stopped" {
		t.Fatalf("published status = %q, want stopped", status.Payload.State)
	}
}

func TestPayloadLimitContractSurvivesOverlayV1Retirement(t *testing.T) {
	if telemetrytransport.MaxPayloadBytes != 256*1024 {
		t.Fatalf("MaxPayloadBytes = %d, want unchanged 256 KiB contract", telemetrytransport.MaxPayloadBytes)
	}
	if got := classifyTelemetryError(telemetrytransport.ErrPayloadTooLarge); got != failureProductOrPayload {
		t.Fatalf("ErrPayloadTooLarge class = %d, want productOrPayload", got)
	}

	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{StrategyPublicTransport: true})
	if err != nil {
		t.Fatal(err)
	}
	runtime.lifecycle = telemetryRuntimeRunning
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104)); err != nil {
		t.Fatalf("payload rejection escaped driver loop: %v", err)
	}
	metrics := runtime.Metrics()
	if runtime.lifecycle != telemetryRuntimeRunning || metrics.FailStops != 0 ||
		len(metrics.FramesDropped) != 0 || len(metrics.PublishFailures) != 0 ||
		metrics.StrategyProjectionsPublished != 1 {
		t.Fatalf("payload contract killed runtime: lifecycle=%d metrics=%+v", runtime.lifecycle, metrics)
	}
}
