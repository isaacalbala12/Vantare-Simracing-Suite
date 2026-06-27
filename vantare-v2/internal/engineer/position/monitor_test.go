package position

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(place uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: place, LapDistance: 100},
		},
	}
}

func TestMonitor_PositionGained(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), mkFrame(4))
	if len(evs) != 1 || evs[0].Type != EventPositionGained {
		t.Fatalf("expected 1 EventPositionGained, got %+v", evs)
	}
}

func TestMonitor_PositionLost(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(3), mkFrame(4))
	if len(evs) != 1 || evs[0].Type != EventPositionLost {
		t.Fatalf("expected 1 EventPositionLost, got %+v", evs)
	}
}

func TestMonitor_NoFireOnSamePlace(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), mkFrame(5))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoFireOnPlaceZero(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), mkFrame(0))
	if evs != nil {
		t.Errorf("expected nil (Place=0 unknown), got %+v", evs)
	}
}

func TestMonitor_Cooldown10s(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(100_000, mkFrame(5), mkFrame(4))
	if len(evs) != 1 {
		t.Fatalf("first: expected 1, got %+v", evs)
	}
	// 5s later, position changes again — cooldown blocks.
	evs = m.Trigger(100_000+5_000, mkFrame(4), mkFrame(3))
	if evs != nil {
		t.Errorf("at +5s: expected nil (cooldown 10s), got %+v", evs)
	}
	// 11s later, cooldown elapsed.
	evs = m.Trigger(100_000+11_000, mkFrame(3), mkFrame(2))
	if len(evs) != 1 {
		t.Errorf("at +11s: expected 1 event, got %+v", evs)
	}
}

func TestMonitor_NilPrevFiresOnFirstChange(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(3))
	// First call: place=3, lastPlace=0, no event (no transition from known).
	if evs != nil {
		t.Errorf("first call with place=3: expected nil (no prior), got %+v", evs)
	}
	// Second call: place=2, transition 3->2, fire.
	evs = m.Trigger(2000, mkFrame(3), mkFrame(2))
	if len(evs) != 1 || evs[0].Type != EventPositionGained {
		t.Errorf("expected 1 EventPositionGained, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}