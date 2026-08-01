// Package catalog owns stable signal IDs and their descriptive metadata.
// Runtime domain packages do not depend on this package.
package catalog

import (
	"fmt"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

type LedgerAction uint8

const (
	LedgerActionUnknown LedgerAction = iota
	LedgerReused
	LedgerHardened
	LedgerAppended
	LedgerExistingUnproduced
)

func (action LedgerAction) Known() bool {
	return action >= LedgerReused && action <= LedgerExistingUnproduced
}

func (action LedgerAction) String() string {
	switch action {
	case LedgerReused:
		return "reused"
	case LedgerHardened:
		return "hardened"
	case LedgerAppended:
		return "appended"
	case LedgerExistingUnproduced:
		return "unproduced-existing"
	default:
		return "unknown"
	}
}

type Definition struct {
	ID     SignalID
	Key    string
	Domain schema.Domain
	Unit   schema.Unit
	Range  schema.Range
	Action LedgerAction
	Notes  string
}

type Tombstone struct {
	ID     SignalID
	Key    string
	Reason string
}

var definitions = []Definition{
	{ID: SignalIdentityDriverName, Key: "identity.driver_name", Domain: schema.DomainIdentity, Unit: schema.UnitText, Range: schema.UnsupportedRange(), Action: LedgerHardened, Notes: "Display label only; never runtime identity."},
	{ID: SignalSessionType, Key: "session.type", Domain: schema.DomainSession, Unit: schema.UnitUnsupported, Range: schema.ClosedRange(1, 5), Action: LedgerHardened, Notes: "Known canonical session enum values only."},
	{ID: SignalVehicleEngineRPM, Key: "vehicle.engine_rpm", Domain: schema.DomainVehicle, Unit: schema.UnitRPM, Range: schema.UnknownRange(), Action: LedgerReused, Notes: "Existing canonical signal reused unchanged."},
	{ID: SignalControlsThrottle, Key: "controls.throttle", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1), Action: LedgerReused, Notes: "Existing normalized control signal reused unchanged."},
	{ID: SignalControlsBrake, Key: "controls.brake", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1), Action: LedgerReused, Notes: "Existing normalized control signal reused unchanged."},
	{ID: SignalControlsClutch, Key: "controls.clutch", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1), Action: LedgerReused, Notes: "Existing normalized control signal reused unchanged."},
	{ID: SignalWheelsBrakeTemperature, Key: "wheels.brake_temperature", Domain: schema.DomainWheels, Unit: schema.UnitCelsius, Range: schema.UnknownRange(), Action: LedgerExistingUnproduced, Notes: "Existing contract; not produced by ISA-129."},
	{ID: SignalEnergyFuelAmount, Key: "energy.fuel_amount", Domain: schema.DomainEnergy, Unit: schema.UnitLiters, Range: schema.NonNegativeRange(), Action: LedgerHardened, Notes: "Liters; valid jointly only when 0 <= amount <= capacity."},
	{ID: SignalPitStopCount, Key: "pit.stop_count", Domain: schema.DomainPit, Unit: schema.UnitCount, Range: schema.NonNegativeRange(), Action: LedgerHardened, Notes: "Pit-stop count cannot be negative."},
	{ID: SignalStandingsPosition, Key: "standings.position", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.ClosedRange(1, 104), Action: LedgerHardened, Notes: "One-based position within the demonstrated LMU vehicle bound."},
	{ID: SignalWeatherAmbientTemperature, Key: "weather.ambient_temperature", Domain: schema.DomainWeather, Unit: schema.UnitUnknown, Range: schema.UnknownRange(), Action: LedgerExistingUnproduced, Notes: "Existing contract; not produced by ISA-129."},
	{ID: SignalSpatialPosition, Key: "spatial.position", Domain: schema.DomainSpatial, Unit: schema.UnitUnknown, Range: schema.UnknownRange(), Action: LedgerExistingUnproduced, Notes: "Existing contract; not produced by ISA-129."},
	{ID: SignalSessionLapNumber, Key: "session.lap_number", Domain: schema.DomainSession, Unit: schema.UnitCount, Range: schema.NonNegativeRange(), Action: LedgerHardened, Notes: "Session lap number preserves legitimate zero."},
	{ID: SignalVehicleGear, Key: "vehicle.gear", Domain: schema.DomainVehicle, Unit: schema.UnitUnsupported, Range: schema.UnknownRange(), Action: LedgerReused, Notes: "Existing canonical gear representation reused unchanged."},
	{ID: SignalVehicleTeamName, Key: "vehicle.team_name", Domain: schema.DomainVehicle, Unit: schema.UnitUnsupported, Range: schema.UnsupportedRange(), Action: LedgerExistingUnproduced, Notes: "Existing contract; not produced by ISA-129."},
	{ID: SignalVehicleName, Key: "vehicle.name", Domain: schema.DomainVehicle, Unit: schema.UnitText, Range: schema.UnsupportedRange(), Action: LedgerHardened, Notes: "Canonical vehicle display name."},
	{ID: SignalStandingsCompletedLaps, Key: "standings.completed_laps", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.NonNegativeRange(), Action: LedgerHardened, Notes: "Completed laps preserve legitimate zero."},
	{ID: SignalSpatialOrientation, Key: "spatial.orientation", Domain: schema.DomainSpatial, Unit: schema.UnitUnknown, Range: schema.UnknownRange(), Action: LedgerExistingUnproduced, Notes: "Existing contract; not produced by ISA-129."},
	{ID: SignalSessionSourceTime, Key: "session.source_time", Domain: schema.DomainSession, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerHardened, Notes: "Non-negative timestamp supplied by the source."},
	{ID: SignalSessionTrackName, Key: "session.track_name", Domain: schema.DomainSession, Unit: schema.UnitText, Range: schema.UnsupportedRange(), Action: LedgerHardened, Notes: "Canonical track display name."},
	{ID: SignalSessionVehicleCount, Key: "session.vehicle_count", Domain: schema.DomainSession, Unit: schema.UnitCount, Range: schema.ClosedRange(0, 104), Action: LedgerReused, Notes: "Existing demonstrated LMU vehicle-count bound."},
	{ID: SignalVehiclePlayerPresent, Key: "vehicle.player_present", Domain: schema.DomainVehicle, Unit: schema.UnitBoolean, Range: schema.UnsupportedRange(), Action: LedgerReused, Notes: "Existing player-presence signal reused unchanged."},
	{ID: SignalVehicleSpeedMPS, Key: "vehicle.speed_mps", Domain: schema.DomainVehicle, Unit: schema.UnitMetersPerSecond, Range: schema.NonNegativeRange(), Action: LedgerHardened, Notes: "Canonical non-negative vehicle speed."},
	{ID: SignalPitInPit, Key: "pit.in_pit", Domain: schema.DomainPit, Unit: schema.UnitBoolean, Range: schema.UnsupportedRange(), Action: LedgerReused, Notes: "Existing pit-state signal reused unchanged."},
	{ID: SignalSessionEndTime, Key: "session.end_time", Domain: schema.DomainSession, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Same clock as source time; valid only when end >= current."},
	{ID: SignalSessionRemainingTime, Key: "session.remaining_time", Domain: schema.DomainSession, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Derived as end-current only from fresh ordered inputs."},
	{ID: SignalSessionMaximumLaps, Key: "session.maximum_laps", Domain: schema.DomainSession, Unit: schema.UnitCount, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Canonical maximum session laps; zero remains present."},
	{ID: SignalVehicleClass, Key: "vehicle.class", Domain: schema.DomainVehicle, Unit: schema.UnitText, Range: schema.UnsupportedRange(), Action: LedgerAppended, Notes: "Canonical vehicle class display label."},
	{ID: SignalStandingsSector, Key: "standings.sector", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.ClosedRange(1, 3), Action: LedgerAppended, Notes: "Known track sector enum values only."},
	{ID: SignalStandingsLapDistance, Key: "standings.lap_distance", Domain: schema.DomainStandings, Unit: schema.UnitMeters, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Distance progressed through the current lap."},
	{ID: SignalStandingsBestLapTime, Key: "standings.best_lap_time", Domain: schema.DomainStandings, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Best completed lap duration; present only when finite and > 0."},
	{ID: SignalStandingsLastLapTime, Key: "standings.last_lap_time", Domain: schema.DomainStandings, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Most recent completed lap duration; present only when finite and > 0."},
	{ID: SignalStandingsEstimatedLapTime, Key: "standings.estimated_lap_time", Domain: schema.DomainStandings, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Observed estimate; present only when finite and > 0."},
	{ID: SignalStandingsPenaltyCount, Key: "standings.penalty_count", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Current non-negative penalty count."},
	{ID: SignalStandingsTimeBehindLeader, Key: "standings.time_behind_leader", Domain: schema.DomainStandings, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Time gap behind the leader as supplied."},
	{ID: SignalStandingsLapsBehindLeader, Key: "standings.laps_behind_leader", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Lap gap behind the leader as supplied."},
	{ID: SignalStandingsTimeBehindNext, Key: "standings.time_behind_next", Domain: schema.DomainStandings, Unit: schema.UnitSeconds, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Time gap behind the next classified vehicle."},
	{ID: SignalStandingsLapsBehindNext, Key: "standings.laps_behind_next", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Lap gap behind the next classified vehicle."},
	{ID: SignalStandingsRelativeTimeGap, Key: "standings.relative_time_gap", Domain: schema.DomainStandings, Unit: schema.UnitSeconds, Range: schema.UnknownRange(), Action: LedgerAppended, Notes: "Signed time gap relative to the player."},
	{ID: SignalStandingsRelativeLapDelta, Key: "standings.relative_lap_delta", Domain: schema.DomainStandings, Unit: schema.UnitCount, Range: schema.UnknownRange(), Action: LedgerAppended, Notes: "Signed lap delta relative to the player."},
	{ID: SignalEnergyFuelCapacity, Key: "energy.fuel_capacity", Domain: schema.DomainEnergy, Unit: schema.UnitLiters, Range: schema.NonNegativeRange(), Action: LedgerAppended, Notes: "Must be finite and > 0 when the joint fuel value is present."},
	{ID: SignalSessionSelfDeltaSeconds, Key: "session.self_delta_seconds", Domain: schema.DomainSession, Unit: schema.UnitSeconds, Range: schema.UnknownRange(), Action: LedgerAppended, Notes: "Signed player delta against the declared reference."},
	{ID: SignalSessionSelfDeltaReference, Key: "session.self_delta_reference", Domain: schema.DomainSession, Unit: schema.UnitText, Range: schema.UnsupportedRange(), Action: LedgerAppended, Notes: "Known canonical self-delta reference enum only."},
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
	concepts := make(map[string]string, len(active)+len(retired))
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
		concept := semanticConcept(definition.Key)
		if previous, exists := concepts[concept]; exists {
			return fmt.Errorf("semantic concept %q duplicated by %q and %q", concept, previous, definition.Key)
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
		if !definition.Action.Known() {
			return fmt.Errorf("signal %q has unknown ledger action %d", definition.Key, definition.Action)
		}
		if strings.TrimSpace(definition.Notes) == "" {
			return fmt.Errorf("signal %q requires ledger notes", definition.Key)
		}
		ids[definition.ID] = definition.Key
		keys[definition.Key] = definition.ID
		concepts[concept] = definition.Key
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
		concept := semanticConcept(tombstone.Key)
		if previous, exists := concepts[concept]; exists {
			return fmt.Errorf("semantic concept %q duplicated by %q and retired key %q", concept, previous, tombstone.Key)
		}
		ids[tombstone.ID] = tombstone.Key
		keys[tombstone.Key] = tombstone.ID
		concepts[concept] = tombstone.Key
	}
	return nil
}

// semanticConcept protects the small set of aliases explicitly rejected by
// the append-only contract. It is deliberately not a fuzzy naming heuristic.
func semanticConcept(key string) string {
	switch key {
	case "identity.driver_name", "identity.driver_label":
		return "identity.driver-display-label"
	case "energy.fuel_amount", "energy.fuel_liters":
		return "energy.fuel-liters"
	default:
		return key
	}
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
	output.WriteString("| ID | Key | Domain | Unit | Range | Ledger action | Notes |\n| ---: | --- | --- | --- | --- | --- | --- |\n")
	for _, definition := range active {
		fmt.Fprintf(&output, "| %d | `%s` | %s | %s | %s | %s | %s |\n", definition.ID, definition.Key, definition.Domain, definition.Unit, definition.Range, definition.Action, definition.Notes)
	}
	output.WriteString("\n## Tombstoned IDs\n\n")
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
