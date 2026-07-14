package pearls

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(lap int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: lap},
	}
}

func mkFrameWithSession(lap int32, lapsTotal int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: lap},
		Session: &telemetry.SessionInfo{
			SessionLapsTotal: lapsTotal,
		},
	}
}

func mkFrameWithPlace(lap int32, place uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: lap},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: place},
		},
	}
}

func TestMonitor_FirstPearlAtLap1(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(1))
	if len(evs) != 1 || evs[0].Type != EventPearl {
		t.Fatalf("expected 1 EventPearl, got %+v", evs)
	}
	pt, _ := evs[0].Payload["pearlType"].(PearlType)
	if pt != PearlTypeNeutral {
		t.Errorf("expected PearlTypeNeutral, got %v", pt)
	}
}

func TestMonitor_NoPearlAtLap0(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(0))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NextPearlAtInterval(t *testing.T) {
	m := NewMonitor()        // interval=12, prob=1.0 (no gating)
	m.SetMinTimeBetweenMS(1) // disable cooldown for this test
	m.Trigger(1000, nil, mkFrame(1))
	// Lap 2..12: no pearl.
	for lap := int32(2); lap <= 12; lap++ {
		evs := m.Trigger(1000+int64(lap)*1000, nil, mkFrame(lap))
		if evs != nil {
			t.Errorf("at lap %d: expected nil, got %+v", lap, evs)
		}
	}
	// Lap 13: pearl.
	evs := m.Trigger(14000, nil, mkFrame(13))
	if len(evs) != 1 {
		t.Errorf("at lap 13: expected 1 EventPearl, got %+v", evs)
	}
}

func TestMonitor_MaxPearlsPerRace(t *testing.T) {
	m := NewMonitor() // max=2, prob=1.0
	m.SetMinTimeBetweenMS(1)
	m.Trigger(1000, nil, mkFrame(1))  // pearl 1
	m.Trigger(2000, nil, mkFrame(13)) // pearl 2
	evs := m.Trigger(3000, nil, mkFrame(25))
	if evs != nil {
		t.Errorf("after max: expected nil, got %+v", evs)
	}
}

func TestMonitor_CustomInterval(t *testing.T) {
	m := NewMonitorWithParams(3, 5, 1.0)
	m.SetMinTimeBetweenMS(1)
	m.Trigger(1000, nil, mkFrame(1)) // pearl 1
	evs := m.Trigger(2000, nil, mkFrame(4))
	if len(evs) != 1 {
		t.Errorf("at lap 4 (interval 3): expected 1, got %+v", evs)
	}
	// 3 laps later again.
	evs = m.Trigger(3000, nil, mkFrame(7))
	if len(evs) != 1 {
		t.Errorf("at lap 7: expected 1, got %+v", evs)
	}
}

func TestMonitor_ResetReArms(t *testing.T) {
	m := NewMonitor()
	m.SetMinTimeBetweenMS(1)
	m.Trigger(1000, nil, mkFrame(1))  // pearl 1
	m.Trigger(2000, nil, mkFrame(13)) // pearl 2
	m.Reset()
	evs := m.Trigger(3000, nil, mkFrame(1))
	if len(evs) != 1 {
		t.Errorf("after Reset: expected 1, got %+v", evs)
	}
}

func TestMonitor_NilFrame(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NilPlayer(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, &telemetry.Frame{})
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_DisabledBlocks(t *testing.T) {
	m := NewMonitor()
	m.SetDisabled(true)
	evs := m.Trigger(1000, nil, mkFrame(1))
	if evs != nil {
		t.Errorf("expected nil when disabled, got %+v", evs)
	}
}

func TestMonitor_DisabledResetReEnables(t *testing.T) {
	m := NewMonitor()
	m.SetDisabled(true)
	m.Reset() // Reset clears disabled
	evs := m.Trigger(1000, nil, mkFrame(1))
	if len(evs) != 1 {
		t.Errorf("after Reset: expected 1, got %+v", evs)
	}
}

func TestMonitor_CooldownBlocks(t *testing.T) {
	m := NewMonitor()
	m.SetMinTimeBetweenMS(50_000) // 50s cooldown
	m.Trigger(1000, nil, mkFrame(1))
	// 10s later, pearl at lap 13 should be blocked by cooldown.
	evs := m.Trigger(11000, nil, mkFrame(13))
	if evs != nil {
		t.Errorf("expected nil (cooldown 50s, only 10s elapsed), got %+v", evs)
	}
	// 60s later, cooldown elapsed.
	evs = m.Trigger(61000, nil, mkFrame(13))
	if len(evs) != 1 {
		t.Errorf("after cooldown: expected 1, got %+v", evs)
	}
}

// --- Iter-2 tests ---

func TestProbability_DoesNotFireEveryTime(t *testing.T) {
	m := NewMonitorWithParams(1, 100, 0.5)
	m.SetMinTimeBetweenMS(1)
	fires := 0
	for i := 0; i < 100; i++ {
		// Each call uses a new frame at a new lap so the interval gate passes.
		evs := m.Trigger(1000+int64(i)*10, nil, mkFrame(int32(i+1)))
		if len(evs) > 0 {
			fires++
		}
	}
	if fires >= 100 {
		t.Errorf("probability 0.5 should not fire every time: got %d/100", fires)
	}
	if fires == 0 {
		t.Errorf("probability 0.5 should fire at least once: got %d/100", fires)
	}
}

func TestPearlType_Improvement_FiresGood(t *testing.T) {
	m := NewMonitorWithParams(1, 10, 1.0)
	m.SetMinTimeBetweenMS(1)
	prev := mkFrameWithPlace(1, 5) // place 5th
	curr := mkFrameWithPlace(2, 3) // improved to 3rd
	evs := m.Trigger(2000, prev, curr)
	if len(evs) != 1 {
		t.Fatalf("expected 1 pearl, got %+v", evs)
	}
	pt, _ := evs[0].Payload["pearlType"].(PearlType)
	if pt != PearlTypeGood {
		t.Errorf("expected PearlTypeGood for improvement, got %v", pt)
	}
}

func TestPearlType_Worsening_FiresBad(t *testing.T) {
	m := NewMonitorWithParams(1, 10, 1.0)
	m.SetMinTimeBetweenMS(1)
	prev := mkFrameWithPlace(1, 3) // place 3rd
	curr := mkFrameWithPlace(2, 5) // worsened to 5th
	evs := m.Trigger(2000, prev, curr)
	if len(evs) != 1 {
		t.Fatalf("expected 1 pearl, got %+v", evs)
	}
	pt, _ := evs[0].Payload["pearlType"].(PearlType)
	if pt != PearlTypeBad {
		t.Errorf("expected PearlTypeBad for worsening, got %v", pt)
	}
}

func TestPearlType_NoChange_FiresNeutral(t *testing.T) {
	m := NewMonitorWithParams(1, 10, 1.0)
	m.SetMinTimeBetweenMS(1)
	prev := mkFrameWithPlace(1, 4)
	curr := mkFrameWithPlace(2, 4) // same place
	evs := m.Trigger(2000, prev, curr)
	if len(evs) != 1 {
		t.Fatalf("expected 1 pearl, got %+v", evs)
	}
	pt, _ := evs[0].Payload["pearlType"].(PearlType)
	if pt != PearlTypeNeutral {
		t.Errorf("expected PearlTypeNeutral for no change, got %v", pt)
	}
}

func TestDisableInLast2Laps(t *testing.T) {
	m := NewMonitorWithParams(1, 10, 1.0)
	m.SetMinTimeBetweenMS(1)
	// Lap 8 is within the last 2 laps of a 10-lap race → should be skipped.
	evs := m.Trigger(1000, nil, mkFrameWithSession(9, 10))
	if evs != nil {
		t.Errorf("expected nil for lap 9 of 10 (last 2 laps), got %+v", evs)
	}
}

func TestDisableInLast2Laps_AllowsEarlyLaps(t *testing.T) {
	m := NewMonitorWithParams(1, 10, 1.0)
	m.SetMinTimeBetweenMS(1)
	// Lap 7 is NOT in the last 2 laps → should fire.
	evs := m.Trigger(1000, nil, mkFrameWithSession(7, 10))
	if len(evs) != 1 {
		t.Errorf("expected pearl for lap 7 of 10, got %+v", evs)
	}
}

func TestDisableInLast2Laps_TimedSessionNotAffected(t *testing.T) {
	m := NewMonitorWithParams(1, 10, 1.0)
	m.SetMinTimeBetweenMS(1)
	// Timed sessions have SessionLapsTotal=0 → no disable.
	evs := m.Trigger(1000, nil, mkFrame(1))
	if len(evs) != 1 {
		t.Errorf("expected pearl for lap 1 of timed session, got %+v", evs)
	}
}
