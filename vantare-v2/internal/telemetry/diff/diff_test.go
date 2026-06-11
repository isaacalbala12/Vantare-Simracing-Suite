package diff_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/diff"
	"github.com/vantare/overlays/v2/pkg/models"
)

func TestComputeFirstEmit(t *testing.T) {
	next := &models.Telemetry{
		Connected: true,
		Player: &models.PlayerTelemetry{
			Speed:     20,
			Gear:      3,
			EngineRPM: 6000,
		},
		Session: &models.SessionInfo{TrackName: "Spa"},
	}
	p := diff.Compute(nil, next)
	if p == nil || len(p.D) == 0 {
		t.Fatal("expected diff on first emit")
	}
	player, ok := p.D["player"].(map[string]any)
	if !ok {
		t.Fatal("expected player in diff")
	}
	if player["gear"] != int32(3) {
		t.Fatalf("gear: %v", player["gear"])
	}
}

func TestComputeSuppressesStablePlayer(t *testing.T) {
	prev := &models.Telemetry{
		Connected: true,
		Player:    &models.PlayerTelemetry{Speed: 20, Gear: 3, EngineRPM: 6000},
	}
	next := &models.Telemetry{
		Connected: true,
		Player:    &models.PlayerTelemetry{Speed: 20.001, Gear: 3, EngineRPM: 6010},
	}
	if p := diff.Compute(prev, next); p != nil {
		t.Fatalf("expected nil diff for noise, got %+v", p.D)
	}
}

func TestComputeVehiclePlaceChange(t *testing.T) {
	prev := &models.Telemetry{
		Connected: true,
		Vehicles:  []models.VehicleScoring{{ID: 1, Place: 2, DriverName: "A"}},
	}
	next := &models.Telemetry{
		Connected: true,
		Vehicles:  []models.VehicleScoring{{ID: 1, Place: 1, DriverName: "A"}},
	}
	p := diff.Compute(prev, next)
	if p == nil {
		t.Fatal("expected vehicles diff")
	}
	if _, ok := p.D["vehicles"]; !ok {
		t.Fatal("expected vehicles key")
	}
}
