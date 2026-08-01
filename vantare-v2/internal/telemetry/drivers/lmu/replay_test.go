package lmu

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording/replay"
)

type gridGoldenV1 struct {
	SchemaVersion int               `json:"schemaVersion"`
	Track         string            `json:"track"`
	Rows          []gridGoldenRowV1 `json:"rows"`
}

type gridGoldenRowV1 struct {
	SourceID int32  `json:"sourceId"`
	Driver   string `json:"driver"`
	Vehicle  string `json:"vehicle"`
	Class    string `json:"class"`
	Player   bool   `json:"player"`
}

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

func TestSanitizedGridReplayMatchesGoldenV1(t *testing.T) {
	source := knownBuffer(t)
	sanitizer, err := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		t.Fatal(err)
	}
	sanitized, err := sanitizer.Sanitize(source)
	if err != nil {
		t.Fatal(err)
	}
	observation, err := parseSupported(sanitized, time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	track, present := observation.TrackName.Value()
	if !present {
		t.Fatal("sanitized replay lost track")
	}
	projection := gridGoldenV1{SchemaVersion: 1, Track: track, Rows: make([]gridGoldenRowV1, 0, len(observation.Vehicles))}
	for _, vehicle := range observation.Vehicles {
		driver, driverPresent := vehicle.DriverName.Value()
		name, namePresent := vehicle.VehicleName.Value()
		class, classPresent := vehicle.VehicleClass.Value()
		player, playerPresent := vehicle.Player.Value()
		if !driverPresent || !namePresent || !classPresent || !playerPresent {
			t.Fatalf("sanitized row %d has missing identity/display field", vehicle.SourceID)
		}
		projection.Rows = append(projection.Rows, gridGoldenRowV1{
			SourceID: int32(vehicle.SourceID), Driver: string(driver), Vehicle: string(name),
			Class: string(class), Player: player,
		})
	}
	got, err := json.MarshalIndent(projection, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	want, err := os.ReadFile(filepath.Join("testdata", "grid_v1.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	want = bytes.ReplaceAll(want, []byte("\r\n"), []byte("\n"))
	if !bytes.Equal(got, want) {
		t.Fatalf("grid golden mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
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
