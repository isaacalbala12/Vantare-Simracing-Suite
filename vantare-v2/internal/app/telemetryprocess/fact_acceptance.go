package telemetryprocess

import (
	"bytes"
	"errors"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

const maxFactACKHistory = 64

var (
	ErrFactStreamChanged = errors.New("telemetry fact stream changed")
	ErrFactSequenceGap   = errors.New("telemetry fact sequence has a gap")
	ErrFactWireConflict  = errors.New("telemetry fact sequence has conflicting bytes")
	ErrFactHistoryLost   = errors.New("telemetry fact duplicate is outside ACK history")
)

type acceptedFact struct {
	sequence uint64
	payload  []byte
}

// factAcceptance checks the IPC ACK boundary, not a second product queue.
// Rust retains and replays facts. The host remembers only the last 64 wire
// values to reject conflicting duplicates if an ACK is lost in transit.
type factAcceptance struct {
	stream uint64
	last   uint64
	seen   []acceptedFact
}

func newFactAcceptance(baseline FactAckV1) (*factAcceptance, error) {
	if baseline.Stream == 0 {
		return nil, ErrReceiverProtocol
	}
	return &factAcceptance{stream: baseline.Stream, last: baseline.Sequence}, nil
}

func (ledger *factAcceptance) accept(frame Frame) (engineer.FactEnvelopeV1, Frame, bool, error) {
	stream, fact, err := DecodeEngineerFactWithStream(frame)
	if err != nil {
		return engineer.FactEnvelopeV1{}, Frame{}, false, err
	}
	sequence := uint64(fact.Fact.Sequence)
	if stream != ledger.stream {
		return engineer.FactEnvelopeV1{}, Frame{}, false, ErrFactStreamChanged
	}
	if sequence <= ledger.last {
		for _, previous := range ledger.seen {
			if previous.sequence == sequence {
				if !bytes.Equal(previous.payload, frame.Payload) {
					return engineer.FactEnvelopeV1{}, Frame{}, false, ErrFactWireConflict
				}
				ack, err := EncodeFactAck(FactAckV1{Stream: stream, Sequence: ledger.last})
				return engineer.FactEnvelopeV1{}, ack, false, err
			}
		}
		return engineer.FactEnvelopeV1{}, Frame{}, false, ErrFactHistoryLost
	}
	if ledger.last == ^uint64(0) || sequence != ledger.last+1 {
		return engineer.FactEnvelopeV1{}, Frame{}, false, ErrFactSequenceGap
	}
	ack, err := EncodeFactAck(FactAckV1{Stream: stream, Sequence: sequence})
	if err != nil {
		return engineer.FactEnvelopeV1{}, Frame{}, false, err
	}
	ledger.last = sequence
	record := acceptedFact{sequence: sequence, payload: bytes.Clone(frame.Payload)}
	if len(ledger.seen) == maxFactACKHistory {
		copy(ledger.seen, ledger.seen[1:])
		ledger.seen[len(ledger.seen)-1] = record
	} else {
		ledger.seen = append(ledger.seen, record)
	}
	return fact, ack, true, nil
}
