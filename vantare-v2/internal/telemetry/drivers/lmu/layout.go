package lmu

// windowsSourceType records the exact C/C++ source representation used by
// the pinned LMU 1.3 layout. In particular, Windows long is represented as an
// int32 and C++ bool occupies one byte.
type windowsSourceType string

const (
	sourceInt32   windowsSourceType = "int32"
	sourceInt16   windowsSourceType = "int16"
	sourceInt8    windowsSourceType = "int8"
	sourceUint8   windowsSourceType = "uint8"
	sourceBool8   windowsSourceType = "bool8"
	sourceFloat64 windowsSourceType = "float64"
	sourceChar    windowsSourceType = "char"
)

func (sourceType windowsSourceType) width() int {
	switch sourceType {
	case sourceInt32:
		return 4
	case sourceInt16:
		return 2
	case sourceInt8, sourceUint8, sourceBool8, sourceChar:
		return 1
	case sourceFloat64:
		return 8
	default:
		return 0
	}
}

type layoutScope string

const (
	scopeSession      layoutScope = "session"
	scopeScoringRow   layoutScope = "scoring-row"
	scopeTelemetryRow layoutScope = "telemetry-row"
)

// layoutField is an admitted read window. Offsets in the session scope are
// absolute; row-scoped offsets are relative to their row base. Count is the
// fixed number of adjacent values of the declared source type.
type layoutField struct {
	Name   string
	Scope  layoutScope
	Offset int
	Type   windowsSourceType
	Count  int
}

func (field layoutField) width() int {
	return field.Type.width() * field.Count
}

func (field layoutField) end() int {
	return field.Offset + field.width()
}

type rowLayout struct {
	Base    int
	Stride  int
	Maximum int
}

func (rows rowLayout) rowBase(index int) (int, bool) {
	if index < 0 || index >= rows.Maximum {
		return 0, false
	}
	return rows.Base + index*rows.Stride, true
}

func (rows rowLayout) end() int {
	return rows.Base + rows.Stride*rows.Maximum
}

type sessionLayout struct {
	TrackName    layoutField
	SessionType  layoutField
	CurrentTime  layoutField
	EndTime      layoutField
	MaximumLaps  layoutField
	VehicleCount layoutField
}

type scoringLayout struct {
	VehicleSourceSlot layoutField
	DriverLabel       layoutField
	VehicleLabel      layoutField
	CompletedLaps     layoutField
	Sector            layoutField
	LapDistance       layoutField
	BestLapTime       layoutField
	LastLapTime       layoutField
	PitStopCount      layoutField
	PenaltyCount      layoutField
	PlayerMarker      layoutField
	InPits            layoutField
	Position          layoutField
	VehicleClass      layoutField
	TimeBehindNext    layoutField
	LapsBehindNext    layoutField
	TimeBehindLeader  layoutField
	LapsBehindLeader  layoutField
	EstimatedLapTime  layoutField
	WorldPosition     layoutField
	LocalVelocity     layoutField
	Orientation       layoutField
}

type telemetryLayout struct {
	VehicleSourceSlot  layoutField
	LapNumber          layoutField
	WorldPosition      layoutField
	LocalVelocity      layoutField
	Orientation        layoutField
	Gear               layoutField
	EngineRPM          layoutField
	Throttle           layoutField
	Brake              layoutField
	Clutch             layoutField
	FuelLiters         layoutField
	FuelCapacityLiters layoutField
	DeltaBest          layoutField
}

type layoutContract struct {
	Version       string
	ObjectSize    int
	ScoringRows   rowLayout
	TelemetryRows rowLayout
	Session       sessionLayout
	Scoring       scoringLayout
	Telemetry     telemetryLayout
}

func sessionField(name string, offset int, sourceType windowsSourceType, count int) layoutField {
	return layoutField{Name: name, Scope: scopeSession, Offset: offset, Type: sourceType, Count: count}
}

func scoringField(name string, offset int, sourceType windowsSourceType, count int) layoutField {
	return layoutField{Name: name, Scope: scopeScoringRow, Offset: offset, Type: sourceType, Count: count}
}

func telemetryField(name string, offset int, sourceType windowsSourceType, count int) layoutField {
	return layoutField{Name: name, Scope: scopeTelemetryRow, Offset: offset, Type: sourceType, Count: count}
}

// lmu13Layout is the closed allowlist proven by the two hash-pinned LMU 1.3
// fixtures. Adding a field requires new provenance and a contract test; known
// but excluded bytes deliberately have no field in this API.
var lmu13Layout = layoutContract{
	Version:       "1.3.0.0",
	ObjectSize:    324820,
	ScoringRows:   rowLayout{Base: 2192, Stride: 584, Maximum: 104},
	TelemetryRows: rowLayout{Base: 128468, Stride: 1888, Maximum: 104},
	Session: sessionLayout{
		TrackName:    sessionField("session.track_name", 1632, sourceChar, 64),
		SessionType:  sessionField("session.type", 1696, sourceInt32, 1),
		CurrentTime:  sessionField("session.current_time", 1700, sourceFloat64, 1),
		EndTime:      sessionField("session.end_time", 1708, sourceFloat64, 1),
		MaximumLaps:  sessionField("session.maximum_laps", 1716, sourceInt32, 1),
		VehicleCount: sessionField("session.vehicle_count", 1736, sourceInt32, 1),
	},
	Scoring: scoringLayout{
		VehicleSourceSlot: scoringField("scoring.vehicle_source_slot", 0, sourceInt32, 1),
		DriverLabel:       scoringField("scoring.driver_label", 4, sourceChar, 32),
		VehicleLabel:      scoringField("scoring.vehicle_label", 36, sourceChar, 64),
		CompletedLaps:     scoringField("scoring.completed_laps", 100, sourceInt16, 1),
		Sector:            scoringField("scoring.sector", 102, sourceInt8, 1),
		LapDistance:       scoringField("scoring.lap_distance", 104, sourceFloat64, 1),
		BestLapTime:       scoringField("scoring.best_lap_time", 144, sourceFloat64, 1),
		LastLapTime:       scoringField("scoring.last_lap_time", 168, sourceFloat64, 1),
		PitStopCount:      scoringField("scoring.pit_stop_count", 192, sourceInt16, 1),
		PenaltyCount:      scoringField("scoring.penalty_count", 194, sourceInt16, 1),
		PlayerMarker:      scoringField("scoring.player_marker", 196, sourceBool8, 1),
		InPits:            scoringField("scoring.in_pits", 198, sourceBool8, 1),
		Position:          scoringField("scoring.position", 199, sourceUint8, 1),
		VehicleClass:      scoringField("scoring.vehicle_class", 200, sourceChar, 32),
		TimeBehindNext:    scoringField("scoring.time_behind_next", 232, sourceFloat64, 1),
		LapsBehindNext:    scoringField("scoring.laps_behind_next", 240, sourceInt32, 1),
		TimeBehindLeader:  scoringField("scoring.time_behind_leader", 244, sourceFloat64, 1),
		LapsBehindLeader:  scoringField("scoring.laps_behind_leader", 252, sourceInt32, 1),
		EstimatedLapTime:  scoringField("scoring.estimated_lap_time", 472, sourceFloat64, 1),
		WorldPosition:     scoringField("scoring.world_position", 264, sourceFloat64, 3),
		LocalVelocity:     scoringField("scoring.local_velocity", 288, sourceFloat64, 3),
		Orientation:       scoringField("scoring.orientation", 336, sourceFloat64, 9),
	},
	Telemetry: telemetryLayout{
		VehicleSourceSlot:  telemetryField("telemetry.vehicle_source_slot", 0, sourceInt32, 1),
		LapNumber:          telemetryField("telemetry.lap_number", 20, sourceInt32, 1),
		WorldPosition:      telemetryField("telemetry.world_position", 160, sourceFloat64, 3),
		LocalVelocity:      telemetryField("telemetry.local_velocity", 184, sourceFloat64, 3),
		Orientation:        telemetryField("telemetry.orientation", 232, sourceFloat64, 9),
		Gear:               telemetryField("telemetry.gear", 352, sourceInt32, 1),
		EngineRPM:          telemetryField("telemetry.engine_rpm", 356, sourceFloat64, 1),
		Throttle:           telemetryField("telemetry.throttle", 420, sourceFloat64, 1),
		Brake:              telemetryField("telemetry.brake", 428, sourceFloat64, 1),
		Clutch:             telemetryField("telemetry.clutch", 444, sourceFloat64, 1),
		FuelLiters:         telemetryField("telemetry.fuel_liters", 524, sourceFloat64, 1),
		FuelCapacityLiters: telemetryField("telemetry.fuel_capacity_liters", 608, sourceFloat64, 1),
		DeltaBest:          telemetryField("telemetry.delta_best", 696, sourceFloat64, 1),
	},
}

func (layout layoutContract) admittedFields() []layoutField {
	return []layoutField{
		layout.Session.TrackName,
		layout.Session.SessionType,
		layout.Session.CurrentTime,
		layout.Session.EndTime,
		layout.Session.MaximumLaps,
		layout.Session.VehicleCount,
		layout.Scoring.VehicleSourceSlot,
		layout.Scoring.DriverLabel,
		layout.Scoring.VehicleLabel,
		layout.Scoring.CompletedLaps,
		layout.Scoring.Sector,
		layout.Scoring.LapDistance,
		layout.Scoring.BestLapTime,
		layout.Scoring.LastLapTime,
		layout.Scoring.PitStopCount,
		layout.Scoring.PenaltyCount,
		layout.Scoring.PlayerMarker,
		layout.Scoring.InPits,
		layout.Scoring.Position,
		layout.Scoring.VehicleClass,
		layout.Scoring.TimeBehindNext,
		layout.Scoring.LapsBehindNext,
		layout.Scoring.TimeBehindLeader,
		layout.Scoring.LapsBehindLeader,
		layout.Scoring.EstimatedLapTime,
		layout.Scoring.WorldPosition,
		layout.Scoring.LocalVelocity,
		layout.Scoring.Orientation,
		layout.Telemetry.VehicleSourceSlot,
		layout.Telemetry.LapNumber,
		layout.Telemetry.WorldPosition,
		layout.Telemetry.LocalVelocity,
		layout.Telemetry.Orientation,
		layout.Telemetry.Gear,
		layout.Telemetry.EngineRPM,
		layout.Telemetry.Throttle,
		layout.Telemetry.Brake,
		layout.Telemetry.Clutch,
		layout.Telemetry.FuelLiters,
		layout.Telemetry.FuelCapacityLiters,
		layout.Telemetry.DeltaBest,
	}
}
