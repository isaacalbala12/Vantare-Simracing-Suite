package lmu

import (
	"context"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
)

// S3.1: el slice de Vehicles que entrega WriteObservation ya nace propio en
// mapObservation (make fresco por observacion). Estos tests fijan la propiedad
// que permite quitar la segunda copia de prepareObservation sin cambiar
// salida ni romper rollback: mutar el batch entregado no contamina al mapper.

func TestBatchMapperS31SinkMutationDoesNotAffectRetry(t *testing.T) {
	t.Parallel()
	mapper, accepted := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7, 8), accepted)

	changed := trackObservation(8)
	changed.TrackName = observed("Track-02")
	failing := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		if len(batch.State.Vehicles) == 0 {
			t.Error("sink received empty vehicles")
			return telemetrycore.ErrBackpressure
		}
		batch.State.Vehicles[0].Identity.Vehicle = "sink-mutated"
		return telemetrycore.ErrBackpressure
	})
	if err := mapper.WriteObservation(context.Background(), changed, failing); err == nil {
		t.Fatal("expected sink error, got nil")
	}

	retry := trackObservation(7, 8)
	writeMapped(t, mapper, retry, accepted)
	batch := accepted.last(t)
	assertCursor(t, batch, 1, 2)
	if batch.Header.Identity.Session != "lmu-session-1" {
		t.Fatalf("session advanced after rejected boundary: %q", batch.Header.Identity.Session)
	}
	assertVehicleID(t, batch, 7, "lmu-slot-7-generation-1")
	assertVehicleID(t, batch, 8, "lmu-slot-8-generation-1")
}

func TestBatchMapperS31SuccessiveBatchesIndependent(t *testing.T) {
	t.Parallel()
	mapper := NewBatchMapper()
	var captured []telemetrycore.Batch
	raw := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		captured = append(captured, batch)
		return nil
	})

	writeMapped(t, mapper, trackObservation(7), raw)
	if len(captured) != 1 || len(captured[0].State.Vehicles) == 0 {
		t.Fatalf("first batch not captured: %+v", captured)
	}
	captured[0].State.Vehicles[0].Identity.Vehicle = "mutated-by-consumer"

	next := trackObservation(7)
	next.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, next, raw)
	if len(captured) != 2 {
		t.Fatalf("captured batches = %d, want 2", len(captured))
	}
	second := captured[1]
	assertCursor(t, second, 1, 2)
	assertVehicleID(t, second, 7, "lmu-slot-7-generation-1")
	if second.State.Vehicles[0].Identity.Vehicle == "mutated-by-consumer" {
		t.Fatal("mutation of delivered batch leaked into next batch")
	}
	if len(captured[0].State.Vehicles) > 0 && len(second.State.Vehicles) > 0 &&
		&captured[0].State.Vehicles[0] == &second.State.Vehicles[0] {
		t.Fatal("successive batches share backing array")
	}
}
