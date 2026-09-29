package telemetryprocess

import (
	"errors"
	"testing"
)

func TestFactReplayRequestStartsAtVerifiedZeroBaseline(t *testing.T) {
	frame, err := EncodeFactReplayRequest(FactAckV1{Stream: 15})
	if err != nil || frame.Kind != KindFactReplayRequest || string(frame.Payload) != `{"stream":15,"sequence":0}` {
		t.Fatalf("replay request = (%+v, %v)", frame, err)
	}
	if _, err := EncodeFactReplayRequest(FactAckV1{}); !errors.Is(err, ErrInvalidFactReplayRequest) {
		t.Fatalf("empty stream error = %v", err)
	}
}
