package telemetryprocess

import (
	"os"
	"path/filepath"
	"testing"
)

// Diagnostic codec benchmark on the pinned Rust wire fixture. It does not
// include acquisition, child CPU, publisher delivery or real temporal churn.
func BenchmarkDecodeOverlaySnapshotRustFixture(b *testing.B) {
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "overlay-snapshot-frame-rust-v1.bin"))
	if err != nil {
		b.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		b.Fatal(err)
	}
	first, err := DecodeOverlaySnapshot(frame)
	if err != nil || first.Frame == nil || len(first.Frame.Standings) < 40 {
		b.Fatalf("invalid pinned Rust Overlay fixture: %v", err)
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, err := DecodeOverlaySnapshot(frame); err != nil {
			b.Fatal(err)
		}
	}
}
