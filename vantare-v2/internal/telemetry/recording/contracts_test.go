package recording

import (
	"errors"
	"math"
	"strings"
	"testing"
	"time"
)

func TestRecordingPayloadV1RoundTripAndUnknownFieldRejection(t *testing.T) {
	t.Parallel()
	payload := validPayload(1)
	encoded, err := EncodePayloadV1(payload)
	if err != nil {
		t.Fatalf("EncodePayloadV1() error = %v", err)
	}
	decoded, err := DecodePayloadV1(encoded)
	if err != nil {
		t.Fatalf("DecodePayloadV1() error = %v", err)
	}
	if decoded.Sequence != payload.Sequence || len(decoded.Vehicles) != 1 ||
		decoded.Vehicles[0].SessionSlot != 1 {
		t.Fatalf("decoded payload = %#v", decoded)
	}

	for _, field := range []string{"driverName", "steamID", "sourcePath", "metadata", "raw"} {
		t.Run(field, func(t *testing.T) {
			candidate := strings.TrimSuffix(string(encoded), "}") + `,"` + field + `":"private"}`
			_, decodeErr := DecodePayloadV1([]byte(candidate))
			var unknown *UnknownRecordingFieldError
			if !errors.As(decodeErr, &unknown) || !errors.Is(decodeErr, ErrUnknownRecordingField) {
				t.Fatalf("DecodePayloadV1(%s) error = %T %v, want typed unknown field", field, decodeErr, decodeErr)
			}
		})
	}
}

func TestRecordingFactV1RejectsUnknownAndInvalidValues(t *testing.T) {
	t.Parallel()
	fact := validFact(1)
	encoded, err := EncodeFactV1(fact)
	if err != nil {
		t.Fatalf("EncodeFactV1() error = %v", err)
	}
	if _, err := DecodeFactV1(append(encoded[:len(encoded)-1], []byte(`,"accountID":"x"}`)...)); !errors.Is(err, ErrUnknownRecordingField) {
		t.Fatalf("unknown fact field error = %v", err)
	}
	fact.Channel = ChannelObserved
	if _, err := EncodeFactV1(fact); !errors.Is(err, ErrInvalidRecording) {
		t.Fatalf("invalid channel error = %v", err)
	}
}

func TestRecordingBatchRequiresOrderedCursorsAndAcceptedWatermark(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		batch RecordingBatch
	}{
		{name: "empty", batch: RecordingBatch{}},
		{name: "duplicate observed", batch: RecordingBatch{
			Observed: []RecordingPayloadV1{validPayload(1), validPayload(1)},
			Accepted: Cursor{Epoch: 1, Sequence: 1},
		}},
		{name: "accepted behind", batch: RecordingBatch{
			Observed: []RecordingPayloadV1{validPayload(2)},
			Accepted: Cursor{Epoch: 1, Sequence: 1},
		}},
		{name: "facts only", batch: RecordingBatch{
			Facts:    []RecordingFactV1{validFact(1)},
			Accepted: Cursor{Epoch: 1, Sequence: 1},
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.batch.Validate(); !errors.Is(err, ErrInvalidRecording) {
				t.Fatalf("Validate() error = %v", err)
			}
		})
	}
	valid := RecordingBatch{
		Observed: []RecordingPayloadV1{validPayload(1), validPayload(2)},
		Facts:    []RecordingFactV1{validFact(1)},
		Accepted: Cursor{Epoch: 1, Sequence: 2},
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid batch error = %v", err)
	}
}

func TestRecordingV1RejectsNonFiniteControlsAndUnknownPresenceBits(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func(*RecordingPayloadV1)
	}{
		{name: "throttle NaN", mutate: func(payload *RecordingPayloadV1) {
			payload.Vehicles[0].Throttle = float32(math.NaN())
		}},
		{name: "brake positive infinity", mutate: func(payload *RecordingPayloadV1) {
			payload.Vehicles[0].Brake = float32(math.Inf(1))
		}},
		{name: "vehicle unknown presence", mutate: func(payload *RecordingPayloadV1) {
			payload.Vehicles[0].Presence = PresenceVehicleV1 | 1<<63
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload := validPayload(1)
			test.mutate(&payload)
			if err := payload.Validate(); !errors.Is(err, ErrInvalidRecording) {
				t.Fatalf("Validate() error = %v, want invalid recording", err)
			}
		})
	}

	fact := validFact(1)
	fact.Presence = PresenceFactV1 | 1<<63
	if err := fact.Validate(); !errors.Is(err, ErrInvalidRecording) {
		t.Fatalf("fact.Validate() error = %v, want invalid recording", err)
	}
}

func TestFactTypeKnownCoversClosedV1Catalog(t *testing.T) {
	t.Parallel()
	for factType := FactLapCompleted; factType <= FactConnectionRecovered; factType++ {
		if !factType.Known() {
			t.Fatalf("FactType(%d).Known() = false", factType)
		}
	}
	for _, factType := range []FactType{FactUnknown, FactConnectionRecovered + 1, FactType(1 << 15)} {
		if factType.Known() {
			t.Fatalf("FactType(%d).Known() = true", factType)
		}
	}
}

func TestCursorRequiresBothComponentsOrNeither(t *testing.T) {
	t.Parallel()
	for _, cursor := range []Cursor{{Epoch: 1}, {Sequence: 1}} {
		if cursor.Valid() {
			t.Fatalf("Cursor %#v unexpectedly valid", cursor)
		}
	}
	for _, cursor := range []Cursor{{}, {Epoch: 1, Sequence: 1}} {
		if !cursor.Valid() {
			t.Fatalf("Cursor %#v unexpectedly invalid", cursor)
		}
	}
}

func TestSessionManifestKeepsIntegrityAndAccessModeOrthogonal(t *testing.T) {
	t.Parallel()
	manifest := NewSessionManifest("session-local-1", "lmu", "test-build", time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC))
	if err := manifest.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	manifest.AccessMode = AccessReadOnly
	if manifest.EffectiveIntegrity() != IntegrityIncomplete {
		t.Fatalf("effective integrity = %q, want incomplete", manifest.EffectiveIntegrity())
	}
	if err := manifest.Validate(); err != nil {
		t.Fatalf("read-only recording manifest error = %v", err)
	}
}

func TestNewLocalSessionIDIsOpaqueAndUnique(t *testing.T) {
	t.Parallel()
	first, err := NewLocalSessionID()
	if err != nil {
		t.Fatalf("NewLocalSessionID(first) error = %v", err)
	}
	second, err := NewLocalSessionID()
	if err != nil {
		t.Fatalf("NewLocalSessionID(second) error = %v", err)
	}
	if first == second || !safeLocalID(first) || !safeLocalID(second) {
		t.Fatalf("session ids are not opaque unique local ids: %q %q", first, second)
	}
}

func FuzzDecodePayloadV1(f *testing.F) {
	seed, err := EncodePayloadV1(validPayload(1))
	if err != nil {
		f.Fatalf("EncodePayloadV1(seed) error = %v", err)
	}
	f.Add(seed)
	f.Add([]byte(`{"version":1,"driverName":"private"}`))
	f.Fuzz(func(t *testing.T, data []byte) {
		payload, decodeErr := DecodePayloadV1(data)
		if decodeErr == nil {
			if err := payload.Validate(); err != nil {
				t.Fatalf("successful decode produced invalid payload: %v", err)
			}
		}
	})
}

func validPayload(sequence uint64) RecordingPayloadV1 {
	return RecordingPayloadV1{
		Version:       RecordingVersionV1,
		Channel:       ChannelObserved,
		Epoch:         1,
		Sequence:      sequence,
		CapturedAtUTC: time.Date(2026, 7, 30, 10, 0, int(sequence), 0, time.UTC),
		Vehicles: []RecordingVehicleV1{{
			SessionSlot: 1,
			SpeedMS:     62.5,
			Throttle:    0.8,
			Brake:       0,
			Gear:        5,
			Presence:    7,
			Quality:     QualityCurrent,
		}},
	}
}

func validFact(sequence uint64) RecordingFactV1 {
	return RecordingFactV1{
		Version:                RecordingVersionV1,
		Channel:                ChannelFact,
		Epoch:                  1,
		FactSequence:           sequence,
		OccurredAtUTC:          time.Date(2026, 7, 30, 10, 0, int(sequence), 0, time.UTC),
		CausalSnapshotSequence: sequence,
		FactType:               FactLapCompleted,
		SessionSlot:            1,
		Value:                  float64(sequence),
		Presence:               PresenceFactValue,
		Quality:                QualityCurrent,
	}
}
