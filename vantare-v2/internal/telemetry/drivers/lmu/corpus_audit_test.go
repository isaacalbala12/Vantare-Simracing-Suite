package lmu

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// TestRustPortTemporalCorpusAuditOptIn audits an external, real LMU capture.
// It is deliberately opt-in: this short corpus is diagnostic even when it
// reaches the accepted 46-car minimum, never the complete migration gate.
func TestRustPortTemporalCorpusAuditOptIn(t *testing.T) {
	dir := os.Getenv("LMU_TEMPORAL_CORPUS")
	if dir == "" {
		t.Skip("set LMU_TEMPORAL_CORPUS to a real sanitized capture directory")
	}
	wantText := os.Getenv("LMU_TEMPORAL_EXPECTED_VEHICLES")
	want, err := strconv.Atoi(wantText)
	if err != nil || want < 46 || want > 104 {
		t.Fatalf("set LMU_TEMPORAL_EXPECTED_VEHICLES to 46..104, got %q", wantText)
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
	if len(manifest.Samples) < 8 || len(manifest.Samples) > 240 {
		t.Fatalf("samples=%d, want 8..240", len(manifest.Samples))
	}
	if manifest.Build != supportedLMUVersion {
		if _, ok := diagnosticLMUVersions[manifest.Build]; !ok {
			t.Fatalf("unadmitted LMU build %q", manifest.Build)
		}
	}
	profile := compatibilityProfile{version: manifest.Build, supported: true}
	var previousSource time.Duration
	var previousUTC time.Time
	var firstSource time.Duration
	parityOut := os.Getenv("LMU_TEMPORAL_PARITY_OUT")
	var parity []struct {
		Engineer json.RawMessage `json:"engineer"`
		Strategy json.RawMessage `json:"strategy"`
	}
	fusion := new(Fusion)
	mapper := NewBatchMapper()
	reducer := telemetrycore.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	overlayProjector := overlayv2.NewCachedProjector(overlayv2.SectionCadence{})
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
		if i == 0 {
			firstSource = source
		}
		fused := fusion.Merge(at, source-firstSource, observation)
		var final envelope.Snapshot[derive.FinalState]
		var committed int
		sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
			observed, err := reducer.Apply(batch)
			if err != nil {
				return err
			}
			final, err = pipeline.Apply(context.Background(), observed)
			committed++
			return err
		})
		if err := mapper.WriteObservation(context.Background(), fused, sink); err != nil || committed != 1 {
			t.Fatalf("sample %d Go temporal commit=%d error=%v", i, committed, err)
		}
		engineerSnapshot, err := engineer.ProjectV1(final)
		if err != nil {
			t.Fatalf("sample %d Go Engineer projection: %v", i, err)
		}
		strategySnapshot, err := strategy.ProjectV1(final)
		if err != nil {
			t.Fatalf("sample %d Go Strategy projection: %v", i, err)
		}
		overlayUpdate, err := overlayProjector.Project(final, overlayv2.SourceContextV2{State: "live"}, overlayv2.DefaultPreferencesV2(), 1, at)
		if err != nil {
			t.Fatalf("sample %d Go Overlay projection: %v", i, err)
		}
		seconds := source.Seconds()
		overlayRows := 0
		if overlayUpdate.Frame != nil {
			overlayRows = len(overlayUpdate.Frame.Standings)
		}
		if engineerSnapshot.Sequence != schema.Sequence(i+1) || len(engineerSnapshot.Vehicles) != want || engineerSnapshot.Player.ID == "" ||
			!engineerSnapshot.SourceTime.Present || engineerSnapshot.SourceTime.Value != seconds ||
			strategySnapshot.Sequence != schema.Sequence(i+1) || strategySnapshot.Player.ID != engineerSnapshot.Player.ID ||
			!strategySnapshot.SourceTime.Present || strategySnapshot.SourceTime.Value != seconds ||
			overlayUpdate.Frame == nil || overlayRows != want {
			t.Fatalf("sample %d Go temporal products: Engineer sequence=%d vehicles=%d player=%q clock=%+v; Strategy sequence=%d player=%q clock=%+v; Overlay rows=%d", i,
				engineerSnapshot.Sequence, len(engineerSnapshot.Vehicles), engineerSnapshot.Player.ID, engineerSnapshot.SourceTime,
				strategySnapshot.Sequence, strategySnapshot.Player.ID, strategySnapshot.SourceTime, overlayRows)
		}
		if parityOut != "" {
			engineerJSON, err := json.Marshal(engineerSnapshot.PayloadV1)
			if err != nil {
				t.Fatal(err)
			}
			strategyJSON, err := json.Marshal(strategySnapshot.PayloadV1)
			if err != nil {
				t.Fatal(err)
			}
			parity = append(parity, struct {
				Engineer json.RawMessage `json:"engineer"`
				Strategy json.RawMessage `json:"strategy"`
			}{engineerJSON, strategyJSON})
		}
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
	if parityOut != "" {
		if err := os.MkdirAll(parityOut, 0o700); err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(parity)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(parityOut, "go-products.json"), encoded, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("audited real temporal SHM+REST corpus: build=%s, samples=%d, vehicles=%d, source=%d..%dms", manifest.Build, len(manifest.Samples), want, manifest.Samples[0].SourceMS, manifest.Samples[len(manifest.Samples)-1].SourceMS)
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
