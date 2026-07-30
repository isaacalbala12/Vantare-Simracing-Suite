package recording

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"time"
)

const (
	ChannelObserved = "observed"
	ChannelFact     = "fact"

	MaxVehiclesPerPayload = 128
	MaxPayloadBytes       = 256 * 1024
)

const (
	PresenceSpeed uint64 = 1 << iota
	PresenceThrottle
	PresenceBrake
	PresenceGear
	PresencePit
	PresenceFactValue

	PresenceVehicleV1 = PresenceSpeed | PresenceThrottle | PresenceBrake | PresenceGear | PresencePit
	PresenceFactV1    = PresenceFactValue
)

var (
	ErrInvalidRecording      = errors.New("invalid recording payload")
	ErrUnknownRecordingField = errors.New("unknown recording field")
)

type UnknownRecordingFieldError struct {
	Field string
}

func (e *UnknownRecordingFieldError) Error() string {
	return fmt.Sprintf("%v: %s", ErrUnknownRecordingField, e.Field)
}

func (e *UnknownRecordingFieldError) Unwrap() error { return ErrUnknownRecordingField }

type Quality uint8

const (
	QualityUnknown Quality = iota
	QualityCurrent
	QualityStale
	QualityMissing
	QualityInvalid
)

type Cursor struct {
	Epoch    uint64 `json:"epoch"`
	Sequence uint64 `json:"sequence"`
}

func (c Cursor) IsZero() bool { return c.Epoch == 0 && c.Sequence == 0 }

func (c Cursor) Valid() bool {
	return c.IsZero() || (c.Epoch != 0 && c.Sequence != 0)
}

func (c Cursor) Before(other Cursor) bool {
	return c.Epoch < other.Epoch || (c.Epoch == other.Epoch && c.Sequence < other.Sequence)
}

type RecordingVehicleV1 struct {
	SessionSlot uint16  `json:"sessionSlot"`
	SpeedMS     float64 `json:"speedMS"`
	Throttle    float32 `json:"throttle"`
	Brake       float32 `json:"brake"`
	Gear        int16   `json:"gear"`
	InPit       bool    `json:"inPit"`
	Presence    uint64  `json:"presence"`
	Quality     Quality `json:"quality"`
}

type RecordingPayloadV1 struct {
	Version       Version              `json:"version"`
	Channel       string               `json:"channel"`
	Epoch         uint64               `json:"epoch"`
	Sequence      uint64               `json:"sequence"`
	CapturedAtUTC time.Time            `json:"capturedAtUTC"`
	SourceTimeNS  *int64               `json:"sourceTimeNS,omitempty"`
	Vehicles      []RecordingVehicleV1 `json:"vehicles"`
}

func (p RecordingPayloadV1) Cursor() Cursor {
	return Cursor{Epoch: p.Epoch, Sequence: p.Sequence}
}

func (p RecordingPayloadV1) Validate() error {
	if p.Version != RecordingVersionV1 || p.Channel != ChannelObserved ||
		p.Epoch == 0 || p.Sequence == 0 || !validUTC(p.CapturedAtUTC) ||
		len(p.Vehicles) > MaxVehiclesPerPayload {
		return ErrInvalidRecording
	}
	seen := make(map[uint16]struct{}, len(p.Vehicles))
	for _, vehicle := range p.Vehicles {
		if vehicle.SessionSlot == 0 || !validQuality(vehicle.Quality) ||
			math.IsNaN(vehicle.SpeedMS) || math.IsInf(vehicle.SpeedMS, 0) ||
			math.IsNaN(float64(vehicle.Throttle)) || math.IsInf(float64(vehicle.Throttle), 0) ||
			math.IsNaN(float64(vehicle.Brake)) || math.IsInf(float64(vehicle.Brake), 0) ||
			vehicle.Throttle < 0 || vehicle.Throttle > 1 ||
			vehicle.Brake < 0 || vehicle.Brake > 1 ||
			vehicle.Presence&^PresenceVehicleV1 != 0 {
			return ErrInvalidRecording
		}
		if _, exists := seen[vehicle.SessionSlot]; exists {
			return ErrInvalidRecording
		}
		seen[vehicle.SessionSlot] = struct{}{}
	}
	return nil
}

type FactType uint16

const (
	FactUnknown FactType = iota
	FactLapCompleted
	FactPitEntered
	FactPitExited
	FactSessionChanged
	FactSessionStarted
	FactSessionEnded
	FactDriverChanged
	FactConnectionLost
	FactConnectionRecovered
)

func (f FactType) Known() bool {
	return f >= FactLapCompleted && f <= FactConnectionRecovered
}

type RecordingFactV1 struct {
	Version                Version   `json:"version"`
	Channel                string    `json:"channel"`
	Epoch                  uint64    `json:"epoch"`
	FactSequence           uint64    `json:"factSequence"`
	OccurredAtUTC          time.Time `json:"occurredAtUTC"`
	CausalSnapshotSequence uint64    `json:"causalSnapshotSequence"`
	FactType               FactType  `json:"factType"`
	SessionSlot            uint16    `json:"sessionSlot"`
	Value                  float64   `json:"value"`
	Presence               uint64    `json:"presence"`
	Quality                Quality   `json:"quality"`
}

func (f RecordingFactV1) Cursor() Cursor {
	return Cursor{Epoch: f.Epoch, Sequence: f.FactSequence}
}

func (f RecordingFactV1) Validate() error {
	if f.Version != RecordingVersionV1 || f.Channel != ChannelFact ||
		f.Epoch == 0 || f.FactSequence == 0 || f.CausalSnapshotSequence == 0 ||
		!validUTC(f.OccurredAtUTC) || !f.FactType.Known() ||
		!validQuality(f.Quality) || math.IsNaN(f.Value) || math.IsInf(f.Value, 0) ||
		f.Presence&^PresenceFactV1 != 0 {
		return ErrInvalidRecording
	}
	return nil
}

type RecordingBatch struct {
	Observed []RecordingPayloadV1
	Facts    []RecordingFactV1
	Accepted Cursor
}

func (b RecordingBatch) Validate() error {
	if len(b.Observed) == 0 {
		return ErrInvalidRecording
	}
	var lastObserved Cursor
	for _, payload := range b.Observed {
		if err := payload.Validate(); err != nil {
			return err
		}
		cursor := payload.Cursor()
		if !lastObserved.IsZero() && !cursorFollows(lastObserved, cursor) {
			return ErrInvalidRecording
		}
		lastObserved = cursor
	}
	var lastFact Cursor
	for _, fact := range b.Facts {
		if err := fact.Validate(); err != nil {
			return err
		}
		cursor := fact.Cursor()
		if !lastFact.IsZero() && !cursorFollows(lastFact, cursor) {
			return ErrInvalidRecording
		}
		lastFact = cursor
	}
	if !b.Accepted.Valid() || b.Accepted.IsZero() || b.Accepted != lastObserved {
		return ErrInvalidRecording
	}
	return nil
}

func cursorFollows(previous, next Cursor) bool {
	if previous.Epoch == next.Epoch {
		return previous.Sequence < math.MaxUint64 && next.Sequence == previous.Sequence+1
	}
	return next.Epoch > previous.Epoch && next.Sequence == 1
}

func EncodePayloadV1(payload RecordingPayloadV1) ([]byte, error) {
	if err := payload.Validate(); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(payload)
	if err != nil || len(encoded) > MaxPayloadBytes {
		return nil, ErrInvalidRecording
	}
	return encoded, nil
}

func EncodeFactV1(fact RecordingFactV1) ([]byte, error) {
	if err := fact.Validate(); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(fact)
	if err != nil || len(encoded) > MaxPayloadBytes {
		return nil, ErrInvalidRecording
	}
	return encoded, nil
}

func DecodePayloadV1(data []byte) (RecordingPayloadV1, error) {
	var payload RecordingPayloadV1
	if err := decodeClosedJSON(data, &payload); err != nil {
		return RecordingPayloadV1{}, err
	}
	return payload, payload.Validate()
}

func DecodeFactV1(data []byte) (RecordingFactV1, error) {
	var fact RecordingFactV1
	if err := decodeClosedJSON(data, &fact); err != nil {
		return RecordingFactV1{}, err
	}
	return fact, fact.Validate()
}

func decodeClosedJSON(data []byte, destination any) error {
	if len(data) == 0 || len(data) > MaxPayloadBytes {
		return ErrInvalidRecording
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		var syntax *json.SyntaxError
		if errors.As(err, &syntax) {
			return ErrInvalidRecording
		}
		const prefix = "json: unknown field "
		if len(err.Error()) > len(prefix) && err.Error()[:len(prefix)] == prefix {
			return &UnknownRecordingFieldError{Field: err.Error()[len(prefix):]}
		}
		return ErrInvalidRecording
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return ErrInvalidRecording
	}
	return nil
}

func validUTC(value time.Time) bool {
	return !value.IsZero() && value.Location() == time.UTC
}

func validQuality(value Quality) bool {
	return value >= QualityUnknown && value <= QualityInvalid
}
