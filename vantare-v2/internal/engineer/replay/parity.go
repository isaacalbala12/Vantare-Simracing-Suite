package replay

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	legacy "github.com/vantare/overlays/v2/internal/engineer/telemetry"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

var (
	ErrUnknownMonitorFamily = errors.New("unknown engineer monitor family")
	ErrParityNotApproved    = errors.New("engineer monitor parity is not approved")
	ErrObservationNotReady  = errors.New("engineer observation lacks required fresh signals")
	ErrInvalidReplayTime    = errors.New("engineer replay timestamp is invalid")
	ErrLegacyRange          = errors.New("engineer observation cannot be represented by the legacy replay model")
)

type MonitorFamily string

const (
	FamilySpotter          MonitorFamily = "spotter"
	FamilyEngine           MonitorFamily = "engine"
	FamilyTyre             MonitorFamily = "tyre"
	FamilyOpponents        MonitorFamily = "opponents"
	FamilyMulticlass       MonitorFamily = "multiclass"
	FamilyWatchedOpponents MonitorFamily = "watchedopponents"
	FamilyFlags            MonitorFamily = "flags"
	FamilyFuel             MonitorFamily = "fuel"
	FamilyPenalties        MonitorFamily = "penalties"
	FamilyLaps             MonitorFamily = "laps"
	FamilyPosition         MonitorFamily = "position"
	FamilyPush             MonitorFamily = "push"
	FamilyRaceTime         MonitorFamily = "racetime"
	FamilySessionEnd       MonitorFamily = "sessionend"
	FamilyTimings          MonitorFamily = "timings"
	FamilyPearls           MonitorFamily = "pearls"
	FamilyPitStops         MonitorFamily = "pitstops"
	FamilyStrategy         MonitorFamily = "strategy"
	FamilyDriverSwaps      MonitorFamily = "driverswaps"
	FamilyDamage           MonitorFamily = "damage"
	FamilyConditions       MonitorFamily = "conditions"
)

type ParityState string

const (
	ParityApproved ParityState = "approved"
	ParityPartial  ParityState = "partial"
	ParityDisabled ParityState = "disabled"
)

type MonitorContract struct {
	Family       MonitorFamily
	State        ParityState
	Capabilities []engineer.CapabilityID
	Scenario     string
	Limitation   string
}

var monitorContracts = []MonitorContract{
	{FamilySpotter, ParityApproved, []engineer.CapabilityID{engineer.CapabilityStandings, engineer.CapabilityControls, engineer.CapabilityPit, engineer.CapabilitySpatial}, "normal-track left/right/three-wide/clear", "formation and FCY remain disabled without game phase"},
	{FamilyEngine, ParityDisabled, []engineer.CapabilityID{engineer.CapabilityControls}, "", "temperature, pressure and stall evidence are unavailable"},
	{FamilyTyre, ParityDisabled, nil, "", "tyre wear, tyre temperature and brake temperature are unavailable"},
	{FamilyOpponents, ParityPartial, []engineer.CapabilityID{engineer.CapabilityStandings, engineer.CapabilityPit}, "", "retirement, finish and driver change are unavailable"},
	{FamilyMulticlass, ParityPartial, []engineer.CapabilityID{engineer.CapabilityStandings, engineer.CapabilityGaps}, "", "track length dependent rules are unavailable"},
	{FamilyWatchedOpponents, ParityPartial, []engineer.CapabilityID{engineer.CapabilityStandings, engineer.CapabilityGaps}, "", "selection and replay scenario are not yet characterized"},
	{FamilyFlags, ParityDisabled, nil, "", "game phase and flag signals are unavailable"},
	{FamilyFuel, ParityApproved, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityFuel}, "absolute thresholds and per-lap consumption", "Virtual Energy is outside the legacy fuel monitor"},
	{FamilyPenalties, ParityApproved, []engineer.CapabilityID{engineer.CapabilityStandings}, "generic penalty counter rising/falling edge", "penalty kind and served reason are unavailable"},
	{FamilyLaps, ParityApproved, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings}, "lap transition and lap timing", "game-phase-specific announcements remain disabled"},
	{FamilyPosition, ParityPartial, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings}, "", "formation and causal overtake rules are unavailable"},
	{FamilyPush, ParityPartial, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityGaps}, "", "track length and game phase dependent rules are unavailable"},
	{FamilyRaceTime, ParityPartial, []engineer.CapabilityID{engineer.CapabilitySession}, "", "game-phase-specific suppression is unavailable"},
	{FamilySessionEnd, ParityPartial, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings}, "", "generic session-ended fact exists but finish state is unavailable"},
	{FamilyTimings, ParityApproved, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityGaps}, "player and adjacent-car gaps", "only canonically comparable gaps are approved"},
	{FamilyPearls, ParityPartial, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings}, "", "safe-driving gates are incomplete"},
	{FamilyPitStops, ParityApproved, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityControls, engineer.CapabilityPit}, "pit entry and exit transition", "limiter, box-now and pit-window rules remain disabled"},
	{FamilyStrategy, ParityPartial, []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityFuel, engineer.CapabilityGaps}, "", "no optimal-strategy authority is approved"},
	{FamilyDriverSwaps, ParityDisabled, nil, "", "driver-change producer and stint signals are not demonstrated"},
	{FamilyDamage, ParityDisabled, nil, "", "damage and detached-wheel signals are unavailable"},
	{FamilyConditions, ParityDisabled, nil, "", "weather and track-condition signals are unavailable"},
}

func MonitorContracts() []MonitorContract {
	result := slices.Clone(monitorContracts)
	for index := range result {
		result[index].Capabilities = slices.Clone(result[index].Capabilities)
	}
	return result
}

func contractFor(family MonitorFamily) (MonitorContract, bool) {
	for _, contract := range monitorContracts {
		if contract.Family == family {
			return contract, true
		}
	}
	return MonitorContract{}, false
}

type GateResult struct {
	Ready   bool
	Missing []string
}

func Evaluate(snapshot engineer.ObservationSnapshotV1, family MonitorFamily) (GateResult, error) {
	contract, ok := contractFor(family)
	if !ok {
		return GateResult{}, ErrUnknownMonitorFamily
	}
	if contract.State != ParityApproved {
		return GateResult{Missing: []string{contract.Limitation}}, ErrParityNotApproved
	}

	missing := make([]string, 0)
	for _, capability := range contract.Capabilities {
		if snapshot.Manifest.State(capability) != engineer.CapabilitySupported {
			missing = append(missing, "capability:"+string(capability))
		}
	}
	requireBaseSignals(snapshot, family, &missing)
	return GateResult{Ready: len(missing) == 0, Missing: missing}, nil
}

func requireBaseSignals(snapshot engineer.ObservationSnapshotV1, family MonitorFamily, missing *[]string) {
	require(snapshot.PlayerPresent, "session.player_present", missing)
	present, ok := usable(snapshot.PlayerPresent)
	if !ok || !present {
		*missing = append(*missing, "session.player_present:true")
	}
	require(snapshot.Player.IsPlayer, "player.is_player", missing)
	require(snapshot.Player.LapNumber, "player.lap_number", missing)

	switch family {
	case FamilySpotter:
		require(snapshot.Player.Speed, "player.speed", missing)
		require(snapshot.Player.WorldPosition, "player.world_position", missing)
		require(snapshot.Player.Orientation, "player.orientation", missing)
		require(snapshot.Player.InPit, "player.in_pit", missing)
		hasOpponent := false
		for _, vehicle := range snapshot.Vehicles {
			isPlayer, isPlayerOK := usable(vehicle.IsPlayer)
			if isPlayerOK && isPlayer {
				continue
			}
			if vehicle.WorldPosition.Usable() && vehicle.InPit.Usable() {
				hasOpponent = true
				break
			}
		}
		if !hasOpponent {
			*missing = append(*missing, "grid.opponent_spatial")
		}
	case FamilyFuel:
		require(snapshot.SourceTime, "session.source_time", missing)
		require(snapshot.Player.FuelLiters, "player.fuel_litres", missing)
		require(snapshot.Player.FuelCapacity, "player.fuel_capacity", missing)
	case FamilyPenalties:
		require(snapshot.Player.PenaltyCount, "player.penalty_count", missing)
	case FamilyLaps:
		require(snapshot.SourceTime, "session.source_time", missing)
		require(snapshot.Player.LastLapTime, "player.last_lap_time", missing)
	case FamilyTimings:
		require(snapshot.Player.Position, "player.position", missing)
		require(snapshot.Player.TimeBehindNext, "player.time_behind_next", missing)
	case FamilyPitStops:
		require(snapshot.Player.InPit, "player.in_pit", missing)
		require(snapshot.Player.Speed, "player.speed", missing)
	}
}

func require[T comparable](field engineer.Field[T], name string, missing *[]string) {
	if !field.Usable() {
		*missing = append(*missing, name)
	}
}

func usable[T comparable](field engineer.Field[T]) (T, bool) {
	if !field.Usable() {
		var zero T
		return zero, false
	}
	return field.Value()
}

// Adapter is a replay-only compatibility bridge. Callers must request one
// approved monitor family; there is deliberately no method that returns a
// catch-all legacy frame for the production runtime.
type Adapter struct {
	epoch uint64
	next  int32
	ids   map[engineer.VehicleID]int32
}

func NewAdapter() *Adapter {
	return &Adapter{next: 1, ids: make(map[engineer.VehicleID]int32)}
}

func (adapter *Adapter) FrameFor(family MonitorFamily, snapshot engineer.ObservationSnapshotV1) (*legacy.Frame, error) {
	gate, err := Evaluate(snapshot, family)
	if err != nil {
		return nil, err
	}
	if !gate.Ready {
		return nil, fmt.Errorf("%w: %s", ErrObservationNotReady, strings.Join(gate.Missing, ", "))
	}
	if adapter.epoch != snapshot.Context.Epoch {
		adapter.epoch = snapshot.Context.Epoch
		adapter.next = 1
		clear(adapter.ids)
	}

	capturedAt, err := time.Parse(time.RFC3339Nano, snapshot.CapturedAt)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidReplayTime, err)
	}
	frame := &legacy.Frame{Connected: true, PlayerHasVehicle: true, TimestampUnixMS: capturedAt.UnixMilli()}
	frame.Session = adaptSession(snapshot)
	frame.Vehicles = make([]legacy.VehicleScoring, 0, len(snapshot.Vehicles))
	for _, vehicle := range snapshot.Vehicles {
		adapted, err := adapter.adaptVehicle(vehicle)
		if err != nil {
			return nil, err
		}
		frame.Vehicles = append(frame.Vehicles, adapted)
		isPlayer, _ := usable(vehicle.IsPlayer)
		if isPlayer {
			player := adaptPlayer(vehicle, adapted.ID, snapshot.TrackName)
			frame.Player = &player
		}
	}
	if frame.Player == nil {
		adapted, err := adapter.adaptVehicle(snapshot.Player)
		if err != nil {
			return nil, err
		}
		player := adaptPlayer(snapshot.Player, adapted.ID, snapshot.TrackName)
		frame.Player = &player
	}
	return frame, nil
}

func (adapter *Adapter) legacyID(id engineer.VehicleID) int32 {
	if value, ok := adapter.ids[id]; ok {
		return value
	}
	value := adapter.next
	adapter.next++
	adapter.ids[id] = value
	return value
}

func (adapter *Adapter) adaptVehicle(value engineer.VehicleObservationV1) (legacy.VehicleScoring, error) {
	result := legacy.VehicleScoring{ID: adapter.legacyID(value.ID)}
	result.DriverName, _ = usable(value.DriverName)
	result.VehicleName, _ = usable(value.VehicleName)
	result.VehicleClass, _ = usable(value.VehicleClass)
	result.IsPlayer, _ = usable(value.IsPlayer)
	if v, ok := usable(value.Position); ok {
		if v < 0 || v > 255 {
			return legacy.VehicleScoring{}, fmt.Errorf("%w: position %d", ErrLegacyRange, v)
		}
		result.Place = uint8(v)
	}
	if v, ok := usable(value.CompletedLaps); ok {
		if v < 0 || v > 32767 {
			return legacy.VehicleScoring{}, fmt.Errorf("%w: completed laps %d", ErrLegacyRange, v)
		}
		result.TotalLaps = int16(v)
	}
	result.InPits, _ = usable(value.InPit)
	if v, ok := usable(value.Sector); ok {
		result.Sector = fmt.Sprint(v)
	}
	result.LapDistance, _ = usable(value.LapDistance)
	result.BestLapTime, _ = usable(value.BestLapTime)
	result.LastLapTime, _ = usable(value.LastLapTime)
	result.EstimatedLapTime, _ = usable(value.EstimatedLapTime)
	result.TimeBehindLeader, _ = usable(value.TimeBehindLeader)
	if v, ok := usable(value.LapsBehindLeader); ok {
		result.LapsBehindLeader = int32(v)
	}
	result.TimeBehindNext, _ = usable(value.TimeBehindNext)
	if v, ok := usable(value.LapsBehindNext); ok {
		result.LapsBehindNext = int32(v)
	}
	if v, ok := usable(value.PitStopCount); ok {
		result.Pitstops = int32(v)
	}
	if v, ok := usable(value.PenaltyCount); ok {
		result.Penalties = int32(v)
	}
	if v, ok := usable(value.WorldPosition); ok {
		result.Position = legacy.Vec3{X: v.X, Y: v.Y, Z: v.Z}
	}
	if v, ok := usable(value.LocalVelocity); ok {
		result.LocalVelocity = legacy.Vec3{X: v.X, Y: v.Y, Z: v.Z}
	}
	if v, ok := usable(value.Orientation); ok {
		result.Orientation = legacy.Orientation{
			Row0: legacy.Vec3{X: v.Row0.X, Y: v.Row0.Y, Z: v.Row0.Z},
			Row1: legacy.Vec3{X: v.Row1.X, Y: v.Row1.Y, Z: v.Row1.Z},
			Row2: legacy.Vec3{X: v.Row2.X, Y: v.Row2.Y, Z: v.Row2.Z},
		}
	}
	return result, nil
}

func adaptPlayer(value engineer.VehicleObservationV1, id int32, track engineer.Field[string]) legacy.PlayerTelemetry {
	result := legacy.PlayerTelemetry{ID: id}
	if v, ok := usable(value.LapNumber); ok {
		result.LapNumber = int32(v)
	}
	result.Speed, _ = usable(value.Speed)
	if v, ok := usable(value.Gear); ok {
		result.Gear = int32(v)
	}
	if v, ok := usable(value.EngineRPM); ok {
		result.EngineRPM = float64(v)
	}
	result.Fuel, _ = usable(value.FuelLiters)
	result.FuelCap, _ = usable(value.FuelCapacity)
	result.Throttle, _ = usable(value.Throttle)
	result.Brake, _ = usable(value.Brake)
	result.Clutch, _ = usable(value.Clutch)
	result.VehicleName, _ = usable(value.VehicleName)
	result.TrackName, _ = usable(track)
	if v, ok := usable(value.WorldPosition); ok {
		result.Position = legacy.Vec3{X: v.X, Y: v.Y, Z: v.Z}
	}
	if v, ok := usable(value.LocalVelocity); ok {
		result.LocalVelocity = legacy.Vec3{X: v.X, Y: v.Y, Z: v.Z}
	}
	if v, ok := usable(value.Orientation); ok {
		result.Orientation = legacy.Orientation{
			Row0: legacy.Vec3{X: v.Row0.X, Y: v.Row0.Y, Z: v.Row0.Z},
			Row1: legacy.Vec3{X: v.Row1.X, Y: v.Row1.Y, Z: v.Row1.Z},
			Row2: legacy.Vec3{X: v.Row2.X, Y: v.Row2.Y, Z: v.Row2.Z},
		}
	}
	return result
}

func adaptSession(snapshot engineer.ObservationSnapshotV1) *legacy.SessionInfo {
	result := &legacy.SessionInfo{}
	result.TrackName, _ = usable(snapshot.TrackName)
	if value, ok := usable(snapshot.SessionType); ok {
		switch value {
		case "practice":
			result.SessionType = 1
		case "qualifying":
			result.SessionType = 2
		case "race", "endurance":
			result.SessionType = 5
		case "warmup":
			result.SessionType = 6
		}
	}
	result.SessionTime, _ = usable(snapshot.SourceTime)
	result.TimeRemainingInGamePhase, _ = usable(snapshot.Remaining)
	if value, ok := usable(snapshot.MaximumLaps); ok {
		result.SessionLapsTotal = int32(value)
	}
	result.IsTimedSession = result.SessionLapsTotal == 0 && result.TimeRemainingInGamePhase > 0
	if value, ok := usable(snapshot.VehicleCount); ok {
		result.NumVehicles = int32(value)
	}
	return result
}
