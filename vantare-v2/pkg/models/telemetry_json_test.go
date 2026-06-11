package models_test

import (
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/pkg/models"
)

func TestTelemetryJSONUsesCamelCase(t *testing.T) {
	tel := &models.Telemetry{
		Connected: true,
		Player: &models.PlayerTelemetry{
			Speed:     15,
			Gear:      4,
			EngineRPM: 7200,
		},
	}
	raw, err := json.Marshal(tel)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if doc["connected"] != true {
		t.Fatalf("expected connected key, got %v", doc)
	}
	player, ok := doc["player"].(map[string]any)
	if !ok {
		t.Fatalf("expected player object in %s", raw)
	}
	if _, ok := player["engineRPM"]; !ok {
		t.Fatalf("expected engineRPM key in player: %v", player)
	}
}
