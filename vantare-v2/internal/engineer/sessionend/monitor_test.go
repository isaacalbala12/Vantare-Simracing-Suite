package sessionend

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(gamePhase uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{GamePhase: gamePhase},
	}
}

func TestMonitor_FiresOnSessionOver(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	// Start at gamePhase 5 (green), 80s later transition to 8 (SessionOver).
	evs := m.Trigger(now, nil, mkFrame(5))
	if evs != nil {
		t.Errorf("first call (green): expected nil, got %+v", evs)
	}
	evs = m.Trigger(now+80_000, mkFrame(5), mkFrame(8))
	if len(evs) != 1 || evs[0].Type != EventSessionEnded {
		t.Fatalf("expected 1 EventSessionEnded, got %+v", evs)
	}
}

func TestMonitor_Gate60sBlocksShortSession(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5))
	// 30s later, SessionOver. Should be blocked by 60s gate.
	evs := m.Trigger(now+30_000, mkFrame(5), mkFrame(8))
	if evs != nil {
		t.Errorf("at +30s: expected nil (gate 60s), got %+v", evs)
	}
}

func TestMonitor_FiresOnlyOnce(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5))
	evs := m.Trigger(now+80_000, mkFrame(5), mkFrame(8))
	if len(evs) != 1 {
		t.Fatalf("first fire: expected 1, got %+v", evs)
	}
	// Next frame still in finished state — no duplicate.
	evs = m.Trigger(now+85_000, mkFrame(8), mkFrame(8))
	if evs != nil {
		t.Errorf("second fire: expected nil (no duplicate), got %+v", evs)
	}
}

func TestMonitor_ReArmsAfterSessionReset(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5))
	m.Trigger(now+80_000, mkFrame(5), mkFrame(8))
	// New session: green flag, then SessionOver again.
	evs := m.Trigger(now+200_000, mkFrame(8), mkFrame(5))
	if evs != nil {
		t.Errorf("transition to green: expected nil, got %+v", evs)
	}
	// After enough time in the new session, fires again.
	evs = m.Trigger(now+200_000+80_000, mkFrame(5), mkFrame(8))
	if len(evs) != 1 {
		t.Errorf("second session: expected 1 event (re-armed), got %+v", evs)
	}
}

func TestMonitor_NoFireOnSessionStoppedUnder60s(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5))
	// GamePhase 7 = SessionStopped.
	evs := m.Trigger(now+10_000, mkFrame(5), mkFrame(7))
	if evs != nil {
		t.Errorf("at +10s SessionStopped: expected nil (gate 60s), got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
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