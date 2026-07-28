package projection

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

func TestMetadataKeepsCanonicalProjectionAndRecordingVersionsIndependent(t *testing.T) {
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: 7, Sequence: 19},
		Clock:  schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 10, 30, 0, 0, time.FixedZone("CEST", 2*60*60))),
	}

	metadata, err := NewMetadata(header, Version(3))
	if err != nil {
		t.Fatalf("NewMetadata() error = %v", err)
	}
	if metadata.CanonicalVersion != schema.CanonicalVersionV1 {
		t.Fatalf("canonical version = %d, want %d", metadata.CanonicalVersion, schema.CanonicalVersionV1)
	}
	if metadata.ProjectionVersion != 3 {
		t.Fatalf("projection version = %d, want 3", metadata.ProjectionVersion)
	}
	if recording.RecordingVersionV1 != 1 {
		t.Fatalf("recording version = %d, want 1", recording.RecordingVersionV1)
	}
	if metadata.CapturedAt != "2026-07-28T08:30:00Z" {
		t.Fatalf("capturedAt = %q", metadata.CapturedAt)
	}

	encoded, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if string(encoded) != `{"canonicalVersion":1,"projectionVersion":3,"epoch":7,"sequence":19,"capturedAt":"2026-07-28T08:30:00Z"}` {
		t.Fatalf("metadata JSON = %s", encoded)
	}
}

func TestNewMetadataRejectsUnknownProjectionVersion(t *testing.T) {
	_, err := NewMetadata(envelope.Header{}, 0)
	if !errors.Is(err, ErrUnknownProjectionVersion) {
		t.Fatalf("NewMetadata() error = %v, want ErrUnknownProjectionVersion", err)
	}
}

func TestMissingFieldMarshalsExplicitQuality(t *testing.T) {
	encoded, err := json.Marshal(MissingField[bool]())
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"present":false,"value":false,"provenance":"unknown","freshness":"missing"}`
	if string(encoded) != want {
		t.Fatalf("MissingField() JSON = %s, want %s", encoded, want)
	}
}

func TestVersionPolicyRejectsUnknownOrRetiredVersions(t *testing.T) {
	policy := VersionPolicy{Current: 3, MinimumSupported: 2}
	tests := []struct {
		name       string
		version    Version
		wantErr    bool
		deprecated bool
	}{
		{name: "current", version: 3},
		{name: "older supported is deprecated", version: 2, deprecated: true},
		{name: "retired", version: 1, wantErr: true},
		{name: "future", version: 4, wantErr: true},
		{name: "zero", version: 0, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := policy.Validate(test.version)
			if (err != nil) != test.wantErr {
				t.Fatalf("Validate(%d) error = %v, wantErr %t", test.version, err, test.wantErr)
			}
			if got := policy.Deprecated(test.version); got != test.deprecated {
				t.Fatalf("Deprecated(%d) = %t, want %t", test.version, got, test.deprecated)
			}
		})
	}
}

func TestFieldPreservesZeroPresenceAndQuality(t *testing.T) {
	freshZero, err := schema.NewField(schema.Ratio(0), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatalf("schema.NewField() error = %v", err)
	}

	tests := []struct {
		name string
		got  Field[schema.Ratio]
		json string
	}{
		{
			name: "fresh zero is present",
			got:  FromField(freshZero),
			json: `{"present":true,"value":0,"provenance":"observed","freshness":"fresh"}`,
		},
		{
			name: "missing is explicit",
			got:  FromField(schema.MissingField[schema.Ratio]()),
			json: `{"present":false,"value":0,"provenance":"unknown","freshness":"missing"}`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			encoded, err := json.Marshal(test.got)
			if err != nil {
				t.Fatalf("json.Marshal() error = %v", err)
			}
			if string(encoded) != test.json {
				t.Fatalf("field JSON = %s, want %s", encoded, test.json)
			}
		})
	}
}

func TestGoldenContractsDoNotLeakCanonicalInternals(t *testing.T) {
	paths := []string{
		filepath.Join("overlay", "testdata", "overlay_v1.golden.json"),
		filepath.Join("engineer", "testdata", "engineer_v1.golden.json"),
		filepath.Join("strategy", "testdata", "strategy_v1.golden.json"),
		filepath.Join("analysis", "testdata", "analysis_v1.golden.json"),
	}
	forbidden := []string{
		`"source"`, `"clock"`, `"receivedMonotonic"`, `"raw"`,
		`"previousIdentity"`, `"team"`, `"driver"`, `"algorithms"`,
	}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			payload, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			for _, key := range forbidden {
				if strings.Contains(string(payload), key) {
					t.Fatalf("%s contains forbidden internal key %s", path, key)
				}
			}
		})
	}
}
