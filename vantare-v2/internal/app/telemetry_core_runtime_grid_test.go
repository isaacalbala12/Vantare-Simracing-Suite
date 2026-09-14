package app

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

func TestRuntimePublishes104VehiclesEndToEnd(t *testing.T) {
	engineer := &recordingEngineerConsumer{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: engineer, StrategyPublicTransport: true})
	if err != nil {
		t.Fatal(err)
	}
	// The production constructor has no driver-injection seam. Exercise the
	// real post-driver runtime sink so this remains production-code-free.
	runtime.lifecycle = telemetryRuntimeRunning
	subscription, err := runtime.StrategyHub().Subscribe(context.Background())
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
	// R6b: 104 vehiculos ya no tocan ningun limite de payload heredado de la
	// proyeccion Overlay V1 retirada: Strategy publica.
	if metrics.StrategyProjectionsPublished != 1 ||
		metrics.EngineerObservations != 1 || len(metrics.FramesDropped) != 0 || len(metrics.PublishFailures) != 0 {
		t.Fatalf("104-vehicle outcome = strategy:%d engineer:%d dropped:%v publish failures:%v",
			metrics.StrategyProjectionsPublished, metrics.EngineerObservations,
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
