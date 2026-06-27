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
)

// Offsets de scoring ya leídos por el parser público (necesarios también aquí
// para construir el VehicleScoring de ingeniero con los campos que el spotter
// consume: ID, IsPlayer, InPits, LapDistance).
const (
	vehicleScoringID          = 0
	vehicleScoringDriverName  = 4
	vehicleScoringIsPlayer    = 196
	vehicleScoringInPits      = 198
	vehicleScoringLapDistance = 104
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
	}
}

func parseSessionEngineer(buf []byte) *engineertelemetry.SessionInfo {
	if len(buf) < scoringInfoOffset+scoringInfoSize {
		return nil
	}
	return &engineertelemetry.SessionInfo{
		TrackName:   readString(buf, 1632, 64),
		NumVehicles: readInt32(buf, scoringNumVehicles),
		TrackLength: readFloat64(buf, scoringTrackLength),
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
		out = append(out, engineertelemetry.VehicleScoring{
			ID:          id,
			DriverName:  name,
			IsPlayer:    readByte(buf, off+vehicleScoringIsPlayer) != 0,
			InPits:      readByte(buf, off+vehicleScoringInPits) != 0,
			LapDistance: readFloat64(buf, off+vehicleScoringLapDistance),
			Position:    readVec3(buf, off+vehicleScoringPosition),
			Orientation: readOrientation(buf, off+vehicleScoringOrientation),
			PathLateral: readFloat64(buf, off+vehicleScoringPathLateral),
			TrackEdge:   readFloat64(buf, off+vehicleScoringTrackEdge),
		})
	}
	return out
}
