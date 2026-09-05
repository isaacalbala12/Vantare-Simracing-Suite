//go:build researchbench

package bench

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
)

const (
	latencyFrames = 3200
	// time.Now() on this Windows host quantises to ~1 ms, which is coarser
	// than a single frame. Latency is therefore sampled in blocks of
	// latencyBlock frames and divided, so the quantisation error stays under
	// a few percent while the distribution across blocks is still visible.
	latencyBlock = 16
)

func percentile(samples []time.Duration, fraction float64) time.Duration {
	if len(samples) == 0 {
		return 0
	}
	index := int(float64(len(samples)-1) * fraction)
	return samples[index]
}

type latencyResult struct {
	label   string
	count   int
	p50     time.Duration
	p95     time.Duration
	p99     time.Duration
	max     time.Duration
	mean    time.Duration
	gcs     uint32
	heapKB  uint64
	allocMB float64
}

// TestFrameLatencyAndGC samples the per-frame wall time of the full chain with
// time.Now, then reports p50/p95/p99 plus heap growth and GC count over the
// same run. This is the number that matters for "does a frame fit in the
// 16.6 ms budget of 60 Hz".
func TestFrameLatencyAndGC(t *testing.T) {
	// R7a: el brazo overlay-v1 esta retirado; solo queda la serie del
	// prototipo compacto historico (BuildCompactFrame), que no es el
	// OverlayFrame V2 productivo ni la linea base de la auditoria futura.
	var results []latencyResult
	for _, count := range VehicleCounts {
		results = append(results, measureChain(t, fmt.Sprintf("compacto (frame+marshal) x%d", count), count))
	}
	report := renderLatency(results)
	t.Log("\n" + report)
	if err := os.WriteFile(filepath.Join(resultsDir(t), "latency-and-gc.txt"), []byte(report), 0o644); err != nil {
		t.Fatal(err)
	}
}

func measureChain(t *testing.T, label string, count int) latencyResult {
	t.Helper()
	ctx := context.Background()
	batches := make([]core.Batch, 512)
	for index := range batches {
		batches[index] = BatchAt(count, uint64(index+1))
	}

	reducer := core.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	samples := make([]time.Duration, 0, latencyFrames/latencyBlock)

	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)

	seq := 0
	var blockStart time.Time
	for frame := 0; frame < latencyFrames; frame++ {
		seq++
		if seq > len(batches) {
			reducer = core.NewReducer()
			pipeline = derive.NewPipeline(derive.Config{})
			seq = 1
		}
		if frame%latencyBlock == 0 {
			blockStart = time.Now()
		}
		observed, err := reducer.Apply(batches[seq-1])
		if err != nil {
			t.Fatal(err)
		}
		final, err := pipeline.Apply(ctx, observed)
		if err != nil {
			t.Fatal(err)
		}
		var encoded []byte
		encoded, err = json.Marshal(BuildCompactFrame(final))
		if err != nil {
			t.Fatal(err)
		}
		if len(encoded) == 0 {
			t.Fatal("empty payload")
		}
		if frame%latencyBlock == latencyBlock-1 {
			samples = append(samples, time.Since(blockStart)/latencyBlock)
		}
	}
	runtime.ReadMemStats(&after)

	var total time.Duration
	for _, sample := range samples {
		total += sample
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })

	return latencyResult{
		label:   label,
		count:   count,
		p50:     percentile(samples, 0.50),
		p95:     percentile(samples, 0.95),
		p99:     percentile(samples, 0.99),
		max:     samples[len(samples)-1],
		mean:    total / time.Duration(len(samples)),
		gcs:     after.NumGC - before.NumGC,
		heapKB:  (after.HeapAlloc) / 1024,
		allocMB: float64(after.TotalAlloc-before.TotalAlloc) / (1024 * 1024),
	}
}

func renderLatency(results []latencyResult) string {
	out := fmt.Sprintf("%d frames por escenario\n", latencyFrames)
	out += fmt.Sprintf("%-34s %10s %10s %10s %10s %10s %7s %12s %12s\n",
		"escenario", "media", "p50", "p95", "p99", "max", "GCs", "alloc total", "heap final")
	for _, current := range results {
		out += fmt.Sprintf("%-34s %10s %10s %10s %10s %10s %7d %9.1f MiB %9d KiB\n",
			current.label,
			current.mean.Round(time.Microsecond),
			current.p50.Round(time.Microsecond),
			current.p95.Round(time.Microsecond),
			current.p99.Round(time.Microsecond),
			current.max.Round(time.Microsecond),
			current.gcs,
			current.allocMB,
			current.heapKB,
		)
	}
	out += "\nPresupuesto por frame: 16.67 ms @60 Hz, 33.3 ms @30 Hz, 50 ms @20 Hz, 100 ms @10 Hz\n"
	return out
}

// BenchmarkSnapshotValueClone isolates the ownership clone the envelope design
// mandates: Snapshot.Value() deep-copies every mutable collection on EVERY
// read, and the runtime reads each snapshot several times per frame.
func BenchmarkSnapshotValueClone(b *testing.B) {
	for _, count := range VehicleCounts {
		b.Run(fmt.Sprintf("final/vehicles=%d", count), func(b *testing.B) {
			final := FinalStateFixture(b, count, 32)
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if _, ok := final.Value(); !ok {
					b.Fatal("no value")
				}
			}
		})
		b.Run(fmt.Sprintf("observed/vehicles=%d", count), func(b *testing.B) {
			observed := ObservedSnapshotAt(count, 1)
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if _, ok := observed.Value(); !ok {
					b.Fatal("no value")
				}
			}
		})
	}
}
