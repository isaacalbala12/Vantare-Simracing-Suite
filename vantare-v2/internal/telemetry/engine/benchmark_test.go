package engine

import (
	"context"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func BenchmarkEngineApply20(b *testing.B)  { benchmarkEngineApply(b, 20) }
func BenchmarkEngineApply64(b *testing.B)  { benchmarkEngineApply(b, 64) }
func BenchmarkEngineApply104(b *testing.B) { benchmarkEngineApply(b, 104) }

func benchmarkEngineApply(b *testing.B, vehicleCount int) {
	b.Helper()
	telemetryEngine := New(
		core.NewReducer(),
		core.NewSessionCoordinator(core.SessionCoordinatorConfig{}),
		derive.NewPipeline(derive.Config{}),
	)
	batch := benchmarkBatch(vehicleCount)
	ctx := context.Background()
	latencies := make([]time.Duration, 0, b.N)
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		started := time.Now()
		batch.Header.Cursor.Sequence++
		if _, err := telemetryEngine.Apply(ctx, batch); err != nil {
			b.Fatal(err)
		}
		latencies = append(latencies, time.Since(started))
	}
	b.StopTimer()
	if len(latencies) > 0 {
		slices.Sort(latencies)
		index := (len(latencies)*99 + 99) / 100
		b.ReportMetric(float64(latencies[index-1].Nanoseconds()), "p99-ns/op")
	}
}

func benchmarkBatch(vehicleCount int) core.Batch {
	vehicles := make([]core.VehicleState, vehicleCount)
	for index := range vehicles {
		vehicles[index].Identity = identity.RunIdentity{
			Event:   "benchmark-event",
			Session: "benchmark-session",
			Vehicle: identity.VehicleID("vehicle-" + strconv.Itoa(index)),
		}
	}
	return core.Batch{
		Header: envelope.Header{
			Source:   "engine-benchmark",
			Cursor:   schema.Cursor{Epoch: 1},
			Identity: identity.RunIdentity{Event: "benchmark-event", Session: "benchmark-session"},
		},
		State: core.ObservedState{
			VehicleCount: benchmarkField(schema.Count(vehicleCount)),
			Vehicles:     vehicles,
		},
	}
}

func benchmarkField[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}
