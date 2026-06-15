package gap

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/pkg/models"
)

func TestComputeTimeGaps_SameLapAhead(t *testing.T) {
	tm := &models.Telemetry{
		Connected: true,
		Player:    &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000, EstimatedLapTime: 120},
			{ID: 2, IsPlayer: false, LapDistance: 1100, EstimatedLapTime: 120},
		},
	}
	ComputeTimeGaps(tm)
	if math.Abs(tm.Vehicles[1].TimeGapToPlayer-10.91) > 0.1 {
		t.Fatalf("expected gap ~10.91s (lap-pace based), got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_SameLapBehind(t *testing.T) {
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000},
			{ID: 2, IsPlayer: false, LapDistance: 900},
		},
	}
	ComputeTimeGaps(tm)
	if math.Abs(tm.Vehicles[1].TimeGapToPlayer+2.0) > 0.1 {
		t.Fatalf("expected gap ~-2.0s behind, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_LappedCar(t *testing.T) {
	// A car one lap ahead but physically just behind the player.
	// Raw distance delta would be negative, but totalLaps adjusts it to ~trackLength.
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000, TotalLaps: 5, EstimatedLapTime: 120},
			{ID: 2, IsPlayer: false, LapDistance: 900, TotalLaps: 6, EstimatedLapTime: 120},
		},
	}
	ComputeTimeGaps(tm)
	if tm.Vehicles[1].TimeGapToPlayer <= 0 {
		t.Fatalf("expected positive gap for lapped car ahead, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_PlayerRowIsZero(t *testing.T) {
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000},
		},
	}
	ComputeTimeGaps(tm)
	if tm.Vehicles[0].TimeGapToPlayer != 0 {
		t.Fatalf("player gap must be 0, got %v", tm.Vehicles[0].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_NoPlayer(t *testing.T) {
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: false, LapDistance: 1000},
		},
	}
	ComputeTimeGaps(tm)
	if tm.Vehicles[0].TimeGapToPlayer != 0 {
		t.Fatalf("expected 0 when player missing, got %v", tm.Vehicles[0].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_UsesEstimatedLapTimeNotInstantSpeed(t *testing.T) {
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 1}, // very slow, would blow up old algorithm
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000, EstimatedLapTime: 120, TotalLaps: 5},
			{ID: 2, IsPlayer: false, LapDistance: 1100, EstimatedLapTime: 120, TotalLaps: 5},
		},
	}
	ComputeTimeGaps(tm)
	// trackLength ~ 1100 (max lap distance), avgSpeed ~ 1100/120 = 9.17, delta = 100 => gap ~ 10.9s
	if tm.Vehicles[1].TimeGapToPlayer < 10 || tm.Vehicles[1].TimeGapToPlayer > 15 {
		t.Fatalf("expected stable gap ~10.9s, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_ZeroLapDistanceIsValid(t *testing.T) {
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 0, EstimatedLapTime: 120, TotalLaps: 5},
			{ID: 2, IsPlayer: false, LapDistance: 100, EstimatedLapTime: 120, TotalLaps: 5},
			{ID: 3, IsPlayer: false, LapDistance: 5000, EstimatedLapTime: 120, TotalLaps: 5},
		},
	}
	ComputeTimeGaps(tm)
	if tm.Vehicles[1].TimeGapToPlayer <= 0 {
		t.Fatalf("expected positive gap for car ahead, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}
