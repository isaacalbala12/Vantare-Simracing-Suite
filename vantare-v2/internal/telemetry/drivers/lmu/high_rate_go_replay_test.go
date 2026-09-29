//go:build windows

package lmu

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	telemetryengine "github.com/vantare/overlays/v2/internal/telemetry/engine"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// This uses the same real event timestamps as the Rust replay. It is an
// oracle prerequisite, not a CPU comparison: disk and JSON fixture decoding
// are still inside this diagnostic test.
func TestReplayLMUHighRateGoOptIn(t *testing.T) {
	dir := os.Getenv("LMU_HIGH_RATE_CORPUS")
	if dir == "" {
		t.Skip("set LMU_HIGH_RATE_CORPUS to the audited real 47-car capture")
	}
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest highRateManifest
	if err := json.Unmarshal(data, &manifest); err != nil || manifest.Schema != "vantare.lmu-temporal-high-rate.v1" || manifest.Vehicles != 47 || manifest.SHMTicks != 3600 || manifest.RESTReports != 239 || len(manifest.Events) != 3839 {
		t.Fatalf("wrong high-rate corpus manifest: %v", err)
	}
	firstAt, err := time.Parse(time.RFC3339Nano, manifest.Events[0].AtUTC)
	if err != nil {
		t.Fatal(err)
	}
	profile := compatibilityProfile{version: manifest.Build, supported: true}
	var parityFile *os.File
	if out := os.Getenv("LMU_HIGH_RATE_PARITY_OUT"); out != "" {
		if err := os.MkdirAll(out, 0o700); err != nil {
			t.Fatal(err)
		}
		parityFile, err = os.OpenFile(filepath.Join(out, "go-products.jsonl"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			t.Fatal(err)
		}
		defer func() {
			if err := parityFile.Close(); err != nil {
				t.Errorf("close Go parity output: %v", err)
			}
		}()
	}
	fusion := new(Fusion)
	restCache := new(restCache)
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
	preferences := overlayv2.DefaultPreferencesV2()
	preferences.Speed = overlayv2.SpeedUnitKPH
	var final envelope.Snapshot[derive.FinalState]
	var facts int
	eventFacts := make([]engineer.FactEnvelopeV1, 0)
	var commits int
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		result, applyErr := engine.Apply(context.Background(), batch)
		if applyErr != nil {
			return applyErr
		}
		final = result.State
		for _, fact := range result.Facts {
			projected, projectErr := engineer.ProjectFactV1(fact)
			if projectErr != nil {
				return projectErr
			}
			eventFacts = append(eventFacts, projected)
			facts++
		}
		commits++
		return nil
	})
	var lastAt time.Time
	var shm, rest, overlays, engineers, strategies int
	for index, event := range manifest.Events {
		at, err := time.Parse(time.RFC3339Nano, event.AtUTC)
		if err != nil || (index > 0 && at.Before(lastAt)) {
			t.Fatalf("event %d has reversed time", index)
		}
		lastAt = at
		elapsed := at.Sub(firstAt) + time.Second
		factNow = at
		var canonical Observation
		switch event.Kind {
		case "shm":
			if event.Index != shm || event.File != fmt.Sprintf("shm-%05d.bin", shm) {
				t.Fatalf("event %d invalid SHM index", index)
			}
			shared := readHashedCorpusFile(t, dir, event.File, event.SHA256)
			observation, parseErr := parseWithProfile(shared, at, profile)
			if parseErr != nil {
				t.Fatalf("event %d SHM parse: %v", index, parseErr)
			}
			canonical = fusion.Merge(at, elapsed, observation)
			shm++
		case "rest":
			if event.Index != rest || event.File != fmt.Sprintf("rest-%05d.json", rest) {
				t.Fatalf("event %d invalid REST index", index)
			}
			started, startErr := time.Parse(time.RFC3339Nano, event.StandingsStartedUTC)
			standingsDone, standingsErr := time.Parse(time.RFC3339Nano, event.StandingsCompletedUTC)
			sessionStarted, sessionErr := time.Parse(time.RFC3339Nano, event.SessionStartedUTC)
			if startErr != nil || standingsErr != nil || sessionErr != nil {
				t.Fatalf("event %d invalid REST timestamps", index)
			}
			body := readHashedCorpusFile(t, dir, event.File, event.SHA256)
			var endpoint struct {
				Schema      string          `json:"schema"`
				Standings   json.RawMessage `json:"standings"`
				SessionInfo json.RawMessage `json:"sessionInfo"`
			}
			if err := json.Unmarshal(body, &endpoint); err != nil || endpoint.Schema != sanitizedRESTBodiesSchema {
				t.Fatalf("event %d REST body: %v", index, err)
			}
			clock := []time.Time{started, standingsDone, standingsDone, sessionStarted, at, at, at}
			clockIndex := 0
			cfg := normalizeRESTConfig(&restConfig{
				client: corpusRESTDoer{standings: endpoint.Standings, session: endpoint.SessionInfo},
				now: func() time.Time {
					if clockIndex >= len(clock) {
						return at
					}
					value := clock[clockIndex]
					clockIndex++
					return value
				},
				elapsed: func() time.Duration {
					value := clock[clockIndex-1]
					return value.Sub(firstAt) + time.Second
				},
			}, time.Now, nil)
			restObservation, complete := pollREST(t.Context(), cfg, restCache)
			if !complete {
				t.Fatalf("event %d REST decode incomplete", index)
			}
			canonical = fusion.Merge(at, elapsed, restObservation)
			rest++
		default:
			t.Fatalf("event %d unknown kind", index)
		}
		before := commits
		eventFacts = eventFacts[:0]
		if err := mapper.WriteObservation(t.Context(), canonical, sink); err != nil || commits != before+1 {
			t.Fatalf("event %d commit=%d error=%v", index, commits-before, err)
		}
		value, ok := final.Value()
		if !ok {
			t.Fatalf("event %d final state missing", index)
		}
		overlaySource.Modes = corpusCapabilityModes(value)
		update, err := overlayProjector.Project(final, overlaySource, preferences, 1, at)
		if err != nil || update.Frame == nil || len(update.Frame.Standings) != manifest.Vehicles {
			t.Fatalf("event %d Overlay rows/error: %v", index, err)
		}
		overlays++
		engineerSnapshot, err := engineer.ProjectV1(final)
		if err != nil || len(engineerSnapshot.Vehicles) != manifest.Vehicles {
			t.Fatalf("event %d Engineer rows/error: %v", index, err)
		}
		engineers++
		strategySnapshot, err := strategy.ProjectV1(final)
		if err != nil || strategySnapshot.Player.ID != engineerSnapshot.Player.ID {
			t.Fatalf("event %d Strategy identity/error: %v", index, err)
		}
		strategies++
		if engineerSnapshot.Sequence != schema.Sequence(index+1) || strategySnapshot.Sequence != schema.Sequence(index+1) {
			t.Fatalf("event %d product sequence mismatch", index)
		}
		if parityFile != nil {
			encoded, err := json.Marshal(struct {
				Overlay  any                       `json:"overlay"`
				Engineer any                       `json:"engineer"`
				Strategy any                       `json:"strategy"`
				Facts    []engineer.FactEnvelopeV1 `json:"facts"`
			}{update.Frame, engineerSnapshot.PayloadV1, strategySnapshot.PayloadV1, eventFacts})
			if err != nil {
				t.Fatalf("event %d parity encode: %v", index, err)
			}
			if _, err := parityFile.Write(append(encoded, '\n')); err != nil {
				t.Fatalf("event %d parity write: %v", index, err)
			}
		}
	}
	if (shm != manifest.SHMTicks) || (rest != manifest.RESTReports) || overlays != len(manifest.Events) || engineers != len(manifest.Events) || strategies != len(manifest.Events) || facts != 1 {
		t.Fatalf("incomplete Go replay: SHM=%d REST=%d products=%d/%d/%d facts=%d", shm, rest, overlays, engineers, strategies, facts)
	}
	t.Logf("real Go high-rate replay: SHM=%d REST=%d products=%d/%d/%d facts=%d", shm, rest, overlays, engineers, strategies, facts)
}
