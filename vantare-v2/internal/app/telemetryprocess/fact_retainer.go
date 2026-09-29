package telemetryprocess

import (
	"bytes"
	"errors"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

const MaxRetainedEngineerFacts = 64

var (
	ErrFactRetainerConfiguration = errors.New("telemetry fact retainer configuration is invalid")
	ErrFactStreamChanged         = errors.New("telemetry fact stream changed")
	ErrFactSequenceGap           = errors.New("telemetry fact sequence has a gap")
	ErrFactWireConflict          = errors.New("telemetry fact sequence has conflicting bytes")
	ErrFactHistoryLost           = errors.New("telemetry fact duplicate is outside retention")
	ErrFactRetentionFull         = errors.New("telemetry fact consumer has not drained retention")
)

type retainedFact struct {
	sequence uint64
	payload  []byte
}

// FactRetainer is scoped to one verified child and one fact stream. Retain
// returns an ACK only after the fact is held in the bounded in-memory queue.
// The caller drains facts to the consumer and sends the ACK after delivery.
type FactRetainer struct {
	capacity int
	stream   uint64
	last     uint64
	seen     []retainedFact
	pending  []engineer.FactEnvelopeV1
}

func NewFactRetainer(capacity int, baseline FactAckV1) (*FactRetainer, error) {
	if capacity < 1 || capacity > MaxRetainedEngineerFacts || baseline.Stream == 0 {
		return nil, ErrFactRetainerConfiguration
	}
	return &FactRetainer{capacity: capacity, stream: baseline.Stream, last: baseline.Sequence}, nil
}

func (retainer *FactRetainer) Retain(frame Frame) (Frame, bool, error) {
	stream, fact, err := DecodeEngineerFactWithStream(frame)
	if err != nil {
		return Frame{}, false, err
	}
	sequence := uint64(fact.Fact.Sequence)
	if stream != retainer.stream {
		return Frame{}, false, ErrFactStreamChanged
	}
	if sequence <= retainer.last {
		for _, previous := range retainer.seen {
			if previous.sequence == sequence {
				if !bytes.Equal(previous.payload, frame.Payload) {
					return Frame{}, false, ErrFactWireConflict
				}
				ack, err := EncodeFactAck(FactAckV1{Stream: stream, Sequence: retainer.last})
				return ack, false, err
			}
		}
		return Frame{}, false, ErrFactHistoryLost
	}
	if sequence != retainer.last+1 {
		return Frame{}, false, ErrFactSequenceGap
	}
	if len(retainer.pending) >= retainer.capacity {
		return Frame{}, false, ErrFactRetentionFull
	}
	ack, err := EncodeFactAck(FactAckV1{Stream: stream, Sequence: sequence})
	if err != nil {
		return Frame{}, false, err
	}
	retainer.last = sequence
	retainer.pending = append(retainer.pending, fact)
	record := retainedFact{sequence: sequence, payload: bytes.Clone(frame.Payload)}
	if len(retainer.seen) == MaxRetainedEngineerFacts {
		copy(retainer.seen, retainer.seen[1:])
		retainer.seen[len(retainer.seen)-1] = record
	} else {
		retainer.seen = append(retainer.seen, record)
	}
	return ack, true, nil
}

// Drain transfers the held facts to the caller in order. The caller owns
// their next delivery boundary; this does not acknowledge consumer success.
func (retainer *FactRetainer) Drain() []engineer.FactEnvelopeV1 {
	facts := retainer.pending
	retainer.pending = nil
	return facts
}
