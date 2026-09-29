package telemetryprocess

import (
	"encoding/json"
	"errors"
)

const MaxFactReplayRequestPayload = 128

var ErrInvalidFactReplayRequest = errors.New("telemetry IPC fact replay request is invalid")

// EncodeFactReplayRequest asks the verified child for frames after the last
// retained cursor. Sequence zero is the valid initial subscription baseline.
func EncodeFactReplayRequest(cursor FactAckV1) (Frame, error) {
	if cursor.Stream == 0 {
		return Frame{}, ErrInvalidFactReplayRequest
	}
	payload, err := json.Marshal(cursor)
	if err != nil || len(payload) > MaxFactReplayRequestPayload {
		return Frame{}, ErrInvalidFactReplayRequest
	}
	return Frame{Kind: KindFactReplayRequest, Payload: payload}, nil
}
