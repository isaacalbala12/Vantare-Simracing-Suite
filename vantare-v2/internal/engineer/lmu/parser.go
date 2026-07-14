// Package lmu decodifica frames de telemetría de Ingeniero desde el mismo buffer
// mmap de Le Mans Ultimate que ya alimenta los widgets de Overlays.
//
// Este paquete NO abre un segundo reader. Reutiliza el buffer crudo entregado por
// EnrichedLMUSource.Read() y produce un *telemetry.Frame (modelo interno de
// ingeniero) con la geometría (Position, Orientation) que el spotter necesita.
//
// No modifica pkg/models.Telemetry ni el JSON público de widgets.
package lmu

import (
	"encoding/binary"
	"math"
	"time"

	engineertelemetry "github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Offsets públicos reutilizados del parser de widgets (internal/telemetry/lmu).
// Se duplican aquí como constantes privadas para no crear dependencia cruzada
// de paquetes y mantener internal/engineer autónomo.
const (
	objectOutSize             = 324820
	telemetryTelemStride      = 1888
	telemetryTelemOffset      = 128468
	vehicleScoringOffset      = 2192
	vehicleScoringStride      = 584
	scoringInfoOffset         = 1632
	scoringInfoSize           = 548
	telemetryPlayerVehicleIdx = 128465
	telemetryPlayerHasVehicle = 128466
	scoringNumVehicles        = 1736
	scoringGamePhase          = 1740
)

// Offsets de scoring ya leídos por el parser público (necesarios también aquí
// para construir el VehicleScoring de ingeniero con los campos que el spotter
// consume: ID, IsPlayer, InPits, LapDistance, BestLapTime, VehicleClass).
const (
	vehicleScoringID           = 0
	vehicleScoringDriverName   = 4
	vehicleScoringVehicleName  = 36
	vehicleScoringLapDistance  = 104
	vehicleScoringBestLapTime  = 144
	vehicleScoringIsPlayer     = 196
	vehicleScoringInPits       = 198
	vehicleScoringVehicleClass = 200
)

// readFloat64 lee un float64 little-endian en off. Devuelve 0 si el offset queda
// fuera del buffer, sin panic.
func readFloat64(buf []byte, off int) float64 {
	if off < 0 || off+8 > len(buf) {
		return 0
	}
	return math.Float64frombits(binary.LittleEndian.Uint64(buf[off:]))
}

// readInt32 lee un int32 little-endian en off. Devuelve 0 si fuera de rango.
func readInt32(buf []byte, off int) int32 {
	if off < 0 || off+4 > len(buf) {
		return 0
	}
	return int32(binary.LittleEndian.Uint32(buf[off:]))
}

// readByte lee un byte en off. Devuelve 0 si fuera de rango.
func readByte(buf []byte, off int) byte {
	if off < 0 || off >= len(buf) {
		return 0
	}
	return buf[off]
}

// readVec3 lee un Vec3 (3 float64 consecutivos) en off. Devuelve cero si fuera
// de rango, sin panic.
func pitStateStr(v byte) string {
	switch v {
	case 0:
		return "NONE"
	case 1:
		return "REQUEST"
	case 2:
		return "ENTERING"
	case 3:
		return "STOPPED"
	case 4:
		return "EXITING"
	default:
		return ""
	}
}

func readVec3(buf []byte, off int) engineertelemetry.Vec3 {
	if off < 0 || off+24 > len(buf) {
		return engineertelemetry.Vec3{}
	}
	return engineertelemetry.Vec3{
		X: math.Float64frombits(binary.LittleEndian.Uint64(buf[off:])),
		Y: math.Float64frombits(binary.LittleEndian.Uint64(buf[off+8:])),
		Z: math.Float64frombits(binary.LittleEndian.Uint64(buf[off+16:])),
	}
}

// readOrientation lee una matriz 3x3 de float64 (9 valores, 72 bytes) en off.
// Convención rFactor/LMU: Row2 = eje Z local en mundo (hacia atrás);
// el spotter usa Row2.X y Row2.Z para calcular el yaw.
// Devuelve Orientation{} si fuera de rango, sin panic.
func readOrientation(buf []byte, off int) engineertelemetry.Orientation {
	if off < 0 || off+72 > len(buf) {
		return engineertelemetry.Orientation{}
	}
	readRow := func(base int) engineertelemetry.Vec3 {
		return engineertelemetry.Vec3{
			X: math.Float64frombits(binary.LittleEndian.Uint64(buf[base:])),
			Y: math.Float64frombits(binary.LittleEndian.Uint64(buf[base+8:])),
			Z: math.Float64frombits(binary.LittleEndian.Uint64(buf[base+16:])),
		}
	}
	return engineertelemetry.Orientation{
		Row0: readRow(off),
		Row1: readRow(off + 24),
		Row2: readRow(off + 48),
	}
}

// readString lee un string ASCII terminado en cero de hasta max bytes desde off.
func readString(buf []byte, off, max int) string {
	if off < 0 || off >= len(buf) {
		return ""
	}
	end := off + max
	if end > len(buf) {
		end = len(buf)
	}
	chunk := buf[off:end]
	for i, b := range chunk {
		if b == 0 {
			return string(chunk[:i])
		}
	}
	return string(chunk)
}

// ParseEngineerFrame decodifica el buffer mmap de LMU en un *telemetry.Frame
// de ingeniero con la geometría que el spotter consume.
//
// Devuelve nil sin panic si:
//   - el buffer es nil o menor que ObjectOutSize;
//   - no hay vehículo del jugador (telemetryPlayerHasVehicle == 0).
//
// No muta el buffer: solo lectura.
func ParseEngineerFrame(buf []byte) *engineertelemetry.Frame {
	if len(buf) < objectOutSize {
		return nil
	}
	if buf[telemetryPlayerHasVehicle] == 0 {
		return nil
	}

	playerIdx := int(readByte(buf, telemetryPlayerVehicleIdx))
	frame := &engineertelemetry.Frame{
		Connected:        true,
		PlayerHasVehicle: true,
		TimestampUnixMS:  time.Now().UnixMilli(),
	}

	// Player desde VehicleTelemetry (slot preferido por el spotter).
	po := telemetryTelemOffset + playerIdx*telemetryTelemStride
	if po+telemetryTelemStride <= len(buf) {
		frame.Player = parsePlayerEngineerTelemetry(buf, po)
	}

	// Sesión.
	frame.Session = parseSessionEngineer(buf)

	// Vehículos (oponentes + jugador) desde VehicleScoring.
	if frame.Session != nil {
		frame.Vehicles = parseVehicleEngineerScoring(buf, int(frame.Session.NumVehicles))
	}

	return frame
}

func parsePlayerEngineerTelemetry(buf []byte, po int) *engineertelemetry.PlayerTelemetry {
	return &engineertelemetry.PlayerTelemetry{
		ID:            readInt32(buf, po+vehicleTelemetryID),
		Position:      readVec3(buf, po+vehicleTelemetryPosition),
		LocalVelocity: readVec3(buf, po+vehicleTelemetryLocalVel),
		Orientation:   readOrientation(buf, po+vehicleTelemetryOrientation),
		// Temperaturas y desgaste (u8, Celsius / 0-100% wear).
		// Offsets identificados en 2ª captura driving — ver offsets.go.
		EngineWaterTemp: int32(readByte(buf, po+engineWaterTempOff)),
		EngineOilTemp:   int32(readByte(buf, po+engineOilTempOff)),
		TyreTempFL:      int32(readByte(buf, po+tyreTempFLOffset)),
		TyreTempFR:      int32(readByte(buf, po+tyreTempFROffset)),
		TyreTempRL:      int32(readByte(buf, po+tyreTempRLOffset)),
		TyreTempRR:      int32(readByte(buf, po+tyreTempRROffset)),
		BrakeTempFL:     int32(readByte(buf, po+brakeTempFLOffset)),
		BrakeTempFR:     int32(readByte(buf, po+brakeTempFROffset)),
		BrakeTempRL:     int32(readByte(buf, po+brakeTempRLOffset)),
		BrakeTempRR:     int32(readByte(buf, po+brakeTempRROffset)),
		TyreWearFL:      readByte(buf, po+tyreWearFLOffset),
		TyreWearFR:      readByte(buf, po+tyreWearFROffset),
		TyreWearRL:      readByte(buf, po+tyreWearRLOffset),
		TyreWearRR:      readByte(buf, po+tyreWearRROffset),
		// Wheel data from LMUWheel struct (decoded as doubles via DecodeWheels).
		WheelBrakeTempFL: kelvinToCelsius(readFloat64(buf, po+WheelArrayBaseOffset+0*WheelStride+WheelBrakeTemp)),
		WheelBrakeTempFR: kelvinToCelsius(readFloat64(buf, po+WheelArrayBaseOffset+1*WheelStride+WheelBrakeTemp)),
		WheelBrakeTempRL: kelvinToCelsius(readFloat64(buf, po+WheelArrayBaseOffset+2*WheelStride+WheelBrakeTemp)),
		WheelBrakeTempRR: kelvinToCelsius(readFloat64(buf, po+WheelArrayBaseOffset+3*WheelStride+WheelBrakeTemp)),
		WheelSurfaceType: readByte(buf, po+WheelArrayBaseOffset+0*WheelStride+WheelSurfaceType),
	}
}

func parseSessionEngineer(buf []byte) *engineertelemetry.SessionInfo {
	if len(buf) < scoringInfoOffset+scoringInfoSize {
		return nil
	}
	sessionLaps := readInt32(buf, scoringSessionLaps)
	if sessionLaps < 0 || sessionLaps > 9999 {
		sessionLaps = 0
	}
	return &engineertelemetry.SessionInfo{
		TrackName:                readString(buf, 1632, 64),
		SessionType:              readInt32(buf, scoringSessionType),
		SessionTime:              readFloat64(buf, scoringCurrentET),
		TimeRemainingInGamePhase: readFloat64(buf, scoringSessionTime),
		NumVehicles:              readInt32(buf, scoringNumVehicles),
		TrackLength:              readFloat64(buf, scoringTrackLength),
		SessionLapsTotal:         int32(sessionLaps),
		// GamePhase: 0=Garage, 1=WarmUp, 2=GridWalk, 3=Formation,
		// 4=Countdown, 5=GreenFlag, 6=FullCourseYellow/SC, 7=SessionStopped,
		// 8=SessionOver, 9=Paused. Same enum as CC rF2GamePhase (RF2Data.cs:68).
		// Used by FlagsMonitor and the spotter FCY-pause gate.
		GamePhase: readByte(buf, scoringGamePhase),
	}
}

func parseVehicleEngineerScoring(buf []byte, count int) []engineertelemetry.VehicleScoring {
	if count <= 0 {
		return nil
	}
	maxCount := count
	if maxCount > 104 {
		maxCount = 104
	}

	out := make([]engineertelemetry.VehicleScoring, 0, maxCount)
	for i := 0; i < maxCount; i++ {
		off := vehicleScoringOffset + i*vehicleScoringStride
		if off+vehicleScoringStride > len(buf) {
			break
		}
		id := readInt32(buf, off+vehicleScoringID)
		name := readString(buf, off+vehicleScoringDriverName, 32)
		if id < 0 || name == "" {
			continue
		}
		pitState := readByte(buf, off+vehicleScoringPitState)
		finishStatus := readByte(buf, off+vehicleScoringFinishStatus)
		finishStr := ""
		switch finishStatus {
		case 1:
			finishStr = "FINISHED"
		case 2:
			finishStr = "DNF"
		case 3:
			finishStr = "DSQ"
		}
		sector := readByte(buf, off+vehicleScoringSector)
		sectorStr := ""
		switch sector {
		case 0:
			sectorStr = "SECTOR1"
		case 1:
			sectorStr = "SECTOR2"
		case 2:
			sectorStr = "SECTOR3"
		}
		out = append(out, engineertelemetry.VehicleScoring{
			ID:               id,
			DriverName:       name,
			VehicleName:      readString(buf, off+vehicleScoringVehicleName, 64),
			VehicleClass:     readString(buf, off+vehicleScoringVehicleClass, 32),
			Place:            readByte(buf, off+vehicleScoringPlace),
			TotalLaps:        int16(readInt32(buf, off+vehicleScoringTotalLaps)),
			IsPlayer:         readByte(buf, off+vehicleScoringIsPlayer) != 0,
			InPits:           readByte(buf, off+vehicleScoringInPits) != 0 || (pitState != 0 && pitState != 1),
			PitState:         pitStateStr(pitState),
			Sector:           sectorStr,
			FinishStatus:     finishStr,
			LapDistance:      readFloat64(buf, off+vehicleScoringLapDistance),
			BestLapTime:      readFloat64(buf, off+vehicleScoringBestLapTime),
			LastLapTime:      readFloat64(buf, off+vehicleScoringLastLapTime),
			EstimatedLapTime: readFloat64(buf, off+vehicleScoringEstimatedLapTime),
			TimeBehindLeader: readFloat64(buf, off+vehicleScoringTimeBehindLeader),
			TimeBehindNext:   readFloat64(buf, off+vehicleScoringTimeBehindNext),
			LapsBehindLeader: readInt32(buf, off+vehicleScoringLapsBehindLeader),
			LapsBehindNext:   readInt32(buf, off+vehicleScoringLapsBehindNext),
			Position:         readVec3(buf, off+vehicleScoringPosition),
			Orientation:      readOrientation(buf, off+vehicleScoringOrientation),
			PathLateral:      readFloat64(buf, off+vehicleScoringPathLateral),
			TrackEdge:        readFloat64(buf, off+vehicleScoringTrackEdge),
			FuelFraction:     float64(readByte(buf, off+vehicleScoringFuelFraction)),
		})
	}
	return out
}
