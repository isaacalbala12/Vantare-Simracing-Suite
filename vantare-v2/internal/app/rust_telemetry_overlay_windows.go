//go:build windows

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetryprocess"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

const rustOverlayPullTimeout = 2 * time.Second

var ErrRustOverlayUnavailable = errors.New("rust overlay delivery unavailable")

// Pull only carries the authenticated Wails window identity across IPC. Rust
// owns the session, ACK, replay, section patch, and latest-wins decisions.
func (runtime *RustTelemetryCandidateRuntime) Pull(sender string, request telemetrytransport.OverlayPullRequest) (telemetrytransport.OverlayPullResponse, bool, error) {
	reply, err := runtime.overlayRPC(telemetryprocess.OverlayCommandV1{
		Operation: telemetryprocess.OverlayPullOperation, Sender: sender,
		SessionID: request.SessionID, Ack: request.Ack, Sections: request.Sections,
	})
	if err != nil {
		return telemetrytransport.OverlayPullResponse{}, false, err
	}
	if bytes.Equal(reply.Response, []byte("null")) {
		return telemetrytransport.OverlayPullResponse{}, false, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(reply.Response))
	decoder.DisallowUnknownFields()
	var response telemetrytransport.OverlayPullResponse
	if err := decoder.Decode(&response); err != nil {
		return telemetrytransport.OverlayPullResponse{}, false, telemetryprocess.ErrInvalidOverlayReply
	}
	if decoder.Decode(&struct{}{}) != io.EOF || response.SessionID != request.SessionID || response.Delivery == 0 || len(response.Events) > 2 {
		return telemetrytransport.OverlayPullResponse{}, false, telemetryprocess.ErrInvalidOverlayReply
	}
	for _, event := range response.Events {
		if event.Name != "telemetry:overlay-v2:status" && event.Name != "telemetry:overlay-v2:snapshot" {
			return telemetrytransport.OverlayPullResponse{}, false, telemetryprocess.ErrInvalidOverlayReply
		}
		if !json.Valid(event.Data) {
			return telemetrytransport.OverlayPullResponse{}, false, telemetryprocess.ErrInvalidOverlayReply
		}
	}
	runtime.mu.Lock()
	if request.Ack == 0 || runtime.overlaySessions[sender] == request.SessionID {
		runtime.overlaySessions[sender] = request.SessionID
	}
	runtime.mu.Unlock()
	return response, true, nil
}

func (runtime *RustTelemetryCandidateRuntime) Close(sender, sessionID string) {
	if _, err := runtime.overlayRPC(telemetryprocess.OverlayCommandV1{
		Operation: telemetryprocess.OverlayCloseOperation, Sender: sender, SessionID: sessionID,
	}); err != nil && !errors.Is(err, ErrRustOverlayUnavailable) {
		log.Printf("Rust overlay close: %v", err)
	}
	runtime.mu.Lock()
	if runtime.overlaySessions[sender] == sessionID {
		delete(runtime.overlaySessions, sender)
	}
	runtime.mu.Unlock()
}

func (runtime *RustTelemetryCandidateRuntime) CloseSender(sender string) {
	if _, err := runtime.overlayRPC(telemetryprocess.OverlayCommandV1{
		Operation: telemetryprocess.OverlayCloseSenderOperation, Sender: sender,
	}); err != nil && !errors.Is(err, ErrRustOverlayUnavailable) {
		log.Printf("Rust overlay window close: %v", err)
	}
	runtime.mu.Lock()
	delete(runtime.overlaySessions, sender)
	runtime.mu.Unlock()
}

func (runtime *RustTelemetryCandidateRuntime) CloseAll() {
	runtime.mu.Lock()
	senders := make([]string, 0, len(runtime.overlaySessions))
	for sender := range runtime.overlaySessions {
		senders = append(senders, sender)
	}
	runtime.mu.Unlock()
	for _, sender := range senders {
		runtime.CloseSender(sender)
	}
}

func (runtime *RustTelemetryCandidateRuntime) overlayRPC(command telemetryprocess.OverlayCommandV1) (telemetryprocess.OverlayReplyV1, error) {
	if runtime == nil {
		return telemetryprocess.OverlayReplyV1{}, ErrRustOverlayUnavailable
	}
	runtime.mu.Lock()
	if runtime.overlayContext == nil || runtime.stopped || runtime.overlayRequestID == ^uint64(0) {
		runtime.mu.Unlock()
		return telemetryprocess.OverlayReplyV1{}, ErrRustOverlayUnavailable
	}
	runtime.overlayRequestID++
	command.RequestID = runtime.overlayRequestID
	requests, runContext := runtime.overlayRequests, runtime.overlayContext
	runtime.mu.Unlock()
	if _, err := telemetryprocess.EncodeOverlayCommand(command); err != nil {
		return telemetryprocess.OverlayReplyV1{}, err
	}
	ctx, cancel := context.WithTimeout(runContext, rustOverlayPullTimeout)
	defer cancel()
	result := make(chan telemetryprocess.OverlayRPCResult, 1)
	select {
	case requests <- telemetryprocess.OverlayRPC{Command: command, Result: result}:
	case <-ctx.Done():
		return telemetryprocess.OverlayReplyV1{}, ErrRustOverlayUnavailable
	}
	select {
	case received := <-result:
		return received.Reply, received.Err
	case <-ctx.Done():
		return telemetryprocess.OverlayReplyV1{}, ErrRustOverlayUnavailable
	}
}
