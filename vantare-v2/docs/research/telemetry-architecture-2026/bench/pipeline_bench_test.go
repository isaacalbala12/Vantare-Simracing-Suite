//go:build researchbench

package bench

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/analysis"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// BenchmarkStageReducer prices core.Reducer.Apply per accepted batch.
func BenchmarkStageReducer(b *testing.B) {
	for _, count := range VehicleCounts {
		b.Run(fmt.Sprintf("vehicles=%d", count), func(b *testing.B) {
			reducer := core.NewReducer()
			batches := make([]core.Batch, 256)
			for index := range batches {
				batches[index] = BatchAt(count, uint64(index+1))
			}
			b.ReportAllocs()
			b.ResetTimer()
			seq := 0
			for i := 0; i < b.N; i++ {
				seq++
				if seq > len(batches) {
					b.StopTimer()
					reducer = core.NewReducer()
					seq = 1
					b.StartTimer()
				}
				if _, err := reducer.Apply(batches[seq-1]); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

// BenchmarkStageDerive prices derive.Pipeline.Apply per observed snapshot.
func BenchmarkStageDerive(b *testing.B) {
	ctx := context.Background()
	for _, count := range VehicleCounts {
		b.Run(fmt.Sprintf("vehicles=%d", count), func(b *testing.B) {
			pipeline := derive.NewPipeline(derive.Config{})
			snapshots := make([]envelope.Snapshot[core.ObservedState], 256)
			for index := range snapshots {
				snapshots[index] = ObservedSnapshotAt(count, uint64(index+1))
			}
			b.ReportAllocs()
			b.ResetTimer()
			seq := 0
			for i := 0; i < b.N; i++ {
				seq++
				if seq > len(snapshots) {
					b.StopTimer()
					pipeline = derive.NewPipeline(derive.Config{})
					seq = 1
					b.StartTimer()
				}
				if _, err := pipeline.Apply(ctx, snapshots[seq-1]); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

// BenchmarkStageProjectOthers prices the sibling product projections that the
// runtime publishes on the very same batch.
// R7a: BenchmarkStageProjectOverlay esta retirado con Overlay V1; el resto
// de productos vivos se conserva.
func BenchmarkStageProjectOthers(b *testing.B) {
	count := 104
	final := FinalStateFixture(b, count, 32)
	b.Run("engineer", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := engineer.ProjectV1(final); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("strategy", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := strategy.ProjectV1(final); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("analysis", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := analysis.ProjectV1(final); err != nil {
				b.Fatal(err)
			}
		}
	})
}

// BenchmarkStageBuildCompactFrame prices the hypothetical compact projection.
func BenchmarkStageBuildCompactFrame(b *testing.B) {
	for _, count := range VehicleCounts {
		b.Run(fmt.Sprintf("vehicles=%d", count), func(b *testing.B) {
			final := FinalStateFixture(b, count, 32)
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				sink = BuildCompactFrame(final)
			}
		})
	}
}

var sink CompactFrame

// R7a: BenchmarkMarshalOverlayV1 esta retirado con Overlay V1; se conserva
// la medicion sobre el prototipo compacto historico
// (BenchmarkMarshalCompactFrame), que no es el OverlayFrame V2 productivo
// ni la linea base de la auditoria futura.
// BenchmarkMarshalCompactFrame prices json.Marshal of the compact payload.
func BenchmarkMarshalCompactFrame(b *testing.B) {
	for _, count := range VehicleCounts {
		b.Run(fmt.Sprintf("vehicles=%d/array", count), func(b *testing.B) {
			frame := BuildCompactFrame(FinalStateFixture(b, count, 32))
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				encoded, err := json.Marshal(frame)
				if err != nil {
					b.Fatal(err)
				}
				b.SetBytes(int64(len(encoded)))
			}
		})
		b.Run(fmt.Sprintf("vehicles=%d/map", count), func(b *testing.B) {
			frame := ToMapFrame(BuildCompactFrame(FinalStateFixture(b, count, 32)))
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				encoded, err := json.Marshal(frame)
				if err != nil {
					b.Fatal(err)
				}
				b.SetBytes(int64(len(encoded)))
			}
		})
	}
}

// R7a: BenchmarkEndToEndCurrent esta retirado con Overlay V1; la cadena
// comparable restante es BenchmarkEndToEndCompact, sobre el prototipo
// compacto historico (no el OverlayFrame V2 productivo ni la linea base de
// la auditoria futura). No se migra el banco a ProjectV2 en este corte.
// BenchmarkEndToEndCompact is the same chain with the compact frame replacing
// projection v1.
func BenchmarkEndToEndCompact(b *testing.B) {
	ctx := context.Background()
	for _, count := range VehicleCounts {
		b.Run(fmt.Sprintf("vehicles=%d", count), func(b *testing.B) {
			batches := make([]core.Batch, 256)
			for index := range batches {
				batches[index] = BatchAt(count, uint64(index+1))
			}
			reducer := core.NewReducer()
			pipeline := derive.NewPipeline(derive.Config{})
			b.ReportAllocs()
			b.ResetTimer()
			seq := 0
			for i := 0; i < b.N; i++ {
				seq++
				if seq > len(batches) {
					b.StopTimer()
					reducer = core.NewReducer()
					pipeline = derive.NewPipeline(derive.Config{})
					seq = 1
					b.StartTimer()
				}
				observed, err := reducer.Apply(batches[seq-1])
				if err != nil {
					b.Fatal(err)
				}
				final, err := pipeline.Apply(ctx, observed)
				if err != nil {
					b.Fatal(err)
				}
				encoded, err := json.Marshal(BuildCompactFrame(final))
				if err != nil {
					b.Fatal(err)
				}
				b.SetBytes(int64(len(encoded)))
			}
		})
	}
}

// FinalStateFixture warms a real pipeline for `warm` frames and returns the
// last FinalState snapshot, so history buffers are realistically populated.
func FinalStateFixture(tb testing.TB, count int, warm int) envelope.Snapshot[derive.FinalState] {
	tb.Helper()
	ctx := context.Background()
	reducer := core.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var final envelope.Snapshot[derive.FinalState]
	for seq := 1; seq <= warm; seq++ {
		observed, err := reducer.Apply(BatchAt(count, uint64(seq)))
		if err != nil {
			tb.Fatal(err)
		}
		final, err = pipeline.Apply(ctx, observed)
		if err != nil {
			tb.Fatal(err)
		}
	}
	return final
}
