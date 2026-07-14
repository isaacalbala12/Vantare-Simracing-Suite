package push

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// mkRaceFrame creates a frame with realistic race context.
// totalLaps=12, completedLaps=9 => 3 laps remaining => within MEDIUM push window (≤4).
func mkRaceFrame(gap float64, place uint8, completedLaps int32, totalLaps int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50, LapNumber: completedLaps},
		Session: &telemetry.SessionInfo{
			SessionType:      5,      // Race
			TrackLength:      5000.0, // MEDIUM
			SessionLapsTotal: totalLaps,
			NumVehicles:      20,
			IsTimedSession:   false,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindNext: gap, Place: place, TotalLaps: int16(completedLaps)},
		},
	}
}

// mkTimeRaceFrame creates a frame for timed sessions.
func mkTimeRaceFrame(gap float64, place uint8, timeRemaining float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50, LapNumber: 10},
		Session: &telemetry.SessionInfo{
			SessionType:              5, // Race
			TimeRemainingInGamePhase: timeRemaining,
			NumVehicles:              20,
			IsTimedSession:           true,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindNext: gap, Place: place, TotalLaps: 9},
		},
	}
}

func TestMonitor_FiresOnCloseGap(t *testing.T) {
	m := NewMonitor()
	// First call establishes state.
	m.Trigger(1000, nil, mkRaceFrame(0.5, 5, 2, 12))
	// Second call: P5, 3 remaining (≤4 for MEDIUM). Should get EventPushToImprove.
	evs := m.Trigger(100_000, nil, mkRaceFrame(0.5, 5, 9, 12))
	found := false
	for _, e := range evs {
		if e.Type == EventPushToImprove {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventPushToImprove for P5, got %+v", evs)
	}
}

func TestMonitor_NoFireOnLargeGap(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(0.5, 5, 2, 12))
	// Gap 5.0 > threshold 1.0, so gain should not fire.
	// Hold path still fires because gap to leader is < 20s.
	evs := m.Trigger(100_000, nil, mkRaceFrame(5.0, 5, 9, 12))
	for _, e := range evs {
		if e.Type == EventPushToImprove || e.Type == EventPushToGetWin ||
			e.Type == EventPushToGetSecond || e.Type == EventPushToGetThird {
			t.Errorf("expected no gain push event with 5.0 gap, got %s", e.Type)
		}
	}
	// Hold event may still fire (gap to leader < 20) — that's acceptable.
}

func TestMonitor_NoFireOnZeroGap(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(0.5, 3, 2, 12))
	evs := m.Trigger(100_000, nil, mkRaceFrame(0, 3, 9, 12))
	if len(evs) > 0 {
		t.Errorf("expected nil (gap=0, no opponent), got %+v", evs)
	}
}

func TestMonitor_NoFireOnNegativeGap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkRaceFrame(-1.0, 3, 9, 12))
	if len(evs) > 0 {
		t.Errorf("expected nil (gap<0 invalid), got %+v", evs)
	}
}

func TestMonitor_Cooldown60s(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(0.5, 3, 2, 12))
	// First fire at +100s with 3 laps remaining.
	evs := m.Trigger(100_000, nil, mkRaceFrame(0.5, 3, 9, 12))
	found := false
	for _, e := range evs {
		if e.Type == EventPushToImprove || e.Type == EventPushToHold {
			found = true
		}
	}
	if !found {
		t.Errorf("first call: expected push event, got %+v", evs)
	}
	// 30s later, cooldown blocks (60s not elapsed).
	evs = m.Trigger(130_000, nil, mkRaceFrame(0.3, 3, 10, 12))
	for _, e := range evs {
		if e.Type == EventPushToImprove || e.Type == EventPushToHold {
			t.Errorf("at +30s: expected nil (cooldown 60s), got %+v", e)
		}
	}
	// 61s later, cooldown elapsed. With completed=11, total=12 => 1 remaining.
	evs = m.Trigger(161_000, nil, mkRaceFrame(0.3, 3, 11, 12))
	found = false
	for _, e := range evs {
		if e.Type == EventPushToImprove || e.Type == EventPushToHold {
			found = true
		}
	}
	if !found {
		t.Errorf("at +61s: expected push event (cooldown elapsed), got %+v", evs)
	}
}

func TestMonitor_CustomThreshold(t *testing.T) {
	m := NewMonitorWithThreshold(3.0)
	m.Trigger(1000, nil, mkRaceFrame(0.5, 3, 2, 12))
	evs := m.Trigger(100_000, nil, mkRaceFrame(2.5, 3, 9, 12))
	found := false
	for _, e := range evs {
		if e.Type == EventPushToImprove || e.Type == EventPushToHold {
			found = true
		}
	}
	if !found {
		t.Errorf("expected push event with 3s threshold on 2.5s gap, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkRaceFrame(0.5, 3, 9, 12), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoPlayer(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{
		Session: &telemetry.SessionInfo{SessionType: 5, TrackLength: 5000, NumVehicles: 20},
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

func TestMonitor_PushToGetWinAtP2(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(0.5, 2, 2, 12))
	evs := m.Trigger(100_000, nil, mkRaceFrame(0.5, 2, 9, 12))
	found := false
	for _, e := range evs {
		if e.Type == EventPushToGetWin {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventPushToGetWin for P2, got %+v", evs)
	}
}

func TestMonitor_PushToGetSecondAtP3(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(0.5, 3, 2, 12))
	evs := m.Trigger(100_000, nil, mkRaceFrame(0.5, 3, 9, 12))
	found := false
	for _, e := range evs {
		if e.Type == EventPushToGetSecond {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventPushToGetSecond for P3, got %+v", evs)
	}
}

func TestMonitor_PushToGetThirdAtP4(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(0.5, 4, 2, 12))
	evs := m.Trigger(100_000, nil, mkRaceFrame(0.5, 4, 9, 12))
	found := false
	for _, e := range evs {
		if e.Type == EventPushToGetThird {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventPushToGetThird for P4, got %+v", evs)
	}
}

func TestMonitor_PushWindowTimeBased(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkTimeRaceFrame(0.5, 5, 200)) // 200s remaining → within 120-240s window
	evs := m.Trigger(100_000, nil, mkTimeRaceFrame(0.5, 5, 180))
	found := false
	for _, e := range evs {
		if e.Type == EventPushToImprove {
			found = true
		}
	}
	if !found {
		t.Errorf("expected push event in time window, got %+v", evs)
	}
}

func TestMonitor_NoPushOutsideTimeWindow(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkTimeRaceFrame(0.5, 3, 500)) // 500s → outside 120-240s window
	evs := m.Trigger(100_000, nil, mkTimeRaceFrame(0.5, 3, 450))
	for _, e := range evs {
		if e.Type == EventPushToImprove || e.Type == EventPushToHold {
			t.Errorf("expected no push event outside time window, got %s", e.Type)
		}
	}
}

// mkTrackRaceFrame creates a race frame with the given track length and gap.
// completedLaps and totalLaps control lap-based push window logic:
//
//	MEDIUM (tlc≤2): lapsRemaining ≤ 4 && > 0
//	LONG (tlc=3):   lapsRemaining ≤ 2 && > 0
//	VERY_LONG (tlc≥4): lapsRemaining == 1
func mkTrackRaceFrame(gap float64, trackLen float64, place uint8, completedLaps, totalLaps int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50, LapNumber: completedLaps},
		Session: &telemetry.SessionInfo{
			SessionType:      5,
			TrackLength:      trackLen,
			SessionLapsTotal: totalLaps,
			NumVehicles:      20,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindNext: gap, Place: place, TotalLaps: int16(completedLaps)},
		},
	}
}

// TestMonitor_GapThresholdByTrackLength verifica que el umbral de gap
// se ajusta segun la clase de longitud de pista.
func TestMonitor_GapThresholdByTrackLength(t *testing.T) {
	tests := []struct {
		name          string
		trackLen      float64
		gapSecs       float64
		completedLaps int32
		totalLaps     int32
		wantPush      bool
		threshold     float64
	}{
		// VERY_SHORT (0.8 threshold, tlc=0): lap window ≤4 laps → 3 remaining works.
		{name: "VeryShort_GapTooLarge", trackLen: 900, gapSecs: 0.9, completedLaps: 9, totalLaps: 12, wantPush: false, threshold: 0.8},
		{name: "VeryShort_GapSmallEnough", trackLen: 900, gapSecs: 0.7, completedLaps: 9, totalLaps: 12, wantPush: true, threshold: 0.8},
		// SHORT (0.8 threshold, tlc=1): 3 remaining works.
		{name: "Short_GapSmallEnough", trackLen: 1500, gapSecs: 0.7, completedLaps: 9, totalLaps: 12, wantPush: true, threshold: 0.8},
		// MEDIUM (1.0 threshold, tlc=2): 3 remaining works.
		{name: "Medium_GapSmallEnough", trackLen: 5000, gapSecs: 0.9, completedLaps: 9, totalLaps: 12, wantPush: true, threshold: 1.0},
		{name: "Medium_GapTooLarge", trackLen: 5000, gapSecs: 1.1, completedLaps: 9, totalLaps: 12, wantPush: false, threshold: 1.0},
		// LONG (1.5 threshold, tlc=3): window requires ≤2 laps → completedLaps=10, total=12 → 2 remaining.
		{name: "Long_GapSmallEnough", trackLen: 15000, gapSecs: 1.3, completedLaps: 10, totalLaps: 12, wantPush: true, threshold: 1.5},
		// VERY_LONG (2.0 threshold, tlc=4): window requires ==1 lap → completedLaps=11, total=12 → 1 remaining.
		{name: "VeryLong_GapSmallEnough", trackLen: 25000, gapSecs: 1.8, completedLaps: 11, totalLaps: 12, wantPush: true, threshold: 2.0},
		{name: "VeryLong_GapTooLarge", trackLen: 25000, gapSecs: 2.2, completedLaps: 11, totalLaps: 12, wantPush: false, threshold: 2.0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := NewMonitor()
			// First call establishes state (no push window yet).
			m.Trigger(1000, nil, mkTrackRaceFrame(tc.gapSecs, tc.trackLen, 5, tc.completedLaps, tc.totalLaps))
			// Second call with push window eligibility.
			evs := m.Trigger(100_000, nil, mkTrackRaceFrame(tc.gapSecs, tc.trackLen, 5, tc.completedLaps, tc.totalLaps))
			found := false
			for _, e := range evs {
				if e.Type == EventPushToImprove {
					found = true
					break
				}
			}
			if tc.wantPush && !found {
				t.Errorf("expected push event at trackLen=%.0f gap=%.1f (threshold=%.1f), got none",
					tc.trackLen, tc.gapSecs, tc.threshold)
			}
			if !tc.wantPush && found {
				t.Errorf("unexpected push event at trackLen=%.0f gap=%.1f (threshold=%.1f)",
					tc.trackLen, tc.gapSecs, tc.threshold)
			}
		})
	}
}

// TestGapThresholdForTrackClass verifica los valores devueltos por
// gapThresholdForTrackClass para cada clase de pista.
func TestGapThresholdForTrackClass(t *testing.T) {
	tests := []struct {
		tlc      int
		expected float64
		desc     string
	}{
		{0, 0.8, "VERY_SHORT"},
		{1, 0.8, "SHORT"},
		{2, 1.0, "MEDIUM"},
		{3, 1.5, "LONG"},
		{4, 2.0, "VERY_LONG"},
		{5, 1.0, "unknown/default"},
		{-1, 1.0, "negative/default"},
	}

	for _, tc := range tests {
		t.Run(tc.desc, func(t *testing.T) {
			got := gapThresholdForTrackClass(tc.tlc)
			if got != tc.expected {
				t.Errorf("gapThresholdForTrackClass(%d) = %f, want %f", tc.tlc, got, tc.expected)
			}
		})
	}
}

// --- Feature 3: Qual exit event ---

// mkQualFrame creates a frame for qualifying (SessionType=3).
func mkQualFrame(inPits bool, lapNum int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: lapNum},
		Session: &telemetry.SessionInfo{
			SessionType: 3, // Qualifying
			TrackLength: 5000,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: inPits, LapDistance: 100},
		},
	}
}

func TestMonitor_QualExit_Fires(t *testing.T) {
	m := NewMonitor()
	// First call: entering pits, which initializes.
	enter := mkQualFrame(true, 1)
	m.Trigger(1000, nil, enter)

	// Second call: pit exit during qual.
	exit := mkQualFrame(false, 1)
	evs := m.Trigger(2000, nil, exit)
	found := false
	for _, e := range evs {
		if e.Type == EventQualExit {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventQualExit on pit exit during qualifying, got %+v", evs)
	}
}

func TestMonitor_QualExit_OneShotPerStint(t *testing.T) {
	m := NewMonitor()

	// Enter pits → reset flag.
	enter := mkQualFrame(true, 1)
	m.Trigger(1000, nil, enter)

	exit := mkQualFrame(false, 1)
	evs1 := m.Trigger(2000, nil, exit)
	hasExit1 := false
	for _, e := range evs1 {
		if e.Type == EventQualExit {
			hasExit1 = true
		}
	}
	if !hasExit1 {
		t.Fatalf("expected qual_exit on first exit, got %+v", evs1)
	}

	// Second exit without re-entering → should NOT fire.
	evs2 := m.Trigger(3000, nil, exit)
	for _, e := range evs2 {
		if e.Type == EventQualExit {
			t.Errorf("qual_exit should NOT fire again for same stint")
		}
	}

	// Re-enter and exit again → should fire once more.
	enter2 := mkQualFrame(true, 1)
	m.Trigger(4000, nil, enter2)
	exit2 := mkQualFrame(false, 1)
	evs3 := m.Trigger(5000, nil, exit2)
	hasExit2 := false
	for _, e := range evs3 {
		if e.Type == EventQualExit {
			hasExit2 = true
		}
	}
	if !hasExit2 {
		t.Errorf("expected qual_exit on second stint exit, got %+v", evs3)
	}
}

func TestMonitor_NoQualExitInRace(t *testing.T) {
	m := NewMonitor()
	enter := mkRaceFrame(0.5, 3, 2, 12)
	enter.Vehicles[0].InPits = true
	exit := mkRaceFrame(0.5, 3, 2, 12)
	exit.Vehicles[0].InPits = false

	m.Trigger(1000, nil, enter)
	evs := m.Trigger(2000, nil, exit)
	for _, e := range evs {
		if e.Type == EventQualExit {
			t.Errorf("qual_exit should NOT fire in race session")
		}
	}
}

// --- Corner attack / defend tests ---

func TestMonitor_CornerAttack(t *testing.T) {
	m := NewMonitor()
	// Feed decreasing gapAhead (TimeBehindNext): 0.9 → 0.7 (< 1.0).
	m.Trigger(1000, nil, mkRaceFrame(0.9, 5, 2, 12))
	evs := m.Trigger(2000, nil, mkRaceFrame(0.7, 5, 9, 12))
	found := false
	for _, e := range evs {
		if e.Type == EventCornerAttack {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventCornerAttack (gap 0.7 < 1.0, decreasing), got %+v", evs)
	}
}

func TestMonitor_CornerAttackCooldown(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(0.9, 5, 2, 12))
	// First fire.
	evs := m.Trigger(2000, nil, mkRaceFrame(0.7, 5, 9, 12))
	fired := false
	for _, e := range evs {
		if e.Type == EventCornerAttack {
			fired = true
		}
	}
	if !fired {
		t.Fatal("expected first EventCornerAttack")
	}
	// 15s later → cooldown (30s) blocks.
	evs = m.Trigger(17000, nil, mkRaceFrame(0.5, 5, 9, 12))
	for _, e := range evs {
		if e.Type == EventCornerAttack {
			t.Errorf("unexpected EventCornerAttack inside cooldown")
		}
	}
	// 35s later → cooldown expired.
	evs = m.Trigger(37000, nil, mkRaceFrame(0.3, 5, 9, 12))
	fired = false
	for _, e := range evs {
		if e.Type == EventCornerAttack {
			fired = true
		}
	}
	if !fired {
		t.Errorf("expected EventCornerAttack after cooldown")
	}
}

func TestMonitor_CornerAttackTooLarge(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(2.0, 5, 2, 12))
	evs := m.Trigger(2000, nil, mkRaceFrame(1.5, 5, 9, 12))
	for _, e := range evs {
		if e.Type == EventCornerAttack {
			t.Errorf("unexpected EventCornerAttack with gap 1.5 > 1.0")
		}
	}
}

// mkDefendFrame creates a race frame with a car behind (for defend tests).
func mkDefendFrame(aheadGap, behindGap float64, place uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50, LapNumber: 9},
		Session: &telemetry.SessionInfo{
			SessionType:      5,
			TrackLength:      5000.0,
			SessionLapsTotal: 12,
			NumVehicles:      20,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindNext: aheadGap, Place: place, TotalLaps: 9},
			{ID: 2, IsPlayer: false, TimeBehindNext: behindGap, Place: place + 1, TotalLaps: 9},
		},
	}
}

func TestMonitor_CornerDefend(t *testing.T) {
	m := NewMonitor()
	// Feed decreasing gapBehind: car behind (P6) has TimeBehindNext decreasing.
	m.Trigger(1000, nil, mkDefendFrame(5.0, 0.9, 5))
	evs := m.Trigger(2000, nil, mkDefendFrame(5.0, 0.7, 5))
	found := false
	for _, e := range evs {
		if e.Type == EventCornerDefend {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventCornerDefend (gap behind 0.7 < 1.0, decreasing), got %+v", evs)
	}
}

func TestMonitor_CornerDefendCooldown(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkDefendFrame(5.0, 0.9, 5))
	evs := m.Trigger(2000, nil, mkDefendFrame(5.0, 0.7, 5))
	fired := false
	for _, e := range evs {
		if e.Type == EventCornerDefend {
			fired = true
		}
	}
	if !fired {
		t.Fatal("expected first EventCornerDefend")
	}
	// 15s later → cooldown blocks.
	evs = m.Trigger(17000, nil, mkDefendFrame(5.0, 0.5, 5))
	for _, e := range evs {
		if e.Type == EventCornerDefend {
			t.Errorf("unexpected EventCornerDefend inside cooldown")
		}
	}
	// 35s later → cooldown expired.
	evs = m.Trigger(37000, nil, mkDefendFrame(5.0, 0.3, 5))
	fired = false
	for _, e := range evs {
		if e.Type == EventCornerDefend {
			fired = true
		}
	}
	if !fired {
		t.Errorf("expected EventCornerDefend after cooldown")
	}
}

func TestMonitor_CornerDefendNoCarBehind(t *testing.T) {
	m := NewMonitor()
	// Leader (P1) has no car behind → no defend.
	m.Trigger(1000, nil, mkDefendFrame(5.0, 0, 1))
	evs := m.Trigger(2000, nil, mkDefendFrame(5.0, 0, 1))
	for _, e := range evs {
		if e.Type == EventCornerDefend {
			t.Errorf("unexpected EventCornerDefend when no car behind")
		}
	}
}
