package lmu

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
)

type fixtureSidecar struct {
	Session struct {
		TrackName   string  `json:"trackName"`
		SessionType int32   `json:"sessionType"`
		CurrentET   float64 `json:"currentET"`
		NumVehicles int32   `json:"numVehicles"`
		GamePhase   uint8   `json:"gamePhase"`
		PlayerName  string  `json:"playerName"`
		AmbientTemp float64 `json:"ambientTemp"`
		TrackTemp   float64 `json:"trackTemp"`
	} `json:"session"`
	Telemetry struct {
		PlayerVehicleIdx int  `json:"playerVehicleIdx"`
		PlayerHasVehicle bool `json:"playerHasVehicle"`
	} `json:"telemetry"`
	Vehicles []struct {
		ID         int32   `json:"id"`
		DriverName string  `json:"driverName"`
		Place      uint8   `json:"place"`
		IsPlayer   bool    `json:"isPlayer"`
		VehicleClass string `json:"vehicleClass"`
	} `json:"vehicles"`
	PlayerTelemetry *struct {
		ID        int32   `json:"id"`
		LapNumber int32   `json:"lapNumber"`
		Gear      int32   `json:"gear"`
		EngineRPM float64 `json:"engineRPM"`
		Speed     float64 `json:"speed"`
		Throttle  float64 `json:"throttle"`
		Brake     float64 `json:"brake"`
		Fuel      float64 `json:"fuel"`
	} `json:"playerTelemetry"`
}

func fixturePaths() (binPath, jsonPath string) {
	root := filepath.Join("..", "..", "..", "testdata")
	return filepath.Join(root, "lmu-fixture.bin"), filepath.Join(root, "lmu-fixture.json")
}

func loadFixture(t *testing.T) ([]byte, fixtureSidecar) {
	t.Helper()

	binPath, jsonPath := fixturePaths()
	if _, err := os.Stat(binPath); err != nil {
		t.Skipf("fixture binary missing (%s); run: python tools/dump-lmu-memory.py --output-dir vantare-v2/testdata", binPath)
	}

	buf, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatalf("read fixture bin: %v", err)
	}
	if len(buf) != ObjectOutSize {
		t.Fatalf("fixture size: got %d want %d", len(buf), ObjectOutSize)
	}

	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatalf("read fixture json: %v", err)
	}

	var sidecar fixtureSidecar
	if err := json.Unmarshal(raw, &sidecar); err != nil {
		t.Fatalf("parse fixture json: %v", err)
	}
	return buf, sidecar
}

func assertFloat(t *testing.T, name string, got, want, eps float64) {
	t.Helper()
	if math.Abs(got-want) > eps {
		t.Fatalf("%s: got %v want %v (±%v)", name, got, want, eps)
	}
}

func TestFixtureParseSession(t *testing.T) {
	buf, fx := loadFixture(t)

	session := ParseSession(buf)
	if session == nil {
		t.Fatal("expected session")
	}
	if session.TrackName != fx.Session.TrackName {
		t.Fatalf("trackName: got %q want %q", session.TrackName, fx.Session.TrackName)
	}
	if session.SessionType != fx.Session.SessionType {
		t.Fatalf("sessionType: got %d want %d", session.SessionType, fx.Session.SessionType)
	}
	if session.NumVehicles != fx.Session.NumVehicles {
		t.Fatalf("numVehicles: got %d want %d", session.NumVehicles, fx.Session.NumVehicles)
	}
	if session.GamePhase != fx.Session.GamePhase {
		t.Fatalf("gamePhase: got %d want %d", session.GamePhase, fx.Session.GamePhase)
	}
	if session.PlayerName != fx.Session.PlayerName {
		t.Fatalf("playerName: got %q want %q", session.PlayerName, fx.Session.PlayerName)
	}
	assertFloat(t, "ambientTemp", session.AmbientTemp, fx.Session.AmbientTemp, 0.01)
	assertFloat(t, "trackTemp", session.TrackTemp, fx.Session.TrackTemp, 0.01)
}

func TestFixtureParsePlayerTelemetry(t *testing.T) {
	buf, fx := loadFixture(t)
	if !fx.Telemetry.PlayerHasVehicle || fx.PlayerTelemetry == nil {
		t.Skip("fixture has no player telemetry")
	}

	player := ParsePlayerTelemetry(buf, fx.Telemetry.PlayerVehicleIdx)
	if player == nil {
		t.Fatal("expected player telemetry")
	}

	pt := fx.PlayerTelemetry
	if player.Gear != pt.Gear {
		t.Fatalf("gear: got %d want %d", player.Gear, pt.Gear)
	}
	assertFloat(t, "speed", player.Speed, pt.Speed, 0.05)
	assertFloat(t, "engineRPM", player.EngineRPM, pt.EngineRPM, 1.0)
	assertFloat(t, "fuel", player.Fuel, pt.Fuel, 0.01)
	assertFloat(t, "throttle", player.Throttle, pt.Throttle, 0.001)
	assertFloat(t, "brake", player.Brake, pt.Brake, 0.001)
}

func TestFixtureParseVehicles(t *testing.T) {
	buf, fx := loadFixture(t)

	vehicles := ParseVehicleScoring(buf, int(fx.Session.NumVehicles))
	if len(vehicles) == 0 {
		t.Fatal("expected at least one vehicle")
	}

	var playerFound bool
	for _, expected := range fx.Vehicles {
		if !expected.IsPlayer {
			continue
		}
		playerFound = true
		var match bool
		for _, v := range vehicles {
			if v.IsPlayer && v.DriverName == expected.DriverName {
				match = true
				if v.Place != expected.Place {
					t.Fatalf("player place: got %d want %d", v.Place, expected.Place)
				}
				if v.VehicleClass != expected.VehicleClass {
					t.Fatalf("player class: got %q want %q", v.VehicleClass, expected.VehicleClass)
				}
				break
			}
		}
		if !match {
			t.Fatalf("player vehicle %q not found in parse output", expected.DriverName)
		}
	}
	if fx.Telemetry.PlayerHasVehicle && !playerFound {
		t.Fatal("fixture marks player but no isPlayer vehicle in JSON sidecar")
	}
}

func TestFixtureParseFull(t *testing.T) {
	buf, fx := loadFixture(t)

	tele := Parse(buf, ParseFull)
	if tele == nil {
		t.Fatal("expected telemetry")
	}
	if !tele.PlayerHasVehicle {
		t.Fatal("expected playerHasVehicle")
	}
	if tele.Session == nil || tele.Player == nil {
		t.Fatal("expected session and player")
	}
	if tele.Session.TrackName != fx.Session.TrackName {
		t.Fatalf("track: got %q want %q", tele.Session.TrackName, fx.Session.TrackName)
	}
	if len(tele.Vehicles) == 0 {
		t.Fatal("expected scoring vehicles")
	}
}

func BenchmarkParseFixtureFull(b *testing.B) {
	binPath, _ := fixturePaths()
	buf, err := os.ReadFile(binPath)
	if err != nil {
		b.Skip("fixture binary missing")
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Parse(buf, ParseFull)
	}
}
