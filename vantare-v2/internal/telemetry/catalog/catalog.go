// Package catalog owns stable signal IDs and their descriptive metadata.
// Runtime domain packages do not depend on this package.
package catalog

import (
	"fmt"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

type Definition struct {
	ID     SignalID
	Key    string
	Domain schema.Domain
	Unit   schema.Unit
	Range  schema.Range
}

type Tombstone struct {
	ID     SignalID
	Key    string
	Reason string
}

var definitions = []Definition{
	{ID: SignalIdentityDriverName, Key: "identity.driver_name", Domain: schema.DomainIdentity, Unit: schema.UnitUnsupported, Range: schema.UnsupportedRange()},
	{ID: SignalSessionType, Key: "session.type", Domain: schema.DomainSession, Unit: schema.UnitUnsupported, Range: schema.UnsupportedRange()},
	{ID: SignalVehicleEngineRPM, Key: "vehicle.engine_rpm", Domain: schema.DomainVehicle, Unit: schema.UnitRPM, Range: schema.UnknownRange()},
	{ID: SignalControlsThrottle, Key: "controls.throttle", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)},
	{ID: SignalControlsBrake, Key: "controls.brake", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)},
	{ID: SignalControlsClutch, Key: "controls.clutch", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)},
	{ID: SignalWheelsBrakeTemperature, Key: "wheels.brake_temperature", Domain: schema.DomainWheels, Unit: schema.UnitCelsius, Range: schema.UnknownRange()},
	{ID: SignalEnergyFuelAmount, Key: "energy.fuel_amount", Domain: schema.DomainEnergy, Unit: schema.UnitUnknown, Range: schema.UnknownRange()},
	{ID: SignalPitStopCount, Key: "pit.stop_count", Domain: schema.DomainPit, Unit: schema.UnitCount, Range: schema.UnknownRange()},
	{ID: SignalStandingsPosition, Key: "standings.position", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.UnknownRange()},
	{ID: SignalWeatherAmbientTemperature, Key: "weather.ambient_temperature", Domain: schema.DomainWeather, Unit: schema.UnitUnknown, Range: schema.UnknownRange()},
	{ID: SignalSpatialPosition, Key: "spatial.position", Domain: schema.DomainSpatial, Unit: schema.UnitUnknown, Range: schema.UnknownRange()},
	{ID: SignalSessionLapNumber, Key: "session.lap_number", Domain: schema.DomainSession, Unit: schema.UnitCount, Range: schema.UnknownRange()},
	{ID: SignalVehicleGear, Key: "vehicle.gear", Domain: schema.DomainVehicle, Unit: schema.UnitUnsupported, Range: schema.UnknownRange()},
	{ID: SignalVehicleTeamName, Key: "vehicle.team_name", Domain: schema.DomainVehicle, Unit: schema.UnitUnsupported, Range: schema.UnsupportedRange()},
	{ID: SignalVehicleName, Key: "vehicle.name", Domain: schema.DomainVehicle, Unit: schema.UnitUnsupported, Range: schema.UnsupportedRange()},
	{ID: SignalStandingsCompletedLaps, Key: "standings.completed_laps", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.UnknownRange()},
	{ID: SignalSpatialOrientation, Key: "spatial.orientation", Domain: schema.DomainSpatial, Unit: schema.UnitUnknown, Range: schema.UnknownRange()},
}

// Tombstones is intentionally empty until the first canonical ID is retired.
// Retirements are append-only and validated against active definitions.
var tombstones = []Tombstone{}

var index = buildIndex(definitions)

func All() []Definition { return append([]Definition(nil), definitions...) }

func Retired() []Tombstone { return append([]Tombstone(nil), tombstones...) }

func ByID(id SignalID) (Definition, bool) {
	if int(id) >= len(index) || id == SignalIDUnknown {
		return Definition{}, false
	}
	definition := index[id]
	return definition, definition.ID == id
}

func Validate() error { return validateLedger(definitions, tombstones) }

func validateLedger(active []Definition, retired []Tombstone) error {
	ids := make(map[SignalID]string, len(active)+len(retired))
	keys := make(map[string]SignalID, len(active)+len(retired))
	for _, definition := range active {
		if definition.ID == SignalIDUnknown {
			return fmt.Errorf("active signal %q uses unknown ID", definition.Key)
		}
		if definition.Key == "" {
			return fmt.Errorf("active signal %d has empty key", definition.ID)
		}
		if previous, exists := ids[definition.ID]; exists {
			return fmt.Errorf("signal ID %d reused by %q and %q", definition.ID, previous, definition.Key)
		}
		if previous, exists := keys[definition.Key]; exists {
			return fmt.Errorf("signal key %q reused by IDs %d and %d", definition.Key, previous, definition.ID)
		}
		if !definition.Domain.Known() {
			return fmt.Errorf("signal %q has unknown domain %d", definition.Key, definition.Domain)
		}
		if !definition.Unit.Valid() {
			return fmt.Errorf("signal %q has invalid unit %d", definition.Key, definition.Unit)
		}
		if err := definition.Range.Validate(); err != nil {
			return fmt.Errorf("signal %q range: %w", definition.Key, err)
		}
		ids[definition.ID] = definition.Key
		keys[definition.Key] = definition.ID
	}
	for _, tombstone := range retired {
		if tombstone.ID == SignalIDUnknown {
			return fmt.Errorf("retired signal %q uses unknown ID", tombstone.Key)
		}
		if tombstone.Key == "" || tombstone.Reason == "" {
			return fmt.Errorf("retired signal %d requires key and reason", tombstone.ID)
		}
		if previous, exists := ids[tombstone.ID]; exists {
			return fmt.Errorf("retired signal ID %d reused by %q and %q", tombstone.ID, previous, tombstone.Key)
		}
		if previous, exists := keys[tombstone.Key]; exists {
			return fmt.Errorf("retired signal key %q reused by IDs %d and %d", tombstone.Key, previous, tombstone.ID)
		}
		ids[tombstone.ID] = tombstone.Key
		keys[tombstone.Key] = tombstone.ID
	}
	return nil
}

func buildIndex(active []Definition) []Definition {
	var maximum SignalID
	for _, definition := range active {
		if definition.ID > maximum {
			maximum = definition.ID
		}
	}
	lookup := make([]Definition, int(maximum)+1)
	for _, definition := range active {
		lookup[definition.ID] = definition
	}
	return lookup
}

func Markdown() string {
	active := All()
	retired := Retired()
	sort.Slice(active, func(i, j int) bool { return active[i].ID < active[j].ID })
	sort.Slice(retired, func(i, j int) bool { return retired[i].ID < retired[j].ID })

	var output strings.Builder
	output.WriteString("# Telemetry Core signal catalog\n\n")
	output.WriteString("Generated deterministically from the Go ledger. IDs are never reused.\n\n")
	output.WriteString("| ID | Key | Domain | Unit | Range |\n| ---: | --- | --- | --- | --- |\n")
	for _, definition := range active {
		fmt.Fprintf(&output, "| %d | `%s` | %s | %s | %s |\n", definition.ID, definition.Key, definition.Domain, definition.Unit, definition.Range)
	}
	output.WriteString("\n## Retired IDs\n\n")
	if len(retired) == 0 {
		output.WriteString("None.\n")
	} else {
		output.WriteString("| ID | Former key | Reason |\n| ---: | --- | --- |\n")
		for _, tombstone := range retired {
			fmt.Fprintf(&output, "| %d | `%s` | %s |\n", tombstone.ID, tombstone.Key, tombstone.Reason)
		}
	}
	return output.String()
}
