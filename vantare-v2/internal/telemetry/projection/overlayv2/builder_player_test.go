package overlayv2

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	overlayv1 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/damage"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestProjectV2Goldens(t *testing.T) {
	t.Parallel()

	for _, count := range []int{1, 20, 44, 104} {
		count := count
		t.Run(fmt.Sprintf("vehicles_%d", count), func(t *testing.T) {
			t.Parallel()
			update, err := ProjectV2(builderFinalState(t, count), builderSourceContext(), DefaultPreferencesV2(), uint64(count))
			if err != nil {
				t.Fatalf("ProjectV2: %v", err)
			}
			if update.Frame == nil || update.Frame.Standings == nil || update.Frame.Relative == nil || update.Frame.Delta.Available == nil {
				t.Fatalf("slice contract must use empty arrays, not null: %#v", update.Frame)
			}
			assertBuilderGolden(t, update, fmt.Sprintf("overlay_v2_%d.golden.json", count))
		})
	}
}

func TestOverlayV2GoldenMatchesV1SemanticsForPlayer(t *testing.T) {
	t.Parallel()

	for _, count := range []int{1, 20, 44, 104} {
		final := builderFinalState(t, count)
		v1, err := overlayv1.ProjectV1(final)
		if err != nil {
			t.Fatalf("ProjectV1(%d): %v", count, err)
		}
		v2, err := ProjectV2(final, builderSourceContext(), DefaultPreferencesV2(), uint64(count))
		if err != nil {
			t.Fatalf("ProjectV2(%d): %v", count, err)
		}
		if v2.Frame == nil {
			t.Fatalf("ProjectV2(%d) returned nil frame", count)
		}
		var player overlayv1.VehicleV1
		found := false
		for _, current := range v1.Vehicles {
			if current.ID == v1.Player {
				player, found = current, true
				break
			}
		}
		if !found {
			t.Fatalf("ProjectV1(%d) player %q absent", count, v1.Player)
		}
		assertQField(t, "speed", v2.Frame.Player.Speed, player.Speed.Value, qualityFromV1(player.Speed.Freshness))
		assertQField(t, "rpm", v2.Frame.Player.RPM, float64(player.EngineRPM.Value), qualityFromV1(player.EngineRPM.Freshness))
		assertQField(t, "gear", v2.Frame.Player.Gear, int32(player.Gear.Value), qualityFromV1(player.Gear.Freshness))
		assertQField(t, "throttle", v2.Frame.Player.Throttle, float64(player.Throttle.Value), qualityFromV1(player.Throttle.Freshness))
		assertQField(t, "brake", v2.Frame.Player.Brake, float64(player.Brake.Value), qualityFromV1(player.Brake.Freshness))
		assertQField(t, "clutch", v2.Frame.Player.Clutch, float64(player.Clutch.Value), qualityFromV1(player.Clutch.Freshness))
	}
}

func TestProjectV2AppliesSpeedPreferenceAndDefaultsToSI(t *testing.T) {
	t.Parallel()

	final := builderFinalState(t, 1)
	si, err := ProjectV2(final, builderSourceContext(), PreferencesV2{}, 1)
	if err != nil {
		t.Fatal(err)
	}
	kph, err := ProjectV2(final, builderSourceContext(), PreferencesV2{Speed: SpeedUnitKPH}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if si.Frame.Units.Speed != SpeedUnitMPS || si.Frame.Player.Speed.V != 50 {
		t.Fatalf("default SI speed = %v %q", si.Frame.Player.Speed.V, si.Frame.Units.Speed)
	}
	if kph.Frame.Units.Speed != SpeedUnitKPH || kph.Frame.Player.Speed.V != 180 {
		t.Fatalf("kph speed = %v %q", kph.Frame.Player.Speed.V, kph.Frame.Units.Speed)
	}
}

func TestProjectV2RejectsUnknownSourceState(t *testing.T) {
	t.Parallel()

	source := builderSourceContext()
	source.State = "connected"
	if _, err := ProjectV2(builderFinalState(t, 1), source, DefaultPreferencesV2(), 1); err == nil {
		t.Fatal("ProjectV2 accepted an unknown source state")
	}
}

func TestBuildCapabilitiesUsesDescriptorAndActualQuality(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	withoutDriverSupport := BuildCapabilities(final, SourceContextV2{})
	if len(withoutDriverSupport.Supported) != 0 || len(withoutDriverSupport.Available) != 0 {
		t.Fatalf("capabilities invented without descriptor support: %#v", withoutDriverSupport)
	}
	withLMU := BuildCapabilities(final, builderSourceContext())
	if withLMU.Available[capabilityControls] != QualityFresh || withLMU.Available[capabilitySession] != QualityFresh {
		t.Fatalf("actual availability not derived from fields: %#v", withLMU.Available)
	}
}

func TestBuildPlayerInstrumentsPreservesFieldQuality(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.Vehicles[0].EngineRPM = builderField(t, vehicle.EngineRPM(6500), schema.FreshnessStale)
	final.Observed.Vehicles[0].Brake = builderField(t, schema.Ratio(0.25), schema.FreshnessInvalid)
	final.Observed.Vehicles[0].Clutch = schema.MissingField[schema.Ratio]()
	player := BuildPlayerInstruments(final, DefaultPreferencesV2())
	if player.RPM.Q != QualityStale || player.RPM.V != 6500 {
		t.Fatalf("stale RPM not preserved: %#v", player.RPM)
	}
	if player.Brake.Q != QualityInvalid || player.Brake.V != 0.25 {
		t.Fatalf("invalid brake not preserved: %#v", player.Brake)
	}
	if player.Clutch.Q != QualityMissing || player.Clutch.V != 0 {
		t.Fatalf("missing clutch not preserved: %#v", player.Clutch)
	}
}

func BenchmarkProjectV2(b *testing.B) {
	for _, count := range []int{1, 20, 44, 104} {
		b.Run(fmt.Sprintf("vehicles_%d", count), func(b *testing.B) {
			final := builderFinalState(b, count)
			source := builderSourceContext()
			b.ReportAllocs()
			for index := 0; index < b.N; index++ {
				if _, err := ProjectV2(final, source, DefaultPreferencesV2(), uint64(index+1)); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

func builderFinalState(tb testing.TB, count int) envelope.Snapshot[derive.FinalState] {
	tb.Helper()
	reducer := core.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var final envelope.Snapshot[derive.FinalState]
	for sequence := uint64(1); sequence <= 2; sequence++ {
		observed, err := reducer.Apply(builderBatch(count, sequence))
		if err != nil {
			tb.Fatal(err)
		}
		final, err = pipeline.Apply(context.Background(), observed)
		if err != nil {
			tb.Fatal(err)
		}
	}
	return final
}

var builderClasses = []string{"hypercar", "lmp2", "gte"}

func builderBatch(count int, sequence uint64) core.Batch {
	run := identity.RunIdentity{Event: "f6-event", Session: "f6-session", Vehicle: "vehicle-000"}
	vehicles := make([]core.VehicleState, count)
	for index := range vehicles {
		id := identity.VehicleID(fmt.Sprintf("vehicle-%03d", index))
		vehicles[index] = core.VehicleState{
			Identity: identity.RunIdentity{Event: run.Event, Session: run.Session, Vehicle: id},
			Player:   builderPresent(index == 0), Position: builderPresent(standings.Position(index + 1)),
			WorldPosition:    builderPresent(spatial.Position{X: float64(index), Z: float64(index) * -2}),
			LapDistance:      builderPresent(standings.LapDistance(float64(index) * 42.5)),
			LapProgressTime:  builderPresent(standings.LapProgressTime(float64(index) * 90 / float64(count))),
			EstimatedLapTime: builderPresent(standings.LapTime(90)),
			// Classification signals so the standings builder and its budget are
			// exercised with populated rows, not with an empty slice.
			DriverName:       builderPresent(identity.DriverName(fmt.Sprintf("Driver %03d", index))),
			VehicleClass:     builderPresent(standings.VehicleClass(builderClasses[index%len(builderClasses)])),
			CompletedLaps:    builderPresent(standings.CompletedLaps(127 - index/8)),
			LastLapTime:      builderPresent(standings.LapTime(91.234 + float64(index)*0.05)),
			TimeBehindLeader: builderPresent(standings.TimeGap(float64(index) * 1.234)),
			LapsBehindLeader: builderPresent(standings.LapGap(index / 40)),
			InPit:            builderPresent(pit.InPit(index%17 == 0)),
		}
	}
	vehicles[0].Gear = builderPresent(vehicle.Gear(4))
	vehicles[0].EngineRPM = builderPresent(vehicle.EngineRPM(7200))
	vehicles[0].SpeedMPS = builderPresent(50.0)
	vehicles[0].Throttle = builderPresent(schema.Ratio(0.75))
	vehicles[0].Brake = builderPresent(schema.Ratio(0.125))
	vehicles[0].Clutch = builderPresent(schema.Ratio(0))
	vehicles[0].Fuel = builderPresent(energy.Fuel{Amount: 42, Capacity: 100})
	vehicles[0].Damage = builderPresent(damage.State{Dents: [8]damage.Severity{1, 2, 3, 4, 5, 6, 7, 8}, Overheating: false, Detached: false, WheelDetachedCount: 0})
	received := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC).Add(time.Duration(sequence) * time.Second)
	sourceTime := builderPresent(time.Duration(sequence) * time.Second)
	return core.Batch{
		Header: envelope.Header{
			Source: "lmu", Cursor: schema.Cursor{Epoch: 3, Sequence: schema.Sequence(sequence)},
			Clock: schema.NewClock(sourceTime, sourceTime, received), Identity: run,
		},
		State: core.ObservedState{
			SourceTime: sourceTime, EndTime: builderPresent(session.EndTime(7200)), MaximumLaps: builderPresent(session.MaximumLaps(0)),
			TrackName: builderPresent("Sebring"), SessionType: builderPresent(session.TypeRace),
			VehicleCount: builderPresent(schema.Count(count)), PlayerPresent: builderPresent(true), Vehicles: vehicles,
		},
	}
}

func builderPresent[T comparable](value T) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}

func builderField[T comparable](tb testing.TB, value T, freshness schema.Freshness) schema.Field[T] {
	tb.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
	if err != nil {
		tb.Fatal(err)
	}
	return field
}

// builderSourceContext mirrors the context the composition root builds for a
// simulator that publishes world positions and official standings and gaps.
// The modes arrive already resolved: ADR 0004 keeps this package free of any
// capability or driver import, so the builder only ever republishes them.
func builderSourceContext() SourceContextV2 {
	rafCap := 40
	return SourceContextV2{
		State:                  "live",
		DescriptorCapabilities: []string{"shared-memory", "rest"},
		Modes: CapabilityModesV2{
			Spatial:   []string{"xyz"},
			Delta:     []string{DeltaReferencePersonalBest},
			Standings: ModeOfficial,
			Gaps:      ModeOfficial,
		},
		PerformanceRevision: 1,
		Performance: PerformanceV2{
			Level: 3, Mode: PerformanceModeManual, Effects: PerformanceEffectsNoBlur, RafCap: &rafCap,
			WidgetHz: map[string]json.RawMessage{
				"pedals": []byte("40"), "pedals-telemetry": []byte("40"), "pedals-telemetry-compact": []byte("40"), "input-telemetry": []byte("40"),
				"delta": []byte("20"), "delta-advanced": []byte("20"), "delta-trace": []byte("20"), "track-map": []byte("20"),
				"relative": []byte("15"), "multiclass-relative": []byte("15"), "head-to-head": []byte("15"), "standings": []byte("5"),
				"broadcast-tower": []byte("4"), "fuel-strategy": []byte("1"), "race-schedule": []byte(`"dirty"`),
				"car-damage-numbers": []byte("1"), "car-damage-visual": []byte("1"), "track-weather": []byte(`"dirty"`),
				"racing-flags": []byte(`"event"`), "engineer-radio": []byte(`"event"`),
			},
			SourceHz: 60,
		},
	}
}

func assertBuilderGolden(t *testing.T, value UpdateV2, name string) {
	t.Helper()
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	payload = append(payload, '\n')
	path := filepath.Join("testdata", name)
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, payload, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != string(want) {
		t.Fatalf("golden mismatch for %s\n--- got ---\n%s\n--- want ---\n%s", name, payload, want)
	}
}

func assertQField[T comparable](t *testing.T, field string, got QValue[T], want T, quality Quality) {
	t.Helper()
	if got.V != want || got.Q != quality {
		t.Fatalf("%s = %#v, want value %#v quality %q", field, got, want, quality)
	}
}

func qualityFromV1(value projection.Freshness) Quality {
	switch value {
	case "fresh":
		return QualityFresh
	case "stale":
		return QualityStale
	case "invalid":
		return QualityInvalid
	default:
		return QualityMissing
	}
}
