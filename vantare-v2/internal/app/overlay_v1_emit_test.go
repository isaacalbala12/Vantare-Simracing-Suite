package app

import (
	"context"
	"testing"
)

// R6a: el productor Overlay V1 esta retirado. WriteBatch nunca publica
// snapshot ni status V1; los contadores heredados quedan en cero y el Hub
// interno sigue construido para su retirada aislada en R6b.
func TestOverlayV1EmissionSwitch(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if runtime.Hub() == nil {
		t.Fatal("retired Overlay V1 Hub must stay built until R6b")
	}
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
		t.Fatal(err)
	}
	metrics := runtime.Metrics()
	if metrics.ProjectionsPublished != 0 || metrics.OverlayProjectionsPublished != 0 {
		t.Fatalf("retired V1 counters = projections %d overlay %d, want 0", metrics.ProjectionsPublished, metrics.OverlayProjectionsPublished)
	}
	if metrics.Transport.SnapshotPublications != 0 || metrics.Transport.StatusPublications != 0 {
		t.Fatalf("retired V1 transport = snapshots %d statuses %d, want 0", metrics.Transport.SnapshotPublications, metrics.Transport.StatusPublications)
	}
}
