package sessionend

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(gamePhase uint8, sessionType int32, place uint8, totalLaps int16, numCars int32, finishStatus string) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{
			GamePhase:   gamePhase,
			SessionType: sessionType,
			NumVehicles: numCars,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: place, TotalLaps: totalLaps, FinishStatus: finishStatus},
		},
	}
}

func TestMonitor_FiresOnSessionOver(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	// Start at gamePhase 5 (green), session type 5 (Race).
	evs := m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	if evs != nil {
		t.Errorf("first call (green): expected nil, got %+v", evs)
	}
	evs = m.Trigger(now+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 1, 10, 20, "FINISHED"))
	// Should have EventSessionEnded AND EventSessionWon (P1).
	hasEnded := false
	hasWon := false
	for _, e := range evs {
		if e.Type == EventSessionEnded {
			hasEnded = true
		}
		if e.Type == EventSessionWon {
			hasWon = true
		}
	}
	if !hasEnded {
		t.Errorf("expected EventSessionEnded, got %+v", evs)
	}
	if !hasWon {
		t.Errorf("expected EventSessionWon for P1, got %+v", evs)
	}
}

func TestMonitor_Gate60sBlocksShortSession(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	// 30s later, SessionOver. Should be blocked by 60s gate.
	evs := m.Trigger(now+30_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 1, 10, 20, "FINISHED"))
	if evs != nil {
		t.Errorf("at +30s: expected nil (gate 60s), got %+v", evs)
	}
}

func TestMonitor_FiresOnlyOnce(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	evs := m.Trigger(now+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 1, 10, 20, "FINISHED"))
	if len(evs) < 1 {
		t.Fatalf("first fire: expected events, got %+v", evs)
	}
	// Next frame still in finished state — no duplicate.
	evs = m.Trigger(now+85_000, mkFrame(8, 5, 1, 0, 20, ""), mkFrame(8, 5, 1, 10, 20, "FINISHED"))
	if evs != nil {
		t.Errorf("second fire: expected nil (no duplicate), got %+v", evs)
	}
}

func TestMonitor_ReArmsAfterSessionReset(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	m.Trigger(now+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 1, 10, 20, "FINISHED"))
	// New session: green flag, then SessionOver again.
	evs := m.Trigger(now+200_000, mkFrame(8, 5, 1, 0, 20, ""), mkFrame(5, 5, 1, 0, 20, ""))
	if evs != nil {
		t.Errorf("transition to green: expected nil, got %+v", evs)
	}
	// After enough time in the new session, fires again.
	evs = m.Trigger(now+200_000+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 1, 10, 20, "FINISHED"))
	hasEnded := false
	for _, e := range evs {
		if e.Type == EventSessionEnded {
			hasEnded = true
		}
	}
	if !hasEnded {
		t.Errorf("second session: expected EventSessionEnded (re-armed), got %+v", evs)
	}
}

func TestMonitor_NoFireOnSessionStoppedUnder60s(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	// GamePhase 7 = SessionStopped.
	evs := m.Trigger(now+10_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(7, 5, 1, 0, 20, ""))
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

func TestMonitor_PodiumForP2(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	evs := m.Trigger(now+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 2, 10, 20, "FINISHED"))
	hasPodium := false
	for _, e := range evs {
		if e.Type == EventSessionPodium {
			hasPodium = true
		}
	}
	if !hasPodium {
		t.Errorf("expected EventSessionPodium for P2, got %+v", evs)
	}
}

func TestMonitor_LastPlace(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	evs := m.Trigger(now+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 20, 10, 20, "FINISHED"))
	hasLast := false
	for _, e := range evs {
		if e.Type == EventSessionLast {
			hasLast = true
		}
	}
	if !hasLast {
		t.Errorf("expected EventSessionLast for P20/20, got %+v", evs)
	}
}

func TestMonitor_DNF(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	evs := m.Trigger(now+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 20, 10, 20, "DNF"))
	hasDNF := false
	for _, e := range evs {
		if e.Type == EventSessionDNF {
			hasDNF = true
		}
	}
	if !hasDNF {
		t.Errorf("expected EventSessionDNF, got %+v", evs)
	}
}

func TestMonitor_DSQ(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 5, 1, 0, 20, ""))
	evs := m.Trigger(now+80_000, mkFrame(5, 5, 1, 0, 20, ""), mkFrame(8, 5, 20, 10, 20, "DSQ"))
	hasDSQ := false
	for _, e := range evs {
		if e.Type == EventSessionDSQ {
			hasDSQ = true
		}
	}
	if !hasDSQ {
		t.Errorf("expected EventSessionDSQ, got %+v", evs)
	}
}

func TestMonitor_QualPole(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	m.Trigger(now, nil, mkFrame(5, 3, 1, 0, 20, "")) // sessionType=3 (Qualify)
	evs := m.Trigger(now+80_000, mkFrame(5, 3, 1, 0, 20, ""), mkFrame(8, 3, 1, 10, 20, "FINISHED"))
	hasPole := false
	for _, e := range evs {
		if e.Type == EventSessionPole {
			hasPole = true
		}
	}
	if !hasPole {
		t.Errorf("expected EventSessionPole for Qual P1, got %+v", evs)
	}
}

func TestMonitor_GoodFinish(t *testing.T) {
	m := NewMonitor()
	now := int64(100_000)
	// First frame: start position 10.
	f1 := mkFrame(5, 5, 10, 0, 20, "")
	m.Trigger(now, nil, f1)
	// Finish at P5 (improvement over P10).
	f2 := mkFrame(8, 5, 5, 10, 20, "FINISHED")
	evs := m.Trigger(now+80_000, f1, f2)
	hasGood := false
	for _, e := range evs {
		if e.Type == EventSessionGood {
			hasGood = true
		}
	}
	if !hasGood {
		t.Errorf("expected EventSessionGood for 10→5 finish, got %+v", evs)
	}
}
