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
	// With a physical (wrap-around) gap, it should be a small negative gap.
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000, TotalLaps: 5, EstimatedLapTime: 120},
			{ID: 2, IsPlayer: false, LapDistance: 900, TotalLaps: 6, EstimatedLapTime: 120},
		},
	}
	ComputeTimeGaps(tm)
	if tm.Vehicles[1].TimeGapToPlayer >= 0 {
		t.Fatalf("expected small negative gap for car physically just behind, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
	if math.Abs(tm.Vehicles[1].TimeGapToPlayer+9.0) > 3.0 {
		t.Fatalf("expected gap ~-9s (100m behind at ~11m/s), got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_PlayerRowIsZero(t *testing.T) {
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000},
			{ID: 2, IsPlayer: false, LapDistance: 1100},
		},
	}
	ComputeTimeGaps(tm)
	if tm.Vehicles[0].TimeGapToPlayer != 0 {
		t.Fatalf("player gap must be 0, got %v", tm.Vehicles[0].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_NoPlayer(t *testing.T) {
	tm := &models.Telemetry{
		Connected: true,
		Player:    &models.PlayerTelemetry{Speed: 50},
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
		Player: &models.PlayerTelemetry{Speed: 80},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000, EstimatedLapTime: 120},
			{ID: 2, IsPlayer: false, LapDistance: 1100, EstimatedLapTime: 120},
		},
	}
	ComputeTimeGaps(tm)
	// trackLength ~ 1100 (max lap distance), avgSpeed ~ 1100/120 = 9.17, delta = 100 => gap ~ 10.9s
	if tm.Vehicles[1].TimeGapToPlayer < 10 || tm.Vehicles[1].TimeGapToPlayer > 15 {
		t.Fatalf("expected stable gap ~10.9s, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}

func TestComputeTimeGaps_PhysicallyAcrossStartLine(t *testing.T) {
	tm := &models.Telemetry{
		Player: &models.PlayerTelemetry{Speed: 50},
		Vehicles: []models.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 1000, EstimatedLapTime: 120},
			{ID: 2, IsPlayer: false, LapDistance: 50, EstimatedLapTime: 120},
		},
	}
	ComputeTimeGaps(tm)
	// Car at 50m is a few hundred metres ahead across the start line, gap ~ +27s
	if tm.Vehicles[1].TimeGapToPlayer <= 0 {
		t.Fatalf("expected positive gap across start line, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
	if tm.Vehicles[1].TimeGapToPlayer > 60 {
		t.Fatalf("expected small positive gap, not a full lap, got %v", tm.Vehicles[1].TimeGapToPlayer)
	}
}
