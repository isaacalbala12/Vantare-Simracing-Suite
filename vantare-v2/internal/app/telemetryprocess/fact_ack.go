package telemetryprocess

import (
	"encoding/json"
	"errors"
)

const MaxFactAckPayload = 128

var ErrInvalidFactAck = errors.New("telemetry IPC fact ACK is invalid")

type FactAckV1 struct {
	Stream   uint64 `json:"stream"`
	Sequence uint64 `json:"sequence"`
}

// EncodeFactAck is called only after the receiver has retained every fact
// through Sequence. The pipe instance binds this stream to its child.
func EncodeFactAck(ack FactAckV1) (Frame, error) {
	if ack.Stream == 0 || ack.Sequence == 0 {
		return Frame{}, ErrInvalidFactAck
	}
	payload, err := json.Marshal(ack)
	if err != nil || len(payload) > MaxFactAckPayload {
		return Frame{}, ErrInvalidFactAck
	}
	return Frame{Kind: KindFactAck, Payload: payload}, nil
}
