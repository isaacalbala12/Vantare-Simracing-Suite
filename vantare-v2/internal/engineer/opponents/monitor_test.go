package opponents

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// mkOpponentsFrame creates a frame with a player and the given opponents.
func mkOpponentsFrame(playerID int32, opponents []telemetry.VehicleScoring) *telemetry.Frame {
	vehicles := []telemetry.VehicleScoring{
		{ID: playerID, IsPlayer: true},
	}
	vehicles = append(vehicles, opponents...)
	return &telemetry.Frame{
		Player:   &telemetry.PlayerTelemetry{ID: playerID},
		Vehicles: vehicles,
	}
}

// mkOpponentsFramePlace creates a frame with a player at the given place.
func mkOpponentsFramePlace(playerID int32, playerPlace uint8, opponents []telemetry.VehicleScoring) *telemetry.Frame {
	vehicles := []telemetry.VehicleScoring{
		{ID: playerID, IsPlayer: true, Place: playerPlace},
	}
	vehicles = append(vehicles, opponents...)
	return &telemetry.Frame{
		Player:   &telemetry.PlayerTelemetry{ID: playerID},
		Vehicles: vehicles,
	}
}

// TestMonitor_NoOpponentPitted: opponent on track then still on track → no event.
func TestMonitor_NoOpponentPitted(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, IsPlayer: false, InPits: false, BestLapTime: 100.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, IsPlayer: false, InPits: false, BestLapTime: 100.0},
	})
	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 0 {
		t.Errorf("expected no events, got %+v", evs)
	}
}

// TestMonitor_OpponentPitted: opponent goes from on-track to pits → event fires.
func TestMonitor_OpponentPitted(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, IsPlayer: false, DriverName: "Rival", InPits: false, BestLapTime: 100.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, IsPlayer: false, DriverName: "Rival", InPits: true, BestLapTime: 100.0},
	})
	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 1 || evs[0].Type != EventOpponentPitted {
		t.Fatalf("expected 1 EventOpponentPitted, got %+v", evs)
	}
	if evs[0].Payload["driverName"] != "Rival" {
		t.Errorf("expected driverName=Rival, got %v", evs[0].Payload["driverName"])
	}
	if evs[0].Payload["id"] != int32(22) {
		t.Errorf("expected id=22, got %v", evs[0].Payload["id"])
	}
}

// TestMonitor_NoDuplicatePitted: opponent stays in pits → no duplicate fires.
func TestMonitor_NoDuplicatePitted(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, InPits: false},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, InPits: true},
	})
	frame3 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, InPits: true},
	})
	m.Trigger(1000, frame1, frame2)
	evs := m.Trigger(2000, frame2, frame3)
	if len(evs) != 0 {
		t.Errorf("expected no duplicate events, got %+v", evs)
	}
}

// TestMonitor_OpponentBestLap: opponent improves best lap → event fires.
func TestMonitor_OpponentBestLap(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 105.5},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 104.2},
	})
	frame2.Player.LapNumber = 3 // meet min laps requirement
	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 1 || evs[0].Type != EventOpponentBestLap {
		t.Fatalf("expected 1 EventOpponentBestLap, got %+v", evs)
	}
	if evs[0].Payload["bestLapTimeSec"] != 104.2 {
		t.Errorf("expected bestLapTimeSec=104.2, got %v", evs[0].Payload["bestLapTimeSec"])
	}
}

// TestMonitor_NoBestLapIfSlower: opponent sets slower lap → no event.
func TestMonitor_NoBestLapIfSlower(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, BestLapTime: 105.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, BestLapTime: 106.5},
	})
	frame2.Player.LapNumber = 3 // meet min laps requirement
	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 0 {
		t.Errorf("expected no events for slower lap, got %+v", evs)
	}
}

// TestMonitor_NoBestLapIfZero: best lap time is 0 (no lap set) → no event.
func TestMonitor_NoBestLapIfZero(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, BestLapTime: 0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, BestLapTime: 0},
	})
	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 0 {
		t.Errorf("expected no events for zero best lap, got %+v", evs)
	}
}

// TestMonitor_PlayerExcluded: player pitting should not fire EventOpponentPitted.
func TestMonitor_PlayerExcluded(t *testing.T) {
	m := NewMonitor()
	frame1 := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: false},
		},
	}
	frame2 := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: true},
		},
	}
	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 0 {
		t.Errorf("player pitting should not fire opponent events, got %+v", evs)
	}
}

// TestMonitor_FirstSightingNoEvent: first time we see an opponent, no event fires.
func TestMonitor_FirstSightingNoEvent(t *testing.T) {
	m := NewMonitor()
	// No prev frame — opponent appears for first time in pits.
	frame := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, InPits: true, BestLapTime: 100.0},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("first sighting should not fire events, got %+v", evs)
	}
}

// TestMonitor_MultipleOpponents: multiple opponents, each tracked independently.
func TestMonitor_MultipleOpponents(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival A", InPits: false, BestLapTime: 105.0},
		{ID: 33, DriverName: "Rival B", InPits: false, BestLapTime: 110.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival A", InPits: true, BestLapTime: 105.0},  // pitted
		{ID: 33, DriverName: "Rival B", InPits: false, BestLapTime: 108.5}, // best lap
	})
	frame2.Player.LapNumber = 3 // meet min laps requirement for best_lap
	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 2 {
		t.Fatalf("expected 2 events, got %+v", evs)
	}
	hasPitted := false
	hasBestLap := false
	for _, e := range evs {
		if e.Type == EventOpponentPitted && e.Payload["driverName"] == "Rival A" {
			hasPitted = true
		}
		if e.Type == EventOpponentBestLap && e.Payload["driverName"] == "Rival B" {
			hasBestLap = true
		}
	}
	if !hasPitted {
		t.Errorf("expected Rival A pitted event, got %+v", evs)
	}
	if !hasBestLap {
		t.Errorf("expected Rival B best lap event, got %+v", evs)
	}
}

// TestMonitor_NilCurr: nil current frame → no panic, no events.
func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	frame := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, InPits: false},
	})
	evs := m.Trigger(1000, frame, nil)
	if len(evs) != 0 {
		t.Errorf("expected no events, got %+v", evs)
	}
}

// TestMonitor_ClassFiltering_DifferentClass: opponent of different class
// → no best_lap/pitted events; EventOpponentClassDifferent fires once.
func TestMonitor_ClassFiltering_DifferentClass(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 105.0, VehicleClass: "GTE"},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: true, BestLapTime: 104.0, VehicleClass: "GTE"},
	})
	frame2.Player.LapNumber = 3

	evs := m.Trigger(1000, frame1, frame2)

	// Should only have the class-different event, not pitted or best_lap.
	hasClassDiff := false
	for _, e := range evs {
		if e.Type == EventOpponentClassDifferent {
			hasClassDiff = true
			if e.Payload["class"] != "GTE" {
				t.Errorf("expected class=GTE, got %v", e.Payload["class"])
			}
		}
		if e.Type == EventOpponentPitted {
			t.Errorf("pitted should NOT fire for different-class opponent")
		}
		if e.Type == EventOpponentBestLap {
			t.Errorf("best_lap should NOT fire for different-class opponent")
		}
	}
	if !hasClassDiff {
		t.Errorf("expected EventOpponentClassDifferent, got %+v", evs)
	}

	// Second trigger: class-different should NOT fire again (once per opponent).
	frame3 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: true, BestLapTime: 104.0, VehicleClass: "GTE"},
	})
	evs2 := m.Trigger(2000, frame2, frame3)
	for _, e := range evs2 {
		if e.Type == EventOpponentClassDifferent {
			t.Errorf("EventOpponentClassDifferent should fire only once per opponent")
		}
	}
}

// TestMonitor_ClassFiltering_SameClass: opponent of same class
// → best_lap and pitted fire normally; no class-different event.
func TestMonitor_ClassFiltering_SameClass(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")

	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 105.0, VehicleClass: "GT3"},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: true, BestLapTime: 104.0, VehicleClass: "GT3"},
	})
	frame2.Player.LapNumber = 3

	evs := m.Trigger(1000, frame1, frame2)
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (pitted + best_lap), got %+v", evs)
	}
	hasPitted := false
	hasBestLap := false
	for _, e := range evs {
		if e.Type == EventOpponentPitted {
			hasPitted = true
		}
		if e.Type == EventOpponentBestLap {
			hasBestLap = true
		}
		if e.Type == EventOpponentClassDifferent {
			t.Errorf("class-different should NOT fire for same-class opponent")
		}
	}
	if !hasPitted {
		t.Errorf("expected pitted event for same-class opponent")
	}
	if !hasBestLap {
		t.Errorf("expected best_lap event for same-class opponent")
	}
}

// TestMonitor_MinLaps_BestLapBlocked: best_lap requires player lap >= 2.
func TestMonitor_MinLaps_BestLapBlocked(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 105.0},
	})
	// Lap 1: below minLapsBeforeBestLap → no best_lap.
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 104.0},
	})
	frame2.Player.LapNumber = 1
	evs := m.Trigger(1000, frame1, frame2)
	for _, e := range evs {
		if e.Type == EventOpponentBestLap {
			t.Errorf("best_lap should NOT fire at lap 1, got %+v", evs)
		}
	}

	// Lap 3: meets requirement → best_lap fires.
	frame3 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 103.0},
	})
	frame3.Player.LapNumber = 3
	evs2 := m.Trigger(2000, frame2, frame3)
	hasBestLap := false
	for _, e := range evs2 {
		if e.Type == EventOpponentBestLap {
			hasBestLap = true
		}
	}
	if !hasBestLap {
		t.Errorf("expected best_lap at lap 3, got %+v", evs2)
	}
}

// TestMonitor_Cooldown_SuppressesRepeatedBestLap: best_lap re-firing within
// 60s is suppressed.
func TestMonitor_Cooldown_SuppressesRepeatedBestLap(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 105.0},
	})
	// Fire best_lap at t=1000.
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 104.0},
	})
	frame2.Player.LapNumber = 3
	evs1 := m.Trigger(1000, frame1, frame2)
	if len(evs1) != 1 || evs1[0].Type != EventOpponentBestLap {
		t.Fatalf("expected 1 best_lap at t=1000, got %+v", evs1)
	}

	// Another improvement at t=2000 (within 60s cooldown) → suppressed.
	frame3 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 103.0},
	})
	frame3.Player.LapNumber = 3
	evs2 := m.Trigger(2000, frame2, frame3)
	for _, e := range evs2 {
		if e.Type == EventOpponentBestLap {
			t.Errorf("best_lap at t=2000 should be suppressed by cooldown, got %+v", evs2)
		}
	}

	// After 60s cooldown (t=61000), improvement fires again.
	frame4 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 102.0},
	})
	frame4.Player.LapNumber = 3
	evs3 := m.Trigger(61000, frame3, frame4)
	hasBestLap := false
	for _, e := range evs3 {
		if e.Type == EventOpponentBestLap {
			hasBestLap = true
		}
	}
	if !hasBestLap {
		t.Errorf("expected best_lap at t=61000 after cooldown expired, got %+v", evs3)
	}
}

// TestMonitor_OpponentLeaves: opponent disappears from session → state cleaned up.
func TestMonitor_OpponentLeaves(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, InPits: false, BestLapTime: 100.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{}) // opponent gone
	m.Trigger(1000, frame1, frame2)
	if _, exists := m.states[22]; exists {
		t.Errorf("expected state for opponent 22 to be cleaned up")
	}
}

// --- Iter-3: Contextual pitting events ---

// TestMonitor_LeaderPitted: opponent at Place==1 enters pits → EventLeaderPitted.
func TestMonitor_LeaderPitted(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Leader", InPits: false, Place: 1},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Leader", InPits: true, Place: 1},
	})
	evs := m.Trigger(1000, frame1, frame2)
	hasLeaderPitted := false
	hasGenericPitted := false
	for _, e := range evs {
		if e.Type == EventLeaderPitted {
			hasLeaderPitted = true
			if e.Payload["driverName"] != "Leader" {
				t.Errorf("expected driverName=Leader, got %v", e.Payload["driverName"])
			}
		}
		if e.Type == EventOpponentPitted {
			hasGenericPitted = true
		}
	}
	if !hasLeaderPitted {
		t.Errorf("expected EventLeaderPitted, got %+v", evs)
	}
	if !hasGenericPitted {
		t.Errorf("expected generic EventOpponentPitted alongside leader pitted, got %+v", evs)
	}
}

// TestMonitor_CarAheadPitted: opponent at Place==playerPlace-1 enters pits.
func TestMonitor_CarAheadPitted(t *testing.T) {
	m := NewMonitor()
	// Player at place 2, opponent at place 1.
	frame1 := mkOpponentsFramePlace(1, 2, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Ahead", InPits: false, Place: 1},
	})
	frame2 := mkOpponentsFramePlace(1, 2, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Ahead", InPits: true, Place: 1},
	})
	evs := m.Trigger(1000, frame1, frame2)
	hasCarAheadPitted := false
	for _, e := range evs {
		if e.Type == EventCarAheadPitted {
			hasCarAheadPitted = true
			if e.Payload["driverName"] != "Ahead" {
				t.Errorf("expected driverName=Ahead, got %v", e.Payload["driverName"])
			}
		}
	}
	if !hasCarAheadPitted {
		t.Errorf("expected EventCarAheadPitted, got %+v", evs)
	}
}

// TestMonitor_CarBehindPitted: opponent at Place==playerPlace+1 enters pits.
func TestMonitor_CarBehindPitted(t *testing.T) {
	m := NewMonitor()
	// Player at place 2, opponent at place 3.
	frame1 := mkOpponentsFramePlace(1, 2, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Behind", InPits: false, Place: 3},
	})
	frame2 := mkOpponentsFramePlace(1, 2, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Behind", InPits: true, Place: 3},
	})
	evs := m.Trigger(1000, frame1, frame2)
	hasCarBehindPitted := false
	for _, e := range evs {
		if e.Type == EventCarBehindPitted {
			hasCarBehindPitted = true
			if e.Payload["driverName"] != "Behind" {
				t.Errorf("expected driverName=Behind, got %v", e.Payload["driverName"])
			}
		}
	}
	if !hasCarBehindPitted {
		t.Errorf("expected EventCarBehindPitted, got %+v", evs)
	}
}

// TestMonitor_CarAheadNotPittedWhenPlayerIsLeader: player at place 1 means
// no car ahead, so EventCarAheadPitted should not fire.
func TestMonitor_CarAheadNotPittedWhenPlayerIsLeader(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFramePlace(1, 1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Behind", InPits: false, Place: 2},
	})
	frame2 := mkOpponentsFramePlace(1, 1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Behind", InPits: true, Place: 2},
	})
	evs := m.Trigger(1000, frame1, frame2)
	for _, e := range evs {
		if e.Type == EventCarAheadPitted {
			t.Errorf("car_ahead_pitted should NOT fire when player is leader")
		}
	}
}

// --- Iter-3: Lead change detection ---

// TestMonitor_LeadChanged: player becomes place 1 (rising edge).
func TestMonitor_LeadChanged(t *testing.T) {
	m := NewMonitor()
	// Player at place 2.
	frame1 := mkOpponentsFramePlace(1, 2, nil)
	m.Trigger(1000, nil, frame1) // seed state
	// Player at place 1 — should fire lead_changed.
	frame2 := mkOpponentsFramePlace(1, 1, nil)
	evs := m.Trigger(2000, frame1, frame2)
	hasLeadChanged := false
	for _, e := range evs {
		if e.Type == EventLeadChanged {
			hasLeadChanged = true
		}
	}
	if !hasLeadChanged {
		t.Errorf("expected EventLeadChanged when player becomes leader, got %+v", evs)
	}
}

// TestMonitor_LeadChanged_NoFireIfAlreadyLeader: already at place 1 → no event.
func TestMonitor_LeadChanged_NoFireIfAlreadyLeader(t *testing.T) {
	m := NewMonitor()
	// Player already at place 1.
	frame1 := mkOpponentsFramePlace(1, 1, nil)
	m.Trigger(1000, nil, frame1) // seed
	frame2 := mkOpponentsFramePlace(1, 1, nil)
	evs := m.Trigger(2000, frame1, frame2)
	for _, e := range evs {
		if e.Type == EventLeadChanged {
			t.Errorf("lead_changed should NOT fire if player was already leader")
		}
	}
}

// TestMonitor_LeadChanged_Cooldown: lead change respects 60s cooldown.
func TestMonitor_LeadChanged_Cooldown(t *testing.T) {
	m := NewMonitor()
	// Fire lead change at t=1000.
	frame1 := mkOpponentsFramePlace(1, 2, nil)
	m.Trigger(1000, nil, frame1)
	frame2 := mkOpponentsFramePlace(1, 1, nil)
	evs1 := m.Trigger(2000, frame1, frame2)
	hasLead := false
	for _, e := range evs1 {
		if e.Type == EventLeadChanged {
			hasLead = true
		}
	}
	if !hasLead {
		t.Fatalf("expected lead_changed at t=2000, got %+v", evs1)
	}

	// Lose lead and regain within cooldown.
	frame3 := mkOpponentsFramePlace(1, 2, nil)
	m.Trigger(3000, frame2, frame3)
	frame4 := mkOpponentsFramePlace(1, 1, nil)
	evs2 := m.Trigger(35000, frame3, frame4)
	for _, e := range evs2 {
		if e.Type == EventLeadChanged {
			t.Errorf("lead_changed at t=35000 should be suppressed by cooldown")
		}
	}

	// After cooldown (t=63000+).
	frame5 := mkOpponentsFramePlace(1, 2, nil)
	m.Trigger(61000, frame4, frame5)
	frame6 := mkOpponentsFramePlace(1, 1, nil)
	evs3 := m.Trigger(63000, frame5, frame6)
	hasLead2 := false
	for _, e := range evs3 {
		if e.Type == EventLeadChanged {
			hasLead2 = true
		}
	}
	if !hasLead2 {
		t.Errorf("expected lead_changed at t=63000 after cooldown expired, got %+v", evs3)
	}
}

// --- Iter-3: Min improvement threshold for best lap ---

// TestMonitor_MinImprovementForBestLap: improvement < 0.05s is suppressed.
func TestMonitor_MinImprovementForBestLap(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 100.00},
	})
	// Improvement of 0.01s (< 0.05) — should NOT fire.
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 99.99},
	})
	frame2.Player.LapNumber = 3
	evs := m.Trigger(1000, frame1, frame2)
	for _, e := range evs {
		if e.Type == EventOpponentBestLap {
			t.Errorf("best_lap should NOT fire for 0.01s improvement (< 0.05 threshold)")
		}
	}
}

// TestMonitor_MinImprovementForBestLap_AllowsLargeImprovement: improvement
// of 0.1s (>= 0.05) fires best_lap.
func TestMonitor_MinImprovementForBestLap_AllowsLargeImprovement(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 100.00},
	})
	// Improvement of 0.1s (>= 0.05) — should fire.
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 99.90},
	})
	frame2.Player.LapNumber = 3
	evs := m.Trigger(1000, frame1, frame2)
	hasBestLap := false
	for _, e := range evs {
		if e.Type == EventOpponentBestLap {
			hasBestLap = true
		}
	}
	if !hasBestLap {
		t.Errorf("expected best_lap for 0.1s improvement, got %+v", evs)
	}
}

// --- Iter-4: Retirements and Disqualifications ---

func TestMonitor_OpponentRetired_DNF(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", BestLapTime: 100.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", BestLapTime: 100.0, FinishStatus: "DNF"},
	})
	evs := m.Trigger(1000, frame1, frame2)
	hasRetired := false
	for _, e := range evs {
		if e.Type == EventOpponentRetired {
			hasRetired = true
		}
	}
	if !hasRetired {
		t.Errorf("expected EventOpponentRetired (DNF), got %+v", evs)
	}
}

func TestMonitor_OpponentDSQ(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", BestLapTime: 100.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", BestLapTime: 100.0, FinishStatus: "DSQ"},
	})
	evs := m.Trigger(1000, frame1, frame2)
	hasDSQ := false
	for _, e := range evs {
		if e.Type == EventOpponentDSQ {
			hasDSQ = true
		}
	}
	if !hasDSQ {
		t.Errorf("expected EventOpponentDSQ, got %+v", evs)
	}
}

func TestMonitor_RetiredOneShot(t *testing.T) {
	m := NewMonitor()
	frame := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", BestLapTime: 100.0},
	})
	m.Trigger(1000, frame, mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", BestLapTime: 100.0, FinishStatus: "DNF"},
	}))
	evs := m.Trigger(2000, frame, mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", BestLapTime: 100.0, FinishStatus: "DNF"},
	}))
	for _, e := range evs {
		if e.Type == EventOpponentRetired {
			t.Errorf("expected no duplicate retired, got %s", e.Type)
		}
	}
}

// TestMonitor_OpponentGone_Retired: opponent disappears from vehicle list
// mid-session without DNF/DSQ → EventDriverSwapped fires.
func TestMonitor_OpponentGone_Retired(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false, BestLapTime: 100.0},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{}) // opponent gone
	evs := m.Trigger(1000, frame1, frame2)
	hasSwap := false
	for _, e := range evs {
		if e.Type == EventDriverSwapped {
			hasSwap = true
			if e.Payload["driverName"] != "Rival" {
				t.Errorf("expected driverName=Rival, got %v", e.Payload["driverName"])
			}
		}
	}
	if !hasSwap {
		t.Errorf("expected EventDriverSwapped when opponent disappears, got %+v", evs)
	}
}

// --- Feature 2: Opponent exiting pits ---

func TestMonitor_OpponentExitedPits_Fires(t *testing.T) {
	m := NewMonitor()
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: true},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false},
	})
	evs := m.Trigger(1000, frame1, frame2)
	found := false
	for _, e := range evs {
		if e.Type == EventOpponentExitedPits {
			found = true
			if e.Payload["driverName"] != "Rival" {
				t.Errorf("expected driverName=Rival, got %v", e.Payload["driverName"])
			}
			if e.Payload["id"] != int32(22) {
				t.Errorf("expected id=22, got %v", e.Payload["id"])
			}
		}
	}
	if !found {
		t.Errorf("expected EventOpponentExitedPits, got %+v", evs)
	}
}

func TestMonitor_OpponentExitedPits_OneShot(t *testing.T) {
	m := NewMonitor()
	// First exit.
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: true},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false},
	})
	evs1 := m.Trigger(1000, frame1, frame2)
	hasExit := false
	for _, e := range evs1 {
		if e.Type == EventOpponentExitedPits {
			hasExit = true
		}
	}
	if !hasExit {
		t.Fatalf("expected EventOpponentExitedPits on first exit, got %+v", evs1)
	}

	// Same opponent still out of pits → should NOT fire again.
	frame3 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false},
	})
	evs2 := m.Trigger(2000, frame2, frame3)
	for _, e := range evs2 {
		if e.Type == EventOpponentExitedPits {
			t.Errorf("exited_pits should NOT fire again while opponent stays out")
		}
	}
}

func TestMonitor_OpponentExitedPits_ResetsAfterReEntry(t *testing.T) {
	m := NewMonitor()
	// Exit 1.
	frame1 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: true},
	})
	frame2 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false},
	})
	m.Trigger(1000, frame1, frame2)

	// Re-enter pits.
	frame3 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: true},
	})
	m.Trigger(2000, frame2, frame3) // triggers pitted event, resets notedExit

	// Exit again → should fire once more.
	frame4 := mkOpponentsFrame(1, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Rival", InPits: false},
	})
	evs := m.Trigger(3000, frame3, frame4)
	found := false
	for _, e := range evs {
		if e.Type == EventOpponentExitedPits {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventOpponentExitedPits after re-entry and exit, got %+v", evs)
	}
}

func TestMonitor_OpponentExitedPits_PlayerIgnored(t *testing.T) {
	m := NewMonitor()
	frame1 := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: true},
		},
	}
	frame2 := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: false},
		},
	}
	evs := m.Trigger(1000, frame1, frame2)
	for _, e := range evs {
		if e.Type == EventOpponentExitedPits {
			t.Errorf("player exiting pits should NOT fire opponent.exited_pits")
		}
	}
}
