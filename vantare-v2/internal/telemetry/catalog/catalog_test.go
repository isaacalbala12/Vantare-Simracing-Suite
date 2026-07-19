package catalog

import (
	"bytes"
	"os"
	"sort"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/controls"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/wheels"
)

// Compile-time witnesses keep the explicitly declared runtime contracts tied
// to this catalog specification without adding a schema -> catalog dependency.
var (
	_ identity.DriverName     = ""
	_ session.Type            = session.TypeUnknown
	_ session.LapNumber       = 0
	_ vehicle.TeamName        = ""
	_ vehicle.VehicleName     = ""
	_ vehicle.Gear            = 0
	_ vehicle.EngineRPM       = 0
	_ controls.Inputs         = controls.Inputs{}
	_ energy.FuelAmount       = 0
	_ pit.StopCount           = 0
	_ standings.Position      = 0
	_ standings.CompletedLaps = 0
	_ weather.Temperature     = 0
	_ spatial.Position        = spatial.Position{}
	_ spatial.Orientation     = spatial.Orientation{}
	_ wheels.BrakeTemperature = wheels.BrakeTemperature{}
)

func TestCatalogCoversExplicitRuntimeContracts(t *testing.T) {
	t.Parallel()

	want := []struct {
		id     SignalID
		key    string
		domain schema.Domain
	}{
		{SignalIdentityDriverName, "identity.driver_name", schema.DomainIdentity},
		{SignalSessionType, "session.type", schema.DomainSession},
		{SignalVehicleEngineRPM, "vehicle.engine_rpm", schema.DomainVehicle},
		{SignalControlsThrottle, "controls.throttle", schema.DomainControls},
		{SignalControlsBrake, "controls.brake", schema.DomainControls},
		{SignalControlsClutch, "controls.clutch", schema.DomainControls},
		{SignalWheelsBrakeTemperature, "wheels.brake_temperature", schema.DomainWheels},
		{SignalEnergyFuelAmount, "energy.fuel_amount", schema.DomainEnergy},
		{SignalPitStopCount, "pit.stop_count", schema.DomainPit},
		{SignalStandingsPosition, "standings.position", schema.DomainStandings},
		{SignalWeatherAmbientTemperature, "weather.ambient_temperature", schema.DomainWeather},
		{SignalSpatialPosition, "spatial.position", schema.DomainSpatial},
		{SignalSessionLapNumber, "session.lap_number", schema.DomainSession},
		{SignalVehicleGear, "vehicle.gear", schema.DomainVehicle},
		{SignalVehicleTeamName, "vehicle.team_name", schema.DomainVehicle},
		{SignalVehicleName, "vehicle.name", schema.DomainVehicle},
		{SignalStandingsCompletedLaps, "standings.completed_laps", schema.DomainStandings},
		{SignalSpatialOrientation, "spatial.orientation", schema.DomainSpatial},
	}

	got := All()
	if len(got) != len(want) {
		t.Fatalf("catalog contains %d definitions, want exact runtime contract set of %d", len(got), len(want))
	}
	for index, expected := range want {
		definition := got[index]
		if definition.ID != expected.id || definition.Key != expected.key || definition.Domain != expected.domain {
			t.Fatalf("definition %d = {%d %q %s}, want {%d %q %s}", index, definition.ID, definition.Key, definition.Domain, expected.id, expected.key, expected.domain)
		}
	}
}

func TestValidateLedgerRejectsBrokenInvariants(t *testing.T) {
	t.Parallel()

	valid := Definition{
		ID:     1,
		Key:    "controls.throttle",
		Domain: schema.DomainControls,
		Unit:   schema.UnitRatio,
		Range:  schema.ClosedRange(0, 1),
	}

	tests := []struct {
		name       string
		active     []Definition
		tombstones []Tombstone
	}{
		{name: "duplicate active id", active: []Definition{valid, {ID: valid.ID, Key: "controls.brake", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "duplicate key", active: []Definition{valid, {ID: 2, Key: valid.Key, Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "retired id reused", active: []Definition{valid}, tombstones: []Tombstone{{ID: valid.ID, Key: "retired.signal", Reason: "contract retired"}}},
		{name: "duplicate retired id", tombstones: []Tombstone{{ID: 9, Key: "retired.one", Reason: "retired"}, {ID: 9, Key: "retired.two", Reason: "retired"}}},
		{name: "unknown id", active: []Definition{{ID: SignalIDUnknown, Key: "controls.throttle", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid domain", active: []Definition{{ID: 2, Key: "bad.domain", Domain: schema.Domain(255), Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid unit", active: []Definition{{ID: 2, Key: "bad.unit", Domain: schema.DomainControls, Unit: schema.Unit(255), Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid range", active: []Definition{{ID: 2, Key: "bad.range", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(1, 0)}}},
		{name: "empty tombstone reason", tombstones: []Tombstone{{ID: 9, Key: "retired.one"}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateLedger(tt.active, tt.tombstones); err == nil {
				t.Fatal("validateLedger() error = nil, want invariant failure")
			}
		})
	}
}

func TestCatalogIsValidAndOrdered(t *testing.T) {
	t.Parallel()

	if err := Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	definitions := All()
	if !sort.SliceIsSorted(definitions, func(i, j int) bool { return definitions[i].ID < definitions[j].ID }) {
		t.Fatal("catalog definitions are not ordered by stable ID")
	}
	for _, definition := range definitions {
		got, ok := ByID(definition.ID)
		if !ok || got != definition {
			t.Fatalf("ByID(%d) = (%+v, %v), want %+v", definition.ID, got, ok, definition)
		}
	}
}

func TestMarkdownGoldenIsDeterministic(t *testing.T) {
	t.Parallel()

	first := Markdown()
	second := Markdown()
	if first != second {
		t.Fatal("Markdown() changed between identical calls")
	}

	want, err := os.ReadFile("../../../docs/telemetry-core/signal-catalog.md")
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}
	want = bytes.ReplaceAll(want, []byte("\r\n"), []byte("\n"))
	if !bytes.Equal([]byte(first), want) {
		t.Fatalf("catalog golden mismatch\n--- got ---\n%s\n--- want ---\n%s", first, want)
	}
}
