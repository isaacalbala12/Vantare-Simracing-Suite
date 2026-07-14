package watchedopponents

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// mkFrame builds a frame with the player (Place=1) and a list of opponents.
// The player is always vehicle ID 1 at Place 1. Opponents get ascending IDs.
func mkFrame(playerClass string, lapNumber int32, opponents []telemetry.VehicleScoring) *telemetry.Frame {
	vehicles := []telemetry.VehicleScoring{
		{ID: 1, IsPlayer: true, VehicleClass: playerClass, Place: 1, LapDistance: 1000.0},
	}
	vehicles = append(vehicles, opponents...)
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        1,
			LapNumber: lapNumber,
		},
		Vehicles: vehicles,
	}
}

func TestMonitor_NewOpponent(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	// Opponent at Place 2 (within 5), same class.
	frame := mkFrame("GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 2, LapDistance: 1050.0, TimeBehindLeader: 5.0},
	})
	evs := m.Trigger(1000, nil, frame)
	found := false
	for _, e := range evs {
		if e.Type == EventWatchedNew {
			found = true
			if e.Payload["driverName"] != "Rival" {
				t.Errorf("expected driverName=Rival, got %v", e.Payload["driverName"])
			}
		}
	}
	if !found {
		t.Errorf("expected EventWatchedNew, got %+v", evs)
	}
}

func TestMonitor_GapIncreasing(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	opponent := telemetry.VehicleScoring{
		ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 2,
		LapDistance: 1050.0, TimeBehindLeader: 5.0,
	}

	// First frame: opponent enters watched range.
	frame1 := mkFrame("GT3", 5, []telemetry.VehicleScoring{opponent})
	evs := m.Trigger(1000, nil, frame1)
	hasNew := false
	for _, e := range evs {
		if e.Type == EventWatchedNew {
			hasNew = true
		}
	}
	if !hasNew {
		t.Fatal("expected EventWatchedNew on first frame")
	}

	// Second frame: gap grows from 5s to 7s (+2s delta).
	opponent2 := opponent
	opponent2.TimeBehindLeader = 7.0 // gap increases from 5 to 7
	frame2 := mkFrame("GT3", 5, []telemetry.VehicleScoring{opponent2})
	evs = m.Trigger(2000, frame1, frame2)
	hasIncreasing := false
	for _, e := range evs {
		if e.Type == EventWatchedGapIncreasing {
			hasIncreasing = true
			delta, ok := e.Payload["deltaSecs"].(float64)
			if !ok || delta < 1.5 || delta > 2.5 {
				t.Errorf("expected deltaSecs ~2.0, got %v", e.Payload["deltaSecs"])
			}
		}
	}
	if !hasIncreasing {
		t.Errorf("expected EventWatchedGapIncreasing, got %+v", evs)
	}
}

func TestMonitor_GapDecreasing(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	opponent := telemetry.VehicleScoring{
		ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 2,
		LapDistance: 1050.0, TimeBehindLeader: 10.0,
	}

	// First frame: enter.
	frame1 := mkFrame("GT3", 5, []telemetry.VehicleScoring{opponent})
	evs := m.Trigger(1000, nil, frame1)
	hasNew := false
	for _, e := range evs {
		if e.Type == EventWatchedNew {
			hasNew = true
		}
	}
	if !hasNew {
		t.Fatal("expected EventWatchedNew on first frame")
	}

	// Second frame: gap shrinks from 10s to 5s (-5s delta).
	opponent2 := opponent
	opponent2.TimeBehindLeader = 5.0
	frame2 := mkFrame("GT3", 5, []telemetry.VehicleScoring{opponent2})
	evs = m.Trigger(2000, frame1, frame2)
	hasDecreasing := false
	for _, e := range evs {
		if e.Type == EventWatchedGapDecreasing {
			hasDecreasing = true
		}
	}
	if !hasDecreasing {
		t.Errorf("expected EventWatchedGapDecreasing, got %+v", evs)
	}
}

func TestMonitor_OpponentGone(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	// Frame 1: opponent within range.
	frame1 := mkFrame("GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 2, LapDistance: 1050.0},
	})
	evs := m.Trigger(1000, nil, frame1)
	if len(evs) != 1 || evs[0].Type != EventWatchedNew {
		t.Fatal("expected EventWatchedNew")
	}

	// Frame 2: opponent at Place 10 (outside 5 positions).
	frame2 := mkFrame("GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 10, LapDistance: 1050.0},
	})
	evs = m.Trigger(2000, frame1, frame2)
	hasGone := false
	for _, e := range evs {
		if e.Type == EventWatchedGone {
			hasGone = true
			if e.Payload["driverName"] != "Rival" {
				t.Errorf("expected driverName=Rival, got %v", e.Payload["driverName"])
			}
		}
	}
	if !hasGone {
		t.Errorf("expected EventWatchedGone, got %+v", evs)
	}
}

func TestMonitor_SameClassOnly(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	// Opponent in HYPERCAR class (different) — should NOT be watched.
	frame := mkFrame("GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Fast", VehicleClass: "HYPERCAR", Place: 2, LapDistance: 1050.0},
	})
	evs := m.Trigger(1000, nil, frame)
	for _, e := range evs {
		if e.Type == EventWatchedNew {
			t.Errorf("unexpected EventWatchedNew for different class")
		}
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	evs := m.Trigger(1000, nil, nil)
	if len(evs) != 0 {
		t.Errorf("expected no events for nil curr, got %+v", evs)
	}
}

func TestMonitor_NoPlayerClass(t *testing.T) {
	m := NewMonitor()
	frame := mkFrame("GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 2},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected no events without player class, got %+v", evs)
	}
}

func TestMonitor_GapStableNoEvent(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	opponent := telemetry.VehicleScoring{
		ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 2,
		LapDistance: 1050.0, TimeBehindLeader: 5.0,
	}

	// Enter.
	frame1 := mkFrame("GT3", 5, []telemetry.VehicleScoring{opponent})
	evs := m.Trigger(1000, nil, frame1)

	// Same gap — no gap event.
	frame2 := mkFrame("GT3", 5, []telemetry.VehicleScoring{opponent})
	evs = m.Trigger(2000, frame1, frame2)
	for _, e := range evs {
		if e.Type == EventWatchedGapIncreasing || e.Type == EventWatchedGapDecreasing {
			t.Errorf("unexpected gap event for stable gap: %s", e.Type)
		}
	}
}

func TestMonitor_OpponentRemovedFromFrame(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	// Frame 1: opponent present.
	frame1 := mkFrame("GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", VehicleClass: "GT3", Place: 2, LapDistance: 1050.0},
	})
	evs := m.Trigger(1000, nil, frame1)
	if len(evs) != 1 || evs[0].Type != EventWatchedNew {
		t.Fatal("expected EventWatchedNew")
	}

	// Frame 2: opponent removed from vehicles entirely.
	frame2 := mkFrame("GT3", 5, nil) // no opponents
	evs = m.Trigger(2000, frame1, frame2)
	hasGone := false
	for _, e := range evs {
		if e.Type == EventWatchedGone {
			hasGone = true
		}
	}
	if !hasGone {
		t.Errorf("expected EventWatchedGone when opponent removed from frame, got %+v", evs)
	}
}

func TestWithinFivePositions(t *testing.T) {
	tests := []struct {
		player uint8
		opp    uint8
		want   bool
	}{
		{1, 1, true},
		{1, 6, true},
		{1, 7, false},
		{5, 1, true},
		{5, 10, true},
		{5, 11, false},
		{0, 5, true}, // unknown player position
		{5, 0, true}, // unknown opponent position
		{0, 0, true}, // both unknown
	}
	for _, tt := range tests {
		got := withinFivePositions(tt.player, tt.opp)
		if got != tt.want {
			t.Errorf("withinFivePositions(%d, %d) = %v, want %v", tt.player, tt.opp, got, tt.want)
		}
	}
}
