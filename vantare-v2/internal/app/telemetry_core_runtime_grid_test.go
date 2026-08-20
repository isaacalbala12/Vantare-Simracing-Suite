package app

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

func TestRuntimePublishes104VehiclesEndToEnd(t *testing.T) {
	engineer := &recordingEngineerConsumer{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: engineer})
	if err != nil {
		t.Fatal(err)
	}
	// The production constructor has no driver-injection seam. Exercise the
	// real post-driver runtime sink so this remains production-code-free.
	runtime.lifecycle = telemetryRuntimeRunning
	subscription, err := runtime.Hub().Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 104)); err != nil {
		t.Fatalf("104-vehicle runtime frame rejected: %v", err)
	}
	if runtime.lifecycle != telemetryRuntimeRunning {
		t.Fatalf("runtime lifecycle = %d, want running", runtime.lifecycle)
	}
	metrics := runtime.Metrics()
	if metrics.OverlayProjectionsPublished != 0 || metrics.EngineerObservations != 1 ||
		metrics.FramesDropped["overlay-publish"] != 1 || metrics.PublishFailures["overlay"] != 1 {
		t.Fatalf("104-vehicle outcome = overlay:%d engineer:%d dropped:%v publish failures:%v",
			metrics.OverlayProjectionsPublished, metrics.EngineerObservations,
			metrics.FramesDropped, metrics.PublishFailures)
	}
	event, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if event.Kind != telemetrytransport.EventStatus {
		t.Fatalf("first event kind = %q, want status", event.Kind)
	}
}
