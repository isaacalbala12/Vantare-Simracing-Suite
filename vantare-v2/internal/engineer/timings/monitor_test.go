package timings

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(gapLeader, gapNext float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindLeader: gapLeader, TimeBehindNext: gapNext, LapDistance: 100},
		},
	}
}

func TestMonitor_FiresAfterInterval(t *testing.T) {
	m := NewMonitor()
	// First call: init, no fire.
	evs := m.Trigger(1000, nil, mkFrame(10, 2))
	if evs != nil {
		t.Errorf("first call: expected nil (init), got %+v", evs)
	}
	// 61s later: fire.
	evs = m.Trigger(61_000, mkFrame(10, 2), mkFrame(11, 2.5))
	if len(evs) != 1 || evs[0].Type != EventGapReport {
		t.Fatalf("expected 1 EventGapReport, got %+v", evs)
	}
	if gap, ok := evs[0].Payload["gapToLeaderSec"].(float64); !ok || gap != 11 {
		t.Errorf("expected gapToLeaderSec=11, got %v", evs[0].Payload)
	}
}

func TestMonitor_NoFireUnderInterval(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(10, 2))
	// 30s later, still inside 60s interval.
	evs := m.Trigger(30_000, mkFrame(10, 2), mkFrame(11, 2.5))
	if evs != nil {
		t.Errorf("expected nil (interval 60s), got %+v", evs)
	}
}

func TestMonitor_NoFireOnNegativeGap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(-1, 2))
	if evs != nil {
		t.Errorf("expected nil (negative gap), got %+v", evs)
	}
	// Fire on next interval even with negative gap — should still be skipped.
	evs = m.Trigger(61_000, mkFrame(-1, 2), mkFrame(-1, 2.5))
	if evs != nil {
		t.Errorf("at +61s with negative gap: expected nil, got %+v", evs)
	}
}

func TestMonitor_CustomInterval(t *testing.T) {
	m := NewMonitorWithInterval(10) // 10s
	m.Trigger(1000, nil, mkFrame(10, 2))
	// 11s later.
	evs := m.Trigger(11_000, mkFrame(10, 2), mkFrame(11, 2.5))
	if len(evs) != 1 {
		t.Errorf("expected 1 event with 10s interval, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(10, 2), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}