package timings

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(gapLeader, gapNext float64, inPits bool) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{
			TrackLength: 5000.0,
			GamePhase:   5,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindLeader: gapLeader, TimeBehindNext: gapNext, LapDistance: 100, InPits: inPits},
		},
	}
}

func TestMonitor_FiresAfterInterval(t *testing.T) {
	m := NewMonitor()
	// First call: init, no fire.
	evs := m.Trigger(1000, nil, mkFrame(10, 2, false))
	if evs != nil {
		t.Errorf("first call: expected nil (init), got %+v", evs)
	}
	// 61s later: fire.
	evs = m.Trigger(61_000, mkFrame(10, 2, false), mkFrame(11, 2.5, false))
	if len(evs) != 1 || evs[0].Type != EventGapReport {
		t.Fatalf("expected 1 EventGapReport, got %+v", evs)
	}
	if gap, ok := evs[0].Payload["gapToLeaderSec"].(float64); !ok || gap != 11 {
		t.Errorf("expected gapToLeaderSec=11, got %v", evs[0].Payload)
	}
}

func TestMonitor_NoFireUnderInterval(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(10, 2, false))
	// 30s later, still inside 60s interval.
	evs := m.Trigger(30_000, mkFrame(10, 2, false), mkFrame(11, 2.5, false))
	if evs != nil {
		t.Errorf("expected nil (interval 60s), got %+v", evs)
	}
}

func TestMonitor_NoFireOnNegativeGap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(-1, 2, false))
	if evs != nil {
		t.Errorf("expected nil (negative gap), got %+v", evs)
	}
	// Fire on next interval even with negative gap — should still be skipped.
	evs = m.Trigger(61_000, mkFrame(-1, 2, false), mkFrame(-1, 2.5, false))
	if evs != nil {
		t.Errorf("at +61s with negative gap: expected nil, got %+v", evs)
	}
}

func TestMonitor_CustomInterval(t *testing.T) {
	m := NewMonitorWithInterval(10) // 10s
	m.Trigger(1000, nil, mkFrame(10, 2, false))
	// 11s later.
	evs := m.Trigger(11_000, mkFrame(10, 2, false), mkFrame(11, 2.5, false))
	if len(evs) != 1 {
		t.Errorf("expected 1 event with 10s interval, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(10, 2, false), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoFireInPits(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(10, 2, true)) // in pits
	// Even after interval, should not fire if in pits.
	evs := m.Trigger(61_000, mkFrame(10, 2, true), mkFrame(11, 2.5, true))
	if evs != nil {
		t.Errorf("expected nil (in pits), got %+v", evs)
	}
}

func TestMonitor_GapStatusIncreasing(t *testing.T) {
	m := NewMonitorWithInterval(1) // 1s interval for fast test
	// Seed samples via repeated triggers.
	m.Trigger(0, nil, mkFrame(2.0, 0, false))
	m.Trigger(20, nil, mkFrame(2.5, 0, false))
	m.Trigger(40, nil, mkFrame(3.0, 0, false))
	// Now fire a report.
	evs := m.Trigger(2000, nil, mkFrame(3.5, 0, false))
	if len(evs) == 1 {
		status := evs[0].Payload["gapStatusAhead"].(string)
		if status != string(GapStatusIncreasing) {
			t.Errorf("expected gapStatusAhead=increasing, got %s", status)
		}
	}
}

func TestMonitor_GapStatusDecreasing(t *testing.T) {
	m := NewMonitorWithInterval(1)
	m.Trigger(0, nil, mkFrame(5.0, 0, false))
	m.Trigger(20, nil, mkFrame(4.0, 0, false))
	m.Trigger(40, nil, mkFrame(3.0, 0, false))
	evs := m.Trigger(2000, nil, mkFrame(2.0, 0, false))
	if len(evs) == 1 {
		status := evs[0].Payload["gapStatusAhead"].(string)
		if status != string(GapStatusDecreasing) {
			t.Errorf("expected gapStatusAhead=decreasing, got %s", status)
		}
	}
}

func TestMonitor_NoFireBelowThreshold(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(10, 2, false))
	// Gap 0.3 < 0.5 threshold.
	evs := m.Trigger(61_000, mkFrame(10, 2, false), mkFrame(0.3, 0.1, false))
	if evs != nil {
		t.Errorf("expected nil (gap < 0.5 threshold), got %+v", evs)
	}
}

func TestMonitor_NoFireAboveMaxThreshold(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(10, 2, false))
	// Both gaps > 20 max threshold.
	evs := m.Trigger(61_000, mkFrame(10, 2, false), mkFrame(25, 25, false))
	if evs != nil {
		t.Errorf("expected nil (gaps > 20 max), got %+v", evs)
	}
}

func TestMonitor_NewMonitorWithReportInterval(t *testing.T) {
	m := NewMonitorWithReportInterval(10)
	if m.intervalMS != 10_000 {
		t.Fatalf("expected intervalMS=10000, got %d", m.intervalMS)
	}
	m.Trigger(1000, nil, mkFrame(10, 2, false))
	evs := m.Trigger(11_000, mkFrame(10, 2, false), mkFrame(11, 2.5, false))
	if len(evs) < 1 {
		t.Errorf("expected at least 1 event with 10s interval, got %d", len(evs))
	}
}

func TestMonitor_SetReportInterval(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(10, 2, false))
	// Change interval to 10s.
	m.SetReportInterval(10)
	// 11s later: should fire (10s interval) and include freq event.
	evs := m.Trigger(12_000, mkFrame(10, 2, false), mkFrame(11, 2.5, false))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (gap + freq), got %d: %+v", len(evs), evs)
	}
	hasGap := false
	hasFreq := false
	for _, e := range evs {
		switch e.Type {
		case EventGapReport:
			hasGap = true
		case EventGapReportFreq:
			hasFreq = true
		}
	}
	if !hasGap {
		t.Error("expected EventGapReport")
	}
	if !hasFreq {
		t.Error("expected EventGapReportFreq when interval changed")
	}
	// Second report should not include freq (interval was not changed again).
	evs = m.Trigger(22_000, mkFrame(11, 2.5, false), mkFrame(12, 3.0, false))
	if len(evs) != 1 || evs[0].Type != EventGapReport {
		t.Errorf("expected 1 EventGapReport (no freq), got %+v", evs)
	}
}

func TestMonitor_SetReportIntervalNoFreqWithoutReport(t *testing.T) {
	// Changing interval without triggering a report should not emit freq.
	m := NewMonitor()
	m.SetReportInterval(30)
	// No init call, so next call should init (not fire).
	evs := m.Trigger(1000, nil, mkFrame(10, 2, false))
	for _, e := range evs {
		if e.Type == EventGapReportFreq {
			t.Errorf("did not expect EventGapReportFreq on init call")
		}
	}
	// Next report should have freq though.
	evs = m.Trigger(31_000, mkFrame(10, 2, false), mkFrame(11, 2.5, false))
	hasFreq := false
	for _, e := range evs {
		if e.Type == EventGapReportFreq {
			hasFreq = true
		}
	}
	if !hasFreq {
		t.Errorf("expected EventGapReportFreq on first report after SetReportInterval")
	}
}

// --- Being held up / being pressured tests ---

func TestMonitor_HeldUp(t *testing.T) {
	m := NewMonitorWithInterval(3600)
	// Feed stable gap samples with small time to car ahead (< 3.0s).
	// gapAhead = TimeBehindNext (gap to car ahead).
	m.Trigger(1000, nil, mkFrame(10.0, 2.0, false)) // gapLeader=10, gapNext=2.0
	m.Trigger(2000, nil, mkFrame(10.2, 2.2, false))
	m.Trigger(3000, nil, mkFrame(10.1, 2.1, false))
	// gapAhead=2.1 < 3.0 + status stable.
	evs := m.Trigger(4000, nil, mkFrame(10.1, 2.1, false))
	found := false
	for _, e := range evs {
		if e.Type == EventBeingHeldUp {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventBeingHeldUp (stable gap 2.1s < 3.0s), got %+v", evs)
	}
}

func TestMonitor_HeldUpCooldown(t *testing.T) {
	m := NewMonitorWithInterval(3600)
	m.Trigger(1000, nil, mkFrame(10.0, 2.0, false))
	m.Trigger(2000, nil, mkFrame(10.2, 2.2, false))
	m.Trigger(3000, nil, mkFrame(10.1, 2.1, false))
	evs := m.Trigger(4000, nil, mkFrame(10.1, 2.1, false))
	fired := false
	for _, e := range evs {
		if e.Type == EventBeingHeldUp {
			fired = true
		}
	}
	if !fired {
		t.Fatal("expected first EventBeingHeldUp")
	}
	evs = m.Trigger(19000, nil, mkFrame(10.1, 2.1, false))
	for _, e := range evs {
		if e.Type == EventBeingHeldUp {
			t.Errorf("unexpected EventBeingHeldUp inside cooldown")
		}
	}
	evs = m.Trigger(39000, nil, mkFrame(10.1, 2.1, false))
	fired = false
	for _, e := range evs {
		if e.Type == EventBeingHeldUp {
			fired = true
		}
	}
	if !fired {
		t.Errorf("expected EventBeingHeldUp after cooldown")
	}
}

func TestMonitor_HeldUpTooLarge(t *testing.T) {
	m := NewMonitorWithInterval(3600)
	m.Trigger(1000, nil, mkFrame(10.0, 5.0, false))
	m.Trigger(2000, nil, mkFrame(10.2, 5.2, false))
	m.Trigger(3000, nil, mkFrame(10.1, 5.1, false))
	evs := m.Trigger(4000, nil, mkFrame(10.1, 5.1, false))
	for _, e := range evs {
		if e.Type == EventBeingHeldUp {
			t.Errorf("unexpected EventBeingHeldUp with gap 5.1 > 3.0")
		}
	}
}

func TestMonitor_Pressured(t *testing.T) {
	m := NewMonitorWithInterval(3600)
	// Need a car behind to detect pressure. Use opponent at Place=2 (player=1).
	frame1 := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{TrackLength: 5000.0, GamePhase: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindLeader: 10.0, TimeBehindNext: 0.5, Place: 1, LapDistance: 100},
			{ID: 2, IsPlayer: false, TimeBehindNext: 1.5, Place: 2, LapDistance: 90}, // car behind, gap 1.5s
		},
	}
	frame2 := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{TrackLength: 5000.0, GamePhase: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindLeader: 10.0, TimeBehindNext: 0.5, Place: 1, LapDistance: 100},
			{ID: 2, IsPlayer: false, TimeBehindNext: 1.2, Place: 2, LapDistance: 90}, // decreasing: 1.5→1.2
		},
	}
	frame3 := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{TrackLength: 5000.0, GamePhase: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindLeader: 10.0, TimeBehindNext: 0.5, Place: 1, LapDistance: 100},
			{ID: 2, IsPlayer: false, TimeBehindNext: 0.9, Place: 2, LapDistance: 90}, // decreasing: 1.2→0.9
		},
	}
	frame4 := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1},
		Session: &telemetry.SessionInfo{TrackLength: 5000.0, GamePhase: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, TimeBehindLeader: 10.0, TimeBehindNext: 0.5, Place: 1, LapDistance: 100},
			{ID: 2, IsPlayer: false, TimeBehindNext: 0.6, Place: 2, LapDistance: 90}, // decreasing: 0.9→0.6
		},
	}
	m.Trigger(1000, nil, frame1)
	m.Trigger(2000, nil, frame2)
	m.Trigger(3000, nil, frame3)
	evs := m.Trigger(4000, nil, frame4)
	found := false
	for _, e := range evs {
		if e.Type == EventBeingPressured {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventBeingPressured (decreasing gap behind 0.6s < 2.0s), got %+v", evs)
	}
}

func TestMonitor_PressuredCooldown(t *testing.T) {
	m := NewMonitorWithInterval(3600)
	// Use multi-vehicle frames with a car behind.
	mkRear := func(gapBehind float64) *telemetry.Frame {
		return &telemetry.Frame{
			Player:  &telemetry.PlayerTelemetry{ID: 1},
			Session: &telemetry.SessionInfo{TrackLength: 5000.0, GamePhase: 5},
			Vehicles: []telemetry.VehicleScoring{
				{ID: 1, IsPlayer: true, TimeBehindLeader: 10.0, TimeBehindNext: 0.5, Place: 1, LapDistance: 100},
				{ID: 2, IsPlayer: false, TimeBehindNext: gapBehind, Place: 2, LapDistance: 90},
			},
		}
	}
	m.Trigger(1000, nil, mkRear(1.8))
	m.Trigger(2000, nil, mkRear(1.5))
	m.Trigger(3000, nil, mkRear(1.2))
	evs := m.Trigger(4000, nil, mkRear(0.9))
	fired := false
	for _, e := range evs {
		if e.Type == EventBeingPressured {
			fired = true
		}
	}
	if !fired {
		t.Fatal("expected first EventBeingPressured")
	}
	// 15s later → cooldown blocks.
	evs = m.Trigger(19000, nil, mkRear(0.7))
	for _, e := range evs {
		if e.Type == EventBeingPressured {
			t.Errorf("unexpected EventBeingPressured inside cooldown")
		}
	}
	// 35s later → cooldown expired.
	evs = m.Trigger(39000, nil, mkRear(0.5))
	fired = false
	for _, e := range evs {
		if e.Type == EventBeingPressured {
			fired = true
		}
	}
	if !fired {
		t.Errorf("expected EventBeingPressured after cooldown")
	}
}
