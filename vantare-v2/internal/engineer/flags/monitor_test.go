package flags

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// fcyGamePhase is the value of SessionInfo.GamePhase that indicates
// Full Course Yellow / Safety Car. Same as rF2GamePhase.FullCourseYellow=6
// in CC RF2Data.cs:68. Defined locally so this package has no import on
// spotter (separation: flags shouldn't depend on spotter).
const fcyGamePhase uint8 = 6

func mkFrame(gamePhase uint8, playerFlag string) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{GamePhase: gamePhase},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Flag: playerFlag, LapDistance: 100},
		},
	}
}

func TestMonitor_TriggerFCYStart(t *testing.T) {
	m := NewMonitor()
	prev := mkFrame(5, "")              // green
	curr := mkFrame(fcyGamePhase, "")   // 6 = FCY

	evs := m.Trigger(1000, prev, curr)
	if len(evs) != 1 || evs[0].Type != EventFCYStarted {
		t.Fatalf("expected 1 EventFCYStarted, got %+v", evs)
	}
}

func TestMonitor_TriggerFCYEnd(t *testing.T) {
	m := NewMonitor()
	prev := mkFrame(6, "")
	curr := mkFrame(5, "")

	evs := m.Trigger(1000, prev, curr)
	if len(evs) != 1 || evs[0].Type != EventFCYEnded {
		t.Fatalf("expected 1 EventFCYEnded, got %+v", evs)
	}
}

func TestMonitor_FCYCooldown25s(t *testing.T) {
	m := NewMonitor()
	prev := mkFrame(5, "")
	curr := mkFrame(6, "")

	now := int64(100_000)
	evs := m.Trigger(now, prev, curr)
	if len(evs) != 1 {
		t.Fatalf("first call: expected 1 event, got %+v", evs)
	}
	// 24s later, still in FCY — no new event (cooldown 25s).
	prev2 := curr
	curr2 := mkFrame(6, "")
	evs = m.Trigger(now+24_000, prev2, curr2)
	if len(evs) != 0 {
		t.Errorf("at 24s: expected 0 events (cooldown), got %+v", evs)
	}
	// 26s later, again no rising edge (FCY already active). Should be silent.
	evs = m.Trigger(now+26_000, prev2, curr2)
	if len(evs) != 0 {
		t.Errorf("at 26s: expected 0 events (no rising edge), got %+v", evs)
	}
}

func TestMonitor_NoEventWhenBothFCY(t *testing.T) {
	m := NewMonitor()
	// Both frames FCY — no transition.
	evs := m.Trigger(1000, mkFrame(6, ""), mkFrame(6, ""))
	if len(evs) != 0 {
		t.Errorf("expected 0 events (no transition), got %+v", evs)
	}
}

func TestMonitor_BlueFlagWithCooldown(t *testing.T) {
	m := NewMonitor()
	prev := mkFrame(5, "GREEN")
	curr := mkFrame(5, "BLUE")

	now := int64(100_000)
	evs := m.Trigger(now, prev, curr)
	if len(evs) != 1 || evs[0].Type != EventBlueFlag {
		t.Fatalf("first call: expected 1 EventBlueFlag, got %+v", evs)
	}
	// 14s later still BLUE — no event (cooldown 15s).
	evs = m.Trigger(now+14_000, curr, curr)
	if len(evs) != 0 {
		t.Errorf("at 14s: expected 0 events (cooldown), got %+v", evs)
	}
	// 16s later still BLUE — should fire again (cooldown elapsed, no transition needed).
	evs = m.Trigger(now+16_000, curr, curr)
	if len(evs) != 1 || evs[0].Type != EventBlueFlag {
		t.Errorf("at 16s: expected 1 EventBlueFlag, got %+v", evs)
	}
}

func TestMonitor_NilPrevFirstCall(t *testing.T) {
	m := NewMonitor()
	// nil prev on first call must not panic; rising edge from nil/zero
	// to FCY should fire.
	evs := m.Trigger(1000, nil, mkFrame(6, ""))
	if len(evs) != 1 || evs[0].Type != EventFCYStarted {
		t.Fatalf("expected 1 EventFCYStarted, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5, ""), nil)
	if evs != nil {
		t.Errorf("expected nil events for nil curr, got %+v", evs)
	}
}

func TestIsFCY(t *testing.T) {
	if !IsFCY(mkFrame(6, "")) {
		t.Error("IsFCY(6) should be true")
	}
	if IsFCY(mkFrame(5, "")) {
		t.Error("IsFCY(5) should be false")
	}
	if IsFCY(nil) {
		t.Error("IsFCY(nil) should be false")
	}
	f := &telemetry.Frame{} // no session
	if IsFCY(f) {
		t.Error("IsFCY without session should be false")
	}
}

func TestMonitor_DoesNotCrashOnRealisticFrame(t *testing.T) {
	m := NewMonitor()
	frame := &telemetry.Frame{
		Connected:        true,
		PlayerHasVehicle: true,
		Player: &telemetry.PlayerTelemetry{
			ID:    1,
			Speed: 20.0,
		},
		Session: &telemetry.SessionInfo{
			TrackName: "Spa",
			GamePhase: 5,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Flag: "GREEN", LapDistance: 100},
			{ID: 2, Flag: "GREEN", LapDistance: 105},
		},
		TimestampUnixMS: time.Now().UnixMilli(),
	}
	evs := m.Trigger(frame.TimestampUnixMS, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected 0 events on clean green-flag frame, got %+v", evs)
	}
}