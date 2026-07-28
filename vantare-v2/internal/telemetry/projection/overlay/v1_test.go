package overlay

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestProjectV1GoldenAndOwnership(t *testing.T) {
	snapshot := overlayInput(t)

	projected, err := (ProjectorV1{}).Project(snapshot)
	if err != nil {
		t.Fatalf("ProjectorV1.Project() error = %v", err)
	}
	payload, ok := projected.Value()
	if !ok {
		t.Fatal("ProjectorV1.Project() returned empty snapshot")
	}
	payload.Vehicles[0].Name.Value = "mutated"
	payload.History.Samples[0].Brake = 0
	ownedAgain, ok := projected.Value()
	if !ok || ownedAgain.Vehicles[0].Name.Value != "Vantare GT" || ownedAgain.History.Samples[0].Brake != 1 {
		t.Fatalf("projector output shares mutable state: vehicles=%+v history=%+v", ownedAgain.Vehicles, ownedAgain.History)
	}

	got, err := ProjectV1(snapshot)
	if err != nil {
		t.Fatalf("ProjectV1() error = %v", err)
	}
	got.Vehicles[0].Name.Value = "mutated"
	again, err := ProjectV1(snapshot)
	if err != nil {
		t.Fatalf("ProjectV1() second error = %v", err)
	}
	if again.Vehicles[0].Name.Value != "Vantare GT" {
		t.Fatalf("projection shares mutable state: name = %q", again.Vehicles[0].Name.Value)
	}

	assertGoldenJSON(t, again, "overlay_v1.golden.json")
}

func TestProjectV1MissingQualityAndCapabilities(t *testing.T) {
	got, err := ProjectV1(overlayInput(t))
	if err != nil {
		t.Fatalf("ProjectV1() error = %v", err)
	}
	if got.TrackName.Present || got.TrackName.Freshness != "missing" {
		t.Fatalf("missing track = %+v", got.TrackName)
	}
	if !got.Vehicles[0].Throttle.Present || got.Vehicles[0].Throttle.Value != 0 {
		t.Fatalf("fresh zero throttle lost presence: %+v", got.Vehicles[0].Throttle)
	}
	if got.Vehicles[1].Speed.Freshness != "stale" {
		t.Fatalf("stale speed = %+v", got.Vehicles[1].Speed)
	}
	want := []Capability{CapabilitySession, CapabilityStandings, CapabilityControls, CapabilityPit, CapabilityHistory}
	if len(got.Capabilities) != len(want) {
		t.Fatalf("capabilities = %v, want %v", got.Capabilities, want)
	}
	for index := range want {
		if got.Capabilities[index] != want[index] {
			t.Fatalf("capabilities = %v, want %v", got.Capabilities, want)
		}
	}
}

func overlayInput(t *testing.T) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	observed := schema.ProvenanceObserved
	fresh := schema.FreshnessFresh
	stale := schema.FreshnessStale
	field := func(value float64, freshness schema.Freshness) schema.Field[float64] {
		result, err := schema.NewField(value, observed, freshness)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	ratio := func(value schema.Ratio) schema.Field[schema.Ratio] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	name := func(value vehicle.VehicleName) schema.Field[vehicle.VehicleName] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	position := func(value standings.Position) schema.Field[standings.Position] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	laps := func(value standings.CompletedLaps) schema.Field[standings.CompletedLaps] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	inPit, err := schema.NewField(pit.InPit(false), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	sessionType, err := schema.NewField(session.TypeRace, observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: 2, Sequence: 8},
		Clock:  schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 9, 0, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{
			Event: "event-1", Session: "session-1", Vehicle: "car-7",
		},
	}
	state := core.ObservedState{
		TrackName:   schema.MissingField[string](),
		SessionType: sessionType,
		Vehicles: []core.VehicleState{
			{
				Identity:      header.Identity,
				Name:          name("Vantare GT"),
				SpeedMPS:      field(0, fresh),
				Throttle:      ratio(0),
				Brake:         ratio(1),
				Clutch:        ratio(0),
				Position:      position(2),
				CompletedLaps: laps(4),
				InPit:         inPit,
			},
			{
				Identity:      identity.RunIdentity{Event: "event-1", Session: "session-1", Vehicle: "car-9"},
				Name:          name("Rival"),
				SpeedMPS:      field(72.5, stale),
				Position:      position(1),
				CompletedLaps: laps(4),
			},
		},
	}
	final := derive.FinalState{
		Observed: state,
		Derived: derive.DerivedState{ControlsHistory: derive.ControlHistory{
			Freshness: schema.FreshnessFresh,
			Samples: []derive.ControlSample{{
				Cursor: header.Cursor, Vehicle: "car-7", Throttle: 0, Brake: 1, Clutch: 0,
			}},
		}},
	}
	result, err := envelope.NewSnapshot(header, final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
		value.Derived.ControlsHistory.Samples = append([]derive.ControlSample(nil), value.Derived.ControlsHistory.Samples...)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func assertGoldenJSON(t *testing.T, value any, name string) {
	t.Helper()
	got, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if string(got)+"\n" != string(want) {
		t.Fatalf("golden mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}
