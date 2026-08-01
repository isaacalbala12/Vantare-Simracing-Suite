package lmu

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const (
	MemoryName             = "LMU_Data"
	ObjectOutSize          = 324820
	telemetryOffset        = 128468
	telemetryStride        = 1888
	scoringStride          = 584
	scoringOffset          = 2192
	scoringIsPlayerOffset  = 196
	scoringInPitsOffset    = 198
	maxVehicles            = 104
	knownFingerprintFormat = "LMU_Data/runtime:build=%s;size=324820;evidence=%s;telemetry=%s"
	unknownFingerprint     = "LMU_Data/size=324820/evidence=insufficient"
)

var ErrIncompatibleBuffer = errors.New("LMU_Data buffer is structurally incompatible")

type Compatibility uint8

const (
	CompatibilityUnknown Compatibility = iota
	CompatibilityKnown
)

type ClockChange uint8

const (
	ClockContinuous ClockChange = iota
	ClockReset
	ClockWrap
)

// Observation is the canonical, product-neutral subset demonstrated by the
// audited LMU_Data fixtures. It intentionally contains no raw bytes, deltas,
// gaps, warnings, or product decisions. Decisions below describe source
// authority only. Canonical driver output leaves REST empty so consumers cannot
// bypass field-level fusion.
type Observation struct {
	Source         ObservationSource
	ReceivedUTC    time.Time
	Compatibility  Compatibility
	Fingerprint    string
	ClockChange    ClockChange
	SourceTime     schema.Field[time.Duration]
	EndTime        schema.Field[session.EndTime]
	MaximumLaps    schema.Field[session.MaximumLaps]
	TrackName      schema.Field[string]
	SessionType    schema.Field[session.Type]
	VehicleCount   schema.Field[schema.Count]
	PlayerPresent  schema.Field[bool]
	VehicleName    schema.Field[vehicle.VehicleName]
	LapNumber      schema.Field[session.LapNumber]
	Gear           schema.Field[vehicle.Gear]
	EngineRPM      schema.Field[vehicle.EngineRPM]
	SpeedMPS       schema.Field[float64]
	Throttle       schema.Field[schema.Ratio]
	Brake          schema.Field[schema.Ratio]
	Clutch         schema.Field[schema.Ratio]
	PlayerPosition schema.Field[standings.Position]
	CompletedLaps  schema.Field[standings.CompletedLaps]
	PitStopCount   schema.Field[pit.StopCount]
	InPit          schema.Field[pit.InPit]
	Fuel           schema.Field[energy.Fuel]
	Vehicles       []VehicleObservation
	REST           RESTObservation
	MatrixVersion  uint16
	Decisions      []FieldDecision
	Conflicts      []ConflictDiagnostic
}

// VehicleSourceID is the LMU slot ID for one continuously occupied row. It is
// not a durable canonical identity and is never derived from position or text.
type VehicleSourceID int32

// VehicleObservation owns the admitted values for one scoring row. Fast
// telemetry and fuel are present only on the scoring-selected player row.
type VehicleObservation struct {
	SourceID         VehicleSourceID
	DriverName       schema.Field[identity.DriverName]
	VehicleName      schema.Field[vehicle.VehicleName]
	VehicleClass     schema.Field[standings.VehicleClass]
	Player           schema.Field[bool]
	Position         schema.Field[standings.Position]
	CompletedLaps    schema.Field[standings.CompletedLaps]
	Sector           schema.Field[standings.Sector]
	LapDistance      schema.Field[standings.LapDistance]
	BestLapTime      schema.Field[standings.LapTime]
	LastLapTime      schema.Field[standings.LapTime]
	EstimatedLapTime schema.Field[standings.LapTime]
	InPit            schema.Field[pit.InPit]
	PitStopCount     schema.Field[pit.StopCount]
	PenaltyCount     schema.Field[standings.PenaltyCount]
	TimeBehindLeader schema.Field[standings.TimeGap]
	LapsBehindLeader schema.Field[standings.LapGap]
	TimeBehindNext   schema.Field[standings.TimeGap]
	LapsBehindNext   schema.Field[standings.LapGap]
	LapNumber        schema.Field[session.LapNumber]
	Gear             schema.Field[vehicle.Gear]
	EngineRPM        schema.Field[vehicle.EngineRPM]
	SpeedMPS         schema.Field[float64]
	Throttle         schema.Field[schema.Ratio]
	Brake            schema.Field[schema.Ratio]
	Clutch           schema.Field[schema.Ratio]
	Fuel             schema.Field[energy.Fuel]
	WorldPosition    schema.Field[spatial.Position]
	LocalVelocity    schema.Field[spatial.LocalVelocity]
	Orientation      schema.Field[spatial.Orientation]
}

func Parse(buf []byte, received time.Time) (Observation, error) {
	return parseWithBuild(buf, received, BuildEvidence{})
}

func parseWithBuild(buf []byte, received time.Time, build BuildEvidence) (Observation, error) {
	return parseWithProfile(buf, received, profileFromBuild(build))
}

func parseWithProfile(buf []byte, received time.Time, profile compatibilityProfile) (Observation, error) {
	if len(buf) < ObjectOutSize {
		return Observation{}, ErrIncompatibleBuffer
	}

	result := Observation{
		Source:        SourceSharedMemory,
		ReceivedUTC:   received.Round(0).UTC(),
		Compatibility: CompatibilityUnknown,
		Fingerprint:   unknownFingerprint,
	}
	if !profile.supported {
		return result, nil
	}
	vehicles := readInt32(buf, lmu13Layout.Session.VehicleCount.Offset)
	if vehicles < 0 || vehicles > int32(lmu13Layout.ScoringRows.Maximum) {
		return rejectedObservation(result, profile, "vehicle-count-invalid"), nil
	}
	track, ok := readCStringField(buf, lmu13Layout.Session.TrackName, 0, true)
	if !ok {
		return rejectedObservation(result, profile, "session-string-invalid"), nil
	}
	currentSeconds := readFloat64(buf, lmu13Layout.Session.CurrentTime.Offset)
	currentTime, currentValid := durationFromSeconds(currentSeconds)
	endSeconds := readFloat64(buf, lmu13Layout.Session.EndTime.Offset)
	maximumLaps := readInt32(buf, lmu13Layout.Session.MaximumLaps.Offset)
	if !currentValid || !finite(endSeconds) || endSeconds < currentSeconds || maximumLaps < 0 {
		return rejectedObservation(result, profile, "session-values-invalid"), nil
	}
	grid, playerIndex, valid := parseActiveGrid(buf, int(vehicles))
	if !valid {
		return rejectedObservation(result, profile, "active-grid-invalid"), nil
	}
	playerPresent := playerIndex >= 0
	evidence := "active-grid-bijective"
	telemetryEvidence := "not-required-no-player"
	if playerPresent {
		telemetryEvidence = "player-id-correlated"
	}
	result.Compatibility = CompatibilityKnown
	result.Fingerprint = fmt.Sprintf(knownFingerprintFormat, profile.version, evidence, telemetryEvidence)
	result.PlayerPresent = observed(playerPresent)
	result.TrackName = observed(normalizeTrackName(track))
	result.VehicleCount = validateCount(vehicles, 0, maxVehicles)
	result.SessionType = validateSessionType(readInt32(buf, lmu13Layout.Session.SessionType.Offset))
	result.SourceTime = observed(currentTime)
	result.EndTime = observed(session.EndTime(endSeconds))
	result.MaximumLaps = observed(session.MaximumLaps(maximumLaps))
	result.Vehicles = grid
	if playerPresent {
		publishPlayer(&result, grid[playerIndex])
	}
	return result, nil
}

func rejectedObservation(result Observation, profile compatibilityProfile, evidence string) Observation {
	result.Fingerprint = fmt.Sprintf("LMU_Data/runtime:build=%s;evidence=%s", profile.version, evidence)
	return result
}

func parseActiveGrid(buf []byte, count int) ([]VehicleObservation, int, bool) {
	telemetryByID := make(map[VehicleSourceID]int, count)
	for index := 0; index < count; index++ {
		base, ok := lmu13Layout.TelemetryRows.rowBase(index)
		if !ok {
			return nil, -1, false
		}
		id := VehicleSourceID(readInt32(buf, base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset))
		if id < 0 {
			return nil, -1, false
		}
		if _, duplicate := telemetryByID[id]; duplicate {
			return nil, -1, false
		}
		telemetryByID[id] = base
	}

	rows := make([]VehicleObservation, 0, count)
	scoringIDs := make(map[VehicleSourceID]struct{}, count)
	playerIndex := -1
	for index := 0; index < count; index++ {
		base, ok := lmu13Layout.ScoringRows.rowBase(index)
		if !ok {
			return nil, -1, false
		}
		row, valid := parseScoringRow(buf, base)
		if !valid || row.SourceID < 0 {
			return nil, -1, false
		}
		if _, duplicate := scoringIDs[row.SourceID]; duplicate {
			return nil, -1, false
		}
		scoringIDs[row.SourceID] = struct{}{}
		telemetryBase, matched := telemetryByID[row.SourceID]
		if !matched {
			return nil, -1, false
		}
		if player, _ := row.Player.Value(); player {
			if playerIndex >= 0 {
				return nil, -1, false
			}
			playerIndex = index
			parsePlayerTelemetry(buf, telemetryBase, &row)
		}
		rows = append(rows, row)
	}
	if len(scoringIDs) != len(telemetryByID) {
		return nil, -1, false
	}
	return rows, playerIndex, true
}

func parseScoringRow(buf []byte, base int) (VehicleObservation, bool) {
	driver, driverOK := readCStringField(buf, lmu13Layout.Scoring.DriverLabel, base, true)
	name, nameOK := readCStringField(buf, lmu13Layout.Scoring.VehicleLabel, base, true)
	class, classOK := readCStringField(buf, lmu13Layout.Scoring.VehicleClass, base, true)
	playerRaw := buf[base+lmu13Layout.Scoring.PlayerMarker.Offset]
	inPitRaw := buf[base+lmu13Layout.Scoring.InPits.Offset]
	completed := readInt16(buf, base+lmu13Layout.Scoring.CompletedLaps.Offset)
	sector, sectorOK := parseSector(readInt8(buf, base+lmu13Layout.Scoring.Sector.Offset))
	lapDistance := readFloat64(buf, base+lmu13Layout.Scoring.LapDistance.Offset)
	position := int32(buf[base+lmu13Layout.Scoring.Position.Offset])
	pitStops := readInt16(buf, base+lmu13Layout.Scoring.PitStopCount.Offset)
	penalties := readInt16(buf, base+lmu13Layout.Scoring.PenaltyCount.Offset)
	timeNext := readFloat64(buf, base+lmu13Layout.Scoring.TimeBehindNext.Offset)
	lapsNext := readInt32(buf, base+lmu13Layout.Scoring.LapsBehindNext.Offset)
	timeLeader := readFloat64(buf, base+lmu13Layout.Scoring.TimeBehindLeader.Offset)
	lapsLeader := readInt32(buf, base+lmu13Layout.Scoring.LapsBehindLeader.Offset)
	if !driverOK || !nameOK || !classOK || playerRaw > 1 || inPitRaw > 1 ||
		completed < 0 || !sectorOK || !finite(lapDistance) ||
		position < 1 || position > maxVehicles || pitStops < 0 || penalties < 0 ||
		!finite(timeNext) || lapsNext < 0 ||
		!finite(timeLeader) || lapsLeader < 0 {
		return VehicleObservation{}, false
	}
	var timeBehindNext schema.Field[standings.TimeGap]
	if timeNext >= 0 {
		timeBehindNext = observed(standings.TimeGap(timeNext))
	}
	var timeBehindLeader schema.Field[standings.TimeGap]
	if timeLeader >= 0 {
		timeBehindLeader = observed(standings.TimeGap(timeLeader))
	}
	var lapDistanceField schema.Field[standings.LapDistance]
	if lapDistance >= 0 {
		lapDistanceField = observed(standings.LapDistance(lapDistance))
	}
	best, bestOK := optionalPositiveLapTime(readFloat64(buf, base+lmu13Layout.Scoring.BestLapTime.Offset))
	last, lastOK := optionalPositiveLapTime(readFloat64(buf, base+lmu13Layout.Scoring.LastLapTime.Offset))
	estimated, estimatedOK := optionalPositiveLapTime(readFloat64(buf, base+lmu13Layout.Scoring.EstimatedLapTime.Offset))
	if !bestOK || !lastOK || !estimatedOK {
		return VehicleObservation{}, false
	}
	worldPosition := readPositionField(buf, base+lmu13Layout.Scoring.WorldPosition.Offset)
	localVelocity := readLocalVelocityField(buf, base+lmu13Layout.Scoring.LocalVelocity.Offset)
	orientation := readOrientationField(buf, base+lmu13Layout.Scoring.Orientation.Offset)
	return VehicleObservation{
		SourceID:   VehicleSourceID(readInt32(buf, base+lmu13Layout.Scoring.VehicleSourceSlot.Offset)),
		DriverName: observed(identity.DriverName(driver)), VehicleName: observed(vehicle.VehicleName(name)),
		VehicleClass: observed(standings.VehicleClass(class)), Player: observed(playerRaw == 1),
		Position: observed(standings.Position(position)), CompletedLaps: observed(standings.CompletedLaps(completed)),
		Sector: sector, LapDistance: lapDistanceField,
		BestLapTime: best, LastLapTime: last, EstimatedLapTime: estimated,
		InPit: observed(pit.InPit(inPitRaw == 1)), PitStopCount: observed(pit.StopCount(pitStops)),
		PenaltyCount:     observed(standings.PenaltyCount(penalties)),
		TimeBehindLeader: timeBehindLeader, LapsBehindLeader: observed(standings.LapGap(lapsLeader)),
		TimeBehindNext: timeBehindNext, LapsBehindNext: observed(standings.LapGap(lapsNext)),
		WorldPosition: worldPosition, LocalVelocity: localVelocity, Orientation: orientation,
	}, true
}

func parsePlayerTelemetry(buf []byte, base int, row *VehicleObservation) {
	lap := readInt32(buf, base+lmu13Layout.Telemetry.LapNumber.Offset)
	if lap >= 0 {
		row.LapNumber = observed(session.LapNumber(lap))
	} else {
		row.LapNumber = invalid[session.LapNumber]()
	}
	row.Gear = observed(vehicle.Gear(readInt32(buf, base+lmu13Layout.Telemetry.Gear.Offset)))
	rpm := readFloat64(buf, base+lmu13Layout.Telemetry.EngineRPM.Offset)
	if finite(rpm) && rpm >= 0 {
		row.EngineRPM = observed(vehicle.EngineRPM(rpm))
	} else {
		row.EngineRPM = invalid[vehicle.EngineRPM]()
	}
	row.WorldPosition = preferFresh(
		readPositionField(buf, base+lmu13Layout.Telemetry.WorldPosition.Offset),
		row.WorldPosition,
	)
	telemetryVelocity := readLocalVelocityField(buf, base+lmu13Layout.Telemetry.LocalVelocity.Offset)
	row.LocalVelocity = preferFresh(telemetryVelocity, row.LocalVelocity)
	row.Orientation = preferFresh(
		readOrientationField(buf, base+lmu13Layout.Telemetry.Orientation.Offset),
		row.Orientation,
	)
	velocity, velocityPresent := telemetryVelocity.Value()
	velocityPresent = velocityPresent && telemetryVelocity.Freshness() == schema.FreshnessFresh
	vx, vy, vz := velocity.X, velocity.Y, velocity.Z
	if velocityPresent {
		speed := math.Sqrt(vx*vx + vy*vy + vz*vz)
		if finite(speed) {
			row.SpeedMPS = observed(speed)
		} else {
			row.SpeedMPS = invalid[float64]()
		}
	} else {
		row.SpeedMPS = invalid[float64]()
	}
	row.Throttle = validateRatio(readFloat64(buf, base+lmu13Layout.Telemetry.Throttle.Offset))
	row.Brake = validateRatio(readFloat64(buf, base+lmu13Layout.Telemetry.Brake.Offset))
	row.Clutch = validateRatio(readFloat64(buf, base+lmu13Layout.Telemetry.Clutch.Offset))
	fuel := energy.Fuel{
		Amount:   energy.FuelAmount(readFloat64(buf, base+lmu13Layout.Telemetry.FuelLiters.Offset)),
		Capacity: energy.FuelCapacity(readFloat64(buf, base+lmu13Layout.Telemetry.FuelCapacityLiters.Offset)),
	}
	if fuel.Valid() {
		row.Fuel = observed(fuel)
	} else {
		row.Fuel = invalid[energy.Fuel]()
	}
}

func readPositionField(buf []byte, offset int) schema.Field[spatial.Position] {
	value := readVector3(buf, offset)
	if !finiteVector(value) {
		return invalid[spatial.Position]()
	}
	return observed(spatial.Position(value))
}

func readLocalVelocityField(buf []byte, offset int) schema.Field[spatial.LocalVelocity] {
	value := readVector3(buf, offset)
	if !finiteVector(value) {
		return invalid[spatial.LocalVelocity]()
	}
	return observed(spatial.LocalVelocity(value))
}

func readOrientationField(buf []byte, offset int) schema.Field[spatial.Orientation] {
	value := spatial.Orientation{
		Row0: readVector3(buf, offset),
		Row1: readVector3(buf, offset+24),
		Row2: readVector3(buf, offset+48),
	}
	if !validOrientation(value) {
		return invalid[spatial.Orientation]()
	}
	return observed(value)
}

func readVector3(buf []byte, offset int) spatial.Vector3 {
	return spatial.Vector3{
		X: readFloat64(buf, offset),
		Y: readFloat64(buf, offset+8),
		Z: readFloat64(buf, offset+16),
	}
}

func finiteVector(value spatial.Vector3) bool {
	return finite(value.X) && finite(value.Y) && finite(value.Z)
}

func validOrientation(value spatial.Orientation) bool {
	if !finiteVector(value.Row0) || !finiteVector(value.Row1) || !finiteVector(value.Row2) {
		return false
	}
	const tolerance = 1e-3
	rows := [...]spatial.Vector3{value.Row0, value.Row1, value.Row2}
	for _, row := range rows {
		if math.Abs(dot(row, row)-1) > tolerance {
			return false
		}
	}
	if math.Abs(dot(rows[0], rows[1])) > tolerance ||
		math.Abs(dot(rows[0], rows[2])) > tolerance ||
		math.Abs(dot(rows[1], rows[2])) > tolerance {
		return false
	}
	determinant := rows[0].X*(rows[1].Y*rows[2].Z-rows[1].Z*rows[2].Y) -
		rows[0].Y*(rows[1].X*rows[2].Z-rows[1].Z*rows[2].X) +
		rows[0].Z*(rows[1].X*rows[2].Y-rows[1].Y*rows[2].X)
	return math.Abs(determinant-1) <= tolerance
}

func dot(left, right spatial.Vector3) float64 {
	return left.X*right.X + left.Y*right.Y + left.Z*right.Z
}

func preferFresh[T comparable](preferred, fallback schema.Field[T]) schema.Field[T] {
	if preferred.Freshness() == schema.FreshnessFresh {
		return preferred
	}
	return fallback
}

func publishPlayer(result *Observation, player VehicleObservation) {
	result.VehicleName = player.VehicleName
	result.LapNumber = player.LapNumber
	result.Gear = player.Gear
	result.EngineRPM = player.EngineRPM
	result.SpeedMPS = player.SpeedMPS
	result.Throttle = player.Throttle
	result.Brake = player.Brake
	result.Clutch = player.Clutch
	result.PlayerPosition = player.Position
	result.CompletedLaps = player.CompletedLaps
	result.PitStopCount = player.PitStopCount
	result.InPit = player.InPit
	result.Fuel = player.Fuel
}

func parseSector(value int8) (schema.Field[standings.Sector], bool) {
	var sector standings.Sector
	switch value {
	case 0:
		sector = standings.SectorThree
	case 1:
		sector = standings.SectorOne
	case 2:
		sector = standings.SectorTwo
	default:
		return schema.MissingField[standings.Sector](), false
	}
	return observed(sector), true
}

func optionalPositiveLapTime(value float64) (schema.Field[standings.LapTime], bool) {
	if !finite(value) {
		return schema.MissingField[standings.LapTime](), false
	}
	if value <= 0 {
		return schema.MissingField[standings.LapTime](), true
	}
	return observed(standings.LapTime(value)), true
}

func readCStringField(buf []byte, field layoutField, base int, allowEmpty bool) (string, bool) {
	start := base + field.Offset
	return reasonableCString(buf[start:start+field.width()], allowEmpty)
}

func reasonableCString(value []byte, allowEmpty bool) (string, bool) {
	nul := -1
	for index, char := range value {
		if char == 0 {
			nul = index
			break
		}
	}
	if nul < 0 || (!allowEmpty && nul == 0) {
		return "", false
	}
	value = value[:nul]
	if !utf8.Valid(value) {
		return "", false
	}
	for _, char := range string(value) {
		if char < 0x20 {
			return "", false
		}
	}
	return string(value), true
}

func observed[T comparable](value T) schema.Field[T] {
	field, _ := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	return field
}

func invalid[T comparable]() schema.Field[T] {
	var zero T
	field, _ := schema.NewField(zero, schema.ProvenanceObserved, schema.FreshnessInvalid)
	return field
}

func validateDuration(seconds float64) schema.Field[time.Duration] {
	value, valid := durationFromSeconds(seconds)
	if !valid {
		return invalid[time.Duration]()
	}
	return observed(value)
}

func validateRatio(value float64) schema.Field[schema.Ratio] {
	if !finiteRatio(value) {
		return invalid[schema.Ratio]()
	}
	return observed(schema.Ratio(value))
}

func validateCount(value, min, max int32) schema.Field[schema.Count] {
	if value < min || value > max {
		return invalid[schema.Count]()
	}
	return observed(schema.Count(value))
}

func validateInPit(value byte) schema.Field[pit.InPit] {
	if value > 1 {
		return invalid[pit.InPit]()
	}
	return observed(pit.InPit(value == 1))
}

func validateSessionType(value int32) schema.Field[session.Type] {
	var canonical session.Type
	switch {
	case value >= 1 && value <= 4:
		canonical = session.TypePractice
	case value >= 5 && value <= 8:
		canonical = session.TypeQualifying
	case value == 9:
		canonical = session.TypeWarmup
	case value >= 10 && value <= 13:
		canonical = session.TypeRace
	default:
		return invalid[session.Type]()
	}
	return observed(canonical)
}

func bufBool(field schema.Field[bool]) bool { value, present := field.Value(); return present && value }
func finite(value float64) bool             { return !math.IsNaN(value) && !math.IsInf(value, 0) }
func finiteRatio(value float64) bool        { return finite(value) && value >= 0 && value <= 1 }
func readInt32(buf []byte, off int) int32   { return int32(binary.LittleEndian.Uint32(buf[off:])) }
func readInt16(buf []byte, off int) int16   { return int16(binary.LittleEndian.Uint16(buf[off:])) }
func readInt8(buf []byte, off int) int8     { return int8(buf[off]) }
func readFloat64(buf []byte, off int) float64 {
	return math.Float64frombits(binary.LittleEndian.Uint64(buf[off:]))
}

func readString(buf []byte, off, size int) string {
	value := buf[off : off+size]
	if index := strings.IndexByte(string(value), 0); index >= 0 {
		value = value[:index]
	}
	return string(value)
}

func normalizeTrackName(value string) string { return strings.TrimSpace(value) }

func classifyClock(previous, current time.Duration) ClockChange {
	if previous <= 0 || current >= previous {
		return ClockContinuous
	}
	if previous >= 24*time.Hour && current < time.Minute {
		return ClockWrap
	}
	return ClockReset
}
