package lmu

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording/replay"
)

const sanitizedSharedMemoryFixtureSHA256 = "959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff"

func TestRawReplayExercisesRealSharedMemoryAndRESTParsers(t *testing.T) {
	t.Parallel()
	shared, err := os.ReadFile(filepath.Join(
		"..", "..", "..", "..", "testdata", "lmu-fixture.bin",
	))
	if err != nil {
		t.Fatalf("ReadFile(shared fixture) error = %v", err)
	}
	sharedDigest := sha256.Sum256(shared)
	expectedDigest, err := hex.DecodeString(sanitizedSharedMemoryFixtureSHA256)
	if err != nil {
		t.Fatalf("DecodeString(fixture SHA-256) error = %v", err)
	}
	if !bytes.Equal(sharedDigest[:], expectedDigest) {
		t.Fatalf("shared fixture SHA-256 = %x, want pinned sanitized capture", sharedDigest)
	}
	standings := []byte(`[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]`)
	sessionInfo := []byte(`{"trackName":"Replay Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}`)
	started := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	fixtures := []replay.RawFixtureV1{
		{
			Metadata: replay.FixtureMetadata{
				FixtureVersion: replay.FixtureVersionV1,
				SimulatorID:    "lmu",
				SimulatorBuild: supportedLMUVersion,
				AppBuild:       "vantare-test",
				SchemaID:       "lmu-shared-memory",
				SchemaVersion:  1,
				StartedAtUTC:   started,
				Origin:         replay.FixtureOriginSanitizedCapture,
				Sanitized:      true,
			},
			Records: []replay.RawRecordV1{
				rawReplayRecord(0, "shared-memory", shared),
			},
		},
		{
			Metadata: replay.FixtureMetadata{
				FixtureVersion: replay.FixtureVersionV1,
				SimulatorID:    "lmu",
				SimulatorBuild: supportedLMUVersion,
				AppBuild:       "vantare-test",
				SchemaID:       "lmu-rest",
				SchemaVersion:  1,
				StartedAtUTC:   started,
				Origin:         replay.FixtureOriginSynthetic,
				Sanitized:      true,
			},
			Records: []replay.RawRecordV1{
				rawReplayRecord(0, "rest-standings", standings),
				rawReplayRecord(time.Millisecond, "rest-session", sessionInfo),
			},
		},
	}

	for fixtureIndex, fixture := range fixtures {
		source, err := fixture.Source()
		if err != nil {
			t.Fatalf("Source(%d) error = %v", fixtureIndex, err)
		}
		player, err := replay.NewPlayer(source, replay.Options{Mode: replay.ModeStep})
		if err != nil {
			t.Fatalf("NewPlayer(%d) error = %v", fixtureIndex, err)
		}
		for recordIndex := range fixture.Records {
			err := player.Step(context.Background(), func(_ context.Context, output replay.Output[replay.RawRecordV1]) error {
				switch output.Value.StreamID {
				case "shared-memory":
					observation, err := parseSupported(output.Value.Payload, output.ReplayUTC)
					if err != nil {
						return err
					}
					if observation.Compatibility != CompatibilityKnown {
						t.Fatal("shared-memory replay did not reach the supported parser")
					}
					if _, present := observation.TrackName.Value(); !present {
						t.Fatal("shared-memory replay lost track name")
					}
				case "rest-standings":
					rows, err := decodeStandings(output.Value.Payload)
					if err != nil {
						return err
					}
					if len(rows) != 1 || !rows[0].Player ||
						rows[0].Position != 3 || rows[0].LapsCompleted != 8 {
						t.Fatalf("standings = %#v", rows)
					}
				case "rest-session":
					info, err := decodeSessionInfo(output.Value.Payload)
					if err != nil {
						return err
					}
					if info.TrackName == nil || *info.TrackName != "Replay Circuit" ||
						info.NumberOfVehicles != 21 ||
						info.CurrentEventTime != 42 {
						t.Fatalf("session info = %#v", info)
					}
				default:
					t.Fatalf("unexpected stream %q", output.Value.StreamID)
				}
				return nil
			})
			if err != nil {
				t.Fatalf("Step(%d, %d) error = %v", fixtureIndex, recordIndex, err)
			}
		}
	}
}

func rawReplayRecord(
	offset time.Duration,
	stream string,
	payload []byte,
) replay.RawRecordV1 {
	sum := sha256.Sum256(payload)
	return replay.RawRecordV1{
		OffsetNS:  offset.Nanoseconds(),
		StreamID:  stream,
		Payload:   payload,
		SHA256Hex: hex.EncodeToString(sum[:]),
	}
}
