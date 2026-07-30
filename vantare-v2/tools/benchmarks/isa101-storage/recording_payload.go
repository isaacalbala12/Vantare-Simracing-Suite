package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const (
	recordingPayloadVersion uint16 = 1
	recordingVehicleSize           = 32
	recordingVehicleCount          = 64
	recordingHeaderSize            = 32
)

var errRecordingPayload = errors.New("invalid recording payload v1")

type UnknownRecordingFieldError struct {
	Scope string
	Field string
}

func (e *UnknownRecordingFieldError) Error() string {
	return fmt.Sprintf("unknown recording field %q in %s", e.Field, e.Scope)
}

// RecordingPayloadV1 is an isolated proposal for TC-06B. It is deliberately
// not core.ObservedState: only storage-approved, pseudonymous values cross this boundary.
type RecordingPayloadV1 struct {
	Version      uint16               `json:"version"`
	Channel      uint16               `json:"channel"`
	Epoch        uint64               `json:"epoch"`
	Sequence     uint64               `json:"sequence"`
	CapturedAtNS int64                `json:"captured_at_ns"`
	Vehicles     []RecordingVehicleV1 `json:"vehicles"`
}

type RecordingVehicleV1 struct {
	SessionSlot      uint16 `json:"session_slot"`
	SpeedMillimeters int32  `json:"speed_mm_s"`
	ThrottlePermille uint16 `json:"throttle_permille"`
	BrakePermille    uint16 `json:"brake_permille"`
	Gear             int8   `json:"gear"`
	InPit            bool   `json:"in_pit"`
	PresenceMask     uint32 `json:"presence_mask"`
	Quality          uint8  `json:"quality"`
}

// RecordingFactV1 is a closed, numeric fact contract. FactType is an enum
// owned by the future recording schema; it is not free-form source metadata.
type RecordingFactV1 struct {
	Version                uint16 `json:"version"`
	Channel                uint16 `json:"channel"`
	Epoch                  uint64 `json:"epoch"`
	Sequence               uint64 `json:"sequence"`
	CapturedAtNS           int64  `json:"captured_at_ns"`
	CausalObservedSequence uint64 `json:"causal_observed_sequence"`
	FactType               uint16 `json:"fact_type"`
	SessionSlot            uint16 `json:"session_slot"`
	Value                  int64  `json:"value"`
	PresenceMask           uint32 `json:"presence_mask"`
	Quality                uint8  `json:"quality"`
}

func encodeRecordingPayloadV1(payload RecordingPayloadV1) ([]byte, error) {
	if payload.Version != recordingPayloadVersion || payload.Channel != channelObserved {
		return nil, fmt.Errorf("%w: version/channel", errRecordingPayload)
	}
	if len(payload.Vehicles) != recordingVehicleCount {
		return nil, fmt.Errorf("%w: vehicle count %d", errRecordingPayload, len(payload.Vehicles))
	}
	output := make([]byte, recordingHeaderSize+recordingVehicleCount*recordingVehicleSize)
	binary.LittleEndian.PutUint16(output[0:2], payload.Version)
	binary.LittleEndian.PutUint16(output[2:4], payload.Channel)
	binary.LittleEndian.PutUint64(output[4:12], payload.Epoch)
	binary.LittleEndian.PutUint64(output[12:20], payload.Sequence)
	binary.LittleEndian.PutUint64(output[20:28], uint64(payload.CapturedAtNS))
	binary.LittleEndian.PutUint32(output[28:32], uint32(len(output)))
	for index, vehicle := range payload.Vehicles {
		offset := recordingHeaderSize + index*recordingVehicleSize
		binary.LittleEndian.PutUint16(output[offset:offset+2], vehicle.SessionSlot)
		binary.LittleEndian.PutUint32(output[offset+2:offset+6], uint32(vehicle.SpeedMillimeters))
		binary.LittleEndian.PutUint16(output[offset+6:offset+8], vehicle.ThrottlePermille)
		binary.LittleEndian.PutUint16(output[offset+8:offset+10], vehicle.BrakePermille)
		output[offset+10] = byte(vehicle.Gear)
		if vehicle.InPit {
			output[offset+11] = 1
		}
		binary.LittleEndian.PutUint32(output[offset+12:offset+16], vehicle.PresenceMask)
		output[offset+16] = vehicle.Quality
		// Bytes 17..31 are reserved and must remain zero for deterministic v1.
	}
	return output, nil
}

func decodeRecordingPayloadV1JSON(input []byte) (RecordingPayloadV1, error) {
	if err := validateRecordingPayloadV1Fields(input); err != nil {
		return RecordingPayloadV1{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(input))
	decoder.DisallowUnknownFields()
	var payload RecordingPayloadV1
	if err := decoder.Decode(&payload); err != nil {
		return RecordingPayloadV1{}, fmt.Errorf("%w: %v", errRecordingPayload, err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return RecordingPayloadV1{}, err
	}
	if _, err := encodeRecordingPayloadV1(payload); err != nil {
		return RecordingPayloadV1{}, err
	}
	return payload, nil
}

func encodeRecordingFactV1(fact RecordingFactV1) ([]byte, error) {
	if fact.Version != recordingPayloadVersion || fact.Channel != channelFacts {
		return nil, fmt.Errorf("%w: fact version/channel", errRecordingPayload)
	}
	const size = 160
	output := make([]byte, size)
	binary.LittleEndian.PutUint16(output[0:2], fact.Version)
	binary.LittleEndian.PutUint16(output[2:4], fact.Channel)
	binary.LittleEndian.PutUint64(output[4:12], fact.Epoch)
	binary.LittleEndian.PutUint64(output[12:20], fact.Sequence)
	binary.LittleEndian.PutUint64(output[20:28], uint64(fact.CapturedAtNS))
	binary.LittleEndian.PutUint32(output[28:32], uint32(len(output)))
	binary.LittleEndian.PutUint64(output[32:40], fact.CausalObservedSequence)
	binary.LittleEndian.PutUint16(output[40:42], fact.FactType)
	binary.LittleEndian.PutUint16(output[42:44], fact.SessionSlot)
	binary.LittleEndian.PutUint64(output[44:52], uint64(fact.Value))
	binary.LittleEndian.PutUint32(output[52:56], fact.PresenceMask)
	output[56] = fact.Quality
	// Bytes 57..159 are reserved and remain zero in v1.
	return output, nil
}

func decodeRecordingFactV1(payload []byte) (RecordingFactV1, error) {
	if len(payload) != 160 {
		return RecordingFactV1{}, fmt.Errorf("%w: fact length %d", errRecordingPayload, len(payload))
	}
	if binary.LittleEndian.Uint16(payload[0:2]) != recordingPayloadVersion ||
		binary.LittleEndian.Uint16(payload[2:4]) != channelFacts ||
		binary.LittleEndian.Uint32(payload[28:32]) != uint32(len(payload)) {
		return RecordingFactV1{}, fmt.Errorf("%w: fact header", errRecordingPayload)
	}
	for _, reserved := range payload[57:160] {
		if reserved != 0 {
			return RecordingFactV1{}, fmt.Errorf("%w: non-zero fact reserved byte", errRecordingPayload)
		}
	}
	return RecordingFactV1{
		Version:                binary.LittleEndian.Uint16(payload[0:2]),
		Channel:                binary.LittleEndian.Uint16(payload[2:4]),
		Epoch:                  binary.LittleEndian.Uint64(payload[4:12]),
		Sequence:               binary.LittleEndian.Uint64(payload[12:20]),
		CapturedAtNS:           int64(binary.LittleEndian.Uint64(payload[20:28])),
		CausalObservedSequence: binary.LittleEndian.Uint64(payload[32:40]),
		FactType:               binary.LittleEndian.Uint16(payload[40:42]),
		SessionSlot:            binary.LittleEndian.Uint16(payload[42:44]),
		Value:                  int64(binary.LittleEndian.Uint64(payload[44:52])),
		PresenceMask:           binary.LittleEndian.Uint32(payload[52:56]),
		Quality:                payload[56],
	}, nil
}

func decodeRecordingFactV1JSON(input []byte) (RecordingFactV1, error) {
	if err := validateAllowedJSONFields(input, "fact", map[string]struct{}{
		"version": {}, "channel": {}, "epoch": {}, "sequence": {},
		"captured_at_ns": {}, "causal_observed_sequence": {}, "fact_type": {},
		"session_slot": {}, "value": {}, "presence_mask": {}, "quality": {},
	}); err != nil {
		return RecordingFactV1{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(input))
	decoder.DisallowUnknownFields()
	var fact RecordingFactV1
	if err := decoder.Decode(&fact); err != nil {
		return RecordingFactV1{}, fmt.Errorf("%w: %v", errRecordingPayload, err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return RecordingFactV1{}, err
	}
	if _, err := encodeRecordingFactV1(fact); err != nil {
		return RecordingFactV1{}, err
	}
	return fact, nil
}

func validateRecordingPayloadV1Fields(input []byte) error {
	rootAllowed := map[string]struct{}{
		"version": {}, "channel": {}, "epoch": {}, "sequence": {},
		"captured_at_ns": {}, "vehicles": {},
	}
	if err := validateAllowedJSONFields(input, "observed", rootAllowed); err != nil {
		return err
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(input, &root); err != nil {
		return fmt.Errorf("%w: %v", errRecordingPayload, err)
	}
	var vehicles []json.RawMessage
	if err := json.Unmarshal(root["vehicles"], &vehicles); err != nil {
		return fmt.Errorf("%w: vehicles: %v", errRecordingPayload, err)
	}
	vehicleAllowed := map[string]struct{}{
		"session_slot": {}, "speed_mm_s": {}, "throttle_permille": {},
		"brake_permille": {}, "gear": {}, "in_pit": {},
		"presence_mask": {}, "quality": {},
	}
	for index, vehicle := range vehicles {
		if err := validateAllowedJSONFields(vehicle, fmt.Sprintf("observed.vehicles[%d]", index), vehicleAllowed); err != nil {
			return err
		}
	}
	return nil
}

func validateAllowedJSONFields(input []byte, scope string, allowed map[string]struct{}) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(input, &fields); err != nil {
		return fmt.Errorf("%w: %v", errRecordingPayload, err)
	}
	for field := range fields {
		if _, ok := allowed[field]; !ok {
			return &UnknownRecordingFieldError{Scope: scope, Field: field}
		}
	}
	return nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return fmt.Errorf("%w: trailing JSON value", errRecordingPayload)
		}
		return fmt.Errorf("%w: %v", errRecordingPayload, err)
	}
	return nil
}

func syntheticRecordingPayload(epoch, sequence uint64, timestamp int64) RecordingPayloadV1 {
	vehicles := make([]RecordingVehicleV1, recordingVehicleCount)
	for index := range vehicles {
		vehicles[index] = RecordingVehicleV1{
			SessionSlot:      uint16(index),
			SpeedMillimeters: int32(18_000 + (sequence+uint64(index)*137)%72_000),
			ThrottlePermille: uint16((sequence*17 + uint64(index)*31) % 1_001),
			BrakePermille:    uint16((sequence*7 + uint64(index)*13) % 1_001),
			Gear:             int8((sequence+uint64(index))%9) - 1,
			InPit:            (sequence+uint64(index))%97 == 0,
			PresenceMask:     0x1f,
			Quality:          1,
		}
	}
	return RecordingPayloadV1{
		Version: recordingPayloadVersion, Channel: channelObserved,
		Epoch: epoch, Sequence: sequence, CapturedAtNS: timestamp, Vehicles: vehicles,
	}
}

func syntheticRecordingFact(epoch, sequence uint64, timestamp int64) RecordingFactV1 {
	return RecordingFactV1{
		Version: recordingPayloadVersion, Channel: channelFacts,
		Epoch: epoch, Sequence: sequence, CapturedAtNS: timestamp,
		CausalObservedSequence: sequence - 1,
		FactType:               uint16(sequence%7 + 1),
		SessionSlot:            uint16(sequence % recordingVehicleCount),
		Value:                  int64(sequence*31) - 500,
		PresenceMask:           0x3,
		Quality:                1,
	}
}
