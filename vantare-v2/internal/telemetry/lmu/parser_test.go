package lmu

import (
	"math"
	"testing"
)

func TestParsePlayerTelemetrySynthetic(t *testing.T) {
	buf := BuildSyntheticBuffer()
	player := ParsePlayerTelemetry(buf, 0)
	if player == nil {
		t.Fatal("expected player telemetry")
	}
	if math.Abs(player.Speed-15) > 0.01 {
		t.Fatalf("speed: got %v want 15", player.Speed)
	}
	if player.Gear != 4 {
		t.Fatalf("gear: got %d want 4", player.Gear)
	}
	if math.Abs(player.EngineRPM-7200) > 0.01 {
		t.Fatalf("rpm: got %v want 7200", player.EngineRPM)
	}
	if math.Abs(player.Fuel-45.2) > 0.01 {
		t.Fatalf("fuel: got %v want 45.2", player.Fuel)
	}
}

func TestParseSessionSynthetic(t *testing.T) {
	buf := BuildSyntheticBuffer()
	session := ParseSession(buf)
	if session == nil {
		t.Fatal("expected session")
	}
	if session.TrackName != "Spa" {
		t.Fatalf("track: got %q", session.TrackName)
	}
	if session.NumVehicles != 3 {
		t.Fatalf("numVehicles: got %d", session.NumVehicles)
	}
}

func TestParseFullSynthetic(t *testing.T) {
	buf := BuildSyntheticBuffer()
	tele := Parse(buf, ParseFull)
	if tele == nil || tele.Player == nil || tele.Session == nil {
		t.Fatal("expected full parse")
	}
	if len(tele.Vehicles) != 1 {
		t.Fatalf("vehicles: got %d want 1 valid row", len(tele.Vehicles))
	}
}
