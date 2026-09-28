package telemetryprocess

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func rustFactFrame(t *testing.T) Frame {
	t.Helper()
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "engineer-fact-frame-rust-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	return frame
}

func alteredFactFrame(t *testing.T, original Frame, stream, sequence uint64, lap int) Frame {
	t.Helper()
	var envelope map[string]any
	if err := json.Unmarshal(original.Payload, &envelope); err != nil {
		t.Fatal(err)
	}
	envelope["stream"] = stream
	inner := envelope["fact"].(map[string]any)["fact"].(map[string]any)
	inner["sequence"] = sequence
	inner["lap"] = lap
	payload, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return Frame{Kind: KindFact, Payload: payload}
}

func TestFactRetainerAcknowledgesOnlyContiguousRetainedFacts(t *testing.T) {
	for _, capacity := range []int{0, MaxRetainedEngineerFacts + 1} {
		if _, err := NewFactRetainer(capacity, FactAckV1{Stream: 15}); !errors.Is(err, ErrFactRetainerConfiguration) {
			t.Fatalf("capacity %d: %v", capacity, err)
		}
	}
	if _, err := NewFactRetainer(1, FactAckV1{}); !errors.Is(err, ErrFactRetainerConfiguration) {
		t.Fatalf("missing baseline stream: %v", err)
	}
	first := rustFactFrame(t)
	withoutBaseline, err := NewFactRetainer(1, FactAckV1{Stream: 15})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := withoutBaseline.Retain(first); !errors.Is(err, ErrFactSequenceGap) {
		t.Fatalf("first fact without matching baseline: %v", err)
	}
	retainer, err := NewFactRetainer(1, FactAckV1{Stream: 15, Sequence: 11})
	if err != nil {
		t.Fatal(err)
	}
	ack, added, err := retainer.Retain(first)
	if err != nil || !added || ack.Kind != KindFactAck {
		t.Fatalf("first fact: added=%v ACK=%v error=%v", added, ack.Kind, err)
	}
	var cursor FactAckV1
	if err := json.Unmarshal(ack.Payload, &cursor); err != nil || cursor != (FactAckV1{Stream: 15, Sequence: 12}) {
		t.Fatalf("first ACK = %+v, %v", cursor, err)
	}
	ack, added, err = retainer.Retain(first)
	if err != nil || added || ack.Kind != KindFactAck {
		t.Fatalf("identical duplicate: added=%v ACK=%v error=%v", added, ack.Kind, err)
	}
	for _, test := range []struct {
		frame Frame
		want  error
	}{
		{alteredFactFrame(t, first, 15, 12, 8), ErrFactWireConflict},
		{alteredFactFrame(t, first, 16, 13, 7), ErrFactStreamChanged},
		{alteredFactFrame(t, first, 15, 14, 7), ErrFactSequenceGap},
		{alteredFactFrame(t, first, 15, 13, 7), ErrFactRetentionFull},
	} {
		if ack, added, err := retainer.Retain(test.frame); !errors.Is(err, test.want) || added || ack.Kind != 0 {
			t.Fatalf("rejected fact: ACK=%v added=%v error=%v want=%v", ack.Kind, added, err, test.want)
		}
	}
	if facts := retainer.Drain(); len(facts) != 1 || uint64(facts[0].Fact.Sequence) != 12 {
		t.Fatalf("drained facts = %+v", facts)
	}
	second := alteredFactFrame(t, first, 15, 13, 7)
	if _, added, err := retainer.Retain(second); err != nil || !added {
		t.Fatalf("next fact: added=%v error=%v", added, err)
	}
	ack, added, err = retainer.Retain(first)
	if err != nil || added {
		t.Fatalf("older duplicate: added=%v error=%v", added, err)
	}
	if err := json.Unmarshal(ack.Payload, &cursor); err != nil || cursor.Sequence != 13 {
		t.Fatalf("duplicate ACK = %+v, %v", cursor, err)
	}
	retainer.Drain()
	for sequence := uint64(14); sequence <= 76; sequence++ {
		frame := alteredFactFrame(t, first, 15, sequence, 7)
		if _, added, err := retainer.Retain(frame); err != nil || !added {
			t.Fatalf("sequence %d: added=%v error=%v", sequence, added, err)
		}
		retainer.Drain()
	}
	if _, _, err := retainer.Retain(first); !errors.Is(err, ErrFactHistoryLost) {
		t.Fatalf("evicted duplicate = %v, want explicit history loss", err)
	}
}
