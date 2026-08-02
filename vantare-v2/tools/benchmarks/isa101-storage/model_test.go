package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFixtureRoundTrip(t *testing.T) {
	want := makeRecord(channelObserved, 7, 42, 123456)
	got, err := parseRecord(want.Channel, want.Payload)
	if err != nil {
		t.Fatal(err)
	}
	if got.Epoch != want.Epoch || got.Sequence != want.Sequence || got.Timestamp != want.Timestamp ||
		!bytes.Equal(got.Payload, want.Payload) {
		t.Fatalf("round trip mismatch: got %+v want %+v", got, want)
	}
}

func TestFramingRejectsTruncatedTail(t *testing.T) {
	var data bytes.Buffer
	store := &frameStore{buf: newTestBuffer(&data)}
	rec := makeRecord(channelObserved, 7, 1, 123)
	if err := store.Append(rec); err != nil {
		t.Fatal(err)
	}
	if err := store.buf.Flush(); err != nil {
		t.Fatal(err)
	}
	truncated := data.Bytes()[:data.Len()-17]
	_, err := readFrame(bytes.NewReader(truncated))
	if !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("expected visible truncated tail, got %v", err)
	}
}

func TestRegisteredCandidatesRoundTripSameBytes(t *testing.T) {
	fixture := recordsFor(scenario{Name: "test", ObservedCount: 64, FactEvery: 8})
	var expected summary
	digest := sha256.New()
	for _, rec := range fixture {
		if err := updateSummary(&expected, rec, digest); err != nil {
			t.Fatal(err)
		}
	}
	copy(expected.Digest[:], digest.Sum(nil))

	for name, candidate := range candidates {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), name+".dat")
			if err := writeFixture(candidate, path, fixture); err != nil {
				t.Fatal(err)
			}
			got, _, err := queryCandidate(candidate, path, math.MinInt64, math.MaxInt64)
			if err != nil {
				t.Fatal(err)
			}
			if got.Records != expected.Records || got.LastSequence != expected.LastSequence ||
				got.Digest != expected.Digest {
				t.Fatalf("round trip mismatch: got %+v want %+v", got, expected)
			}
		})
	}
}

func TestFutureFixtureIsReadOnlyBoundary(t *testing.T) {
	payload := append([]byte(nil), makeRecord(channelObserved, 7, 1, 123).Payload...)
	payload[0] = byte(fixtureVersion + 1)
	_, err := parseRecord(channelObserved, payload)
	if !errors.Is(err, errFutureFixture) {
		t.Fatalf("expected future fixture error, got %v", err)
	}
}

func TestRecordingPayloadV1Golden(t *testing.T) {
	payload := syntheticRecordingPayload(7, 42, 123456)
	got, err := encodeRecordingPayloadV1(payload)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != payloadSize {
		t.Fatalf("payload size = %d, want %d", len(got), payloadSize)
	}
	sum := fmt.Sprintf("%x", sha256.Sum256(got))
	golden, err := os.ReadFile(filepath.Join("testdata", "recording-payload-v1.sha256"))
	if err != nil {
		t.Fatal(err)
	}
	if sum != strings.TrimSpace(string(golden)) {
		t.Fatalf("golden mismatch: got %s", sum)
	}
}

func TestRecordingPayloadV1RejectsSensitiveOrUnboundedFields(t *testing.T) {
	base, err := json.Marshal(syntheticRecordingPayload(7, 42, 123456))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeRecordingPayloadV1JSON(base); err != nil {
		t.Fatalf("valid observed base rejected: %v", err)
	}
	for field, value := range forbiddenRecordingJSONFields() {
		assertUnknownRecordingField(t, decodeObservedJSON, addJSONField(t, base, field, value), field)
	}
}

func TestRecordingFactV1GoldenAndBinaryRoundTrip(t *testing.T) {
	fact := syntheticRecordingFact(7, 42, 123456)
	encoded, err := encodeRecordingFactV1(fact)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeRecordingFactV1(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if decoded != fact {
		t.Fatalf("fact round trip mismatch: got %+v want %+v", decoded, fact)
	}
	sum := fmt.Sprintf("%x", sha256.Sum256(encoded))
	golden, err := os.ReadFile(filepath.Join("testdata", "recording-fact-v1.sha256"))
	if err != nil {
		t.Fatal(err)
	}
	if sum != strings.TrimSpace(string(golden)) {
		t.Fatalf("fact golden mismatch: got %s", sum)
	}
}

func TestRecordingFactV1RejectsNonZeroReservedBytes(t *testing.T) {
	tests := []struct {
		name   string
		offset int
	}{
		{name: "first reserved byte", offset: 57},
		{name: "last reserved byte", offset: 159},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			encoded, err := encodeRecordingFactV1(syntheticRecordingFact(7, 42, 123456))
			if err != nil {
				t.Fatal(err)
			}
			encoded[test.offset] = 1
			if _, err := decodeRecordingFactV1(encoded); !errors.Is(err, errRecordingPayload) {
				t.Fatalf("reserved offset %d: got %v, want errRecordingPayload", test.offset, err)
			}
		})
	}
}

func TestRecordingFactV1RejectsSensitiveOrUnboundedFields(t *testing.T) {
	base, err := json.Marshal(syntheticRecordingFact(7, 42, 123456))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeRecordingFactV1JSON(base); err != nil {
		t.Fatalf("valid fact base rejected: %v", err)
	}
	for field, value := range forbiddenRecordingJSONFields() {
		assertUnknownRecordingField(t, decodeFactJSON, addJSONField(t, base, field, value), field)
	}
}

func TestStartupSeparatesIntegrityStateFromAccessMode(t *testing.T) {
	for _, state := range []string{"opening", "recording", "recovering", "incomplete"} {
		got := startupRecoveryManifest(benchmarkManifest{IntegrityState: state, AccessMode: "read_write"})
		if got.IntegrityState != "incomplete" {
			t.Fatalf("integrity state %q recovered as %q", state, got.IntegrityState)
		}
	}
	readOnlyComplete := startupRecoveryManifest(benchmarkManifest{IntegrityState: "complete", AccessMode: "read_only"})
	if readOnlyComplete.IntegrityState != "complete" || readOnlyComplete.AccessMode != "read_only" {
		t.Fatalf("read-only complete manifest changed: %+v", readOnlyComplete)
	}
}

func forbiddenRecordingJSONFields() map[string]any {
	return map[string]any{
		"driver_name":       "Isaac",
		"team_name":         "Vantare",
		"vehicle_remote_id": "remote-42",
		"steam_id":          "7656119",
		"file_path":         `C:\Users\isaac`,
		"metadata":          map[string]any{"anything": "goes"},
		"unknown_field":     true,
	}
}

func addJSONField(t *testing.T, base []byte, field string, value any) []byte {
	t.Helper()
	var object map[string]any
	if err := json.Unmarshal(base, &object); err != nil {
		t.Fatal(err)
	}
	object[field] = value
	result, err := json.Marshal(object)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

type recordingJSONDecoder func([]byte) error

func decodeObservedJSON(input []byte) error {
	_, err := decodeRecordingPayloadV1JSON(input)
	return err
}

func decodeFactJSON(input []byte) error {
	_, err := decodeRecordingFactV1JSON(input)
	return err
}

func assertUnknownRecordingField(t *testing.T, decode recordingJSONDecoder, input []byte, wantField string) {
	t.Helper()
	err := decode(input)
	var unknown *UnknownRecordingFieldError
	if !errors.As(err, &unknown) {
		t.Fatalf("field %q: expected typed unknown-field error, got %v", wantField, err)
	}
	if unknown.Field != wantField {
		t.Fatalf("field %q: typed error reported %q", wantField, unknown.Field)
	}
}

func newTestBuffer(output io.Writer) *bufio.Writer {
	return bufio.NewWriter(output)
}
