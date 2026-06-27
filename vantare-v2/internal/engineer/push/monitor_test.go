package push

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(gap float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindNext: gap},
		},
	}
}

func TestMonitor_FiresOnCloseGap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(0.5))
	if len(evs) != 1 || evs[0].Type != EventPushNow {
		t.Fatalf("expected 1 EventPushNow, got %+v", evs)
	}
	if gap, ok := evs[0].Payload["gapSecs"].(float64); !ok || gap != 0.5 {
		t.Errorf("expected gapSecs=0.5, got %v", evs[0].Payload)
	}
}

func TestMonitor_NoFireOnLargeGap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(2.5))
	if evs != nil {
		t.Errorf("expected nil (gap > threshold), got %+v", evs)
	}
}

func TestMonitor_NoFireOnZeroGap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(0))
	if evs != nil {
		t.Errorf("expected nil (gap=0, no opponent), got %+v", evs)
	}
}

func TestMonitor_NoFireOnNegativeGap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(-1.0))
	if evs != nil {
		t.Errorf("expected nil (gap<0 invalid), got %+v", evs)
	}
}

func TestMonitor_Cooldown60s(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(100_000, nil, mkFrame(0.5))
	if len(evs) != 1 {
		t.Fatalf("first call: expected 1 event, got %+v", evs)
	}
	// 30s later, still in close gap — cooldown blocks.
	evs = m.Trigger(100_000+30_000, nil, mkFrame(0.3))
	if evs != nil {
		t.Errorf("at +30s: expected nil (cooldown 60s), got %+v", evs)
	}
	// 61s later, cooldown elapsed.
	evs = m.Trigger(100_000+61_000, nil, mkFrame(0.3))
	if len(evs) != 1 {
		t.Errorf("at +61s: expected 1 event (cooldown elapsed), got %+v", evs)
	}
}

func TestMonitor_CustomThreshold(t *testing.T) {
	m := NewMonitorWithThreshold(3.0) // 3s threshold
	evs := m.Trigger(1000, nil, mkFrame(2.5))
	if len(evs) != 1 {
		t.Errorf("expected 1 event with 3s threshold on 2.5s gap, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0.5), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoPlayer(t *testing.T) {
	m := NewMonitor()
	// Two non-player vehicles — no player identifiable, no fallback.
	f := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: false, TimeBehindNext: 0.3},
			{ID: 2, IsPlayer: false, TimeBehindNext: 0.0},
		},
	}
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil (no player), got %+v", evs)
	}
}