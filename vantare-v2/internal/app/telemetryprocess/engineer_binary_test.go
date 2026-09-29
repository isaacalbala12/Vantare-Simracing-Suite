package telemetryprocess

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func TestEngineerBinaryCandidateMatchesRustJSONFixture(t *testing.T) {
	binaryFrame := engineerFixture(t, "engineer-snapshot-frame-rust-binary-v1.bin")
	jsonFrame := engineerFixture(t, "engineer-snapshot-frame-rust-v1.bin")
	got, identity, err := DecodeEngineerBinarySnapshot(binaryFrame)
	if err != nil || identity == nil || identity.Vehicle != engineer.VehicleID(got.Player.ID) ||
		!(engineer.Context{Epoch: uint64(got.Metadata.Epoch), Identity: *identity}).Complete() {
		t.Fatalf("binary decode: identity=%+v error=%v", identity, err)
	}
	want, err := DecodeEngineerSnapshot(jsonFrame)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("binary Engineer differs from the pinned Rust JSON projection")
	}
	if len(got.Vehicles) < 40 {
		t.Fatalf("binary Engineer rows=%d", len(got.Vehicles))
	}
	for _, bad := range []Frame{
		{Kind: KindStatus, Payload: binaryFrame.Payload},
		{Kind: KindSnapshot, Payload: binaryFrame.Payload[:len(binaryFrame.Payload)-1]},
		{Kind: KindSnapshot, Payload: append(append([]byte(nil), binaryFrame.Payload...), 0)},
		{Kind: KindSnapshot, Payload: append([]byte("wrong"), binaryFrame.Payload[5:]...)},
	} {
		if _, _, err := DecodeEngineerBinarySnapshot(bad); !errors.Is(err, ErrInvalidObservationSnapshot) {
			t.Fatalf("invalid binary frame accepted: %v", err)
		}
	}
	wrongVersion := append([]byte(nil), binaryFrame.Payload...)
	wrongVersion[4] = 2
	if _, _, err := DecodeEngineerBinarySnapshot(Frame{Kind: KindSnapshot, Payload: wrongVersion}); !errors.Is(err, ErrInvalidObservationSnapshot) {
		t.Fatalf("unknown version accepted: %v", err)
	}
	reserved := append([]byte(nil), binaryFrame.Payload...)
	capturedAtLength := int(binary.LittleEndian.Uint16(reserved[22:24]))
	bodyStart := 24 + capturedAtLength + 1
	for field := 0; field < 5; field++ {
		length := int(binary.LittleEndian.Uint16(reserved[bodyStart : bodyStart+2]))
		bodyStart += 2 + length
	}
	reserved[bodyStart] = 0x80 // unknown capability
	if _, _, err := DecodeEngineerBinarySnapshot(Frame{Kind: KindSnapshot, Payload: reserved}); !errors.Is(err, ErrInvalidObservationSnapshot) {
		t.Fatalf("unknown capability accepted: %v", err)
	}
	reservedField := append([]byte(nil), binaryFrame.Payload...)
	reservedField[bodyStart+1] = 0x80 // unknown field quality bits
	if _, _, err := DecodeEngineerBinarySnapshot(Frame{Kind: KindSnapshot, Payload: reservedField}); !errors.Is(err, ErrInvalidObservationSnapshot) {
		t.Fatalf("unknown quality accepted: %v", err)
	}
}

func TestEngineerBinaryCandidateRealTemporalParityOptIn(t *testing.T) {
	out := os.Getenv("LMU_TEMPORAL_BINARY_OUT")
	corpus := os.Getenv("LMU_TEMPORAL_CORPUS")
	if out == "" && corpus == "" {
		t.Skip("set LMU_TEMPORAL_BINARY_OUT and LMU_TEMPORAL_CORPUS to audited real files")
	}
	if out == "" || corpus == "" {
		t.Fatal("both LMU_TEMPORAL_BINARY_OUT and LMU_TEMPORAL_CORPUS are required")
	}
	manifestBytes, err := os.ReadFile(filepath.Join(corpus, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Samples []struct {
			Index    int `json:"index"`
			Vehicles int `json:"vehicles"`
		} `json:"samples"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil || len(manifest.Samples) < 8 || len(manifest.Samples) > 240 {
		t.Fatalf("invalid audited manifest: samples=%d error=%v", len(manifest.Samples), err)
	}
	for index, sample := range manifest.Samples {
		if sample.Index != index || sample.Vehicles < 46 {
			t.Fatalf("sample %d index=%d vehicles=%d", index, sample.Index, sample.Vehicles)
		}
		binaryFrame := engineerFixturePath(t, filepath.Join(out, fmt.Sprintf("%03d-engineer-binary.bin", index)))
		jsonFrame := engineerFixturePath(t, filepath.Join(out, fmt.Sprintf("%03d-engineer-json.bin", index)))
		got, gotIdentity, err := DecodeEngineerBinarySnapshot(binaryFrame)
		if err != nil {
			t.Fatalf("sample %d binary: %v", index, err)
		}
		want, wantIdentity, err := DecodeEngineerSnapshotWithIdentity(jsonFrame)
		if err != nil {
			t.Fatalf("sample %d JSON: %v", index, err)
		}
		if len(got.Vehicles) != sample.Vehicles || !reflect.DeepEqual(got, want) || !reflect.DeepEqual(gotIdentity, wantIdentity) {
			t.Fatalf("sample %d Engineer binary differs from Rust JSON", index)
		}
	}
	t.Logf("binary Engineer matched complete Rust JSON snapshot and identity for %d real samples", len(manifest.Samples))
}

func engineerFixturePath(t *testing.T, path string) Frame {
	t.Helper()
	wire, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	return frame
}

func engineerFixture(t *testing.T, file string) Frame {
	t.Helper()
	return engineerFixturePath(t, filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", file))
}
