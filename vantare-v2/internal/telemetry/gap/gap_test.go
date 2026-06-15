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
	if math.Abs(tm.Vehicles[1].TimeGapToPlayer-2.0) > 0.1 {
		t.Fatalf("expected gap ~2.0s ahead, got %v", tm.Vehicles[1].TimeGapToPlayer)
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
