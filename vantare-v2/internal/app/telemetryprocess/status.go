package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const MaxStatusPayload = 256

var ErrInvalidStatus = errors.New("telemetry IPC status is invalid")

// StatusV1 is a process heartbeat and source state. The host measures heartbeat
// arrival with its own monotonic clock; sourceAgeNs is measured by the child.
type StatusV1 struct {
	Heartbeat   uint64  `json:"heartbeat"`
	State       string  `json:"state"`
	SourceAgeNS *uint64 `json:"sourceAgeNs"`
}

// StatusTracker belongs to one child instance. Recreate it on restart so an
// old child's heartbeat can never establish health for the new one.
type StatusTracker struct {
	last uint64
}

func (tracker *StatusTracker) Accept(frame Frame) (StatusV1, error) {
	status, err := DecodeStatus(frame)
	if err != nil {
		return StatusV1{}, err
	}
	if status.Heartbeat != tracker.last+1 {
		return StatusV1{}, ErrInvalidStatus
	}
	tracker.last = status.Heartbeat
	return status, nil
}

func DecodeStatus(frame Frame) (StatusV1, error) {
	if frame.Kind != KindStatus || len(frame.Payload) > MaxStatusPayload {
		return StatusV1{}, ErrInvalidStatus
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	var status StatusV1
	if err := decoder.Decode(&status); err != nil {
		return StatusV1{}, fmt.Errorf("%w: %v", ErrInvalidStatus, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return StatusV1{}, ErrInvalidStatus
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(frame.Payload, &fields); err != nil || fields == nil {
		return StatusV1{}, ErrInvalidStatus
	}
	for _, name := range []string{"heartbeat", "state", "sourceAgeNs"} {
		if _, ok := fields[name]; !ok {
			return StatusV1{}, ErrInvalidStatus
		}
	}
	if status.Heartbeat == 0 {
		return StatusV1{}, ErrInvalidStatus
	}
	switch status.State {
	case "live", "degraded", "stale":
		if status.SourceAgeNS == nil {
			return StatusV1{}, ErrInvalidStatus
		}
	case "detecting", "connecting", "error", "stopping", "stopped":
		if status.SourceAgeNS != nil {
			return StatusV1{}, ErrInvalidStatus
		}
	default:
		return StatusV1{}, ErrInvalidStatus
	}
	return status, nil
}

func DecodeStop(frame Frame) error {
	if frame.Kind != KindStop || len(frame.Payload) != 0 {
		return ErrInvalidStatus
	}
	return nil
}
