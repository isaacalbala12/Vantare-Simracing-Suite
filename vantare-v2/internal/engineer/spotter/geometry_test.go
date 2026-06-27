package spotter

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func TestClassify_LeftOpponent(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 2.8, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone, got %d", len(zones))
	}
	if zones[0].Side != SideLeft {
		t.Errorf("expected SideLeft, got %s", zones[0].Side)
	}
	if zones[0].VehicleID != 2 {
		t.Errorf("expected VehicleID 2, got %d", zones[0].VehicleID)
	}
	if zones[0].LateralM != 2.8 {
		t.Errorf("expected LateralM 2.8, got %f", zones[0].LateralM)
	}
	if zones[0].ForwardM != 0.0 {
		t.Errorf("expected ForwardM 0.0, got %f", zones[0].ForwardM)
	}
}

func TestClassify_RightOpponent(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: -2.8, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone, got %d", len(zones))
	}
	if zones[0].Side != SideRight {
		t.Errorf("expected SideRight, got %s", zones[0].Side)
	}
	if zones[0].VehicleID != 2 {
		t.Errorf("expected VehicleID 2, got %d", zones[0].VehicleID)
	}
}

func TestClassify_FarOpponentIgnored(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 21.0, Y: 0, Z: 0}, // CrewChief track zone is 20m.
			},
			{
				ID:          3,
				LapDistance: 108,
				Position:    telemetry.Vec3{X: 2.8, Y: 0, Z: 8.0}, // outside car length.
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Errorf("expected 0 zones, got %d", len(zones))
	}
}

func TestClassify_PitOpponentIgnored(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				InPits:      true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: -2.8, Y: 0, Z: 0},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Errorf("expected 0 zones, got %d", len(zones))
	}
}

func TestClassify_TwoOpponents(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: -2.8, Y: 0, Z: 0}, // Right side
			},
			{
				ID:          3,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 2.8, Y: 0, Z: 0}, // Left side
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 2 {
		t.Fatalf("expected 2 zones, got %d", len(zones))
	}

	// Should be sorted by lateral: Right (-2.8) then Left (2.8)
	if zones[0].Side != SideRight || zones[0].VehicleID != 2 {
		t.Errorf("expected first zone to be vehicle 2 on SideRight, got ID %d, side %s", zones[0].VehicleID, zones[0].Side)
	}
	if zones[1].Side != SideLeft || zones[1].VehicleID != 3 {
		t.Errorf("expected second zone to be vehicle 3 on SideLeft, got ID %d, side %s", zones[1].VehicleID, zones[1].Side)
	}
}

func TestClassify_FallbackToFramePlayer(t *testing.T) {
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			Orientation: telemetry.Orientation{
				// Custom orientation: local +X (left) points toward world +Z.
				Row0: telemetry.Vec3{X: 0, Y: 0, Z: -1},
				Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
				Row2: telemetry.Vec3{X: 1, Y: 0, Z: 0},
			},
			Position: telemetry.Vec3{X: 0, Y: 0, Z: 0},
			Speed:    MinSpotterSpeedMPS + 1.0, // en pista, no parado (gate de velocidad)
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				// Zero orientation on scoring object
				Orientation: telemetry.Orientation{},
			},
			{
				ID:          2,
				LapDistance: 100,
				// Opponent is at world +Z, matching local +X (left).
				Position: telemetry.Vec3{X: 0, Y: 0, Z: 2.8},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone, got %d", len(zones))
	}
	if zones[0].Side != SideLeft {
		t.Errorf("expected SideLeft due to rotation, got %s", zones[0].Side)
	}
}

func TestClassify_PrefersLivePlayerOrientationOverScoringOrientation(t *testing.T) {
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:       1,
			Position: telemetry.Vec3{X: 0, Y: 0, Z: 0},
			Speed:    MinSpotterSpeedMPS + 1.0, // en pista (gate de velocidad)
			Orientation: telemetry.Orientation{
				Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
				Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
				Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
			},
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: -1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: -2.8, Y: 0, Z: 0},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone, got %d", len(zones))
	}
	if zones[0].Side != SideRight {
		t.Fatalf("expected live player orientation to classify opponent as right, got %s", zones[0].Side)
	}
}

func TestClassify_FallbackToIdentity(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{}, // Zero
			},
			{
				ID:          2,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 2.8, Y: 0, Z: 0},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone, got %d", len(zones))
	}
	if zones[0].Side != SideLeft {
		t.Errorf("expected SideLeft, got %s", zones[0].Side)
	}
}

func TestClassify_SingleVehicleFallback(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          42,
				IsPlayer:    false, // IsPlayer not set, but it's the only vehicle in the frame
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if zones == nil {
		t.Fatal("expected non-nil response for found player")
	}
	if len(zones) != 0 {
		t.Errorf("expected 0 zones, got %d", len(zones))
	}
}

func TestClassify_RearEndCollision(t *testing.T) {
	frame := &telemetry.Frame{
		Session: &telemetry.SessionInfo{
			TrackLength: 6000,
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 500,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 495,                                   // 5m behind on track (rear-end collision)
				Position:    telemetry.Vec3{X: 1.0, Y: 0, Z: -5.0}, // slightly right + behind in 3D
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Errorf("expected 0 zones (rear-end collision ignored), got %d zones: %v", len(zones), zones)
	}
}

func TestClassify_ParallelWheelOverlap(t *testing.T) {
	frame := &telemetry.Frame{
		Session: &telemetry.SessionInfo{
			TrackLength: 6000,
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 500,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 503,                                   // 3m ahead on track (wheel overlap, parallel)
				Position:    telemetry.Vec3{X: -2.8, Y: 0, Z: 3.0}, // right + 3m ahead in 3D
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone (parallel wheel overlap), got %d", len(zones))
	}
	if zones[0].Side != SideRight {
		t.Errorf("expected SideRight, got %s", zones[0].Side)
	}
}

func TestClassify_LapWraparound(t *testing.T) {
	frame := &telemetry.Frame{
		Session: &telemetry.SessionInfo{
			TrackLength: 6000,
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 5995, // near end of lap
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 5, // just past start/finish
				Position:    telemetry.Vec3{X: -2.8, Y: 0, Z: -10.0},
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
		},
	}

	// Raw diff = 5 - 5995 = -5990, normalized = -5990 + 6000 = 10 (10m ahead)
	// 10m > ForwardM=5.2 (sens normal uses length 4.5m), so should NOT be detected (too far ahead)
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Errorf("expected 0 zones (10m ahead after wraparound), got %d", len(zones))
	}
}

func frameWithPlayerAndOpponent(playerPos, oppPos telemetry.Vec3) *telemetry.Frame {
	return &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    playerPos,
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
			{
				ID:          2,
				LapDistance: 100,
				Position:    oppPos,
				Orientation: telemetry.Orientation{
					Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
					Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
					Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
				},
			},
		},
	}
}

func TestClassify_CrewChiefPositiveAlignedXIsLeft(t *testing.T) {
	frame := frameWithPlayerAndOpponent(
		telemetry.Vec3{X: 0, Y: 0, Z: 0},
		telemetry.Vec3{X: 2.0, Y: 0, Z: -1.0},
	)
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 || zones[0].Side != SideLeft {
		t.Fatalf("zones=%+v", zones)
	}
}

func TestClassify_CrewChiefNegativeAlignedXIsRight(t *testing.T) {
	frame := frameWithPlayerAndOpponent(
		telemetry.Vec3{X: 0, Y: 0, Z: 0},
		telemetry.Vec3{X: -2.0, Y: 0, Z: -1.0},
	)
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 || zones[0].Side != SideRight {
		t.Fatalf("zones=%+v", zones)
	}
}

func TestClassify_CrewChiefTrackZoneAllowsWideNearbyOpponent(t *testing.T) {
	frame := frameWithPlayerAndOpponent(
		telemetry.Vec3{X: 0, Y: 0, Z: 0},
		telemetry.Vec3{X: 5.0, Y: 0, Z: 0},
	)
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 || zones[0].Side != SideLeft {
		t.Fatalf("expected nearby opponent within 20m track zone to be detected, zones=%+v", zones)
	}
}

func TestClassify_DoesNotTreatWorldOriginOpponentAsInvalid(t *testing.T) {
	frame := frameWithPlayerAndOpponent(
		telemetry.Vec3{X: -2.0, Y: 0, Z: 0},
		telemetry.Vec3{X: 0, Y: 0, Z: 0},
	)
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 || zones[0].Side != SideLeft {
		t.Fatalf("expected origin opponent to be classified when relative position is valid, zones=%+v", zones)
	}
}

func TestClassify_IgnoresOpponentInPits(t *testing.T) {
	frame := frameWithPlayerAndOpponent(telemetry.Vec3{}, telemetry.Vec3{X: 2, Z: -1})
	frame.Vehicles[1].InPits = true
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Fatalf("zones=%+v", zones)
	}
}

func TestClassify_IgnoresInvalidOpponentLapDistance(t *testing.T) {
	frame := frameWithPlayerAndOpponent(telemetry.Vec3{}, telemetry.Vec3{X: 2, Z: -1})
	frame.Vehicles[1].LapDistance = -1
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Fatalf("zones=%+v", zones)
	}
}

func TestClassify_IgnoresPlayerInPits(t *testing.T) {
	frame := frameWithPlayerAndOpponent(telemetry.Vec3{}, telemetry.Vec3{X: 2, Z: -1})
	frame.Vehicles[0].InPits = true
	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Fatalf("zones=%+v", zones)
	}
}

func TestClassifyWithActiveSides_ExistingOverlapLeftUsesClearGap(t *testing.T) {
	frame := frameWithPlayerAndOpponent(
		telemetry.Vec3{X: 0, Y: 0, Z: 0},
		telemetry.Vec3{X: 2.0, Y: 0, Z: 4.95},
	)

	zones := ClassifyWithActiveSides(frame, SensitivityNormal, ActiveSides{Left: true})

	if len(zones) != 1 {
		t.Fatalf("expected active left overlap to remain in zone, got %d zones: %+v", len(zones), zones)
	}
	if zones[0].Side != SideLeft {
		t.Fatalf("expected SideLeft, got %s", zones[0].Side)
	}
}

func TestClassifyWithActiveSides_NoExistingOverlapLeftRejectsClearGap(t *testing.T) {
	frame := frameWithPlayerAndOpponent(
		telemetry.Vec3{X: 0, Y: 0, Z: 0},
		telemetry.Vec3{X: 2.0, Y: 0, Z: 4.95},
	)

	zones := ClassifyWithActiveSides(frame, SensitivityNormal, ActiveSides{})

	if len(zones) != 0 {
		t.Fatalf("expected inactive left opponent outside new-overlap range to be rejected, zones=%+v", zones)
	}
}

func TestClassifyWithActiveSides_ExistingOverlapRightUsesClearGap(t *testing.T) {
	frame := frameWithPlayerAndOpponent(
		telemetry.Vec3{X: 0, Y: 0, Z: 0},
		telemetry.Vec3{X: -2.0, Y: 0, Z: 4.95},
	)

	zones := ClassifyWithActiveSides(frame, SensitivityNormal, ActiveSides{Right: true})

	if len(zones) != 1 {
		t.Fatalf("expected active right overlap to remain in zone, got %d zones: %+v", len(zones), zones)
	}
	if zones[0].Side != SideRight {
		t.Fatalf("expected SideRight, got %s", zones[0].Side)
	}
}

func TestClassifyWithActiveSides_ExistingOverlapBothSides(t *testing.T) {
	frame := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:          1,
				IsPlayer:    true,
				LapDistance: 100,
				Position:    telemetry.Vec3{X: 0, Y: 0, Z: 0},
				Orientation: telemetry.Orientation{Row2: telemetry.Vec3{Z: 1}},
			},
			{ID: 2, LapDistance: 100, Position: telemetry.Vec3{X: 2.0, Y: 0, Z: 4.95}},
			{ID: 3, LapDistance: 100, Position: telemetry.Vec3{X: -2.0, Y: 0, Z: 4.95}},
		},
	}

	zones := ClassifyWithActiveSides(frame, SensitivityNormal, ActiveSides{Left: true, Right: true})

	if len(zones) != 2 {
		t.Fatalf("expected both active sides to remain in zone, got %d zones: %+v", len(zones), zones)
	}
	if zones[0].Side != SideRight || zones[1].Side != SideLeft {
		t.Fatalf("expected deterministic right then left ordering, zones=%+v", zones)
	}
}

// Speed gate: Classify debe silenciar el spotter cuando el jugador va por
// debajo de MinSpotterSpeedMPS (paridad CC NoisyCartesianCoordinateSpotter.cs:297).
func TestClassify_PlayerBelowMinSpeed_NoZones(t *testing.T) {
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:    1,
			Speed: MinSpotterSpeedMPS - 1.0, // por debajo del umbral
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 100, Position: telemetry.Vec3{X: 0, Y: 0, Z: 0}},
			{ID: 2, LapDistance: 100, Position: telemetry.Vec3{X: 2.8, Y: 0, Z: 0}}, // oponente en overlap
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 0 {
		t.Fatalf("expected 0 zones when player below min speed, got %d: %+v", len(zones), zones)
	}
}

func TestClassify_PlayerAtMinSpeed_ZonesReturned(t *testing.T) {
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:    1,
			Speed: MinSpotterSpeedMPS, // exactamente en el umbral -> debe pasar (gate usa <, no <=)
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 100, Position: telemetry.Vec3{X: 0, Y: 0, Z: 0}},
			{ID: 2, LapDistance: 100, Position: telemetry.Vec3{X: 2.8, Y: 0, Z: 0}},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone at exactly min speed, got %d", len(zones))
	}
	if zones[0].Side != SideLeft {
		t.Errorf("expected SideLeft, got %s", zones[0].Side)
	}
}

func TestClassify_PlayerAboveMinSpeed_ZonesReturned(t *testing.T) {
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:    1,
			Speed: MinSpotterSpeedMPS + 10.0,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 100, Position: telemetry.Vec3{X: 0, Y: 0, Z: 0}},
			{ID: 2, LapDistance: 100, Position: telemetry.Vec3{X: 2.8, Y: 0, Z: 0}},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone above min speed, got %d", len(zones))
	}
	if zones[0].Side != SideLeft {
		t.Errorf("expected SideLeft, got %s", zones[0].Side)
	}
}

// Si frame.Player es nil (player resuelto solo por VehicleScoring fallback),
// el gate de velocidad no aplica — comportamiento existente se mantiene.
func TestClassify_PlayerNilSpeed_NoGateApplied(t *testing.T) {
	frame := &telemetry.Frame{
		// Player = nil intencionalmente
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 100, Position: telemetry.Vec3{X: 0, Y: 0, Z: 0}},
			{ID: 2, LapDistance: 100, Position: telemetry.Vec3{X: 2.8, Y: 0, Z: 0}},
		},
	}

	zones := Classify(frame, SensitivityNormal)
	if len(zones) != 1 {
		t.Fatalf("expected 1 zone when Player is nil (gate not applied), got %d", len(zones))
	}
	if zones[0].Side != SideLeft {
		t.Errorf("expected SideLeft, got %s", zones[0].Side)
	}
}
