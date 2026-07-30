package replay

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"
)

const (
	MaxRawFixtureRecords = 100_000
	MaxRawRecordBytes    = 4 * 1024 * 1024
	MaxRawFixtureBytes   = 64 * 1024 * 1024
)

var (
	ErrFixtureIntegrity    = errors.New("replay fixture integrity check failed")
	ErrUnknownFixtureField = errors.New("unknown replay fixture field")
)

type RawRecordV1 struct {
	OffsetNS  int64  `json:"offsetNS"`
	StreamID  string `json:"streamID"`
	Payload   []byte `json:"payload"`
	SHA256Hex string `json:"sha256"`
}

func (record RawRecordV1) Validate() error {
	if record.OffsetNS < 0 ||
		!safeToken(record.StreamID, 64) ||
		len(record.Payload) == 0 ||
		len(record.Payload) > MaxRawRecordBytes ||
		len(record.SHA256Hex) != sha256.Size*2 {
		return ErrInvalidFixture
	}
	sum := sha256.Sum256(record.Payload)
	if !equalDigest(record.SHA256Hex, sum[:]) {
		return ErrFixtureIntegrity
	}
	return nil
}

type RawFixtureV1 struct {
	Metadata FixtureMetadata `json:"metadata"`
	Records  []RawRecordV1   `json:"records"`
}

func (fixture RawFixtureV1) Validate() error {
	if err := fixture.Metadata.Validate(); err != nil ||
		len(fixture.Records) == 0 ||
		len(fixture.Records) > MaxRawFixtureRecords {
		return ErrInvalidFixture
	}
	var previous int64
	var total int
	for index, record := range fixture.Records {
		if err := record.Validate(); err != nil {
			return err
		}
		if (index == 0 && record.OffsetNS != 0) ||
			(index > 0 && record.OffsetNS < previous) {
			return ErrInvalidFixture
		}
		if total > MaxRawFixtureBytes-len(record.Payload) {
			return ErrInvalidFixture
		}
		total += len(record.Payload)
		previous = record.OffsetNS
	}
	return nil
}

func EncodeRawFixtureV1(fixture RawFixtureV1) ([]byte, error) {
	if err := fixture.Validate(); err != nil {
		return nil, err
	}
	data, err := json.MarshalIndent(fixture, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode raw replay fixture: %w", err)
	}
	data = append(data, '\n')
	if len(data) > MaxRawFixtureBytes {
		return nil, ErrInvalidFixture
	}
	return data, nil
}

func DecodeRawFixtureV1(data []byte) (RawFixtureV1, error) {
	if len(data) == 0 || len(data) > MaxRawFixtureBytes {
		return RawFixtureV1{}, ErrInvalidFixture
	}
	var fixture RawFixtureV1
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&fixture); err != nil {
		var unknown *json.UnmarshalTypeError
		if errors.As(err, &unknown) {
			return RawFixtureV1{}, ErrInvalidFixture
		}
		const prefix = "json: unknown field "
		if len(err.Error()) > len(prefix) && err.Error()[:len(prefix)] == prefix {
			return RawFixtureV1{}, ErrUnknownFixtureField
		}
		return RawFixtureV1{}, ErrInvalidFixture
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return RawFixtureV1{}, ErrInvalidFixture
	}
	return fixture, fixture.Validate()
}

func (fixture RawFixtureV1) Source() (*SliceSource[RawRecordV1], error) {
	if err := fixture.Validate(); err != nil {
		return nil, err
	}
	frames := make([]Frame[RawRecordV1], len(fixture.Records))
	for index, record := range fixture.Records {
		frames[index] = Frame[RawRecordV1]{
			Offset: time.Duration(record.OffsetNS),
			Value:  cloneRawRecord(record),
		}
	}
	return NewSliceSource(fixture.Metadata, frames, cloneRawRecord)
}

func cloneRawRecord(record RawRecordV1) RawRecordV1 {
	record.Payload = append([]byte(nil), record.Payload...)
	return record
}

func equalDigest(encoded string, expected []byte) bool {
	decoded, err := hex.DecodeString(encoded)
	if err != nil || len(decoded) != len(expected) {
		return false
	}
	return bytes.Equal(decoded, expected)
}
