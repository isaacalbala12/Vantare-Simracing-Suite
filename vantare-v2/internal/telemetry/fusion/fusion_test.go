package fusion_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/fusion"
	"github.com/vantare/overlays/v2/internal/telemetry/lmuapi"
	"github.com/vantare/overlays/v2/pkg/models"
)

func TestMergeStandingsAddsRestFieldsAndPreservesFastPlayerInputs(t *testing.T) {
	base := &models.Telemetry{
		Connected: true,
		Player: &models.PlayerTelemetry{
			ID:        31,
			Speed:     12.3,
			Gear:      2,
			EngineRPM: 4200,
			Fuel:      88,
		},
	}
	rows := []lmuapi.StandingRow{{
		DriverName:            "Isaac Albala",
		CarNumber:             "46",
		CarClass:              "LMP3",
		FullTeamName:          "ADESS Factory Racing Team 2025",
		VehicleName:           "ADESS Factory Racing Team 2025 #46:ELMS",
		Position:              12,
		Player:                true,
		LapsCompleted:         0,
		LapsBehindLeader:      6,
		LapsBehindClassLeader: 2,
		TimeBehindNext:        243.93,
		LapDistance:           165.79,
		TimeIntoLap:           3.02,
		EstimatedLapTime:      246.19,
		PitState:              "EXITING",
		Pitting:               true,
		InGarageStall:         true,
		Sector:                "SECTOR1",
	}}

	out := fusion.Merge(base, rows, nil, 0)
	if out.Player.Speed != 12.3 || out.Player.Gear != 2 {
		t.Fatalf("fast player inputs were not preserved: %#v", out.Player)
	}
	if len(out.Vehicles) != 1 {
		t.Fatalf("vehicles: got %d want 1", len(out.Vehicles))
	}
	v := out.Vehicles[0]
	if v.DriverNumber != "46" || v.TeamName != "ADESS Factory Racing Team 2025" || v.LapDistance != 165.79 {
		t.Fatalf("REST fields not merged: %#v", v)
	}
	if !v.IsPlayer || !v.Pitting || !v.InGarageStall || v.PitState != "EXITING" {
		t.Fatalf("pit/player fields not merged: %#v", v)
	}
}

func TestMergeSessionInfo(t *testing.T) {
	base := &models.Telemetry{Connected: true}
	info := &lmuapi.SessionInfo{
		TrackName:                "Circuit de la Sarthe",
		Session:                  "PRACTICE1",
		GamePhase:                5,
		NumberOfVehicles:         12,
		PlayerName:               "Isaac Albala",
		CurrentEventTime:         1587,
		TimeRemainingInGamePhase: 123.9,
		YellowFlagState:          "NONE",
		SectorFlag:               []string{"YELLOW", "YELLOW", "YELLOW"},
	}
	out := fusion.Merge(base, nil, info, 0)
	if out.Session == nil {
		t.Fatal("expected session")
	}
	if out.Session.TrackName != "Circuit de la Sarthe" || out.Session.SessionName != "PRACTICE1" {
		t.Fatalf("unexpected session: %#v", out.Session)
	}
}

func TestMergeAppliesDeltaBestOnlyIfValid(t *testing.T) {
	base := &models.Telemetry{
		Connected: true,
		Player:    &models.PlayerTelemetry{ID: 1, Speed: 10},
	}
	rows := []lmuapi.StandingRow{{DriverName: "A", Player: true}}
	out := fusion.Merge(base, rows, nil, 1.234)
	if out.Player.DeltaBest != 1.234 {
		t.Fatalf("expected delta 1.234, got %v", out.Player.DeltaBest)
	}
	out2 := fusion.Merge(base, rows, nil, -1.5)
	if out2.Player.DeltaBest != -1.5 {
		t.Fatalf("expected delta -1.5 for negative delta, got %v", out2.Player.DeltaBest)
	}
	out3 := fusion.Merge(base, rows, nil, 12000) // absurdly large
	if out3.Player.DeltaBest != 0 {
		t.Fatalf("expected delta 0 for absurdly large delta, got %v", out3.Player.DeltaBest)
	}
}

func TestMergePreservesExistingDeltaBestWhenIncomingIsZero(t *testing.T) {
	base := &models.Telemetry{
		Connected: true,
		Player:    &models.PlayerTelemetry{ID: 1, Speed: 10, DeltaBest: -0.250},
	}
	rows := []lmuapi.StandingRow{{DriverName: "A", Player: true}}
	out := fusion.Merge(base, rows, nil, 0)
	if out.Player.DeltaBest != -0.250 {
		t.Fatalf("expected DeltaBest to be preserved as -0.250 when incoming is 0, got %v", out.Player.DeltaBest)
	}
}

func TestMergePreservesExistingSessionFields(t *testing.T) {
	base := &models.Telemetry{
		Connected: true,
		Session:   &models.SessionInfo{TrackName: "Old Track", SessionType: 3},
	}
	info := &lmuapi.SessionInfo{TrackName: "New Track", Session: "RACE1"}
	out := fusion.Merge(base, nil, info, 0)
	if out.Session.TrackName != "New Track" || out.Session.SessionType != 3 || out.Session.SessionName != "RACE1" {
		t.Fatalf("session merge failed: %#v", out.Session)
	}
}

func TestMergeWithoutSharedMemoryNeverConnects(t *testing.T) {
	tests := []struct {
		name string
		base *models.Telemetry
	}{
		{name: "nil base"},
		{name: "explicit disconnected base", base: &models.Telemetry{Connected: false}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := fusion.Merge(
				tt.base,
				[]lmuapi.StandingRow{{DriverName: "REST only", Player: true}},
				&lmuapi.SessionInfo{TrackName: "REST only"},
				-0.25,
			)
			if out == nil {
				t.Fatal("Merge()=nil, want explicit disconnected telemetry")
			}
			if out.Connected {
				t.Fatalf("Merge()=%#v, REST-only data must not create a connected state", out)
			}
			if out.Session != nil || out.Player != nil || len(out.Vehicles) != 0 || out.PlayerHasVehicle {
				t.Fatalf("Merge()=%#v, disconnected output must not expose REST-only scoring or player data", out)
			}
		})
	}
}
