//go:build researchbench

package bench

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
)

func overlayPayload(tb testing.TB, count int) (overlay.PayloadV1, projection.Metadata) {
	tb.Helper()
	final := FinalStateFixture(tb, count, 32)
	projected, err := overlay.ProjectV1(final)
	if err != nil {
		tb.Fatal(err)
	}
	return projected.PayloadV1, projected.Metadata
}

func liveHub(tb testing.TB) *telemetrytransport.Hub {
	tb.Helper()
	hub := telemetrytransport.NewHub(telemetrytransport.HubConfig{Product: telemetrytransport.ProductOverlay})
	status, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductOverlay, 1, time.Now(),
		telemetrytransport.StatusPayload{State: "live"},
	)
	if err != nil {
		tb.Fatal(err)
	}
	if err := hub.PublishStatus(status); err != nil {
		tb.Fatal(err)
	}
	return hub
}

// BenchmarkTransportPublishOverlayV1 prices NewOverlayFull (marshal + seal +
// validation) plus Hub.PublishSnapshot for the real overlay payload.
func BenchmarkTransportPublishOverlayV1(b *testing.B) {
	for _, count := range VehicleCounts {
		b.Run(fmt.Sprintf("vehicles=%d", count), func(b *testing.B) {
			payload, metadata := overlayPayload(b, count)
			hub := liveHub(b)
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				metadata.Sequence = metadata.Sequence + 1
				full, err := telemetrytransport.NewOverlayFull(metadata, 1, payload)
				if err != nil {
					b.Skipf("payload of %d vehicles rejected by transport: %v", count, err)
				}
				if err := hub.PublishSnapshot(full, nil); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

// BenchmarkSealSHA256 isolates the per-frame SHA-256 seal over the payload.
func BenchmarkSealSHA256(b *testing.B) {
	for _, count := range VehicleCounts {
		payload, _ := overlayPayload(b, count)
		encoded, err := json.Marshal(payload)
		if err != nil {
			b.Fatal(err)
		}
		b.Run(fmt.Sprintf("overlay-v1/vehicles=%d/bytes=%d", count, len(encoded)), func(b *testing.B) {
			b.SetBytes(int64(len(encoded)))
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				digest := sha256.New()
				digest.Write(encoded)
				var out [sha256.Size]byte
				digest.Sum(out[:0])
			}
		})
		compact, err := json.Marshal(BuildCompactFrame(FinalStateFixture(b, count, 32)))
		if err != nil {
			b.Fatal(err)
		}
		b.Run(fmt.Sprintf("compact/vehicles=%d/bytes=%d", count, len(compact)), func(b *testing.B) {
			b.SetBytes(int64(len(compact)))
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				digest := sha256.New()
				digest.Write(compact)
				var out [sha256.Size]byte
				digest.Sum(out[:0])
			}
		})
	}
}

// BenchmarkMergePatchGenerate prices producing the RFC 7396 delta.
func BenchmarkMergePatchGenerate(b *testing.B) {
	for _, count := range VehicleCounts {
		previous, _ := json.Marshal(BuildCompactFrame(FinalStateFixture(b, count, 32)))
		next, _ := json.Marshal(BuildCompactFrame(FinalStateFixture(b, count, 33)))
		b.Run(fmt.Sprintf("compact/vehicles=%d", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				if GenerateMergePatch(previous, next) == nil {
					b.Fatal("empty patch")
				}
			}
		})

		previousPayload, _ := overlayPayload(b, count)
		previousOverlay, _ := json.Marshal(previousPayload)
		nextProjected, err := overlay.ProjectV1(FinalStateFixture(b, count, 33))
		if err != nil {
			b.Fatal(err)
		}
		nextOverlay, _ := json.Marshal(nextProjected.PayloadV1)
		b.Run(fmt.Sprintf("overlay-v1/vehicles=%d", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				if GenerateMergePatch(previousOverlay, nextOverlay) == nil {
					b.Fatal("empty patch")
				}
			}
		})
	}
}

// BenchmarkMergePatchApply prices the repository's ApplyMergePatch, which the
// frontend mirror must also pay on every delta frame.
func BenchmarkMergePatchApply(b *testing.B) {
	for _, count := range VehicleCounts {
		previous, _ := json.Marshal(BuildCompactFrame(FinalStateFixture(b, count, 32)))
		next, _ := json.Marshal(BuildCompactFrame(FinalStateFixture(b, count, 33)))
		patch := GenerateMergePatch(previous, next)
		b.Run(fmt.Sprintf("compact/vehicles=%d", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				if _, err := telemetrytransport.ApplyMergePatch(previous, patch); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

// BenchmarkLatestWinsCell prices the alternative publisher: one atomic cell
// with a level-triggered signal, i.e. "the newest frame always wins and the
// publisher never allocates per subscriber".
type latestCell struct {
	value  atomic.Pointer[[]byte]
	signal chan struct{}
}

func newLatestCell() *latestCell {
	return &latestCell{signal: make(chan struct{}, 1)}
}

func (cell *latestCell) publish(frame []byte) {
	cell.value.Store(&frame)
	select {
	case cell.signal <- struct{}{}:
	default:
	}
}

func (cell *latestCell) load() []byte {
	pointer := cell.value.Load()
	if pointer == nil {
		return nil
	}
	return *pointer
}

func BenchmarkLatestWinsCell(b *testing.B) {
	frame, _ := json.Marshal(BuildCompactFrame(FinalStateFixture(b, 104, 32)))
	cell := newLatestCell()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cell.publish(frame)
	}
	_ = cell.load()
}

// BenchmarkSlowSubscriberHub measures publisher cost while a subscriber is
// deliberately slow (5 ms per read). The Hub is documented latest-wins and
// starts no goroutines; this checks the publisher really never pays for it.
func BenchmarkSlowSubscriberHub(b *testing.B) {
	payload, metadata := overlayPayload(b, 20)
	hub := liveHub(b)
	ctx, cancel := context.WithCancel(context.Background())
	subscription, err := hub.Subscribe(ctx)
	if err != nil {
		b.Fatal(err)
	}
	var received atomic.Int64
	var wait sync.WaitGroup
	wait.Add(1)
	go func() {
		defer wait.Done()
		for {
			if _, err := subscription.Next(ctx); err != nil {
				return
			}
			received.Add(1)
			time.Sleep(5 * time.Millisecond)
		}
	}()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		metadata.Sequence = metadata.Sequence + 1
		full, err := telemetrytransport.NewOverlayFull(metadata, 1, payload)
		if err != nil {
			b.Fatal(err)
		}
		if err := hub.PublishSnapshot(full, nil); err != nil {
			b.Fatal(err)
		}
	}
	b.StopTimer()
	cancel()
	subscription.Close()
	wait.Wait()
	b.ReportMetric(float64(received.Load())/float64(b.N)*100, "%delivered")
}

// BenchmarkSlowSubscriberLatestWinsCell is the same scenario against the
// alternative one-cell publisher.
func BenchmarkSlowSubscriberLatestWinsCell(b *testing.B) {
	frame, _ := json.Marshal(BuildCompactFrame(FinalStateFixture(b, 20, 32)))
	cell := newLatestCell()
	done := make(chan struct{})
	var received atomic.Int64
	go func() {
		defer close(done)
		for {
			select {
			case <-cell.signal:
				_ = cell.load()
				received.Add(1)
				time.Sleep(5 * time.Millisecond)
			case <-time.After(50 * time.Millisecond):
				return
			}
		}
	}()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cell.publish(frame)
	}
	b.StopTimer()
	<-done
	b.ReportMetric(float64(received.Load())/float64(b.N)*100, "%delivered")
}
