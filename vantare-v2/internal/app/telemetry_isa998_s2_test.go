package app

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

// TestIsa998S2StrategySkippedWithoutDestination pinnea el comportamiento
// observable del corte S2: sin destino no se proyecta ni se publica Strategy,
// pero status y entrega Engineer quedan intactos; con destino, la proyección
// publica el mismo payload. Es test de equivalencia (pasa en base y
// candidato); el ahorro lo demuestra el benchmark, no este test.
func TestIsa998S2StrategySkippedWithoutDestination(t *testing.T) {
	t.Parallel()

	// OFF: transporte Strategy apagado por defecto, sin Hub.
	consumer := &recordingEngineerConsumer{}
	off, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	if off.StrategyHub() != nil {
		t.Fatalf("default StrategyHub() = %p, want nil", off.StrategyHub())
	}
	if err := (runtimeBatchSink{runtime: off}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	// Status y entrega intactos sin destino: el orden canónico se mantiene.
	if len(consumer.calls) != 3 || consumer.calls[0] != "status:stopped" ||
		consumer.calls[1] != "observation" || consumer.calls[2] != "fact:session.started" {
		t.Fatalf("Engineer delivery order without destination = %v", consumer.calls)
	}
	offMetrics := off.Metrics()
	if offMetrics.BatchesApplied != 1 || offMetrics.StrategyProjectionsPublished != 0 {
		t.Fatalf("metrics without destination = applied %d strategy %d",
			offMetrics.BatchesApplied, offMetrics.StrategyProjectionsPublished)
	}
	if len(offMetrics.FramesDropped) != 0 || len(offMetrics.PublishFailures) != 0 {
		t.Fatalf("unexpected drops/failures without destination = %v / %v",
			offMetrics.FramesDropped, offMetrics.PublishFailures)
	}

	// ON: con destino se proyecta y publica el mismo payload.
	on, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	subscription := subscribeRuntimeHub(t, on.StrategyHub())
	defer subscription.Close()
	if err := (runtimeBatchSink{runtime: on}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	strategyStatus := nextStatus(t, subscription)
	strategyFrame := nextSnapshot(t, subscription)
	if strategyFrame.Product != telemetrytransport.ProductStrategy {
		t.Fatalf("product = %q, want Strategy", strategyFrame.Product)
	}
	if strategyFrame.StatusRevision != strategyStatus.StatusRevision {
		t.Fatalf("status revision differs: frame %d status %d",
			strategyFrame.StatusRevision, strategyStatus.StatusRevision)
	}
	var payload strategyprojection.PayloadV1
	if err := json.Unmarshal(strategyFrame.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.Player.FuelLiters.Present || payload.Player.FuelLiters.Value != 60 ||
		!payload.Player.FuelCapacity.Present || payload.Player.FuelCapacity.Value != 100 {
		t.Fatalf("Strategy Fuel = %#v, want 60/100", payload.Player)
	}
	if on.Metrics().StrategyProjectionsPublished != 1 {
		t.Fatalf("strategy counter with destination = %d, want 1",
			on.Metrics().StrategyProjectionsPublished)
	}
}
