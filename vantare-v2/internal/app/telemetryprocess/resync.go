package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const MaxResyncPayload = 128

var ErrInvalidResync = errors.New("telemetry IPC resync range is invalid")

type ResyncRequiredV1 struct {
	Stream uint64 `json:"stream"`
	First  uint64 `json:"first"`
	Next   uint64 `json:"next"`
}

func DecodeResyncRequired(frame Frame) (ResyncRequiredV1, error) {
	if frame.Kind != KindResyncRequired || len(frame.Payload) > MaxResyncPayload {
		return ResyncRequiredV1{}, ErrInvalidResync
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	var boundary ResyncRequiredV1
	if err := decoder.Decode(&boundary); err != nil {
		return ResyncRequiredV1{}, fmt.Errorf("%w: %v", ErrInvalidResync, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return ResyncRequiredV1{}, ErrInvalidResync
	}
	if boundary.Stream == 0 || boundary.First == 0 || boundary.Next < boundary.First {
		return ResyncRequiredV1{}, ErrInvalidResync
	}
	return boundary, nil
}
