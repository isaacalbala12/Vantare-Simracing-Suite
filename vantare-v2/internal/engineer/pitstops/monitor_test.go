package pitstops

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(inPits bool) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: inPits, LapDistance: 100},
		},
	}
}

func TestMonitor_FiresOnPitEntry(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(false), mkFrame(true))
	if len(evs) != 1 || evs[0].Type != EventPitEntry {
		t.Fatalf("expected 1 EventPitEntry, got %+v", evs)
	}
}

func TestMonitor_FiresOnPitExit(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(true), mkFrame(false))
	if len(evs) != 1 || evs[0].Type != EventPitExit {
		t.Fatalf("expected 1 EventPitExit, got %+v", evs)
	}
}

func TestMonitor_NoFireWhenStayingInPits(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(true), mkFrame(true))
	if evs != nil {
		t.Errorf("expected nil (no transition), got %+v", evs)
	}
}

func TestMonitor_NoFireWhenStayingOut(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(false), mkFrame(false))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NilPrevFiresOnEntry(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(true))
	if len(evs) != 1 || evs[0].Type != EventPitEntry {
		t.Fatalf("expected 1 EventPitEntry, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(false), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoPlayer(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: false, InPits: true},
			{ID: 2, IsPlayer: false, InPits: false},
		},
	}
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}