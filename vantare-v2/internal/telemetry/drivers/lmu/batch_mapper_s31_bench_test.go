package lmu

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
)

// BenchmarkBatchMapperS31Fixture mide el primer mapping + sink del fixture
// real de pista preparseado y fusionado (testdata/lmu-fixture.bin,
// 44 vehiculos; parse y fusion fuera del timer, misma ruta que
// BenchmarkParseTrackFixture). No mide parsing ni steady-state. La salida se
// consume en el sink.
func BenchmarkBatchMapperS31Fixture(b *testing.B) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		b.Fatal(err)
	}
	parsed, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		b.Fatal(err)
	}
	fused := new(Fusion).Merge(parsed.ReceivedUTC, 0, parsed)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		mapper := NewBatchMapper()
		sunk := 0
		sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
			sunk += len(batch.State.Vehicles)
			return nil
		})
		if err := mapper.WriteObservation(context.Background(), fused, sink); err != nil {
			b.Fatal(err)
		}
		if sunk == 0 {
			b.Fatal("sin vehiculos consumidos")
		}
	}
}
