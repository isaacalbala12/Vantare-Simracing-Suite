package telemetryprocess

import (
	"encoding/json"
	"errors"
	"testing"
)

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

func TestFactAcceptanceChecksReplayWithoutRetainingProductFacts(t *testing.T) {
	if _, err := newFactAcceptance(FactAckV1{}); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("missing stream: %v", err)
	}
	first := receiverFixture(t, "engineer-fact-frame-rust-v1.bin")
	withoutBaseline, err := newFactAcceptance(FactAckV1{Stream: 15})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := withoutBaseline.accept(first); !errors.Is(err, ErrFactSequenceGap) {
		t.Fatalf("fact without matching baseline: %v", err)
	}
	ledger, err := newFactAcceptance(FactAckV1{Stream: 15, Sequence: 11})
	if err != nil {
		t.Fatal(err)
	}
	fact, ack, added, err := ledger.accept(first)
	if err != nil || !added || fact.Fact.Sequence != 12 || ack.Kind != KindFactAck {
		t.Fatalf("first fact: added=%v ACK=%v error=%v", added, ack.Kind, err)
	}
	var cursor FactAckV1
	if err := json.Unmarshal(ack.Payload, &cursor); err != nil || cursor != (FactAckV1{Stream: 15, Sequence: 12}) {
		t.Fatalf("first ACK = %+v, %v", cursor, err)
	}
	_, ack, added, err = ledger.accept(first)
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
	} {
		if _, ack, added, err := ledger.accept(test.frame); !errors.Is(err, test.want) || added || ack.Kind != 0 {
			t.Fatalf("rejected fact: ACK=%v added=%v error=%v want=%v", ack.Kind, added, err, test.want)
		}
	}
	second := alteredFactFrame(t, first, 15, 13, 7)
	if _, _, added, err := ledger.accept(second); err != nil || !added {
		t.Fatalf("next fact: added=%v error=%v", added, err)
	}
	_, ack, added, err = ledger.accept(first)
	if err != nil || added {
		t.Fatalf("older duplicate: added=%v error=%v", added, err)
	}
	if err := json.Unmarshal(ack.Payload, &cursor); err != nil || cursor.Sequence != 13 {
		t.Fatalf("duplicate ACK = %+v, %v", cursor, err)
	}
	for sequence := uint64(14); sequence <= 76; sequence++ {
		frame := alteredFactFrame(t, first, 15, sequence, 7)
		if _, _, added, err := ledger.accept(frame); err != nil || !added {
			t.Fatalf("sequence %d: added=%v error=%v", sequence, added, err)
		}
	}
	if _, _, _, err := ledger.accept(first); !errors.Is(err, ErrFactHistoryLost) {
		t.Fatalf("evicted duplicate = %v, want explicit history loss", err)
	}
}
