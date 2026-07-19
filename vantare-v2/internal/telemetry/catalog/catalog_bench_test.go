package catalog

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema/controls"
)

var (
	benchmarkDefinition Definition
	benchmarkRatio      float64
)

func BenchmarkByID(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		definition, ok := ByID(SignalControlsThrottle)
		if !ok {
			b.Fatal("throttle signal missing")
		}
		benchmarkDefinition = definition
	}
}

func BenchmarkTypedStructAccess(b *testing.B) {
	b.ReportAllocs()
	inputs := controls.Inputs{Throttle: 0.75}
	for i := 0; i < b.N; i++ {
		benchmarkRatio = float64(inputs.Throttle)
	}
}
