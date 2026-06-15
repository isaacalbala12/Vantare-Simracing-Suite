package lmu

import (
	"encoding/binary"
	"math"
)

type vehicleSpec struct {
	offset       int
	id           uint32
	name         string
	place        byte
	isPlayer     byte
	lapDistance  float64
	bestLapTime  float64
	estLapTime   float64
	totalLaps    int16
	vehicleClass string
}

func writeFloat64(buf []byte, off int, v float64) {
	binary.LittleEndian.PutUint64(buf[off:], math.Float64bits(v))
}

func writeInt32(buf []byte, off int, v uint32) {
	binary.LittleEndian.PutUint32(buf[off:], v)
}

func writeInt16(buf []byte, off int, v int16) {
	binary.LittleEndian.PutUint16(buf[off:], uint16(v))
}

func writeString(buf []byte, off int, s string, max int) {
	if off >= len(buf) {
		return
	}
	end := off + max
	if end > len(buf) {
		end = len(buf)
	}
	copy(buf[off:end], s)
}

func setPlayerSpeedMPS(buf []byte, po int, speedMPS float64) {
	binary.LittleEndian.PutUint64(buf[po+vehicleTelemetryLocalVel:], math.Float64bits(speedMPS))
}

// SetPlayerSpeedMPS overwrites the player slot local velocity X (m/s) for tests.
func SetPlayerSpeedMPS(buf []byte, speedMPS float64) {
	if len(buf) < ObjectOutSize {
		return
	}
	setPlayerSpeedMPS(buf, telemetryTelemOffset, speedMPS)
}

func writeVehicle(buf []byte, v vehicleSpec) {
	o := v.offset
	writeInt32(buf, o+vehicleScoringID, v.id)
	writeString(buf, o+vehicleScoringDriverName, v.name, 32)
	writeString(buf, o+vehicleScoringVehicleClass, v.vehicleClass, 32)
	buf[o+vehicleScoringPlace] = v.place
	buf[o+vehicleScoringIsPlayer] = v.isPlayer
	writeInt16(buf, o+vehicleScoringTotalLaps, v.totalLaps)
	writeFloat64(buf, o+vehicleScoringLapDistance, v.lapDistance)
	writeFloat64(buf, o+vehicleScoringBestLapTime, v.bestLapTime)
	writeFloat64(buf, o+vehicleScoringEstimatedLapTime, v.estLapTime)
}

// BuildSyntheticBuffer returns a valid-sized buffer with known test values.
func BuildSyntheticBuffer() []byte {
	buf := make([]byte, ObjectOutSize)

	writeString(buf, scoringTrackName, "Spa", 64)
	writeInt32(buf, scoringSession, 10)
	buf[scoringGamePhase] = 5
	writeString(buf, scoringPlayerName, "TestDriver", 32)

	po := telemetryTelemOffset

	const numVehicles = 10
	binary.LittleEndian.PutUint32(buf[scoringNumVehicles:], uint32(numVehicles))

	vehicles := []vehicleSpec{
		{id: 11, name: "TestDriver", vehicleClass: "HYPERCAR", place: 4, isPlayer: 1,
			lapDistance: 5000, bestLapTime: 105.5, estLapTime: 106.0, totalLaps: 5},
		{id: 1, name: "Niek S.", vehicleClass: "HYPERCAR", place: 1,
			lapDistance: 5200, bestLapTime: 103.5, estLapTime: 104.0, totalLaps: 6},
		{id: 2, name: "Cedric M.", vehicleClass: "HYPERCAR", place: 2,
			lapDistance: 5100, bestLapTime: 104.2, estLapTime: 104.5, totalLaps: 5},
		{id: 3, name: "Oleg N.", vehicleClass: "LMP2", place: 3,
			lapDistance: 5050, bestLapTime: 108.8, estLapTime: 109.0, totalLaps: 5},
		{id: 4, name: "Rene A.", vehicleClass: "HYPERCAR", place: 5,
			lapDistance: 4800, bestLapTime: 106.1, estLapTime: 106.5, totalLaps: 5},
		{id: 5, name: "Marco S.", vehicleClass: "LMP3", place: 6,
			lapDistance: 4400, bestLapTime: 112.5, estLapTime: 113.0, totalLaps: 5},
		{id: 6, name: "Tom B.", vehicleClass: "LMGT3", place: 7,
			lapDistance: 4300, bestLapTime: 118.3, estLapTime: 119.0, totalLaps: 5},
		{id: 7, name: "Yuki T.", vehicleClass: "HYPERCAR", place: 8,
			lapDistance: 4000, bestLapTime: 107.2, estLapTime: 107.5, totalLaps: 5},
		{id: 8, name: "Alex P.", vehicleClass: "LMP2", place: 9,
			lapDistance: 3800, bestLapTime: 110.1, estLapTime: 110.5, totalLaps: 5},
		{id: 9, name: "Lars M.", vehicleClass: "LMGT3", place: 10,
			lapDistance: 3500, bestLapTime: 120.0, estLapTime: 120.5, totalLaps: 5},
	}

	for i, v := range vehicles {
		v.offset = vehicleScoringOffset + i*vehicleScoringStride
		writeVehicle(buf, v)
	}

	buf[telemetryPlayerVehicleIdx] = 0
	buf[telemetryPlayerHasVehicle] = 1

	setPlayerSpeedMPS(buf, po, 15)
	binary.LittleEndian.PutUint32(buf[po+vehicleTelemetryGear:], 4)
	writeFloat64(buf, po+vehicleTelemetryEngineRPM, 7200)
	writeFloat64(buf, po+vehicleTelemetryFuel, 45.2)

	return buf
}
