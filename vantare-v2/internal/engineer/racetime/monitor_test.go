package racetime

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(remSecs float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{TimeRemainingInGamePhase: remSecs},
	}
}

func TestMonitor_5MinFiresAtThreshold(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(300))
	if len(evs) != 1 || evs[0].Type != EventFiveMinRemain {
		t.Fatalf("expected 1 EventFiveMinRemain, got %+v", evs)
	}
}

func TestMonitor_2MinFiresAtThreshold(t *testing.T) {
	m := NewMonitor()
	// 5min fires first because 120 <= 300. The new monitor triggers
	// 5min and 2min on the same frame when both thresholds are crossed.
	evs := m.Trigger(1000, nil, mkFrame(120))
	if len(evs) != 2 {
		t.Fatalf("at 120s: expected 2 events (5+2), got %+v", evs)
	}
	// Now both are played; subsequent calls at any time-remaining
	// should not refire.
	evs = m.Trigger(2000, nil, mkFrame(60))
	if evs != nil {
		t.Errorf("at 60s after fires: expected nil, got %+v", evs)
	}
}

func TestMonitor_5And2FireTogetherWhenJumping(t *testing.T) {
	m := NewMonitor()
	// Sequence: first frame above 5min, second frame at 100s (between
	// 0 and 120): the 5min marker should already have fired on the way
	// down, so only 2min fires now.
	evs := m.Trigger(1000, nil, mkFrame(400))
	if len(evs) != 0 {
		t.Errorf("at 400s: expected nil, got %+v", evs)
	}
	evs = m.Trigger(2000, nil, mkFrame(200))
	if len(evs) != 1 || evs[0].Type != EventFiveMinRemain {
		t.Errorf("at 200s: expected 1 EventFiveMinRemain, got %+v", evs)
	}
	evs = m.Trigger(3000, nil, mkFrame(100))
	if len(evs) != 1 || evs[0].Type != EventTwoMinRemain {
		t.Errorf("at 100s: expected 1 EventTwoMinRemain, got %+v", evs)
	}
}

func TestMonitor_ZeroFiresWhenTimerReachesZero(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(0))
	if len(evs) != 1 || evs[0].Type != EventZeroMinRemain {
		t.Fatalf("at 0: expected 1 EventZeroMinRemain, got %+v", evs)
	}
}

func TestMonitor_NoFireWhenMuchTimeLeft(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(3600))
	if evs != nil {
		t.Errorf("expected nil (1h left), got %+v", evs)
	}
}

func TestMonitor_NoFireOnNegativeRem(t *testing.T) {
	// rem < 0 is "unknown"; should be skipped (infinity).
	m := NewMonitor()
	// rem == -1 should NOT fire (treated as invalid).
	evs := m.Trigger(1000, nil, mkFrame(-1))
	if evs != nil {
		t.Errorf("expected nil for rem=-1 (invalid), got %+v", evs)
	}
}

func TestMonitor_NoDuplicateAfterFire(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(300))
	// Next frame still at 300 — no re-fire.
	evs := m.Trigger(2000, nil, mkFrame(300))
	if evs != nil {
		t.Errorf("expected nil (no duplicate), got %+v", evs)
	}
}

func TestMonitor_ResetReArms(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(300))
	m.Reset()
	evs := m.Trigger(2000, nil, mkFrame(300))
	if len(evs) != 1 {
		t.Errorf("after Reset: expected 1 event, got %+v", evs)
	}
}

func TestMonitor_NilFrame(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NilSession(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, &telemetry.Frame{})
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}