package telemetryprocess

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestGoFactAckFrameMatchesRustFixture(t *testing.T) {
	for _, value := range []FactAckV1{{}, {Stream: 15}, {Sequence: 1}} {
		if _, err := EncodeFactAck(value); !errors.Is(err, ErrInvalidFactAck) {
			t.Fatalf("invalid ACK %+v: %v", value, err)
		}
	}
	frame, err := EncodeFactAck(FactAckV1{Stream: 15, Sequence: 1})
	if err != nil {
		t.Fatal(err)
	}
	var wire bytes.Buffer
	if err := WriteFrame(&wire, frame); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "fact-ack-frame-go-v1.bin")
	if os.Getenv("VANTARE_IPC_ORACLE_UPDATE") == "1" {
		if err := os.WriteFile(path, wire.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(wire.Bytes(), want) {
		t.Fatal("Go FactAck differs from Rust wire fixture")
	}
}
