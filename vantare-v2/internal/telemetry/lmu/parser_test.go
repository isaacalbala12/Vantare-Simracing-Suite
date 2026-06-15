package lmu

import (
	"encoding/binary"
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
	if session.NumVehicles != 10 {
		t.Fatalf("numVehicles: got %d want 10", session.NumVehicles)
	}
}

func TestParseFullSynthetic(t *testing.T) {
	buf := BuildSyntheticBuffer()
	tele := Parse(buf, ParseFull)
	if tele == nil || tele.Player == nil || tele.Session == nil {
		t.Fatal("expected full parse")
	}
	if len(tele.Vehicles) != 10 {
		t.Fatalf("vehicles: got %d want 10 valid rows", len(tele.Vehicles))
	}
}

func TestParsePlayerTelemetryReadsFloat32TimeGapsAndClutch(t *testing.T) {
	buf := BuildSyntheticBuffer()
	po := telemetryTelemOffset
	binary.LittleEndian.PutUint64(buf[po+vehicleTelemetryFilteredClutch:], math.Float64bits(0.42))
	binary.LittleEndian.PutUint32(buf[po+vehicleTelemetryTimeGapPlaceAhead:], math.Float32bits(1.25))
	binary.LittleEndian.PutUint32(buf[po+vehicleTelemetryTimeGapPlaceBehind:], math.Float32bits(2.5))

	player := ParsePlayerTelemetry(buf, 0)
	if player == nil {
		t.Fatal("expected player telemetry")
	}
	if math.Abs(player.Clutch-0.42) > 0.001 {
		t.Fatalf("clutch: got %v want 0.42", player.Clutch)
	}
	if math.Abs(player.TimeGapPlaceAhead-1.25) > 0.001 {
		t.Fatalf("gap ahead: got %v want 1.25", player.TimeGapPlaceAhead)
	}
	if math.Abs(player.TimeGapPlaceBehind-2.5) > 0.001 {
		t.Fatalf("gap behind: got %v want 2.5", player.TimeGapPlaceBehind)
	}
}

func TestParseVehicleScoringReadsPrimitiveFieldWidths(t *testing.T) {
	buf := BuildSyntheticBuffer()
	v0 := vehicleScoringOffset
	buf[v0+vehicleScoringPitState] = 2
	buf[v0+vehicleScoringFlag] = 6
	buf[v0+vehicleScoringFuelFraction] = 87
	binary.LittleEndian.PutUint16(buf[v0+vehicleScoringPitstops:], uint16(3))
	binary.LittleEndian.PutUint16(buf[v0+vehicleScoringPenalties:], uint16(1))

	vehicles := ParseVehicleScoring(buf, 1)
	if len(vehicles) != 1 {
		t.Fatalf("vehicles: got %d want 1", len(vehicles))
	}
	v := vehicles[0]
	if v.PitState != "ENTERING" {
		t.Fatalf("pit state: got %q want ENTERING", v.PitState)
	}
	if v.Flag != "BLUE" {
		t.Fatalf("flag: got %q want BLUE", v.Flag)
	}
	if v.FuelFraction != 87 {
		t.Fatalf("fuel fraction: got %v want 87", v.FuelFraction)
	}
	if v.Pitstops != 3 {
		t.Fatalf("pitstops: got %d want 3", v.Pitstops)
	}
	if v.Penalties != 1 {
		t.Fatalf("penalties: got %d want 1", v.Penalties)
	}
}
