package lmu

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// TestRustPortTemporalCorpusAuditOptIn audits an external, real LMU capture.
// It is deliberately opt-in: a missing 44/104 corpus must never be reported
// as a passing migration gate by an ordinary go test ./... run.
func TestRustPortTemporalCorpusAuditOptIn(t *testing.T) {
	dir := os.Getenv("LMU_TEMPORAL_CORPUS")
	if dir == "" {
		t.Skip("set LMU_TEMPORAL_CORPUS to a real sanitized capture directory")
	}
	wantText := os.Getenv("LMU_TEMPORAL_EXPECTED_VEHICLES")
	want, err := strconv.Atoi(wantText)
	if err != nil || want < 1 || want > 104 {
		t.Fatalf("set LMU_TEMPORAL_EXPECTED_VEHICLES to 1..104, got %q", wantText)
	}
	type sample struct {
		Index      int    `json:"index"`
		AtUTC      string `json:"atUtc"`
		SourceMS   int64  `json:"sourceMs"`
		Vehicles   int    `json:"vehicles"`
		SharedFile string `json:"sharedFile"`
		SharedSHA  string `json:"sharedSha256"`
		RESTFile   string `json:"restFile"`
		RESTSHA    string `json:"restSha256"`
	}
	var manifest struct {
		Build   string   `json:"build"`
		Samples []sample `json:"samples"`
	}
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if len(manifest.Samples) != 8 {
		t.Fatalf("samples=%d, want 8", len(manifest.Samples))
	}
	if manifest.Build != supportedLMUVersion {
		if _, ok := diagnosticLMUVersions[manifest.Build]; !ok {
			t.Fatalf("unadmitted LMU build %q", manifest.Build)
		}
	}
	profile := compatibilityProfile{version: manifest.Build, supported: true}
	var previousSource time.Duration
	var previousUTC time.Time
	for i, entry := range manifest.Samples {
		if entry.Index != i || entry.SharedFile != fmt.Sprintf("%03d-shm.bin", i) || entry.RESTFile != fmt.Sprintf("%03d-rest.json", i) {
			t.Fatalf("sample %d has noncanonical index or filename", i)
		}
		if entry.Vehicles != want {
			t.Fatalf("sample %d has %d vehicles, want %d", i, entry.Vehicles, want)
		}
		at, err := time.Parse(time.RFC3339Nano, entry.AtUTC)
		if err != nil || (i > 0 && !at.After(previousUTC)) {
			t.Fatalf("sample %d has invalid or nonincreasing capture time", i)
		}
		previousUTC = at
		shared := readHashedCorpusFile(t, dir, entry.SharedFile, entry.SharedSHA)
		if len(shared) != ObjectOutSize {
			t.Fatalf("sample %d SHM size=%d, want %d", i, len(shared), ObjectOutSize)
		}
		observation, err := parseWithProfile(shared, at, profile)
		if err != nil || observation.Compatibility != CompatibilityKnown {
			t.Fatalf("sample %d Go parser rejected SHM: %v", i, err)
		}
		count, countOK := observation.VehicleCount.Value()
		player, playerOK := observation.PlayerPresent.Value()
		source, sourceOK := observation.SourceTime.Value()
		if !countOK || int(count) != want || len(observation.Vehicles) != want || !playerOK || !player || !sourceOK || source.Milliseconds() != entry.SourceMS || (i > 0 && source <= previousSource) {
			t.Fatalf("sample %d Go parser disagrees with grid/player/source clock manifest", i)
		}
		previousSource = source
		rest := readHashedCorpusFile(t, dir, entry.RESTFile, entry.RESTSHA)
		var overlap struct {
			Schema  string `json:"schema"`
			Status  string `json:"status"`
			Session struct {
				VehicleCount struct {
					Value int `json:"value"`
				} `json:"vehicle_count"`
			} `json:"session"`
			Player struct {
				Present struct {
					Value bool `json:"value"`
				} `json:"present"`
			} `json:"player"`
		}
		if err := json.Unmarshal(rest, &overlap); err != nil || overlap.Schema != "vantare.lmu-rest-overlap.v1" || overlap.Status != "live" || overlap.Session.VehicleCount.Value != want || !overlap.Player.Present.Value {
			t.Fatalf("sample %d REST overlap disagrees with live grid", i)
		}
	}
	t.Logf("audited real temporal SHM+REST corpus: build=%s, samples=%d, vehicles=%d, source=%d..%dms", manifest.Build, len(manifest.Samples), want, manifest.Samples[0].SourceMS, manifest.Samples[7].SourceMS)
}

func readHashedCorpusFile(t *testing.T, dir, name, expected string) []byte {
	t.Helper()
	if len(expected) != 64 {
		t.Fatalf("%s has invalid SHA-256 length", name)
	}
	if _, err := hex.DecodeString(expected); err != nil {
		t.Fatalf("%s has invalid SHA-256: %v", name, err)
	}
	data, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		t.Fatal(err)
	}
	got := sha256.Sum256(data)
	if hex.EncodeToString(got[:]) != expected {
		t.Fatalf("%s SHA-256 mismatch", name)
	}
	return data
}
