package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

var ErrInvalidEngineerFact = errors.New("telemetry IPC engineer fact is invalid")

const MaxEngineerFactPayload = 4 << 10

// DecodeEngineerFact validates one ordered fact; the caller must retain it
// before sending FactAck. This decoder does not acknowledge or coalesce facts.
func DecodeEngineerFact(frame Frame) (engineer.FactEnvelopeV1, error) {
	_, fact, err := DecodeEngineerFactWithStream(frame)
	return fact, err
}

func DecodeEngineerFactWithStream(frame Frame) (uint64, engineer.FactEnvelopeV1, error) {
	if frame.Kind != KindFact || len(frame.Payload) > MaxEngineerFactPayload {
		return 0, engineer.FactEnvelopeV1{}, ErrInvalidEngineerFact
	}
	var payload struct {
		Product string          `json:"product"`
		Stream  uint64          `json:"stream"`
		Fact    json.RawMessage `json:"fact"`
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return 0, engineer.FactEnvelopeV1{}, fmt.Errorf("%w: envelope: %v", ErrInvalidEngineerFact, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return 0, engineer.FactEnvelopeV1{}, ErrInvalidEngineerFact
	}
	if payload.Product != ProductEngineerV1 || payload.Stream == 0 || len(payload.Fact) == 0 {
		return 0, engineer.FactEnvelopeV1{}, ErrInvalidEngineerFact
	}
	var fact engineer.FactEnvelopeV1
	decoder = json.NewDecoder(bytes.NewReader(payload.Fact))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&fact); err != nil {
		return 0, engineer.FactEnvelopeV1{}, fmt.Errorf("%w: fact: %v", ErrInvalidEngineerFact, err)
	}
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return 0, engineer.FactEnvelopeV1{}, ErrInvalidEngineerFact
	}
	if fact.CanonicalVersion != 1 || fact.ProjectionVersion != 1 || fact.Epoch == 0 ||
		fact.Sequence == 0 || fact.Fact.Sequence == 0 || !knownEngineerFactKind(fact.Fact.Kind) {
		return 0, engineer.FactEnvelopeV1{}, ErrInvalidEngineerFact
	}
	for _, stamp := range []string{fact.CapturedAt, fact.Fact.OccurredAt} {
		if _, err := time.Parse(time.RFC3339Nano, stamp); err != nil {
			return 0, engineer.FactEnvelopeV1{}, ErrInvalidEngineerFact
		}
	}
	return payload.Stream, fact, nil
}

func knownEngineerFactKind(kind engineer.FactKind) bool {
	switch kind {
	case engineer.FactSessionStarted, engineer.FactSessionEnded, engineer.FactLapCompleted,
		engineer.FactPitEntered, engineer.FactPitExited, engineer.FactDriverChanged,
		engineer.FactConnectionLost, engineer.FactConnectionRecovered:
		return true
	default:
		return false
	}
}
