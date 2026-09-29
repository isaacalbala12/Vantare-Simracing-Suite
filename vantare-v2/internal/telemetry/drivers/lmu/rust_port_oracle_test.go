package lmu

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// This is the frozen Go parser oracle for the real, static 44-car LMU 1.3
// fixture. It is only a parser checkpoint, never the temporal or CPU corpus.
func TestRustPortGoParserOracleStatic44(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	const fixtureSHA = "959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff"
	if got := sha256.Sum256(input); hex.EncodeToString(got[:]) != fixtureSHA {
		t.Fatalf("real LMU fixture SHA = %x, want %s", got, fixtureSHA)
	}
	parsed, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Compatibility != CompatibilityKnown || len(parsed.Vehicles) != 44 {
		t.Fatalf("Go parser oracle rejected known 44-car fixture: compatibility=%d vehicles=%d", parsed.Compatibility, len(parsed.Vehicles))
	}
	encoded, err := json.Marshal(parsed)
	if err != nil {
		t.Fatal(err)
	}
	const observationSHA = "2c61c6948e4dd1ecea4f4ae93bbc5eee1d40a4ad4bc4260ec88535cf379393c2"
	if got := sha256.Sum256(encoded); hex.EncodeToString(got[:]) != observationSHA {
		t.Fatalf("Go parser observation SHA = %x, want %s", got, observationSHA)
	}
}

func TestRustPortGoParserOracleRejectsInvalidGrid(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := parseSupported(input[:ObjectOutSize-1], time.Unix(100, 0)); !errors.Is(err, ErrIncompatibleBuffer) {
		t.Fatalf("short buffer error = %v", err)
	}
	countInvalid := append([]byte(nil), input...)
	binary.LittleEndian.PutUint32(countInvalid[lmu13Layout.Session.VehicleCount.Offset:], 105)
	duplicateID := append([]byte(nil), input...)
	secondTelemetryBase, ok := lmu13Layout.TelemetryRows.rowBase(1)
	if !ok {
		t.Fatal("second telemetry row is outside pinned layout")
	}
	copy(duplicateID[secondTelemetryBase:secondTelemetryBase+4], duplicateID[telemetryOffset:telemetryOffset+4])
	invalidTrack := append([]byte(nil), input...)
	for at := 1632; at < 1696; at++ {
		invalidTrack[at] = 'A'
	}
	duplicatePlayer := append([]byte(nil), input...)
	duplicatePlayer[scoringOffset+scoringIsPlayerOffset] = 1
	for _, candidate := range [][]byte{countInvalid, duplicateID, invalidTrack, duplicatePlayer} {
		observation, err := parseSupported(candidate, time.Unix(100, 0))
		if err != nil || observation.Compatibility != CompatibilityUnknown {
			t.Fatalf("invalid frame accepted or returned unexpected error: compatibility=%d error=%v", observation.Compatibility, err)
		}
	}
}
