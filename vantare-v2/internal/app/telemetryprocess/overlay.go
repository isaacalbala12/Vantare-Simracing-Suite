package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
)

const (
	MaxOverlayCommandPayload = 1024
	MaxOverlayReplyPayload   = 160 * 1024
	MaxOverlaySenderBytes    = 128
	MaxOverlaySessionBytes   = 128
)

var ErrInvalidOverlayCommand = errors.New("telemetry IPC overlay command is invalid")
var ErrInvalidOverlayReply = errors.New("telemetry IPC overlay reply is invalid")

type OverlayOperation string

const (
	OverlayPullOperation        OverlayOperation = "pull"
	OverlayCloseOperation       OverlayOperation = "close"
	OverlayCloseSenderOperation OverlayOperation = "closeSender"
)

type OverlayCommandV1 struct {
	RequestID uint64           `json:"requestId"`
	Operation OverlayOperation `json:"operation"`
	Sender    string           `json:"sender"`
	SessionID string           `json:"sessionId,omitempty"`
	Ack       uint64           `json:"ack,omitempty"`
	Sections  uint8            `json:"sections,omitempty"`
}

func EncodeOverlayCommand(command OverlayCommandV1) (Frame, error) {
	if command.RequestID == 0 || len(command.Sender) == 0 || len(command.Sender) > MaxOverlaySenderBytes ||
		len(command.SessionID) > MaxOverlaySessionBytes || command.Sections > 1 {
		return Frame{}, ErrInvalidOverlayCommand
	}
	switch command.Operation {
	case OverlayPullOperation:
		if command.SessionID == "" {
			return Frame{}, ErrInvalidOverlayCommand
		}
	case OverlayCloseOperation:
		if command.SessionID == "" || command.Ack != 0 || command.Sections != 0 {
			return Frame{}, ErrInvalidOverlayCommand
		}
	case OverlayCloseSenderOperation:
		if command.SessionID != "" || command.Ack != 0 || command.Sections != 0 {
			return Frame{}, ErrInvalidOverlayCommand
		}
	default:
		return Frame{}, ErrInvalidOverlayCommand
	}
	payload, err := json.Marshal(command)
	if err != nil || len(payload) > MaxOverlayCommandPayload {
		return Frame{}, ErrInvalidOverlayCommand
	}
	return Frame{Kind: KindOverlayCommand, Payload: payload}, nil
}

type OverlayReplyV1 struct {
	RequestID uint64          `json:"requestId"`
	Response  json.RawMessage `json:"response"`
}

func DecodeOverlayReply(frame Frame) (OverlayReplyV1, error) {
	if frame.Kind != KindOverlayReply || len(frame.Payload) > MaxOverlayReplyPayload {
		return OverlayReplyV1{}, ErrInvalidOverlayReply
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	var reply OverlayReplyV1
	if err := decoder.Decode(&reply); err != nil {
		return OverlayReplyV1{}, ErrInvalidOverlayReply
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF || reply.RequestID == 0 || len(reply.Response) == 0 {
		return OverlayReplyV1{}, ErrInvalidOverlayReply
	}
	if reply.Response[0] != '{' && !bytes.Equal(reply.Response, []byte("null")) {
		return OverlayReplyV1{}, ErrInvalidOverlayReply
	}
	return reply, nil
}
