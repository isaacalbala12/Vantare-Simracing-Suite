package app

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestOverlayPublicationPreservesWireAndSizeMetrics(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	var expected telemetryPayloadHistogram
	var previousRevision uint64
	for sequence := uint64(1); sequence <= 3; sequence++ {
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(sequence, 64)); err != nil {
			t.Fatal(err)
		}
		event, ok := publisher.ReplaySnapshot()
		if !ok || !json.Valid(event.Data) {
			t.Fatal("missing valid V2 publication")
		}
		var wire struct {
			DeliveryRevision uint64 `json:"revision"`
		}
		if err := json.Unmarshal(event.Data, &wire); err != nil {
			t.Fatal(err)
		}
		if wire.DeliveryRevision <= previousRevision {
			t.Fatalf("revision=%d does not advance after %d", wire.DeliveryRevision, previousRevision)
		}
		previousRevision = wire.DeliveryRevision
		expected.observe(uint64(len(event.Data)))
	}
	if got := runtime.Metrics().OverlayV2PayloadBytes["64"]; got != expected.snapshot() {
		t.Fatalf("wire size histogram=%+v expected=%+v", got, expected.snapshot())
	}
}

// Generated input, not a physical LMU measurement. Unlike the sink-only bench,
// this keeps an actual overlay consumer active so JSON publication is measured.
func BenchmarkOverlayPublication64(b *testing.B) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		b.Fatal(err)
	}
	_, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		b.Fatal(err)
	}
	defer release()
	batch := hardeningBatch(1, 64)
	var sequence uint64
	b.ReportAllocs()
	for b.Loop() {
		sequence++
		batch.Header.Cursor.Sequence = schema.Sequence(sequence)
		batch.Header.Clock = hardeningClock(sequence)
		batch.State.SourceTime = runtimePresent(time.Duration(sequence-1) * hardeningSampleInterval)
		if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); err != nil {
			b.Fatal(err)
		}
	}
}
