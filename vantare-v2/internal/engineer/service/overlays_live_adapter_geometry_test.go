package service

import (
	"encoding/binary"
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	engineertelemetry "github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// TestSpotter_LiveLMU_FixtureCarLeft: oponente a +X del jugador (mirando +Z=atrás),
// orientación identidad → spotter debe reportar SideLeft.
func TestSpotter_LiveLMU_FixtureCarLeft(t *testing.T) {
	frame := buildSpotterFrame(
		playerPos(engineertelemetry.Vec3{X: 100, Y: 0, Z: 200}),
		identityOrientation(),
		[]engineertelemetry.VehicleScoring{
			scoringVehicle(11, true, engineertelemetry.Vec3{X: 100, Y: 0, Z: 200}, identityOrientation()),
			scoringVehicle(22, false, engineertelemetry.Vec3{X: 103, Y: 0, Z: 200}, identityOrientation()),
		},
	)

	zones := spotter.Classify(frame, spotter.SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone, got %d (%+v)", len(zones), zones)
	}
	if zones[0].Side != spotter.SideLeft {
		t.Errorf("expected SideLeft, got %q", zones[0].Side)
	}
}

// TestSpotter_LiveLMU_FixtureCarRight: simétrico, oponente a -X.
func TestSpotter_LiveLMU_FixtureCarRight(t *testing.T) {
	frame := buildSpotterFrame(
		playerPos(engineertelemetry.Vec3{X: 100, Y: 0, Z: 200}),
		identityOrientation(),
		[]engineertelemetry.VehicleScoring{
			scoringVehicle(11, true, engineertelemetry.Vec3{X: 100, Y: 0, Z: 200}, identityOrientation()),
			scoringVehicle(22, false, engineertelemetry.Vec3{X: 97, Y: 0, Z: 200}, identityOrientation()),
		},
	)

	zones := spotter.Classify(frame, spotter.SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone, got %d", len(zones))
	}
	if zones[0].Side != spotter.SideRight {
		t.Errorf("expected SideRight, got %q", zones[0].Side)
	}
}

// TestSpotter_LiveLMU_YawConsistency: jugador con yaw π/2 (mirando +X).
// Oponente colocado en mundo en (100,0,203) — que en local es detrás (+Z).
// Tras alinear, debe quedar a la izquierda local.
func TestSpotter_LiveLMU_YawConsistency(t *testing.T) {
	// Rotación yaw=π/2: Row2 = (sin(yaw), 0, cos(yaw)) = (1, 0, 0).
	// Local +X = izquierda, Local +Z = atrás.
	yaw90 := engineertelemetry.Orientation{
		Row0: engineertelemetry.Vec3{X: 0, Y: 0, Z: -1},
		Row1: engineertelemetry.Vec3{X: 0, Y: 1, Z: 0},
		Row2: engineertelemetry.Vec3{X: 1, Y: 0, Z: 0},
	}
	frame := buildSpotterFrame(
		playerPos(engineertelemetry.Vec3{X: 100, Y: 0, Z: 200}),
		yaw90,
		[]engineertelemetry.VehicleScoring{
			scoringVehicle(11, true, engineertelemetry.Vec3{X: 100, Y: 0, Z: 200}, yaw90),
			// Oponente 3m detrás (en mundo +Z), que en local del jugador es a la izquierda.
			scoringVehicle(22, false, engineertelemetry.Vec3{X: 100, Y: 0, Z: 203}, yaw90),
		},
	)

	zones := spotter.Classify(frame, spotter.SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone with yaw=π/2, got %d (%+v)", len(zones), zones)
	}
	if zones[0].Side != spotter.SideLeft {
		t.Errorf("expected SideLeft with yaw=π/2, got %q", zones[0].Side)
	}
}

// Helpers de construcción de frames sintéticos para tests de geometría.

func identityOrientation() engineertelemetry.Orientation {
	return engineertelemetry.Orientation{
		Row0: engineertelemetry.Vec3{X: 1, Y: 0, Z: 0},
		Row1: engineertelemetry.Vec3{X: 0, Y: 1, Z: 0},
		Row2: engineertelemetry.Vec3{X: 0, Y: 0, Z: 1},
	}
}

func playerPos(p engineertelemetry.Vec3) *engineertelemetry.PlayerTelemetry {
	return &engineertelemetry.PlayerTelemetry{
		ID:          11,
		Position:    p,
		Orientation: identityOrientation(),
	}
}

func scoringVehicle(id int32, isPlayer bool, pos engineertelemetry.Vec3, orient engineertelemetry.Orientation) engineertelemetry.VehicleScoring {
	return engineertelemetry.VehicleScoring{
		ID:          id,
		DriverName:  "V",
		IsPlayer:    isPlayer,
		InPits:      false,
		LapDistance: 5000,
		Position:    pos,
		Orientation: orient,
	}
}

func buildSpotterFrame(player *engineertelemetry.PlayerTelemetry, orient engineertelemetry.Orientation, vehicles []engineertelemetry.VehicleScoring) *engineertelemetry.Frame {
	player.Orientation = orient
	return &engineertelemetry.Frame{
		Connected:        true,
		PlayerHasVehicle: true,
		Player:           player,
		Vehicles:         vehicles,
	}
}

// Sanity check: el helper de buffer produce bytes escribibles del tamaño correcto.
func TestBuildEngineerAdapterBuffer_SanitySize(t *testing.T) {
	buf := buildSyntheticEngineerFrameBuffer()
	if len(buf) != 324820 {
		t.Errorf("buffer size = %d, want 324820", len(buf))
	}
	// Verificar que player idx está marcado.
	if buf[128465] != 0 {
		t.Errorf("player idx = %d, want 0", buf[128465])
	}
	if buf[128466] != 1 {
		t.Errorf("player has vehicle = %d, want 1", buf[128466])
	}
	// NumVehicles = 2.
	if n := binary.LittleEndian.Uint32(buf[1736:]); n != 2 {
		t.Errorf("NumVehicles = %d, want 2", n)
	}
	// Player X = 100.
	if x := math.Float64frombits(binary.LittleEndian.Uint64(buf[128468+160:])); x != 100 {
		t.Errorf("player X = %v, want 100", x)
	}
}
