package lmu

import (
	"encoding/binary"
	"math"
	"testing"

	engineertelemetry "github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// writeVec3 escribe un Vec3 en off (24 bytes). Solo para tests.
func writeVec3(buf []byte, off int, v engineertelemetry.Vec3) {
	binary.LittleEndian.PutUint64(buf[off:], math.Float64bits(v.X))
	binary.LittleEndian.PutUint64(buf[off+8:], math.Float64bits(v.Y))
	binary.LittleEndian.PutUint64(buf[off+16:], math.Float64bits(v.Z))
}

// writeOrientation escribe una matriz 3x3 en off (72 bytes). Solo para tests.
func writeOrientation(buf []byte, off int, o engineertelemetry.Orientation) {
	writeVec3(buf, off, o.Row0)
	writeVec3(buf, off+24, o.Row1)
	writeVec3(buf, off+48, o.Row2)
}

// newSyntheticBuffer construye un buffer mmap válido con geometría conocida para tests.
// playerIdx indica el slot del jugador (0 por defecto).
func newSyntheticBuffer(playerIdx int) []byte {
	buf := make([]byte, objectOutSize)
	buf[telemetryPlayerHasVehicle] = 1
	buf[telemetryPlayerVehicleIdx] = byte(playerIdx)

	// Sesión: 2 vehículos, TrackLength 6500.
	binary.LittleEndian.PutUint32(buf[scoringNumVehicles:], 2)
	binary.LittleEndian.PutUint64(buf[scoringTrackLength:], math.Float64bits(6500.0))

	// Player slot (VehicleTelemetry).
	po := telemetryTelemOffset + playerIdx*telemetryTelemStride
	binary.LittleEndian.PutUint32(buf[po+vehicleTelemetryID:], 11)
	writeVec3(buf, po+vehicleTelemetryPosition, engineertelemetry.Vec3{X: 100, Y: 0, Z: 200})
	writeVec3(buf, po+vehicleTelemetryLocalVel, engineertelemetry.Vec3{X: 0, Y: 0, Z: -50})
	// Orientation identidad (mirando a -Z = adelante).
	writeOrientation(buf, po+vehicleTelemetryOrientation, engineertelemetry.Orientation{
		Row0: engineertelemetry.Vec3{X: 1, Y: 0, Z: 0},
		Row1: engineertelemetry.Vec3{X: 0, Y: 1, Z: 0},
		Row2: engineertelemetry.Vec3{X: 0, Y: 0, Z: 1},
	})

	// VehicleScoring: slot 0 = jugador, slot 1 = oponente a la izquierda (+X).
	writeScoringSlot(buf, 0, 11, "Player", true, false, 5000.0,
		engineertelemetry.Vec3{X: 100, Y: 0, Z: 200},
		engineertelemetry.Orientation{
			Row0: engineertelemetry.Vec3{X: 1},
			Row1: engineertelemetry.Vec3{Y: 1},
			Row2: engineertelemetry.Vec3{Z: 1},
		})
	writeScoringSlot(buf, 1, 22, "Opponent", false, false, 5050.0,
		engineertelemetry.Vec3{X: 103, Y: 0, Z: 200},
		engineertelemetry.Orientation{
			Row0: engineertelemetry.Vec3{X: 1},
			Row1: engineertelemetry.Vec3{Y: 1},
			Row2: engineertelemetry.Vec3{Z: 1},
		})

	return buf
}

func writeScoringSlot(buf []byte, idx int, id int32, name string, isPlayer, inPits bool, lapDist float64, pos engineertelemetry.Vec3, orient engineertelemetry.Orientation) {
	off := vehicleScoringOffset + idx*vehicleScoringStride
	binary.LittleEndian.PutUint32(buf[off+vehicleScoringID:], uint32(id))
	copy(buf[off+vehicleScoringDriverName:], name)
	if isPlayer {
		buf[off+vehicleScoringIsPlayer] = 1
	}
	if inPits {
		buf[off+vehicleScoringInPits] = 1
	}
	binary.LittleEndian.PutUint64(buf[off+vehicleScoringLapDistance:], math.Float64bits(lapDist))
	writeVec3(buf, off+vehicleScoringPosition, pos)
	writeOrientation(buf, off+vehicleScoringOrientation, orient)
	binary.LittleEndian.PutUint64(buf[off+vehicleScoringPathLateral:], math.Float64bits(0.5))
	binary.LittleEndian.PutUint64(buf[off+vehicleScoringTrackEdge:], math.Float64bits(1.5))
}

func TestParseEngineerFrame_PlayerGeometry(t *testing.T) {
	buf := newSyntheticBuffer(0)
	frame := ParseEngineerFrame(buf)
	if frame == nil {
		t.Fatal("expected non-nil frame")
	}
	if frame.Player == nil {
		t.Fatal("expected non-nil player")
	}
	if frame.Player.ID != 11 {
		t.Errorf("player ID = %d, want 11", frame.Player.ID)
	}
	if frame.Player.Position.X != 100 || frame.Player.Position.Z != 200 {
		t.Errorf("player Position = %+v, want {100,0,200}", frame.Player.Position)
	}
	if frame.Player.Orientation.Row2.X != 0 || frame.Player.Orientation.Row2.Z != 1 {
		t.Errorf("player Orientation.Row2 = %+v, want {0,0,1}", frame.Player.Orientation.Row2)
	}
}

func TestParseEngineerFrame_VehicleScoringGeometry(t *testing.T) {
	buf := newSyntheticBuffer(0)
	frame := ParseEngineerFrame(buf)
	if frame == nil {
		t.Fatal("expected non-nil frame")
	}
	if len(frame.Vehicles) != 2 {
		t.Fatalf("vehicles = %d, want 2", len(frame.Vehicles))
	}
	opp := frame.Vehicles[1]
	if opp.ID != 22 {
		t.Errorf("opponent ID = %d, want 22", opp.ID)
	}
	if opp.Position.X != 103 {
		t.Errorf("opponent Position.X = %v, want 103", opp.Position.X)
	}
	if opp.LapDistance != 5050 {
		t.Errorf("opponent LapDistance = %v, want 5050", opp.LapDistance)
	}
	if opp.PathLateral != 0.5 {
		t.Errorf("opponent PathLateral = %v, want 0.5", opp.PathLateral)
	}
	if opp.TrackEdge != 1.5 {
		t.Errorf("opponent TrackEdge = %v, want 1.5", opp.TrackEdge)
	}
}

func TestParseEngineerFrame_BufferTooSmall(t *testing.T) {
	frame := ParseEngineerFrame(make([]byte, 100))
	if frame != nil {
		t.Errorf("expected nil frame for small buffer, got %+v", frame)
	}
}

func TestParseEngineerFrame_PlayerIdxOutOfBounds(t *testing.T) {
	buf := newSyntheticBuffer(0)
	// Forzar playerIdx fuera de rango (200 > 104 slots).
	buf[telemetryPlayerVehicleIdx] = 200
	frame := ParseEngineerFrame(buf)
	if frame == nil {
		t.Fatal("expected non-nil frame even with bad playerIdx")
	}
	// po = 128468 + 200*1888 = 506068 > ObjectOutSize → Player debe ser nil.
	if frame.Player != nil {
		t.Errorf("expected nil player when idx out of bounds, got %+v", frame.Player)
	}
}

func TestParseEngineerFrame_ZeroOrientation(t *testing.T) {
	buf := newSyntheticBuffer(0)
	// Orientation todo ceros del jugador.
	po := telemetryTelemOffset
	writeOrientation(buf, po+vehicleTelemetryOrientation, engineertelemetry.Orientation{})
	frame := ParseEngineerFrame(buf)
	if frame == nil || frame.Player == nil {
		t.Fatal("expected frame and player")
	}
	if frame.Player.Orientation.Row2.X != 0 || frame.Player.Orientation.Row2.Z != 0 {
		t.Errorf("expected zero Orientation, got %+v", frame.Player.Orientation)
	}
}

func TestParseEngineerFrame_NoPlayerVehicle(t *testing.T) {
	buf := newSyntheticBuffer(0)
	buf[telemetryPlayerHasVehicle] = 0
	if frame := ParseEngineerFrame(buf); frame != nil {
		t.Errorf("expected nil when player has no vehicle, got %+v", frame)
	}
}

func TestParseEngineerFrame_DoesNotMutateBuffer(t *testing.T) {
	buf := newSyntheticBuffer(0)
	before := make([]byte, len(buf))
	copy(before, buf)
	_ = ParseEngineerFrame(buf)
	for i, b := range buf {
		if b != before[i] {
			t.Fatalf("buffer mutated at offset %d: %d != %d", i, b, before[i])
		}
	}
}

// TestParseEngineerFrame_GamePhase: el parser debe leer mGamePhase (offset 1740
// dentro de LMUScoringInfo) en el frame de ingeniero para alimentar el gate
// FCY del spotter (LMU-15) y el FlagsMonitor (G1.1).
// Paridad CC: RF2Data.cs:68 enum rF2GamePhase. GamePhase==6 = FullCourseYellow.
func TestParseEngineerFrame_GamePhase(t *testing.T) {
	cases := []struct {
		name string
		val  byte
	}{
		{"GreenFlag", 5},
		{"FullCourseYellow", 6},
		{"SessionStopped", 7},
		{"Garage", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			buf := newSyntheticBuffer(0)
			buf[scoringGamePhase] = tc.val
			frame := ParseEngineerFrame(buf)
			if frame == nil || frame.Session == nil {
				t.Fatal("expected non-nil frame and session")
			}
			if frame.Session.GamePhase != tc.val {
				t.Errorf("GamePhase = %d, want %d", frame.Session.GamePhase, tc.val)
			}
		})
	}
}
