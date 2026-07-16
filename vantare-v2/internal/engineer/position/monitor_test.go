package position

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

type frameOption func(*telemetry.Frame)

func mkFrame(place uint8, opts ...frameOption) *telemetry.Frame {
	f := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{SessionType: 5}, // Race
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: place, LapDistance: 100},
		},
	}
	for _, o := range opts {
		o(f)
	}
	return f
}

func withTimeBehindNext(v float64) frameOption {
	return func(f *telemetry.Frame) {
		f.Vehicles[0].TimeBehindNext = v
	}
}

func withTotalLaps(v int16) frameOption {
	return func(f *telemetry.Frame) {
		f.Vehicles[0].TotalLaps = v
	}
}

func withNumVehicles(v int32) frameOption {
	return func(f *telemetry.Frame) {
		f.Session.NumVehicles = v
	}
}

func TestMonitor_PositionGained(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), mkFrame(4))
	hasGained := false
	for _, e := range evs {
		if e.Type == EventPositionGained {
			hasGained = true
		}
	}
	if !hasGained {
		t.Fatalf("expected EventPositionGained, got %+v", evs)
	}
}

func TestMonitor_PositionLost(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(3), mkFrame(4))
	hasLost := false
	for _, e := range evs {
		if e.Type == EventPositionLost {
			hasLost = true
		}
	}
	if !hasLost {
		t.Fatalf("expected EventPositionLost, got %+v", evs)
	}
}

func TestMonitor_NoFireOnSamePlace(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), mkFrame(5))
	hasPos := false
	for _, e := range evs {
		if e.Type == EventPositionGained || e.Type == EventPositionLost {
			hasPos = true
		}
	}
	if hasPos {
		t.Errorf("expected no position event, got %+v", evs)
	}
}

func TestMonitor_NoFireOnPlaceZero(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), mkFrame(0))
	hasPos := false
	for _, e := range evs {
		if e.Type == EventPositionGained || e.Type == EventPositionLost {
			hasPos = true
		}
	}
	if hasPos {
		t.Errorf("expected no position event (Place=0 unknown), got %+v", evs)
	}
}

func TestMonitor_Cooldown10s(t *testing.T) {
	m := NewMonitor()
	// 5→4: position improves (Place 4 < 5), so EventPositionGained.
	evs := m.Trigger(100_000, mkFrame(5), mkFrame(4))
	hasGained := false
	for _, e := range evs {
		if e.Type == EventPositionGained {
			hasGained = true
		}
	}
	if !hasGained {
		t.Fatalf("first: expected EventPositionGained (5→4), got %+v", evs)
	}
	// 5s later, position changes again 4→3 — cooldown blocks.
	evs = m.Trigger(100_000+5_000, mkFrame(4), mkFrame(3))
	hasGained = false
	for _, e := range evs {
		if e.Type == EventPositionGained {
			hasGained = true
		}
	}
	if hasGained {
		t.Errorf("at +5s: expected no position event (cooldown 10s), got %+v", evs)
	}
	// 11s later, cooldown elapsed.
	evs = m.Trigger(100_000+11_000, mkFrame(3), mkFrame(2))
	hasGained = false
	for _, e := range evs {
		if e.Type == EventPositionGained {
			hasGained = true
		}
	}
	if !hasGained {
		t.Errorf("at +11s: expected EventPositionGained, got %+v", evs)
	}
}

func TestMonitor_NilPrevFiresOnFirstChange(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(3))
	// First call: place=3, lastPlace=0, no position event (no transition from known).
	hasPos := false
	for _, e := range evs {
		if e.Type == EventPositionGained || e.Type == EventPositionLost {
			hasPos = true
		}
	}
	if hasPos {
		t.Errorf("first call with place=3: expected no position event (no prior), got %+v", evs)
	}
	// Second call: place=2, transition 3->2, fire.
	evs = m.Trigger(2000, mkFrame(3), mkFrame(2))
	hasGained := false
	for _, e := range evs {
		if e.Type == EventPositionGained {
			hasGained = true
		}
	}
	if !hasGained {
		t.Errorf("expected EventPositionGained, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

// ---- Start evaluation tests (CC thresholds by absolute start position) ----

func TestMonitor_StartGood(t *testing.T) {
	m := NewMonitor()
	// StartPlace < 5 → good start (CC threshold).
	m.Trigger(1000, nil, mkFrame(3))
	evs := m.Trigger(2000, mkFrame(3), mkFrame(1))
	hasStartGood := false
	for _, e := range evs {
		if e.Type == EventStartGood {
			hasStartGood = true
		}
	}
	if !hasStartGood {
		t.Errorf("expected EventStartGood (startPlace=3, now P1), got %+v", evs)
	}
}

func TestMonitor_StartTerrible(t *testing.T) {
	m := NewMonitor()
	// deltaPos=+7 > 5 → terrible start (CC: deltaPos > 5).
	m.Trigger(1000, nil, mkFrame(3))
	evs := m.Trigger(2000, mkFrame(3), mkFrame(10))
	hasTerrible := false
	for _, e := range evs {
		if e.Type == EventStartTerrible {
			hasTerrible = true
		}
	}
	if !hasTerrible {
		t.Errorf("expected EventStartTerrible (startPlace=3, delta=+7), got %+v", evs)
	}
}

func TestMonitor_StartBad(t *testing.T) {
	m := NewMonitor()
	// deltaPos=+4 > 3 → bad start (CC: deltaPos > 3).
	m.Trigger(1000, nil, mkFrame(3))
	evs := m.Trigger(2000, mkFrame(3), mkFrame(7))
	hasBad := false
	for _, e := range evs {
		if e.Type == EventStartBad {
			hasBad = true
		}
	}
	if !hasBad {
		t.Errorf("expected EventStartBad (startPlace=3, delta=+4), got %+v", evs)
	}
}

func TestMonitor_StartOK(t *testing.T) {
	m := NewMonitor()
	// deltaPos=+2, not >5 or >3, not <0 → ok (CC default).
	m.Trigger(1000, nil, mkFrame(3))
	evs := m.Trigger(2000, mkFrame(3), mkFrame(5))
	hasOK := false
	for _, e := range evs {
		if e.Type == EventStartOK {
			hasOK = true
		}
	}
	if !hasOK {
		t.Errorf("expected EventStartOK (startPlace=7, now P5), got %+v", evs)
	}
}

func TestMonitor_StartNotEmittedAgain(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(3))
	m.Trigger(2000, mkFrame(3), mkFrame(1)) // good start, marks playedStartMessage
	// Third call: start message should NOT fire again, even though data changed.
	evs := m.Trigger(3000, mkFrame(1), mkFrame(1))
	for _, e := range evs {
		if e.Type == EventStartGood || e.Type == EventStartBad || e.Type == EventStartTerrible || e.Type == EventStartOK {
			t.Errorf("unexpected start event after already evaluated: %+v", e)
		}
	}
}

// ---- Overtake detection tests ----

func TestOvertakeCompleted(t *testing.T) {
	m := NewMonitor()
	// Build gap buffer: player chases P5 from behind.
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(2.0)))
	m.Trigger(2000,
		mkFrame(5, withTimeBehindNext(2.0)),
		mkFrame(5, withTimeBehindNext(1.5)))
	m.Trigger(3000,
		mkFrame(5, withTimeBehindNext(1.5)),
		mkFrame(5, withTimeBehindNext(0.8)))
	// Overtake: Place improves to 4 inside the reporting window.
	evs := m.Trigger(3500,
		mkFrame(5, withTimeBehindNext(0.8)),
		mkFrame(4, withTimeBehindNext(1.2)))
	hasOvertake := false
	for _, e := range evs {
		if e.Type == EventOvertakeCompleted {
			hasOvertake = true
			if p, ok := e.Payload["newPlace"]; !ok || p.(uint8) != 4 {
				t.Errorf("expected newPlace=4, got %v", p)
			}
			if p, ok := e.Payload["positionsGained"]; !ok || p.(int) != 1 {
				t.Errorf("expected positionsGained=1, got %v", p)
			}
		}
	}
	if !hasOvertake {
		t.Errorf("expected EventOvertakeCompleted, got %+v", evs)
	}
}

func TestOvertakeLost(t *testing.T) {
	m := NewMonitor()
	// Player in P4 with gap to P3.
	m.Trigger(1000, nil, mkFrame(4, withTimeBehindNext(1.0)))
	m.Trigger(2000,
		mkFrame(4, withTimeBehindNext(1.0)),
		mkFrame(4, withTimeBehindNext(0.8)))
	// Being passed: Place worsens to 5, someone is now ahead (TBN > 0).
	evs := m.Trigger(3000,
		mkFrame(4, withTimeBehindNext(0.8)),
		mkFrame(5, withTimeBehindNext(0.5)))
	hasLost := false
	for _, e := range evs {
		if e.Type == EventOvertakeLost {
			hasLost = true
			if p, ok := e.Payload["newPlace"]; !ok || p.(uint8) != 5 {
				t.Errorf("expected newPlace=5, got %v", p)
			}
			if p, ok := e.Payload["positionsLost"]; !ok || p.(int) != 1 {
				t.Errorf("expected positionsLost=1, got %v", p)
			}
		}
	}
	if !hasLost {
		t.Errorf("expected EventOvertakeLost, got %+v", evs)
	}
}

func TestOvertakeCooldown(t *testing.T) {
	m := NewMonitor()
	// First overtake at T=3000.
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(2.0)))
	m.Trigger(2000,
		mkFrame(5, withTimeBehindNext(2.0)),
		mkFrame(5, withTimeBehindNext(1.0)))
	evs := m.Trigger(3000,
		mkFrame(5, withTimeBehindNext(1.0)),
		mkFrame(4, withTimeBehindNext(1.5)))
	hasOvertake := false
	for _, e := range evs {
		if e.Type == EventOvertakeCompleted {
			hasOvertake = true
		}
	}
	if !hasOvertake {
		t.Fatalf("expected first overtake, got %+v", evs)
	}

	// Attempt second overtake within 20s cooldown.
	m.Trigger(4000,
		mkFrame(4, withTimeBehindNext(1.5)),
		mkFrame(4, withTimeBehindNext(1.2)))
	m.Trigger(5000,
		mkFrame(4, withTimeBehindNext(1.2)),
		mkFrame(4, withTimeBehindNext(0.8)))
	evs = m.Trigger(6000,
		mkFrame(4, withTimeBehindNext(0.8)),
		mkFrame(3, withTimeBehindNext(0.5)))
	for _, e := range evs {
		if e.Type == EventOvertakeCompleted {
			t.Errorf("unexpected overtake within cooldown at T=6000: %+v", e)
		}
	}

	// After 25s from first overtake, cooldown allows.
	m.Trigger(26000,
		mkFrame(3, withTimeBehindNext(0.5)),
		mkFrame(3, withTimeBehindNext(0.3)))
	evs = m.Trigger(28000,
		mkFrame(3, withTimeBehindNext(0.3)),
		mkFrame(2, withTimeBehindNext(0.8)))
	hasOvertake = false
	for _, e := range evs {
		if e.Type == EventOvertakeCompleted {
			hasOvertake = true
		}
	}
	if !hasOvertake {
		t.Errorf("expected overtake after cooldown elapsed at T=28000, got %+v", evs)
	}
}

func TestOvertakeNoEventWhenTimeBehindNextIsZero(t *testing.T) {
	m := NewMonitor()
	// When there is no car ahead (TBN=0), Place improvement should NOT
	// trigger an overtake event (inheriting position, not passing).
	m.Trigger(1000, nil, mkFrame(5))
	evs := m.Trigger(2000, mkFrame(5), mkFrame(4))
	for _, e := range evs {
		if e.Type == EventOvertakeCompleted {
			t.Errorf("unexpected EventOvertakeCompleted when no car ahead (TBN=0): %+v", e)
		}
	}
}

// ---- Last place detection tests ----

func TestLastPlaceManyLaps(t *testing.T) {
	m := NewMonitor()
	numVeh := int32(20)

	// Init: last place, lap 0.
	m.Trigger(1000, nil, mkFrame(20, withNumVehicles(numVeh), withTotalLaps(0)))

	// Laps 1-4: no event expected.
	for lap := int16(1); lap <= 4; lap++ {
		evs := m.Trigger(1000+int64(lap)*1000,
			mkFrame(20, withNumVehicles(numVeh), withTotalLaps(lap-1)),
			mkFrame(20, withNumVehicles(numVeh), withTotalLaps(lap)))
		for _, e := range evs {
			if e.Type == EventLastPlaceForManyLaps {
				t.Fatalf("unexpected last place event at lap %d: %+v", lap, e)
			}
		}
	}

	// Lap 5: should fire.
	evs := m.Trigger(6000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(4)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(5)))
	hasLast := false
	for _, e := range evs {
		if e.Type == EventLastPlaceForManyLaps {
			hasLast = true
		}
	}
	if !hasLast {
		t.Errorf("expected EventLastPlaceForManyLaps at lap 5, got %+v", evs)
	}
}

func TestLastPlaceResetAfterImprovement(t *testing.T) {
	m := NewMonitor()
	numVeh := int32(20)

	// Start in last place for 2 laps.
	m.Trigger(1000, nil, mkFrame(20, withNumVehicles(numVeh), withTotalLaps(0)))
	m.Trigger(2000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(0)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(1)))

	// Improve to P15 → counter resets.
	m.Trigger(3000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(1)),
		mkFrame(15, withNumVehicles(numVeh), withTotalLaps(1)))

	// Return to last place. Need 5 laps to trigger again.
	m.Trigger(4000,
		mkFrame(15, withNumVehicles(numVeh), withTotalLaps(1)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(2)))
	m.Trigger(5000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(2)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(3)))
	m.Trigger(6000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(3)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(4)))
	m.Trigger(7000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(4)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(5)))
	evs := m.Trigger(8000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(5)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(6)))

	hasLast := false
	for _, e := range evs {
		if e.Type == EventLastPlaceForManyLaps {
			hasLast = true
		}
	}
	if !hasLast {
		t.Errorf("expected EventLastPlaceForManyLaps after reset and 5 laps in last, got %+v", evs)
	}
}

func TestLastPlaceOneShot(t *testing.T) {
	m := NewMonitor()
	numVeh := int32(20)

	m.Trigger(1000, nil, mkFrame(20, withNumVehicles(numVeh), withTotalLaps(0)))
	// Laps 1-4: build up counter without firing.
	for lap := int16(1); lap <= 4; lap++ {
		m.Trigger(1000+int64(lap)*1000,
			mkFrame(20, withNumVehicles(numVeh), withTotalLaps(lap-1)),
			mkFrame(20, withNumVehicles(numVeh), withTotalLaps(lap)))
	}
	// Lap 5: first emission (lapsInLastPlace reaches 5).
	evs := m.Trigger(6000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(4)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(5)))
	count := 0
	for _, e := range evs {
		if e.Type == EventLastPlaceForManyLaps {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected exactly 1 EventLastPlaceForManyLaps (one-shot), got %d in %+v", count, evs)
	}

	// Extra lap should NOT re-fire (one-shot).
	evs = m.Trigger(7000,
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(5)),
		mkFrame(20, withNumVehicles(numVeh), withTotalLaps(6)))
	for _, e := range evs {
		if e.Type == EventLastPlaceForManyLaps {
			t.Errorf("unexpected re-fire of EventLastPlaceForManyLaps (one-shot): %+v", e)
		}
	}
}

func mkFormationFrame(gamePhase uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{GamePhase: gamePhase},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 5},
		},
	}
}

func TestMonitor_FormationPosition(t *testing.T) {
	m := NewMonitor()
	// Not in formation → no event.
	evs := m.Trigger(1000, nil, mkFormationFrame(4))
	for _, e := range evs {
		if e.Type == EventFormationPosition {
			t.Errorf("unexpected EventFormationPosition outside formation phase")
		}
	}

	// Enter formation → fire.
	evs = m.Trigger(2000, nil, mkFormationFrame(3))
	found := false
	for _, e := range evs {
		if e.Type == EventFormationPosition {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventFormationPosition in formation phase, got %+v", evs)
	}

	// Second call → one-shot, no re-fire.
	evs = m.Trigger(3000, nil, mkFormationFrame(3))
	for _, e := range evs {
		if e.Type == EventFormationPosition {
			t.Errorf("unexpected second EventFormationPosition (one-shot)")
		}
	}
}

func TestMonitor_FormationPositionResetsOnSessionChange(t *testing.T) {
	m := NewMonitor()
	// Fire formation once.
	evs := m.Trigger(1000, nil, mkFormationFrame(3))
	found := false
	for _, e := range evs {
		if e.Type == EventFormationPosition {
			found = true
		}
	}
	if !found {
		t.Fatal("expected first EventFormationPosition")
	}

	// Session change triggers reset. Simulate by changing SessionType.
	prev := mkFormationFrame(3)
	curr := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{GamePhase: 3, SessionType: 6},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 3},
		},
	}
	evs = m.Trigger(2000, prev, curr)
	// Should not re-fire on this call (session change resets but curr is
	// still formation phase; the reset happens before the formation check).
	found = false
	for _, e := range evs {
		if e.Type == EventFormationPosition {
			found = true
		}
	}
	if found {
		t.Errorf("unexpected EventFormationPosition on session change frame (reset then re-check)")
	}
}

// ---------------------------------------------------------------------------
// Feature 2: Give position back tests
// ---------------------------------------------------------------------------

func TestMonitor_GivePositionBack_FiresWhenOpponentClose(t *testing.T) {
	m := NewMonitor()
	// First establish position.
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(0)))
	// Gain position from P5 to P4 with opponent close behind (<1.0s).
	evs := m.Trigger(2000, mkFrame(5, withTimeBehindNext(0.5)), mkFrame(4, withTimeBehindNext(0.5)))
	found := false
	for _, e := range evs {
		if e.Type == EventGivePositionBack {
			found = true
			if p, ok := e.Payload["urgent"]; ok {
				if u, ok := p.(bool); ok && u {
					t.Errorf("expected urgent=false for non-urgent gap (0.5s)")
				}
			}
			break
		}
	}
	if !found {
		t.Fatalf("expected EventGivePositionBack, got %+v", evs)
	}
}

func TestMonitor_GivePositionBackNow_FiresWhenGapTiny(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(0)))
	// Gain position from P5 to P4 with opponent very close (<0.3s).
	evs := m.Trigger(2000, mkFrame(5, withTimeBehindNext(0.2)), mkFrame(4, withTimeBehindNext(0.2)))
	found := false
	for _, e := range evs {
		if e.Type == EventGivePositionBackNow {
			found = true
			if p, ok := e.Payload["urgent"]; ok {
				if u, ok := p.(bool); ok && !u {
					t.Errorf("expected urgent=true for tiny gap (0.2s)")
				}
			}
			break
		}
	}
	if !found {
		t.Fatalf("expected EventGivePositionBackNow, got %+v", evs)
	}
}

func TestMonitor_GivePositionBack_Cooldown60s(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(0)))

	// First give-back fires.
	evs := m.Trigger(2000, mkFrame(5, withTimeBehindNext(0.5)), mkFrame(4, withTimeBehindNext(0.5)))
	found := false
	for _, e := range evs {
		if e.Type == EventGivePositionBack {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected first EventGivePositionBack, got %+v", evs)
	}

	// Second gain (from a different frame) within 60s should NOT fire.
	// Simulate another gain by moving position again.
	evs = m.Trigger(10000, mkFrame(4, withTimeBehindNext(0.5)), mkFrame(3, withTimeBehindNext(0.5)))
	for _, e := range evs {
		if e.Type == EventGivePositionBack || e.Type == EventGivePositionBackNow {
			t.Errorf("unexpected give-back within 60s cooldown: %+v", e)
		}
	}

	// After 60s cooldown, should fire again.
	evs = m.Trigger(65000, mkFrame(3, withTimeBehindNext(0.5)), mkFrame(2, withTimeBehindNext(0.5)))
	found = false
	for _, e := range evs {
		if e.Type == EventGivePositionBack {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventGivePositionBack after 60s cooldown, got %+v", evs)
	}
}

func TestMonitor_GivePositionBack_NoFireWhenGapLarge(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(0)))
	// Gain position from P5 to P4 but opponent far (>1.0s) → no give-back.
	evs := m.Trigger(2000, mkFrame(5, withTimeBehindNext(1.5)), mkFrame(4, withTimeBehindNext(1.5)))
	for _, e := range evs {
		if e.Type == EventGivePositionBack || e.Type == EventGivePositionBackNow {
			t.Errorf("unexpected give-back when opponent far (gap=1.5s): %+v", e)
		}
	}
}

func TestMonitor_GivePositionBack_NoFireWhenNoTimeBehindNext(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(5))
	// Gain position but no car ahead (TimeBehindNext = 0) → not a real pass.
	evs := m.Trigger(2000, mkFrame(5), mkFrame(4))
	for _, e := range evs {
		if e.Type == EventGivePositionBack || e.Type == EventGivePositionBackNow {
			t.Errorf("unexpected give-back when TimeBehindNext=0: %+v", e)
		}
	}
}

func TestMonitor_GivePositionBack_NoFireWhenNoRecentGain(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(0)))
	// Gain position.
	m.Trigger(2000, mkFrame(5, withTimeBehindNext(0.5)), mkFrame(4, withTimeBehindNext(0.5)))
	// After 15s, the gain window has expired (10s window).
	evs := m.Trigger(17000, mkFrame(4, withTimeBehindNext(0.5)), mkFrame(4, withTimeBehindNext(0.5)))
	for _, e := range evs {
		if e.Type == EventGivePositionBack || e.Type == EventGivePositionBackNow {
			t.Errorf("unexpected give-back outside 10s gain window: %+v", e)
		}
	}
}

func TestMonitor_GivePositionBack_ResetsOnSessionChange(t *testing.T) {
	m := NewMonitor()
	// Set up session with SessionType=5 (Race).
	m.Trigger(1000, nil, mkFrame(5, withTimeBehindNext(0)))
	// Gain position and fire give-back.
	m.Trigger(2000, mkFrame(5, withTimeBehindNext(0.5)), mkFrame(4, withTimeBehindNext(0.5)))

	// Session change.
	curr := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{SessionType: 6},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 10, TimeBehindNext: 0.5},
		},
	}
	m.Trigger(3000, mkFrame(4, withTimeBehindNext(0.5)), curr)

	// After session change, gain should produce a new give-back event.
	evs := m.Trigger(4000, mkFrame(10, withTimeBehindNext(0.5)), mkFrame(9, withTimeBehindNext(0.5)))
	found := false
	for _, e := range evs {
		if e.Type == EventGivePositionBack {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventGivePositionBack after session change reset, got %+v", evs)
	}
}
