package lmu

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// Pins the product projection of the real static 44-car capture to Go.
// It does not prove the temporal 44/104 or physical LMU gates.
func TestRustProjectionGoOracleStatic44(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	fused := new(Fusion).Merge(parsed.ReceivedUTC, 0, parsed)
	mapper := NewBatchMapper()
	reducer := telemetrycore.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var final envelope.Snapshot[derive.FinalState]
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		observed, err := reducer.Apply(batch)
		if err != nil {
			return err
		}
		final, err = pipeline.Apply(context.Background(), observed)
		return err
	})
	if err := mapper.WriteObservation(context.Background(), fused, sink); err != nil {
		t.Fatal(err)
	}
	state, ok := final.Value()
	if !ok {
		t.Fatal("no final state")
	}
	rafCap := 40
	source := overlayv2.SourceContextV2{
		State:                  "live",
		DescriptorCapabilities: []string{"shared-memory", "rest"},
		Modes:                  overlayv2.CapabilityModesV2{Spatial: []string{"xyz"}, Delta: []string{"personal-best"}, Standings: overlayv2.ModeOfficial, Gaps: overlayv2.ModeReconstructed},
		Performance:            overlayv2.PerformanceV2{Level: 9, Mode: "unknown", Effects: "unknown", RafCap: &rafCap, WidgetHz: map[string]json.RawMessage{"pedals": []byte("40")}, Reason: "unknown", SourceHz: 60},
	}
	capabilities := overlayv2.BuildCapabilities(state, source)
	full, err := overlayv2.ProjectV2(final, source, overlayv2.DefaultPreferencesV2(), 1)
	if err != nil {
		t.Fatal(err)
	}
	fullAlternate, err := overlayv2.ProjectV2(final, source, overlayv2.PreferencesV2{
		Speed: overlayv2.SpeedUnitKPH, Temperature: overlayv2.TemperatureUnitFahrenheit,
		Pressure: overlayv2.PressureUnitPSI, Fuel: overlayv2.FuelUnitGallonsUS,
		DeltaReference: overlayv2.DeltaReferencePreviousLap,
	}, 2)
	if err != nil {
		t.Fatal(err)
	}
	strategySnapshot, err := strategy.ProjectV1(final)
	if err != nil {
		t.Fatal(err)
	}
	engineerSnapshot, err := engineer.ProjectV1(final)
	if err != nil {
		t.Fatal(err)
	}
	want, err := json.Marshal(struct {
		Engineer               engineer.PayloadV1            `json:"engineer"`
		Strategy               strategy.PayloadV1            `json:"strategy"`
		Session                overlayv2.SessionV2           `json:"session"`
		Player                 overlayv2.PlayerInstrumentsV2 `json:"player"`
		Weather                overlayv2.WeatherV2           `json:"weather"`
		Controls               overlayv2.ControlsV2          `json:"controls"`
		Damage                 overlayv2.DamageViewV2        `json:"damage"`
		Fuel                   overlayv2.FuelViewV2          `json:"fuel"`
		Delta                  overlayv2.DeltaViewV2         `json:"delta"`
		Standings              []overlayv2.StandingRowV2     `json:"standings"`
		Relative               []overlayv2.RelativeRowV2     `json:"relative"`
		RelativeSameClass      []overlayv2.RelativeRowV2     `json:"relativeSameClass"`
		Spotter                overlayv2.SpotterViewV2       `json:"spotter"`
		Radar                  overlayv2.RadarViewV2         `json:"radar"`
		CapabilityAvailability map[string]overlayv2.Quality  `json:"capabilityAvailability"`
		Capabilities           overlayv2.CapabilitiesV2      `json:"capabilities"`
		Full                   overlayv2.UpdateV2            `json:"full"`
		FullAlternate          overlayv2.UpdateV2            `json:"fullAlternate"`
	}{engineerSnapshot.PayloadV1, strategySnapshot.PayloadV1, overlayv2.BuildSession(state), overlayv2.BuildPlayerInstruments(state, overlayv2.DefaultPreferencesV2()), overlayv2.BuildWeather(state), overlayv2.BuildControls(state), overlayv2.BuildDamage(state), overlayv2.BuildFuel(state, overlayv2.DefaultPreferencesV2()), overlayv2.BuildDelta(state, overlayv2.DefaultPreferencesV2()), overlayv2.BuildStandings(state), overlayv2.BuildRelative(state), overlayv2.BuildRelativeSameClass(state), overlayv2.BuildSpotter(state), overlayv2.BuildRadar(state), capabilities.Available, capabilities, full, fullAlternate})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("..", "..", "..", "..", "rust", "telemetry", "testdata", "overlay-core-slices-go-v1.json")
	if os.Getenv("VANTARE_PROJECTION_ORACLE_UPDATE") == "1" {
		if err := os.WriteFile(path, append(want, '\n'), 0644); err != nil {
			t.Fatal(err)
		}
	}
	golden, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(bytes.TrimSpace(golden), want) {
		t.Fatal("Go projection differs from pinned Rust port oracle")
	}
}

// Pins cadence decisions independently of product data so Rust can compare
// the exact section mask for hot policy, safety and clock discontinuity.
func TestRustCadenceGoOracle(t *testing.T) {
	scheduler := overlayv2.NewSectionScheduler(overlayv2.DefaultSectionCadence())
	origin := time.Unix(100, 0)
	plans := make([]uint16, 240)
	for tick := range plans {
		if tick == 80 {
			scheduler.SetCadence(overlayv2.SectionCadence{Fast: 150 * time.Millisecond, Mid: 300 * time.Millisecond, Slow: 750 * time.Millisecond, Relative: 500 * time.Millisecond, DirtyCeiling: time.Second})
		}
		dirty := overlayv2.DirtySet(0)
		if tick%37 == 0 {
			dirty = dirty.Mark(overlayv2.SectionStandings)
		}
		if tick == 150 || tick == 160 {
			// Go has no exported safety constructor; an all-dirty discontinuity
			// exercises both safety bits at the same time.
			dirty = overlayv2.AllDirty()
		}
		now := origin.Add(time.Duration(tick) * (time.Second / 60))
		if tick == 200 {
			now = origin.Add(-time.Second)
		}
		plans[tick] = uint16(scheduler.Plan(now, dirty))
	}
	want, err := json.Marshal(plans)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("..", "..", "..", "..", "rust", "telemetry", "testdata", "overlay-cadence-go-v1.json")
	if os.Getenv("VANTARE_PROJECTION_ORACLE_UPDATE") == "1" {
		if err := os.WriteFile(path, append(want, '\n'), 0644); err != nil {
			t.Fatal(err)
		}
	}
	golden, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(bytes.TrimSpace(golden), want) {
		t.Fatal("Go cadence differs from pinned Rust port oracle")
	}
}
