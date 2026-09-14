package engine

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
)

// BenchmarkEngineS32Apply mide Apply con lote sintetico minimo; solo usa API
// estable (New, Apply, engineBatch). La salida se consume (facts + cursor).

func BenchmarkEngineS32Apply(b *testing.B) {
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		engine := New(
			core.NewReducer(),
			core.NewSessionCoordinator(core.SessionCoordinatorConfig{}),
			derive.NewPipeline(derive.Config{}),
		)
		result, err := engine.Apply(context.Background(), engineBatch(1))
		if err != nil {
			b.Fatal(err)
		}
		sunk := len(result.Facts) + int(result.Cursor.Sequence)
		if sunk == 0 {
			b.Fatal("sin salida consumida")
		}
	}
}
