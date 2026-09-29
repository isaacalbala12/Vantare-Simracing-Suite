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
	Heartbeat     uint64  `json:"heartbeat"`
	State         string  `json:"state"`
	SourceAgeNS   *uint64 `json:"sourceAgeNs"`
	SHMTicks      *uint64 `json:"shmTicks,omitempty"`
	RESTReports   *uint64 `json:"restReports,omitempty"`
	RESTBatches   *uint64 `json:"restBatches,omitempty"`
	RESTHTTPFresh *uint64 `json:"restHttpFresh,omitempty"`
	RESTState     string  `json:"restState,omitempty"`
}

// StatusTracker belongs to one child instance. Recreate it on restart so an
// old child's heartbeat can never establish health for the new one.
type StatusTracker struct {
	last StatusV1
}

func (tracker *StatusTracker) Accept(frame Frame) (StatusV1, error) {
	status, err := DecodeStatus(frame)
	if err != nil {
		return StatusV1{}, err
	}
	if status.Heartbeat != tracker.last.Heartbeat+1 {
		return StatusV1{}, ErrInvalidStatus
	}
	if tracker.last.Heartbeat != 0 {
		if (status.SHMTicks == nil) != (tracker.last.SHMTicks == nil) {
			return StatusV1{}, ErrInvalidStatus
		}
		if status.SHMTicks != nil && (*status.SHMTicks < *tracker.last.SHMTicks ||
			*status.RESTReports < *tracker.last.RESTReports || *status.RESTBatches < *tracker.last.RESTBatches ||
			*status.RESTHTTPFresh < *tracker.last.RESTHTTPFresh) {
			return StatusV1{}, ErrInvalidStatus
		}
	}
	tracker.last = status
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
	counted := 0
	for _, name := range []string{"shmTicks", "restReports", "restBatches", "restHttpFresh"} {
		if _, ok := fields[name]; ok {
			counted++
		}
	}
	if counted != 0 && (counted != 4 || status.SHMTicks == nil || status.RESTReports == nil ||
		status.RESTBatches == nil || status.RESTHTTPFresh == nil ||
		*status.RESTBatches > *status.RESTReports || *status.RESTHTTPFresh > *status.RESTReports) {
		return StatusV1{}, ErrInvalidStatus
	}
	if _, present := fields["restState"]; present {
		switch status.RESTState {
		case "live", "partial", "unsupported", "offline", "timeout", "stale":
		default:
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
