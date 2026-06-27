package penalties

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(penalties int32) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{GamePhase: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Penalties: penalties, LapDistance: 100},
		},
	}
}

func TestMonitor_RisingEdgeEmitsEvent(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0), mkFrame(1))
	if len(evs) != 1 || evs[0].Type != EventNewDriveThrough {
		t.Fatalf("expected 1 EventNewDriveThrough, got %+v", evs)
	}
}

func TestMonitor_NoEventWhenAlreadyPenalized(t *testing.T) {
	m := NewMonitor()
	// First frame already has penalty=2; second frame still 2 — no rising edge.
	evs := m.Trigger(1000, mkFrame(2), mkFrame(2))
	if evs != nil {
		t.Errorf("expected nil (no rising edge), got %+v", evs)
	}
}

func TestMonitor_NoEventWhenCleared(t *testing.T) {
	m := NewMonitor()
	// Penalty went 2 -> 0 (served). Not a rising edge.
	evs := m.Trigger(1000, mkFrame(2), mkFrame(0))
	if evs != nil {
		t.Errorf("expected nil (cleared), got %+v", evs)
	}
}

func TestMonitor_Cooldown30s(t *testing.T) {
	m := NewMonitor()
	// Simulate 4 frames: imposed, served, re-imposed after cooldown, etc.
	// Behaviour: a rising edge 0->>0 fires (subject to cooldown); once the
	// monitor has seen a non-zero value, it stays "armed" until it sees 0,
	// at which point the next >0 is again a fresh rising edge (subject to cooldown).
	frames := []struct {
		prev  int32
		curr  int32
		nowMS int64
		want  int // expected events
	}{
		{prev: 0, curr: 1, nowMS: 100_000, want: 1},     // imposed -> fire
		{prev: 1, curr: 0, nowMS: 100_001, want: 0},     // served
		{prev: 0, curr: 1, nowMS: 105_000, want: 0},      // re-imposed 5s after first: cooldown blocks
		{prev: 1, curr: 1, nowMS: 131_000, want: 0},      // 31s after first: cooldown elapsed BUT no fresh rising edge (last=1 already)
		{prev: 1, curr: 0, nowMS: 132_000, want: 0},      // served
		{prev: 0, curr: 1, nowMS: 200_000, want: 1},      // 100s after first: re-armed, fires
	}
	for i, tc := range frames {
		evs := m.Trigger(tc.nowMS, mkFrame(tc.prev), mkFrame(tc.curr))
		got := len(evs)
		if got != tc.want {
			t.Errorf("frame %d (prev=%d curr=%d now=%d): expected %d events, got %d (%+v)",
				i, tc.prev, tc.curr, tc.nowMS, tc.want, got, evs)
		}
	}
}

func TestMonitor_NilPrevFiresOnFirstPenalty(t *testing.T) {
	m := NewMonitor()
	// No previous frame; current has penalty=1.
	evs := m.Trigger(1000, nil, mkFrame(1))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %+v", evs)
	}
}

func TestMonitor_NilCurrNoPanic(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoPlayerVehicle(t *testing.T) {
	m := NewMonitor()
	// Two non-player vehicles — no single player, no fallback.
	f := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: false, Penalties: 5},
			{ID: 2, IsPlayer: false, Penalties: 0},
		},
	}
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil (no player), got %+v", evs)
	}
}