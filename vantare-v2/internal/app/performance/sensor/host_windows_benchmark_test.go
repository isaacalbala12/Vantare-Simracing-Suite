//go:build windows

package sensor

import (
	"context"
	"testing"
	"time"
)

func BenchmarkHostSamplerMarginalCost(b *testing.B) {
	ctx := context.Background()
	b.Run("off", func(b *testing.B) {
		disabled := HostSamplerFunc(func(context.Context) (HostSample, error) { return HostSample{}, nil })
		b.ReportAllocs()
		for iteration := 0; iteration < b.N; iteration++ {
			if _, err := disabled.Sample(ctx); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("on_1hz", func(b *testing.B) {
		sampler := NewHostSampler()
		now := time.Unix(1000, 0)
		sampler.now = func() time.Time { return now }
		b.ReportAllocs()
		for iteration := 0; iteration < b.N; iteration++ {
			if _, err := sampler.Sample(ctx); err != nil {
				b.Fatal(err)
			}
			now = now.Add(time.Second)
		}
	})
}
