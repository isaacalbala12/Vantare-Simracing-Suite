package replay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestRawFixtureV1GoldenRoundTripAndReplay(t *testing.T) {
	t.Parallel()
	data, err := os.ReadFile(filepath.Join("testdata", "raw-v1.golden.json"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	fixture, err := DecodeRawFixtureV1(data)
	if err != nil {
		t.Fatalf("DecodeRawFixtureV1() error = %v", err)
	}
	if fixture.Metadata.SimulatorID != "lmu" || !fixture.Metadata.Sanitized || len(fixture.Records) != 2 {
		t.Fatalf("fixture = %#v", fixture)
	}
	encoded, err := EncodeRawFixtureV1(fixture)
	if err != nil {
		t.Fatalf("EncodeRawFixtureV1() error = %v", err)
	}
	if string(encoded) != string(data) {
		t.Fatalf("golden changed\n got: %s\nwant: %s", encoded, data)
	}

	source, err := fixture.Source()
	if err != nil {
		t.Fatalf("Source() error = %v", err)
	}
	player, err := NewPlayer(source, Options{Mode: ModeStep})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	var got [][]byte
	for range fixture.Records {
		if err := player.Step(context.Background(), func(_ context.Context, output Output[RawRecordV1]) error {
			got = append(got, append([]byte(nil), output.Value.Payload...))
			return nil
		}); err != nil {
			t.Fatalf("Step() error = %v", err)
		}
	}
	if want := [][]byte{{1, 2, 3, 4}, []byte(`{"session":"sanitized"}`)}; !reflect.DeepEqual(got, want) {
		t.Fatalf("payloads = %v, want %v", got, want)
	}
}

func TestRawFixtureRejectsUnknownFieldsTamperingAndUnsafeProvenance(t *testing.T) {
	t.Parallel()
	valid := rawFixtureForTest()
	encoded, err := EncodeRawFixtureV1(valid)
	if err != nil {
		t.Fatalf("EncodeRawFixtureV1() error = %v", err)
	}
	withUnknown := append(encoded[:len(encoded)-2], []byte(",\"personalName\":\"driver\"}\n")...)
	if _, err := DecodeRawFixtureV1(withUnknown); !errors.Is(err, ErrUnknownFixtureField) {
		t.Fatalf("DecodeRawFixtureV1(unknown) error = %v", err)
	}

	tampered := valid
	tampered.Records = append([]RawRecordV1(nil), valid.Records...)
	tampered.Records[0].Payload = []byte("changed")
	if _, err := EncodeRawFixtureV1(tampered); !errors.Is(err, ErrFixtureIntegrity) {
		t.Fatalf("EncodeRawFixtureV1(tampered) error = %v", err)
	}

	unsafe := valid
	unsafe.Metadata.Sanitized = false
	if _, err := EncodeRawFixtureV1(unsafe); !errors.Is(err, ErrInvalidFixture) {
		t.Fatalf("EncodeRawFixtureV1(unsafe) error = %v", err)
	}

	delayed := valid
	delayed.Records = append([]RawRecordV1(nil), valid.Records...)
	delayed.Records[0].OffsetNS = 1
	if _, err := EncodeRawFixtureV1(delayed); !errors.Is(err, ErrInvalidFixture) {
		t.Fatalf("EncodeRawFixtureV1(delayed first frame) error = %v", err)
	}
}

func rawFixtureForTest() RawFixtureV1 {
	payload := []byte{1, 2, 3}
	sum := sha256.Sum256(payload)
	return RawFixtureV1{
		Metadata: FixtureMetadata{
			FixtureVersion: FixtureVersionV1,
			SimulatorID:    "lmu",
			SimulatorBuild: "2026.07-test",
			AppBuild:       "vantare-test",
			SchemaID:       "lmu-shared-memory",
			SchemaVersion:  1,
			StartedAtUTC:   time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC),
			Origin:         FixtureOriginSynthetic,
			Sanitized:      true,
		},
		Records: []RawRecordV1{{
			OffsetNS:  0,
			StreamID:  "scoring",
			Payload:   payload,
			SHA256Hex: hex.EncodeToString(sum[:]),
		}},
	}
}
