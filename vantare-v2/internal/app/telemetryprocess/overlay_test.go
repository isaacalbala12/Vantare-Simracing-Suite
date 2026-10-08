package telemetryprocess

import (
	"bytes"
	"errors"
	"testing"
)

func TestOverlayCommandMatchesRustWire(t *testing.T) {
	command := OverlayCommandV1{
		RequestID: 7, Operation: OverlayPullOperation, Sender: "studio", SessionID: "s",
	}
	frame, err := EncodeOverlayCommand(command)
	if err != nil || frame.Kind != KindOverlayCommand {
		t.Fatalf("encode command: %#v %v", frame, err)
	}
	want := []byte(`{"requestId":7,"operation":"pull","sender":"studio","sessionId":"s"}`)
	if !bytes.Equal(frame.Payload, want) {
		t.Fatalf("Go command wire = %s, want %s", frame.Payload, want)
	}
	for _, bad := range []OverlayCommandV1{
		{},
		{RequestID: 1, Operation: OverlayPullOperation, Sender: "studio"},
		{RequestID: 1, Operation: OverlayCloseOperation, Sender: "studio", SessionID: "s", Ack: 1},
		{RequestID: 1, Operation: OverlayCloseSenderOperation, Sender: "studio", SessionID: "s"},
		{RequestID: 1, Operation: OverlayPullOperation, Sender: "studio", SessionID: "s", Sections: 2},
	} {
		if _, err := EncodeOverlayCommand(bad); !errors.Is(err, ErrInvalidOverlayCommand) {
			t.Fatalf("accepted invalid overlay command %#v: %v", bad, err)
		}
	}
}

func TestOverlayReplyDecodesRustWireAndRejectsInvalid(t *testing.T) {
	frame := Frame{Kind: KindOverlayReply, Payload: []byte(`{"requestId":7,"response":{"sessionId":"s","delivery":1,"events":[{"name":"telemetry:overlay-v2:status","data":{"revision":1}}]}}`)}
	reply, err := DecodeOverlayReply(frame)
	if err != nil || reply.RequestID != 7 || len(reply.Response) == 0 {
		t.Fatalf("Rust reply = (%#v, %v)", reply, err)
	}
	for _, bad := range []Frame{
		{Kind: KindStatus, Payload: frame.Payload},
		{Kind: KindOverlayReply, Payload: []byte(`{"requestId":0,"response":null}`)},
		{Kind: KindOverlayReply, Payload: []byte(`{"requestId":7}`)},
		{Kind: KindOverlayReply, Payload: []byte(`{"requestId":7,"response":[]}`)},
		{Kind: KindOverlayReply, Payload: []byte(`{"requestId":7,"response":null,"unknown":1}`)},
	} {
		if _, err := DecodeOverlayReply(bad); !errors.Is(err, ErrInvalidOverlayReply) {
			t.Fatalf("accepted invalid overlay reply %s: %v", bad.Payload, err)
		}
	}
}
