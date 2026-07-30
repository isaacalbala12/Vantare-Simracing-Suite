package main

import (
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"time"
)

const (
	channelObserved uint16 = 1
	channelFacts    uint16 = 2
	fixtureVersion  uint16 = 1
	payloadSize            = 2_080 // 32-byte header + 64 sanitized 32-byte vehicles.
)

var (
	errFutureFixture  = errors.New("future fixture version")
	errInvalidFixture = errors.New("invalid fixture")
)

type record struct {
	Channel    uint16
	Epoch      uint64
	Sequence   uint64
	Timestamp  int64
	Payload    []byte
	PayloadCRC uint32
}

type summary struct {
	Records      int64
	Observed     int64
	Facts        int64
	PayloadBytes int64
	LastEpoch    uint64
	LastSequence uint64
	Digest       [sha256.Size]byte
}

type store interface {
	Append(record) error
	Sync() error
	Close() error
}

type reader interface {
	Summarize(from, to int64) (summary, error)
	Close() error
}

type candidate struct {
	Name           string
	SupportsCommit bool
	OpenWriter     func(string) (store, error)
	OpenReader     func(string) (reader, error)
}

var candidates = map[string]candidate{}

func register(c candidate) {
	if _, exists := candidates[c.Name]; exists {
		panic("duplicate candidate " + c.Name)
	}
	candidates[c.Name] = c
}

func makeRecord(channel uint16, epoch, sequence uint64, timestamp int64) record {
	var payload []byte
	if channel == channelObserved {
		var err error
		payload, err = encodeRecordingPayloadV1(syntheticRecordingPayload(epoch, sequence, timestamp))
		if err != nil {
			panic(err)
		}
	} else {
		var err error
		payload, err = encodeRecordingFactV1(syntheticRecordingFact(epoch, sequence, timestamp))
		if err != nil {
			panic(err)
		}
	}
	return record{
		Channel: channel, Epoch: epoch, Sequence: sequence, Timestamp: timestamp,
		Payload: payload, PayloadCRC: crc32.ChecksumIEEE(payload),
	}
}

func parseRecord(channel uint16, payload []byte) (record, error) {
	if len(payload) < 32 {
		return record{}, fmt.Errorf("%w: payload too short", errInvalidFixture)
	}
	version := binary.LittleEndian.Uint16(payload[0:2])
	if version > fixtureVersion {
		return record{}, fmt.Errorf("%w: %d", errFutureFixture, version)
	}
	if version != fixtureVersion || binary.LittleEndian.Uint16(payload[2:4]) != channel {
		return record{}, fmt.Errorf("%w: header mismatch", errInvalidFixture)
	}
	if int(binary.LittleEndian.Uint32(payload[28:32])) != len(payload) {
		return record{}, fmt.Errorf("%w: length mismatch", errInvalidFixture)
	}
	return record{
		Channel:    channel,
		Epoch:      binary.LittleEndian.Uint64(payload[4:12]),
		Sequence:   binary.LittleEndian.Uint64(payload[12:20]),
		Timestamp:  int64(binary.LittleEndian.Uint64(payload[20:28])),
		Payload:    payload,
		PayloadCRC: crc32.ChecksumIEEE(payload),
	}, nil
}

func updateSummary(s *summary, rec record, digest io.Writer) error {
	if crc32.ChecksumIEEE(rec.Payload) != rec.PayloadCRC {
		return fmt.Errorf("payload checksum: %w", errInvalidFixture)
	}
	if _, err := digest.Write(rec.Payload); err != nil {
		return fmt.Errorf("digest payload: %w", err)
	}
	s.Records++
	s.PayloadBytes += int64(len(rec.Payload))
	switch rec.Channel {
	case channelObserved:
		s.Observed++
	case channelFacts:
		s.Facts++
	default:
		return fmt.Errorf("%w: channel %d", errInvalidFixture, rec.Channel)
	}
	if rec.Epoch > s.LastEpoch || rec.Epoch == s.LastEpoch && rec.Sequence > s.LastSequence {
		s.LastEpoch, s.LastSequence = rec.Epoch, rec.Sequence
	}
	return nil
}

type scenario struct {
	Name          string
	ObservedCount int
	FactEvery     int
	Step          time.Duration
	Repetitions   int
}

var scenarios = map[string]scenario{
	"nominal":     {Name: "nominal", ObservedCount: 1_200, FactEvery: 20, Step: 50 * time.Millisecond, Repetitions: 5},
	"four_x":      {Name: "four_x", ObservedCount: 4_800, FactEvery: 20, Step: 12500 * time.Microsecond, Repetitions: 5},
	"logical_24h": {Name: "logical_24h", ObservedCount: 86_400, FactEvery: 60, Step: time.Second, Repetitions: 1},
	"facts_burst": {Name: "facts_burst", ObservedCount: 1_200, FactEvery: 1, Step: 50 * time.Millisecond, Repetitions: 5},
}

func recordsFor(s scenario) []record {
	const epoch = uint64(7)
	base := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC).UnixNano()
	records := make([]record, 0, s.ObservedCount+s.ObservedCount/s.FactEvery)
	var sequence uint64
	for i := 0; i < s.ObservedCount; i++ {
		sequence++
		timestamp := base + int64(time.Duration(i)*s.Step)
		records = append(records, makeRecord(channelObserved, epoch, sequence, timestamp))
		if (i+1)%s.FactEvery == 0 {
			sequence++
			records = append(records, makeRecord(channelFacts, epoch, sequence, timestamp))
		}
	}
	return records
}
