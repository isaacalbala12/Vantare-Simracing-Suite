package laps

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(lapNumber int32, bestLapTime float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        1,
			LapNumber: lapNumber,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, BestLapTime: bestLapTime},
		},
	}
}

func TestMonitor_LapCompleted(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0, 0), mkFrame(1, 0))
	if len(evs) != 1 || evs[0].Type != EventLapCompleted {
		t.Fatalf("expected 1 EventLapCompleted, got %+v", evs)
	}
	if lap, ok := evs[0].Payload["lap"].(int32); !ok || lap != 1 {
		t.Errorf("expected payload lap=1, got %v", evs[0].Payload)
	}
}

func TestMonitor_NoLapEventWhenSameNumber(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5, 0), mkFrame(5, 0))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_FastestLap(t *testing.T) {
	m := NewMonitor()
	// Lap 1 done, BestLapTime 105.5.
	m.Trigger(1000, mkFrame(0, 0), mkFrame(1, 105.5))
	// Lap 2, BestLapTime 104.2 (improvement).
	evs := m.Trigger(2000, mkFrame(1, 105.5), mkFrame(2, 104.2))
	if len(evs) != 2 {
		// 1 EventLapCompleted + 1 EventFastestLap
		t.Fatalf("expected 2 events, got %+v", evs)
	}
	var types []string
	for _, e := range evs {
		types = append(types, e.Type)
	}
	hasFastest := false
	for _, t := range types {
		if t == EventFastestLap {
			hasFastest = true
		}
	}
	if !hasFastest {
		t.Errorf("expected EventFastestLap among %v", types)
	}
}

func TestMonitor_NoFastestIfSlower(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, mkFrame(0, 0), mkFrame(1, 105.0))
	evs := m.Trigger(2000, mkFrame(1, 105.0), mkFrame(2, 106.5))
	// Only EventLapCompleted; no fastest.
	if len(evs) != 1 || evs[0].Type != EventLapCompleted {
		t.Errorf("expected 1 EventLapCompleted, got %+v", evs)
	}
}

func TestMonitor_NilPrevFiresOnFirstLap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(1, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %+v", evs)
	}
}

func TestMonitor_NilPlayer(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{} // no Player
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NilCurrNoPanic(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0, 0), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

// --- Consistency analysis tests ---

// mkFrameConsistent creates a frame with session time for lap-time tracking.
func mkFrameConsistent(lapNumber int32, sessionTime float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        1,
			LapNumber: lapNumber,
		},
		Session: &telemetry.SessionInfo{
			SessionTime: sessionTime,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, BestLapTime: 0},
		},
	}
}

// runConsistentLaps feeds consecutive lap completions and returns the
// consistency events (those of type consistent/improving/worsening).
func runConsistentLaps(t *testing.T, m *Monitor, laps []struct {
	lap         int32
	timeMS      int64
	sessionTime float64
}) []Event {
	t.Helper()
	var out []Event
	for _, l := range laps {
		evs := m.Trigger(l.timeMS, nil, mkFrameConsistent(l.lap, l.sessionTime))
		for _, e := range evs {
			if e.Type == EventLapConsistent || e.Type == EventLapImproving || e.Type == EventLapWorsening {
				out = append(out, e)
			}
		}
	}
	return out
}

func TestConsistency_Range(t *testing.T) {
	// 3 laps all within 0.5 % of each other → consistent.
	// Lap times: 100.0, 100.3, 100.1 (max delta ~0.3 %).
	m := NewMonitor()
	// Trigger: init, then 3 completions with rising lapNumber.
	m.Trigger(0, nil, mkFrameConsistent(0, 0))

	evs := m.Trigger(1000, nil, mkFrameConsistent(1, 100.0))
	_ = evs // lap completed, no consistency yet (too few laps)

	evs = m.Trigger(2000, nil, mkFrameConsistent(2, 200.3))
	_ = evs // lap completed, no consistency yet (2 laps)

	evs = m.Trigger(3000, nil, mkFrameConsistent(3, 300.4))
	_ = evs // lap completed, now we have 3 lap times

	// Each lap = sessionTime diff: 100.0, 100.3, 100.1
	// avg = 100.1333, range = 100.0 * 0.005 = 0.5
	// All within 0.5 of avg → consistent
	found := false
	for _, e := range evs {
		if e.Type == EventLapConsistent {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventLapConsistent among events, got %+v", evs)
	}
}

func TestConsistency_Improving(t *testing.T) {
	// Each lap faster (lower time) → improving.
	// Event fires on the 3rd lap (first time we have 3 lap times).
	m := NewMonitor()
	m.Trigger(0, nil, mkFrameConsistent(0, 0))

	m.Trigger(1000, nil, mkFrameConsistent(1, 105.0))        // lap time 105.0
	m.Trigger(2000, nil, mkFrameConsistent(2, 205.0))        // lap time 100.0 (faster)
	evs := m.Trigger(3000, nil, mkFrameConsistent(3, 280.0)) // lap time 75.0 (faster)
	// Last 3 laps: [105.0, 100.0, 75.0] → each faster → improving fires

	found := false
	for _, e := range evs {
		if e.Type == EventLapImproving {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventLapImproving among events, got %+v", evs)
	}
}

func TestConsistency_Worsening(t *testing.T) {
	// Each lap slower (higher time) → worsening.
	// Event fires on the 3rd lap (first time we have 3 lap times).
	m := NewMonitor()
	m.Trigger(0, nil, mkFrameConsistent(0, 0))

	m.Trigger(1000, nil, mkFrameConsistent(1, 80.0))         // lap time 80.0
	m.Trigger(2000, nil, mkFrameConsistent(2, 175.0))        // lap time 95.0 (slower)
	evs := m.Trigger(3000, nil, mkFrameConsistent(3, 280.0)) // lap time 105.0 (slower)
	// Last 3 laps: [80.0, 95.0, 105.0] → each slower → worsening fires

	found := false
	for _, e := range evs {
		if e.Type == EventLapWorsening {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventLapWorsening among events, got %+v", evs)
	}
}

func TestConsistency_TooFewLaps(t *testing.T) {
	// Only 2 lap times recorded → no consistency event.
	m := NewMonitor()
	m.Trigger(0, nil, mkFrameConsistent(0, 0))

	evs := m.Trigger(1000, nil, mkFrameConsistent(1, 100.0))
	_ = evs

	evs = m.Trigger(2000, nil, mkFrameConsistent(2, 200.0))
	for _, e := range evs {
		if e.Type == EventLapConsistent || e.Type == EventLapImproving || e.Type == EventLapWorsening {
			t.Errorf("expected no consistency event with 2 laps, got %s", e.Type)
		}
	}
}

func TestConsistency_Cooldown(t *testing.T) {
	// Fire consistent, then within 2 s → no fire, after 6 s → fire again.
	m := NewMonitor()
	m.Trigger(0, nil, mkFrameConsistent(0, 0))

	// Lap 1-3: consistent pattern (close times)
	m.Trigger(1000, nil, mkFrameConsistent(1, 100.0))
	m.Trigger(2000, nil, mkFrameConsistent(2, 200.1))
	evs := m.Trigger(3000, nil, mkFrameConsistent(3, 300.0))
	// Lap times: 100.0, 100.1, 99.9 → consistent

	fired := false
	for _, e := range evs {
		if e.Type == EventLapConsistent {
			fired = true
		}
	}
	if !fired {
		t.Fatal("expected first consistency event")
	}

	// Lap 4 at +5s (within cooldown: 2s since last event at +3s)
	evs = m.Trigger(5000, nil, mkFrameConsistent(4, 400.1))
	// Lap 4 time = 100.1 → still within range, but only 2s since last
	fired = false
	for _, e := range evs {
		if e.Type == EventLapConsistent {
			fired = true
		}
	}
	if fired {
		t.Errorf("expected no consistency event within cooldown (2s < 5s)")
	}

	// Lap 5 at +10s (6s since last event at +3s → after cooldown)
	evs = m.Trigger(9000, nil, mkFrameConsistent(5, 500.2))
	// Lap 5 time = 100.1 → still within range, cooldown expired
	fired = false
	for _, e := range evs {
		if e.Type == EventLapConsistent {
			fired = true
		}
	}
	if !fired {
		t.Errorf("expected consistency event after cooldown expired")
	}
}

func mkFormationFrame(gamePhase uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1, LapNumber: 0},
		Session: &telemetry.SessionInfo{GamePhase: gamePhase},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true},
		},
	}
}

func TestMonitor_FormationLap(t *testing.T) {
	m := NewMonitor()
	// Not in formation → no event.
	evs := m.Trigger(1000, nil, mkFormationFrame(4))
	for _, e := range evs {
		if e.Type == EventFormationLap {
			t.Errorf("unexpected EventFormationLap outside formation phase")
		}
	}

	// Enter formation phase → fires.
	evs = m.Trigger(2000, nil, mkFormationFrame(3))
	found := false
	for _, e := range evs {
		if e.Type == EventFormationLap {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventFormationLap in formation phase, got %+v", evs)
	}

	// Second trigger in formation → one-shot, should NOT fire again.
	evs = m.Trigger(3000, nil, mkFormationFrame(3))
	for _, e := range evs {
		if e.Type == EventFormationLap {
			t.Errorf("unexpected second EventFormationLap (one-shot)")
		}
	}

	// Leave formation (phase 4) then re-enter → should fire again.
	evs = m.Trigger(4000, nil, mkFormationFrame(4))
	evs = m.Trigger(5000, nil, mkFormationFrame(3))
	found = false
	for _, e := range evs {
		if e.Type == EventFormationLap {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventFormationLap after re-entering formation phase")
	}
}
