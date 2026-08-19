package app

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

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
