package service_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/normalizer"
	"github.com/vantare/overlays/v2/internal/telemetry/pipeline"
)

func BenchmarkPipelineNormalizeFilter(b *testing.B) {
	buf := lmu.BuildSyntheticBuffer()
	n := normalizer.New()
	f := pipeline.NewFilter()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		snap, ok := f.ShouldPublish(n.FromBuffer(buf))
		if !ok && i > 0 {
			// first iter publishes
		}
		_ = snap
	}
}
