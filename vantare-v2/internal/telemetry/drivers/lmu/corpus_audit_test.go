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

	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	telemetryengine "github.com/vantare/overlays/v2/internal/telemetry/engine"
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
		Overlay  json.RawMessage `json:"overlay"`
		Engineer json.RawMessage `json:"engineer"`
		Strategy json.RawMessage `json:"strategy"`
		Facts    json.RawMessage `json:"facts"`
	}
	fusion := new(Fusion)
	mapper := NewBatchMapper()
	var factNow time.Time
	engine := telemetryengine.New(telemetrycore.NewReducer(), telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{Now: func() time.Time { return factNow }}), derive.NewPipeline(derive.Config{}))
	overlayProjector := overlayv2.NewCachedProjector(overlayv2.DefaultSectionCadence())
	rafCap := 40
	overlaySource := overlayv2.SourceContextV2{
		State: "live", DescriptorCapabilities: []string{"shared-memory", "rest"},
		Modes:       overlayv2.CapabilityModesV2{Spatial: []string{"xyz"}, Delta: []string{"personal-best"}, Standings: overlayv2.ModeOfficial, Gaps: overlayv2.ModeReconstructed},
		Performance: overlayv2.PerformanceV2{Level: 3, Mode: overlayv2.PerformanceModeManual, Effects: overlayv2.PerformanceEffectsNoBlur, RafCap: &rafCap, WidgetHz: map[string]json.RawMessage{"pedals": []byte("40")}, SourceHz: 60},
	}
	overlayPreferences := overlayv2.DefaultPreferencesV2()
	overlayPreferences.Speed = overlayv2.SpeedUnitKPH
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
		factNow = at
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
		facts := make([]engineer.FactEnvelopeV1, 0)
		var committed int
		sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
			result, err := engine.Apply(context.Background(), batch)
			if err != nil {
				return err
			}
			final = result.State
			for _, fact := range result.Facts {
				projected, projectErr := engineer.ProjectFactV1(fact)
				if projectErr != nil {
					return projectErr
				}
				facts = append(facts, projected)
			}
			committed++
			return nil
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
		if os.Getenv("LMU_TEMPORAL_RESOLVE_MODES") == "1" {
			value, ok := final.Value()
			if !ok {
				t.Fatalf("sample %d missing final state", i)
			}
			overlaySource.Modes = corpusCapabilityModes(value)
		}
		overlayUpdate, err := overlayProjector.Project(final, overlaySource, overlayPreferences, 1, at)
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
			overlayJSON, err := json.Marshal(overlayUpdate.Frame)
			if err != nil {
				t.Fatal(err)
			}
			engineerJSON, err := json.Marshal(engineerSnapshot.PayloadV1)
			if err != nil {
				t.Fatal(err)
			}
			strategyJSON, err := json.Marshal(strategySnapshot.PayloadV1)
			if err != nil {
				t.Fatal(err)
			}
			factsJSON, err := json.Marshal(facts)
			if err != nil {
				t.Fatal(err)
			}
			parity = append(parity, struct {
				Overlay  json.RawMessage `json:"overlay"`
				Engineer json.RawMessage `json:"engineer"`
				Strategy json.RawMessage `json:"strategy"`
				Facts    json.RawMessage `json:"facts"`
			}{overlayJSON, engineerJSON, strategyJSON, factsJSON})
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

// Compare against the production capability resolver with evidence extracted
// from the same committed Go state. The regular oracle keeps its fixed policy.
func corpusCapabilityModes(final derive.FinalState) overlayv2.CapabilityModesV2 {
	quality := func(value schema.Freshness) capability.Quality {
		switch value {
		case schema.FreshnessFresh:
			return capability.QualityFresh
		case schema.FreshnessStale:
			return capability.QualityStale
		case schema.FreshnessInvalid:
			return capability.QualityInvalid
		default:
			return capability.QualityMissing
		}
	}
	best := func(read func(telemetrycore.VehicleState) schema.Freshness) capability.Quality {
		result := capability.QualityMissing
		for _, vehicle := range final.Observed.Vehicles {
			current := quality(read(vehicle))
			if current == capability.QualityFresh {
				return current
			}
			if current == capability.QualityStale || current == capability.QualityInvalid && result == capability.QualityMissing {
				result = current
			}
		}
		return result
	}
	modes := capability.ResolveModes(Capabilities(), capability.SessionEvidence{
		WorldPosition:   best(func(value telemetrycore.VehicleState) schema.Freshness { return value.WorldPosition.Freshness() }),
		LapDistance:     best(func(value telemetrycore.VehicleState) schema.Freshness { return value.LapDistance.Freshness() }),
		DeltaReferences: overlayv2.AvailableDeltaReferences(final),
		Standings:       best(func(value telemetrycore.VehicleState) schema.Freshness { return value.Position.Freshness() }),
		Gaps:            quality(final.Derived.Gaps.Freshness),
	})
	spatial := []string{}
	if modes.Spatial != capability.SpatialNone {
		spatial = append(spatial, string(modes.Spatial))
	}
	return overlayv2.CapabilityModesV2{
		Spatial: spatial, Delta: modes.DeltaReferences,
		Standings: overlayv2.Mode(modes.Standings), Gaps: overlayv2.Mode(modes.Gaps),
	}
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
