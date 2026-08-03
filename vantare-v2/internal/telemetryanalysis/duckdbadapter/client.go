package duckdbadapter

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
)

const (
	maxInputFrameBytes  = 64 * 1024
	maxOutputFrameBytes = 64 * 1024 * 1024
	maxStderrBytes      = 16 * 1024
)

var (
	ErrProtocol        = errors.New("telemetry analysis reader protocol error")
	ErrArtifactChanged = errors.New("staged telemetry artifact changed")
)

type isolatedProcess interface {
	PID() int
	Wait() error
	Terminate()
}

func encodeRequest(frameRequest request) ([]byte, string, error) {
	requestID, err := newRequestID()
	if err != nil {
		return nil, "", ErrProtocol
	}
	frameRequest.ProtocolVersion = ProtocolVersion
	frameRequest.RequestID = requestID
	frameRequest.Handshake = expectedHandshakeRequest()
	frame, err := json.Marshal(frameRequest)
	if err != nil || len(frame) > maxInputFrameBytes {
		return nil, "", ErrProtocol
	}
	return append(frame, '\n'), requestID, nil
}

func responseError(answer response) error {
	if answer.OK {
		return nil
	}
	switch answer.ErrorCode {
	case "artifact_changed":
		return ErrArtifactChanged
	case "cancelled":
		return context.Canceled
	case "timeout":
		return context.DeadlineExceeded
	default:
		return ErrProtocol
	}
}

func decodeResponse(frame []byte, requestID string, expectedOperation operation) (response, error) {
	if len(frame) == 0 || len(frame) > maxOutputFrameBytes+1 || frame[len(frame)-1] != '\n' || bytes.Count(frame, []byte{'\n'}) != 1 {
		return response{}, ErrProtocol
	}
	decoder := json.NewDecoder(bytes.NewReader(frame[:len(frame)-1]))
	decoder.DisallowUnknownFields()
	var answer response
	if err := decoder.Decode(&answer); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return response{}, ErrProtocol
	}
	if answer.ProtocolVersion != ProtocolVersion || answer.RequestID != requestID || answer.Operation != expectedOperation {
		return response{}, ErrProtocol
	}
	if answer.OK && answer.ErrorCode != "" || !answer.OK && answer.ErrorCode == "" {
		return response{}, ErrProtocol
	}
	return answer, nil
}

func validHandshake(handshake handshakeResponse) bool {
	return handshake.HelperVersion == HelperVersion && handshake.DuckDBVersion == DuckDBVersion &&
		handshake.SchemaVersion == SchemaVersion && handshake.OS == "windows" && handshake.Arch == "amd64" &&
		equalOperations(handshake.SupportedOperations, supportedOperations())
}

func newRequestID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}

type limitedWriter struct {
	buffer bytes.Buffer
	limit  int
	seen   int
}

func (w *limitedWriter) Write(data []byte) (int, error) {
	w.seen += len(data)
	if w.seen > w.limit {
		return 0, ErrProtocol
	}
	return w.buffer.Write(data)
}

func (w *limitedWriter) Bytes() []byte { return w.buffer.Bytes() }
