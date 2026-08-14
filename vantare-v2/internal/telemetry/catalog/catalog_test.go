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
	_ session.EndTime         = 0
	_ session.RemainingTime   = 0
	_ session.MaximumLaps     = 0
	_ session.DeltaSeconds    = 0
	_ session.DeltaReference  = session.DeltaReferenceUnknown
	_ vehicle.TeamName        = ""
	_ vehicle.VehicleName     = ""
	_ vehicle.Gear            = 0
	_ vehicle.EngineRPM       = 0
	_ controls.Inputs         = controls.Inputs{}
	_ energy.FuelAmount       = 0
	_ pit.StopCount           = 0
	_ pit.InPit               = false
	_ standings.Position      = 0
	_ standings.CompletedLaps = 0
	_ standings.VehicleClass  = ""
	_ standings.Sector        = standings.SectorUnknown
	_ standings.LapDistance   = 0
	_ standings.LapTime       = 0
	_ standings.PenaltyCount  = 0
	_ standings.TimeGap       = 0
	_ standings.LapGap        = 0
	_ standings.RelativeTime  = 0
	_ standings.RelativeLaps  = 0
	_ energy.FuelCapacity     = 0
	_ weather.Temperature     = 0
	_ spatial.Position        = spatial.Position{}
	_ spatial.Orientation     = spatial.Orientation{}
	_ spatial.LocalVelocity   = spatial.LocalVelocity{}
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
		{SignalSessionSourceTime, "session.source_time", schema.DomainSession},
		{SignalSessionTrackName, "session.track_name", schema.DomainSession},
		{SignalSessionVehicleCount, "session.vehicle_count", schema.DomainSession},
		{SignalVehiclePlayerPresent, "vehicle.player_present", schema.DomainVehicle},
		{SignalVehicleSpeedMPS, "vehicle.speed_mps", schema.DomainVehicle},
		{SignalPitInPit, "pit.in_pit", schema.DomainPit},
		{SignalSessionEndTime, "session.end_time", schema.DomainSession},
		{SignalSessionRemainingTime, "session.remaining_time", schema.DomainSession},
		{SignalSessionMaximumLaps, "session.maximum_laps", schema.DomainSession},
		{SignalVehicleClass, "vehicle.class", schema.DomainVehicle},
		{SignalStandingsSector, "standings.sector", schema.DomainStandings},
		{SignalStandingsLapDistance, "standings.lap_distance", schema.DomainStandings},
		{SignalStandingsBestLapTime, "standings.best_lap_time", schema.DomainStandings},
		{SignalStandingsLastLapTime, "standings.last_lap_time", schema.DomainStandings},
		{SignalStandingsEstimatedLapTime, "standings.estimated_lap_time", schema.DomainStandings},
		{SignalStandingsPenaltyCount, "standings.penalty_count", schema.DomainStandings},
		{SignalStandingsTimeBehindLeader, "standings.time_behind_leader", schema.DomainStandings},
		{SignalStandingsLapsBehindLeader, "standings.laps_behind_leader", schema.DomainStandings},
		{SignalStandingsTimeBehindNext, "standings.time_behind_next", schema.DomainStandings},
		{SignalStandingsLapsBehindNext, "standings.laps_behind_next", schema.DomainStandings},
		{SignalStandingsRelativeTimeGap, "standings.relative_time_gap", schema.DomainStandings},
		{SignalStandingsRelativeLapDelta, "standings.relative_lap_delta", schema.DomainStandings},
		{SignalEnergyFuelCapacity, "energy.fuel_capacity", schema.DomainEnergy},
		{SignalSessionSelfDeltaSeconds, "session.self_delta_seconds", schema.DomainSession},
		{SignalSessionSelfDeltaReference, "session.self_delta_reference", schema.DomainSession},
		{SignalSpatialLocalVelocity, "spatial.local_velocity", schema.DomainSpatial},
		{SignalSessionNativeDeltaBest, "session.native_delta_best", schema.DomainSession},
		{SignalSessionPreviousLapDelta, "session.previous_lap_delta", schema.DomainSession},
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

func TestCatalogISA129IDsAreStableAndAppendOnly(t *testing.T) {
	t.Parallel()

	stable := []SignalID{
		SignalIdentityDriverName, SignalSessionType, SignalVehicleEngineRPM,
		SignalControlsThrottle, SignalControlsBrake, SignalControlsClutch,
		SignalWheelsBrakeTemperature, SignalEnergyFuelAmount, SignalPitStopCount,
		SignalStandingsPosition, SignalWeatherAmbientTemperature, SignalSpatialPosition,
		SignalSessionLapNumber, SignalVehicleGear, SignalVehicleTeamName,
		SignalVehicleName, SignalStandingsCompletedLaps, SignalSpatialOrientation,
		SignalSessionSourceTime, SignalSessionTrackName, SignalSessionVehicleCount,
		SignalVehiclePlayerPresent, SignalVehicleSpeedMPS, SignalPitInPit,
	}
	for index, id := range stable {
		if want := SignalID(index + 1); id != want {
			t.Fatalf("stable ID at index %d = %d, want %d", index, id, want)
		}
	}

	appended := []SignalID{
		SignalSessionEndTime, SignalSessionRemainingTime, SignalSessionMaximumLaps,
		SignalVehicleClass, SignalStandingsSector, SignalStandingsLapDistance,
		SignalStandingsBestLapTime, SignalStandingsLastLapTime, SignalStandingsEstimatedLapTime,
		SignalStandingsPenaltyCount, SignalStandingsTimeBehindLeader, SignalStandingsLapsBehindLeader,
		SignalStandingsTimeBehindNext, SignalStandingsLapsBehindNext,
		SignalStandingsRelativeTimeGap, SignalStandingsRelativeLapDelta,
		SignalEnergyFuelCapacity, SignalSessionSelfDeltaSeconds, SignalSessionSelfDeltaReference,
		SignalSpatialLocalVelocity,
		SignalSessionNativeDeltaBest,
		SignalSessionPreviousLapDelta,
	}
	for index, id := range appended {
		if want := SignalID(25 + index); id != want {
			t.Fatalf("appended ID at index %d = %d, want %d", index, id, want)
		}
	}
	if got := len(All()); got != 46 {
		t.Fatalf("catalog definitions = %d, want 46", got)
	}
}

func TestCatalogISA129ReuseHardenAppendMatrix(t *testing.T) {
	t.Parallel()

	tests := []struct {
		id     SignalID
		action LedgerAction
		unit   schema.Unit
		range_ schema.Range
	}{
		{SignalIdentityDriverName, LedgerHardened, schema.UnitText, schema.UnsupportedRange()},
		{SignalSessionType, LedgerHardened, schema.UnitUnsupported, schema.ClosedRange(1, 5)},
		{SignalVehicleEngineRPM, LedgerReused, schema.UnitRPM, schema.UnknownRange()},
		{SignalControlsThrottle, LedgerReused, schema.UnitRatio, schema.ClosedRange(0, 1)},
		{SignalControlsBrake, LedgerReused, schema.UnitRatio, schema.ClosedRange(0, 1)},
		{SignalControlsClutch, LedgerReused, schema.UnitRatio, schema.ClosedRange(0, 1)},
		{SignalWheelsBrakeTemperature, LedgerExistingUnproduced, schema.UnitCelsius, schema.UnknownRange()},
		{SignalEnergyFuelAmount, LedgerHardened, schema.UnitLiters, schema.NonNegativeRange()},
		{SignalPitStopCount, LedgerHardened, schema.UnitCount, schema.NonNegativeRange()},
		{SignalStandingsPosition, LedgerHardened, schema.UnitCount, schema.ClosedRange(1, 104)},
		{SignalWeatherAmbientTemperature, LedgerExistingUnproduced, schema.UnitUnknown, schema.UnknownRange()},
		{SignalSpatialPosition, LedgerHardened, schema.UnitMeters, schema.UnknownRange()},
		{SignalSessionLapNumber, LedgerHardened, schema.UnitCount, schema.NonNegativeRange()},
		{SignalVehicleGear, LedgerReused, schema.UnitUnsupported, schema.UnknownRange()},
		{SignalVehicleTeamName, LedgerExistingUnproduced, schema.UnitUnsupported, schema.UnsupportedRange()},
		{SignalVehicleName, LedgerHardened, schema.UnitText, schema.UnsupportedRange()},
		{SignalStandingsCompletedLaps, LedgerHardened, schema.UnitCount, schema.NonNegativeRange()},
		{SignalSpatialOrientation, LedgerHardened, schema.UnitUnsupported, schema.UnknownRange()},
		{SignalSessionSourceTime, LedgerHardened, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalSessionTrackName, LedgerHardened, schema.UnitText, schema.UnsupportedRange()},
		{SignalSessionVehicleCount, LedgerReused, schema.UnitCount, schema.ClosedRange(0, 104)},
		{SignalVehiclePlayerPresent, LedgerReused, schema.UnitBoolean, schema.UnsupportedRange()},
		{SignalVehicleSpeedMPS, LedgerHardened, schema.UnitMetersPerSecond, schema.NonNegativeRange()},
		{SignalPitInPit, LedgerReused, schema.UnitBoolean, schema.UnsupportedRange()},
		{SignalSessionEndTime, LedgerAppended, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalSessionRemainingTime, LedgerAppended, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalSessionMaximumLaps, LedgerAppended, schema.UnitCount, schema.NonNegativeRange()},
		{SignalVehicleClass, LedgerAppended, schema.UnitText, schema.UnsupportedRange()},
		{SignalStandingsSector, LedgerAppended, schema.UnitCount, schema.ClosedRange(1, 3)},
		{SignalStandingsLapDistance, LedgerAppended, schema.UnitMeters, schema.NonNegativeRange()},
		{SignalStandingsBestLapTime, LedgerAppended, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalStandingsLastLapTime, LedgerAppended, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalStandingsEstimatedLapTime, LedgerAppended, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalStandingsPenaltyCount, LedgerAppended, schema.UnitCount, schema.NonNegativeRange()},
		{SignalStandingsTimeBehindLeader, LedgerAppended, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalStandingsLapsBehindLeader, LedgerAppended, schema.UnitCount, schema.NonNegativeRange()},
		{SignalStandingsTimeBehindNext, LedgerAppended, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalStandingsLapsBehindNext, LedgerAppended, schema.UnitCount, schema.NonNegativeRange()},
		{SignalStandingsRelativeTimeGap, LedgerAppended, schema.UnitSeconds, schema.UnknownRange()},
		{SignalStandingsRelativeLapDelta, LedgerAppended, schema.UnitCount, schema.UnknownRange()},
		{SignalEnergyFuelCapacity, LedgerAppended, schema.UnitLiters, schema.NonNegativeRange()},
		{SignalSessionSelfDeltaSeconds, LedgerAppended, schema.UnitSeconds, schema.UnknownRange()},
		{SignalSessionSelfDeltaReference, LedgerAppended, schema.UnitText, schema.UnsupportedRange()},
		{SignalSpatialLocalVelocity, LedgerAppended, schema.UnitMetersPerSecond, schema.UnknownRange()},
		{SignalSessionNativeDeltaBest, LedgerAppended, schema.UnitSeconds, schema.UnknownRange()},
		{SignalSessionPreviousLapDelta, LedgerAppended, schema.UnitSeconds, schema.UnknownRange()},
	}

	for _, tt := range tests {
		definition, ok := ByID(tt.id)
		if !ok {
			t.Fatalf("ByID(%d) missing", tt.id)
		}
		if definition.Action != tt.action || definition.Unit != tt.unit || definition.Range != tt.range_ {
			t.Fatalf("definition %d = action=%s unit=%s range=%s, want %s/%s/%s", tt.id, definition.Action, definition.Unit, definition.Range, tt.action, tt.unit, tt.range_)
		}
	}
}

func TestValidateLedgerRejectsSemanticAliases(t *testing.T) {
	t.Parallel()

	base := func(id SignalID, key string, domain schema.Domain, unit schema.Unit, range_ schema.Range) Definition {
		return Definition{ID: id, Key: key, Domain: domain, Unit: unit, Range: range_, Action: LedgerReused, Notes: "test definition"}
	}
	tests := []struct {
		name   string
		active []Definition
	}{
		{
			name: "driver name and display label",
			active: []Definition{
				base(1, "identity.driver_name", schema.DomainIdentity, schema.UnitText, schema.UnsupportedRange()),
				base(2, "identity.driver_label", schema.DomainIdentity, schema.UnitText, schema.UnsupportedRange()),
			},
		},
		{
			name: "fuel amount and liters",
			active: []Definition{
				base(1, "energy.fuel_amount", schema.DomainEnergy, schema.UnitLiters, schema.NonNegativeRange()),
				base(2, "energy.fuel_liters", schema.DomainEnergy, schema.UnitLiters, schema.NonNegativeRange()),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateLedger(tt.active, nil); err == nil {
				t.Fatal("validateLedger() accepted duplicate semantic concept")
			}
		})
	}
}

func TestCatalogDefinesEveryISA34FusionSignalMetadata(t *testing.T) {
	t.Parallel()

	tests := []struct {
		id     SignalID
		unit   schema.Unit
		range_ schema.Range
	}{
		{SignalSessionSourceTime, schema.UnitSeconds, schema.NonNegativeRange()},
		{SignalSessionTrackName, schema.UnitText, schema.UnsupportedRange()},
		{SignalSessionVehicleCount, schema.UnitCount, schema.ClosedRange(0, 104)},
		{SignalVehiclePlayerPresent, schema.UnitBoolean, schema.UnsupportedRange()},
		{SignalVehicleSpeedMPS, schema.UnitMetersPerSecond, schema.NonNegativeRange()},
		{SignalPitInPit, schema.UnitBoolean, schema.UnsupportedRange()},
	}
	for _, tt := range tests {
		definition, ok := ByID(tt.id)
		if !ok || definition.Unit != tt.unit || definition.Range != tt.range_ {
			t.Fatalf("definition %d = %#v, want unit=%v range=%v", tt.id, definition, tt.unit, tt.range_)
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
		Action: LedgerReused,
		Notes:  "test definition",
	}

	tests := []struct {
		name       string
		active     []Definition
		tombstones []Tombstone
	}{
		{name: "duplicate active id", active: []Definition{valid, {ID: valid.ID, Key: "controls.brake", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1), Action: LedgerReused, Notes: "test definition"}}},
		{name: "duplicate key", active: []Definition{valid, {ID: 2, Key: valid.Key, Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1), Action: LedgerReused, Notes: "test definition"}}},
		{name: "retired id reused", active: []Definition{valid}, tombstones: []Tombstone{{ID: valid.ID, Key: "retired.signal", Reason: "contract retired"}}},
		{name: "duplicate retired id", tombstones: []Tombstone{{ID: 9, Key: "retired.one", Reason: "retired"}, {ID: 9, Key: "retired.two", Reason: "retired"}}},
		{name: "unknown id", active: []Definition{{ID: SignalIDUnknown, Key: "controls.throttle", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid domain", active: []Definition{{ID: 2, Key: "bad.domain", Domain: schema.Domain(255), Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid unit", active: []Definition{{ID: 2, Key: "bad.unit", Domain: schema.DomainControls, Unit: schema.Unit(255), Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid range", active: []Definition{{ID: 2, Key: "bad.range", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(1, 0)}}},
		{name: "unknown ledger action", active: []Definition{{ID: 2, Key: "bad.action", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1), Notes: "test definition"}}},
		{name: "empty ledger notes", active: []Definition{{ID: 2, Key: "bad.notes", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1), Action: LedgerReused}}},
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
