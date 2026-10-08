//go:build windows

package telemetryprocess

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestOverlayBridgeCorrelatesRepliesAndClosesPendingRequests(t *testing.T) {
	requests := make(chan OverlayRPC)
	written := make(chan Frame, 2)
	bridge := newOverlayBridge(context.Background(), requests, func(frame Frame) error {
		written <- frame
		return nil
	})
	first := make(chan OverlayRPCResult, 1)
	second := make(chan OverlayRPCResult, 1)
	requests <- OverlayRPC{Command: OverlayCommandV1{RequestID: 1, Operation: OverlayPullOperation, Sender: "studio", SessionID: "one"}, Result: first}
	requests <- OverlayRPC{Command: OverlayCommandV1{RequestID: 2, Operation: OverlayPullOperation, Sender: "obs", SessionID: "two"}, Result: second}
	<-written
	<-written
	if err := bridge.accept(Frame{Kind: KindOverlayReply, Payload: []byte(`{"requestId":2,"response":null}`)}); err != nil {
		t.Fatal(err)
	}
	select {
	case reply := <-second:
		if reply.Err != nil || reply.Reply.RequestID != 2 {
			t.Fatalf("wrong reply: %+v", reply)
		}
	case <-time.After(time.Second):
		t.Fatal("second request did not receive its reply")
	}
	bridge.close()
	if reply := <-first; !errors.Is(reply.Err, ErrOverlayBridgeClosed) {
		t.Fatalf("pending request was not closed: %+v", reply)
	}
	if err := bridge.accept(Frame{Kind: KindOverlayReply, Payload: []byte(`{"requestId":2,"response":null}`)}); !errors.Is(err, ErrInvalidOverlayReply) {
		t.Fatalf("duplicate reply accepted: %v", err)
	}
}

func TestOverlayBridgeBoundsUnansweredCommands(t *testing.T) {
	requests := make(chan OverlayRPC)
	written := make(chan Frame, maxPendingOverlayRPC)
	bridge := newOverlayBridge(context.Background(), requests, func(frame Frame) error {
		written <- frame
		return nil
	})
	defer bridge.close()
	for id := uint64(1); id <= maxPendingOverlayRPC; id++ {
		requests <- OverlayRPC{
			Command: OverlayCommandV1{RequestID: id, Operation: OverlayPullOperation, Sender: "studio", SessionID: "s"},
			Result:  make(chan OverlayRPCResult, 1),
		}
	}
	for range maxPendingOverlayRPC {
		<-written
	}
	rejected := make(chan OverlayRPCResult, 1)
	requests <- OverlayRPC{
		Command: OverlayCommandV1{RequestID: maxPendingOverlayRPC + 1, Operation: OverlayPullOperation, Sender: "studio", SessionID: "s"},
		Result:  rejected,
	}
	select {
	case result := <-rejected:
		if !errors.Is(result.Err, ErrOverlayBridgeBusy) {
			t.Fatalf("overflow result = %+v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("full bridge did not reject promptly")
	}
}
