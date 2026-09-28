package telemetryprocess

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestDecodeRustResyncRangeAndRejectMalformed(t *testing.T) {
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "resync-frame-rust-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeResyncRequired(frame)
	if err != nil || got != (ResyncRequiredV1{Stream: 15, First: 3, Next: 67}) {
		t.Fatalf("Rust resync = %+v, %v", got, err)
	}
	for _, malformed := range []Frame{
		{Kind: KindFact, Payload: frame.Payload},
		{Kind: KindResyncRequired, Payload: []byte(`{"stream":0,"first":3,"next":67}`)},
		{Kind: KindResyncRequired, Payload: []byte(`{"stream":15,"first":4,"next":3}`)},
		{Kind: KindResyncRequired, Payload: []byte(`{"stream":15,"first":3,"next":67,"extra":1}`)},
		{Kind: KindResyncRequired, Payload: make([]byte, MaxResyncPayload+1)},
	} {
		if _, err := DecodeResyncRequired(malformed); !errors.Is(err, ErrInvalidResync) {
			t.Fatalf("malformed resync error = %v", err)
		}
	}
}
