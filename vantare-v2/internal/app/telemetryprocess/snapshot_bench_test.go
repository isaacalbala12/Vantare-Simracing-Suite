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

// Compare every snapshot decoder on the pinned wire frames. In particular,
// Engineer carries a full vehicle grid, while Strategy is a small control.
func BenchmarkDecodeObservationSnapshotRustFixture(b *testing.B) {
	for _, test := range []struct {
		name   string
		file   string
		decode func(Frame) error
	}{
		{"engineer", "engineer-snapshot-frame-rust-v1.bin", func(frame Frame) error {
			_, err := DecodeEngineerSnapshot(frame)
			return err
		}},
		{"strategy", "strategy-snapshot-frame-rust-v1.bin", func(frame Frame) error {
			_, err := DecodeStrategySnapshot(frame)
			return err
		}},
	} {
		b.Run(test.name, func(b *testing.B) {
			wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", test.file))
			if err != nil {
				b.Fatal(err)
			}
			frame, err := DecodeFrame(wire)
			if err != nil {
				b.Fatal(err)
			}
			if err := test.decode(frame); err != nil {
				b.Fatal(err)
			}
			b.ReportAllocs()
			for b.Loop() {
				if err := test.decode(frame); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
