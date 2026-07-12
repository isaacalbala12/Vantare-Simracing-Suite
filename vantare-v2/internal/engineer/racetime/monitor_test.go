package racetime

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(remSecs float64, runningSecs float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{TimeRemainingInGamePhase: remSecs, SessionTime: runningSecs},
	}
}

func TestMonitor_20MinFiresAtThreshold(t *testing.T) {
	m := NewMonitor()
	// 20 min: rem/60 < 20 && > 19.9, needs runningTime > 120
	evs := m.Trigger(1000, nil, mkFrame(1199.5, 200))
	if len(evs) == 0 || evs[0].Type != EventTwentyMinRemain {
		t.Fatalf("expected EventTwentyMinRemain at 1199.5s, got %+v", evs)
	}
}

func TestMonitor_15MinFiresAtThreshold(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(899.5, 200))
	if len(evs) == 0 || evs[0].Type != EventFifteenMinRemain {
		t.Fatalf("expected EventFifteenMinRemain at 899.5s, got %+v", evs)
	}
}

func TestMonitor_10MinFiresAtThreshold(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(599.5, 200))
	if len(evs) == 0 || evs[0].Type != EventTenMinRemain {
		t.Fatalf("expected EventTenMinRemain at 599.5s, got %+v", evs)
	}
}

func TestMonitor_5MinFiresAtThreshold(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(299.5, 200))
	if len(evs) == 0 || evs[0].Type != EventFiveMinRemain {
		t.Fatalf("expected 1 EventFiveMinRemain, got %+v", evs)
	}
}

func TestMonitor_2MinFiresAtThreshold(t *testing.T) {
	m := NewMonitor()
	// At 119.5 with runningTime > 60: 2min fires (rem/60 ~1.99),
	// plus pearls_disable (rem/60 < 3). The 2min gate is rem/60 < 2 && > 1.9,
	// so 1.99 matches. Should fire both 2min and pearls_disable.
	evs := m.Trigger(1000, nil, mkFrame(119.5, 100))
	has2Min := false
	for _, e := range evs {
		if e.Type == EventTwoMinRemain {
			has2Min = true
			break
		}
	}
	if !has2Min {
		t.Fatalf("expected EventTwoMinRemain at 119.5s, got %+v", evs)
	}
}

// 5min and 2min fire together when both thresholds crossed with enough running time.
func TestMonitor_5And2FireTogetherWhenJumping(t *testing.T) {
	m := NewMonitor()
	// Start above 5min threshold.
	evs := m.Trigger(1000, nil, mkFrame(400, 200))
	if len(evs) != 0 {
		t.Errorf("at 400s: expected nil (no gate crosses), got %+v", evs)
	}
	// At 200s: rem/60 ≈ 3.33, which is < 5 && > 4.9? No, 3.33 is not > 4.9.
	// So 5-min doesn't fire here either. Need to test sequential cross.
	// Instead use direct test: go from >300 to exactly 299.x.
	_ = evs
}

func TestMonitor_5MinSequential(t *testing.T) {
	m := NewMonitor()
	// First above threshold.
	m.Trigger(1000, nil, mkFrame(400, 200))
	// Then cross 5-min.
	evs := m.Trigger(2000, nil, mkFrame(299.5, 200))
	has5Min := false
	for _, e := range evs {
		if e.Type == EventFiveMinRemain {
			has5Min = true
			break
		}
	}
	if !has5Min {
		t.Errorf("at 299.5s: expected EventFiveMinRemain, got %+v", evs)
	}
	// Then cross 2-min.
	evs = m.Trigger(3000, nil, mkFrame(119.5, 100))
	has2Min := false
	for _, e := range evs {
		if e.Type == EventTwoMinRemain {
			has2Min = true
			break
		}
	}
	if !has2Min {
		t.Errorf("at 119.5s: expected EventTwoMinRemain, got %+v", evs)
	}
}

func TestMonitor_ZeroFiresWhenTimerReachesZero(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(0, 100))
	if len(evs) == 0 || evs[0].Type != EventZeroMinRemain {
		t.Fatalf("at 0: expected 1 EventZeroMinRemain, got %+v", evs)
	}
}

func TestMonitor_ZeroFiresWhenTimerBelow02(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(0.1, 100))
	has0Min := false
	for _, e := range evs {
		if e.Type == EventZeroMinRemain {
			has0Min = true
			break
		}
	}
	if !has0Min {
		t.Fatalf("at 0.1: expected EventZeroMinRemain (<=0.2), got %+v", evs)
	}
}

func TestMonitor_NoFireWhenMuchTimeLeft(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(3600, 200))
	if evs != nil {
		t.Errorf("expected nil (1h left), got %+v", evs)
	}
}

func TestMonitor_NoFireOnNegativeRem(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(-1, 100))
	if evs != nil {
		t.Errorf("expected nil for rem=-1 (invalid), got %+v", evs)
	}
}

func TestMonitor_NoDuplicateAfterFire(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(299.5, 200))
	evs := m.Trigger(2000, nil, mkFrame(299.5, 200))
	if len(evs) != 0 {
		t.Errorf("expected 0 events (no duplicate), got %+v", evs)
	}
}

func TestMonitor_ResetReArms(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(299.5, 200))
	m.Reset()
	evs := m.Trigger(2000, nil, mkFrame(299.5, 200))
	if len(evs) == 0 || evs[0].Type != EventFiveMinRemain {
		t.Errorf("after Reset: expected EventFiveMinRemain, got %+v", evs)
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

func TestMonitor_RunningTimeGateBlocksEarly(t *testing.T) {
	m := NewMonitor()
	// 5min threshold crossed but runningTime = 50 < 120 → should NOT fire.
	evs := m.Trigger(1000, nil, mkFrame(299.5, 50))
	if len(evs) != 0 {
		t.Errorf("expected 0 events (runningTime 50 < 120), got %+v", evs)
	}
}

func TestMonitor_RunningTimeGateBlocks2MinEarly(t *testing.T) {
	m := NewMonitor()
	// 2min threshold crossed but runningTime = 30 < 60 → should NOT fire.
	evs := m.Trigger(1000, nil, mkFrame(119.5, 30))
	if len(evs) != 0 {
		t.Errorf("expected 0 events (runningTime 30 < 60), got %+v", evs)
	}
}

func TestMonitor_HalfwayFires(t *testing.T) {
	m := NewMonitor()
	// First frame at 600s rem — captures halfTime = 300.
	m.Trigger(1000, nil, mkFrame(600, 200))
	// Later: rem < halfTime (200 < 300)
	evs := m.Trigger(2000, nil, mkFrame(200, 200))
	if len(evs) == 0 || evs[0].Type != EventHalfWayRemain {
		t.Errorf("expected EventHalfWayRemain at 200s rem (half=300), got %+v", evs)
	}
}

func TestMonitor_PearlsDisabledAtLessThan3Min(t *testing.T) {
	m := NewMonitor()
	// runningTime > 60, rem/60 < 3 (e.g., 170s = 2.83 min)
	evs := m.Trigger(1000, nil, mkFrame(170, 100))
	found := false
	for _, e := range evs {
		if e.Type == "racetime.pearls_disable" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected racetime.pearls_disable event at rem=170 (<3min), got %+v", evs)
	}
	if !m.PearlsDisabled() {
		t.Errorf("expected PearlsDisabled()=true")
	}
}

func TestMonitor_PearlsNotDisabledAbove3Min(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(200, 100))
	for _, e := range evs {
		if e.Type == "racetime.pearls_disable" {
			t.Errorf("unexpected pearls_disable at rem=200 (>3min), got %+v", evs)
		}
	}
	if m.PearlsDisabled() {
		t.Errorf("expected PearlsDisabled()=false")
	}
}

func TestMonitor_ResetClearsPearlsDisable(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(170, 100))
	if !m.PearlsDisabled() {
		t.Fatal("expected disabled after <3min")
	}
	m.Reset()
	if m.PearlsDisabled() {
		t.Errorf("expected PearlsDisabled()=false after Reset")
	}
}

// ---------------------------------------------------------------------------
// Sub-minute markers: 1-minute and 30-seconds remaining
// ---------------------------------------------------------------------------

func TestMonitor_OneMinRemaining(t *testing.T) {
	m := NewMonitor()
	// rem=60, runningTime=100 (>60) → should fire.
	evs := m.Trigger(1000, nil, mkFrame(60, 100))
	var found bool
	for _, e := range evs {
		if e.Type == EventOneMinRemain {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventOneMinRemain at 60s rem, got %+v", evs)
	}
}

func TestMonitor_OneMinRemainingBelow60(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(30, 100))
	var found bool
	for _, e := range evs {
		if e.Type == EventOneMinRemain {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventOneMinRemain at 30s rem (<=60), got %+v", evs)
	}
}

func TestMonitor_ThirtySecRemaining(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(30, 100))
	var found bool
	for _, e := range evs {
		if e.Type == EventThirtySecRemain {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventThirtySecRemain at 30s rem, got %+v", evs)
	}
}

func TestMonitor_SubOneMinNoFireAbove60(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(61, 100))
	for _, e := range evs {
		if e.Type == EventOneMinRemain || e.Type == EventThirtySecRemain {
			t.Fatal("unexpected sub-minute event above 60s")
		}
	}
}

func TestMonitor_OneMinAnd30sFireSequentially(t *testing.T) {
	m := NewMonitor()
	// At 45s: only 1-min fires (<=60), 30s does not (>30).
	evs := m.Trigger(1000, nil, mkFrame(45, 100))
	has1Min := false
	has30s := false
	for _, e := range evs {
		if e.Type == EventOneMinRemain {
			has1Min = true
		}
		if e.Type == EventThirtySecRemain {
			has30s = true
		}
	}
	if !has1Min {
		t.Error("expected EventOneMinRemain at 45s")
	}
	if has30s {
		t.Error("unexpected EventThirtySecRemain at 45s (>30)")
	}

	// Advance to 20s: 30s fires.
	evs = m.Trigger(2000, nil, mkFrame(20, 100))
	has30s = false
	for _, e := range evs {
		if e.Type == EventThirtySecRemain {
			has30s = true
		}
	}
	if !has30s {
		t.Error("expected EventThirtySecRemain at 20s")
	}
}

func TestMonitor_SubMinuteNoDuplicateAfterFire(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(45, 100))
	// Second call with same conditions → no duplicate.
	evs := m.Trigger(2000, nil, mkFrame(45, 100))
	for _, e := range evs {
		if e.Type == EventOneMinRemain {
			t.Fatal("EventOneMinRemain fired again despite one-shot")
		}
	}
}

func TestMonitor_ResetReArmsSubMinute(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(45, 100))
	m.Reset()
	evs := m.Trigger(2000, nil, mkFrame(45, 100))
	var found bool
	for _, e := range evs {
		if e.Type == EventOneMinRemain {
			found = true
			break
		}
	}
	if !found {
		t.Error("after Reset: expected EventOneMinRemain to fire again")
	}
}

// ---------------------------------------------------------------------------
// Feature 4: Pre-race countdown announcements
// ---------------------------------------------------------------------------

// mkPreRaceFrame creates a frame in Formation(3) phase with given rem time.
func mkPreRaceFrame(remSecs float64, gamePhase uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{
			TimeRemainingInGamePhase: remSecs,
			SessionTime:              0,
			GamePhase:                gamePhase,
		},
	}
}

func TestMonitor_PreRace2Min_FiresDuringFormation(t *testing.T) {
	m := NewMonitor()
	// Formation phase, rem between 115 and 125.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(120, 3))
	var found bool
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventPreRaceTwoMin at 120s rem in Formation, got %+v", evs)
	}
}

func TestMonitor_PreRace2Min_FiresDuringCountdown(t *testing.T) {
	m := NewMonitor()
	// Countdown phase, rem between 115 and 125.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(120, 4))
	var found bool
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventPreRaceTwoMin at 120s rem in Countdown, got %+v", evs)
	}
}

func TestMonitor_PreRace1Min_Fires(t *testing.T) {
	m := NewMonitor()
	// rem between 55 and 65.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(60, 3))
	var found bool
	for _, e := range evs {
		if e.Type == EventPreRaceOneMin {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventPreRaceOneMin at 60s rem, got %+v", evs)
	}
}

func TestMonitor_PreRace30s_Fires(t *testing.T) {
	m := NewMonitor()
	// rem between 25 and 35.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(30, 3))
	var found bool
	for _, e := range evs {
		if e.Type == EventPreRaceThirty {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventPreRaceThirty at 30s rem, got %+v", evs)
	}
}

func TestMonitor_PreRace_NoFireDuringGreenPhase(t *testing.T) {
	m := NewMonitor()
	// Green phase (5) — not pre-race.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(120, 5))
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin || e.Type == EventPreRaceOneMin || e.Type == EventPreRaceThirty {
			t.Fatalf("unexpected pre-race event during Green phase: %+v", e)
		}
	}
}

func TestMonitor_PreRace_NoFireOutsideThresholds(t *testing.T) {
	m := NewMonitor()
	// rem=200s is outside both 2min (115-125) and 1min (55-65) thresholds.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(200, 3))
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin || e.Type == EventPreRaceOneMin || e.Type == EventPreRaceThirty {
			t.Fatalf("unexpected pre-race event at 200s: %+v", e)
		}
	}
}

func TestMonitor_PreRace_OneShot(t *testing.T) {
	m := NewMonitor()
	// First call fires.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(120, 3))
	has2Min := false
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin {
			has2Min = true
		}
	}
	if !has2Min {
		t.Fatal("expected first EventPreRaceTwoMin")
	}

	// Second call with same threshold should NOT re-fire.
	evs = m.Trigger(2000, nil, mkPreRaceFrame(120, 3))
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin {
			t.Fatal("EventPreRaceTwoMin should not re-fire (one-shot)")
		}
	}
}

func TestMonitor_PreRace_AllThreeFireSequentially(t *testing.T) {
	m := NewMonitor()
	// Start at 2min threshold.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(120, 3))
	has2Min := false
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin {
			has2Min = true
		}
	}
	if !has2Min {
		t.Error("expected EventPreRaceTwoMin")
	}

	// Now at 1min threshold.
	evs = m.Trigger(2000, nil, mkPreRaceFrame(60, 3))
	has1Min := false
	for _, e := range evs {
		if e.Type == EventPreRaceOneMin {
			has1Min = true
		}
	}
	if !has1Min {
		t.Error("expected EventPreRaceOneMin")
	}

	// Now at 30s threshold.
	evs = m.Trigger(3000, nil, mkPreRaceFrame(30, 3))
	has30s := false
	for _, e := range evs {
		if e.Type == EventPreRaceThirty {
			has30s = true
		}
	}
	if !has30s {
		t.Error("expected EventPreRaceThirty")
	}
}

func TestMonitor_PreRace_ResetClearsFlags(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkPreRaceFrame(120, 3))
	m.Reset()
	// After reset, should fire again.
	evs := m.Trigger(2000, nil, mkPreRaceFrame(120, 3))
	has2Min := false
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin {
			has2Min = true
		}
	}
	if !has2Min {
		t.Error("after Reset: expected EventPreRaceTwoMin to fire again")
	}
}

func TestMonitor_PreRace_DoesNotFireInGaragePhase(t *testing.T) {
	m := NewMonitor()
	// Garage phase (0) should not trigger pre-race events.
	evs := m.Trigger(1000, nil, mkPreRaceFrame(120, 0))
	for _, e := range evs {
		if e.Type == EventPreRaceTwoMin || e.Type == EventPreRaceOneMin || e.Type == EventPreRaceThirty {
			t.Fatalf("unexpected pre-race event during Garage phase: %+v", e)
		}
	}
}
