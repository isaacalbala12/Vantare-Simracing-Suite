package pitstops

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(inPits bool) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: inPits, LapDistance: 100},
		},
	}
}

// frameConfig simplifies creating frames with specific lap distance and track length.
type frameConfig struct {
	inPits      bool
	lapDistance float64
	trackLength float64
	lapNumber   int32
	speed       float64
}

func mkFrameWith(cfg frameConfig) *telemetry.Frame {
	if cfg.lapNumber == 0 {
		cfg.lapNumber = 5
	}
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID: 1, LapNumber: cfg.lapNumber, Speed: cfg.speed,
		},
		Session: &telemetry.SessionInfo{
			TrackLength: cfg.trackLength,
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID: 1, IsPlayer: true, InPits: cfg.inPits,
				LapDistance: cfg.lapDistance, TotalLaps: int16(cfg.lapNumber),
			},
		},
	}
}

// --- Existing tests ---

func TestMonitor_FiresOnPitEntry(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(false), mkFrame(true))
	if len(evs) < 1 || evs[0].Type != EventPitEntry {
		t.Fatalf("expected EventPitEntry, got %+v", evs)
	}
}

func TestMonitor_FiresOnPitExit(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(true), mkFrame(false))
	if len(evs) < 1 || evs[0].Type != EventPitExit {
		t.Fatalf("expected EventPitExit, got %+v", evs)
	}
}

func TestMonitor_NoFireWhenStayingInPits(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(true), mkFrame(true))
	if evs != nil {
		t.Errorf("expected nil (no transition), got %+v", evs)
	}
}

func TestMonitor_NoFireWhenStayingOut(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(false), mkFrame(false))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NilPrevFiresOnEntry(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(true))
	if len(evs) < 1 || evs[0].Type != EventPitEntry {
		t.Fatalf("expected EventPitEntry, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(false), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoPlayer(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: false, InPits: true},
			{ID: 2, IsPlayer: false, InPits: false},
		},
	}
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

// --- New tests for distance-based pit entry warnings ---

func TestMonitor_OneHundredMetres(t *testing.T) {
	// TrackLength=1000, LapDistance=910 → 90m remaining → should fire 100m event.
	m := NewMonitor()
	f := mkFrameWith(frameConfig{
		inPits: false, lapDistance: 910, trackLength: 1000, lapNumber: 5,
	})
	evs := m.Trigger(1000, nil, f)

	found := false
	for _, e := range evs {
		if e.Type == EventPitOneHundredMetres {
			found = true
			if rem, ok := e.Payload["remaining_m"]; ok {
				if r, ok := rem.(float64); ok && r > 50 && r <= 100 {
					// OK
				} else {
					t.Errorf("unexpected remaining_m value: %v (type %T)", rem, rem)
				}
			} else {
				t.Error("missing remaining_m in payload")
			}
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitOneHundredMetres, got events: %+v", evs)
	}

	// Second call with same distance should NOT fire again.
	evs2 := m.Trigger(1100, f, f)
	for _, e := range evs2 {
		if e.Type == EventPitOneHundredMetres {
			t.Error("EventPitOneHundredMetres should not fire twice on same approach")
		}
	}
}

func TestMonitor_FiftyMetres(t *testing.T) {
	// TrackLength=1000, LapDistance=960 → 40m remaining → should fire 50m event.
	m := NewMonitor()
	f := mkFrameWith(frameConfig{
		inPits: false, lapDistance: 960, trackLength: 1000, lapNumber: 5,
	})
	evs := m.Trigger(1000, nil, f)

	found := false
	for _, e := range evs {
		if e.Type == EventPitFiftyMetres {
			found = true
			if rem, ok := e.Payload["remaining_m"]; ok {
				if r, ok := rem.(float64); ok && r <= 50 {
					// OK
				} else {
					t.Errorf("unexpected remaining_m value: %v (type %T)", rem, rem)
				}
			} else {
				t.Error("missing remaining_m in payload")
			}
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitFiftyMetres, got events: %+v", evs)
	}
}

func TestMonitor_OneHundredMetres_OnlyFiresWhenClose(t *testing.T) {
	// LapDistance far from pit entry should NOT fire distance warnings.
	m := NewMonitor()
	f := mkFrameWith(frameConfig{
		inPits: false, lapDistance: 500, trackLength: 1000, lapNumber: 5,
	})
	evs := m.Trigger(1000, nil, f)
	for _, e := range evs {
		if e.Type == EventPitOneHundredMetres || e.Type == EventPitFiftyMetres {
			t.Errorf("unexpected distance event %s when far from pit entry", e.Type)
		}
	}
}

// --- Box now test ---

func TestMonitor_BoxNow(t *testing.T) {
	// EventPitBoxNow should fire on pit entry (InPits rising edge).
	m := NewMonitor()
	prev := mkFrameWith(frameConfig{inPits: false, lapDistance: 900, trackLength: 1000, lapNumber: 5})
	curr := mkFrameWith(frameConfig{inPits: true, lapDistance: 950, trackLength: 1000, lapNumber: 5})

	evs := m.Trigger(1000, prev, curr)
	found := false
	for _, e := range evs {
		if e.Type == EventPitBoxNow {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitBoxNow on pit entry, got %+v", evs)
	}

	// Second call with no transition should NOT fire again.
	evs2 := m.Trigger(2000, curr, curr)
	for _, e := range evs2 {
		if e.Type == EventPitBoxNow {
			t.Error("EventPitBoxNow should not fire twice for same pit entry")
		}
	}
}

// --- Pit window tests ---

func TestMonitor_PitWindow_OpenOnEntry(t *testing.T) {
	// EventPitWindowOpen should fire on pit entry.
	m := NewMonitor()
	prev := mkFrameWith(frameConfig{inPits: false, lapNumber: 5})
	curr := mkFrameWith(frameConfig{inPits: true, lapNumber: 5})

	evs := m.Trigger(1000, prev, curr)
	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpen {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowOpen on pit entry, got %+v", evs)
	}
}

func TestMonitor_PitWindow_CloseOnExit(t *testing.T) {
	// EventPitWindowClose should fire on pit exit.
	m := NewMonitor()
	// First enter.
	prev := mkFrameWith(frameConfig{inPits: false, lapNumber: 5})
	enter := mkFrameWith(frameConfig{inPits: true, lapNumber: 5})
	m.Trigger(1000, prev, enter)

	// Then exit.
	exit := mkFrameWith(frameConfig{inPits: false, lapNumber: 5})
	evs := m.Trigger(2000, enter, exit)
	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowClose {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowClose on pit exit, got %+v", evs)
	}
}

func TestMonitor_PitWindow_Dedup(t *testing.T) {
	// Pit window events should not fire on a second entry/exit cycle
	// without an intervening exit/entry.
	m := NewMonitor()
	prev := mkFrameWith(frameConfig{inPits: false, lapNumber: 5})
	curr := mkFrameWith(frameConfig{inPits: true, lapNumber: 5})

	// First call opens the window.
	evs1 := m.Trigger(1000, prev, curr)
	openCount := 0
	for _, e := range evs1 {
		if e.Type == EventPitWindowOpen {
			openCount++
		}
	}
	if openCount != 1 {
		t.Fatalf("expected 1 EventPitWindowOpen on entry, got %d", openCount)
	}

	// Second call (still in pits) should NOT fire another open.
	evs2 := m.Trigger(2000, curr, curr)
	for _, e := range evs2 {
		if e.Type == EventPitWindowOpen {
			t.Error("EventPitWindowOpen should not fire twice while already in pits")
		}
	}
}

func TestMonitor_PitWindow_CloseOnLapChangeAfterExit(t *testing.T) {
	// If the pit window is still active after exiting (no close fired yet),
	// a lap number change should close it.
	m := NewMonitor()
	prev := mkFrameWith(frameConfig{inPits: false, lapNumber: 5})
	enter := mkFrameWith(frameConfig{inPits: true, lapNumber: 5})
	m.Trigger(1000, prev, enter)

	// Exit without closing (the close fires during exit but let's test
	// the lap change path separately by creating a scenario where the
	// window stays active after exit). Actually the monitor fires close
	// on exit too, so let's test that the lap close path works:
	// Manually set pitWindowActive to true.
	m.pitWindowActive = true

	// New lap, player not in pits.
	newLap := mkFrameWith(frameConfig{inPits: false, lapNumber: 6, lapDistance: 10, trackLength: 1000})
	evs := m.Trigger(3000, enter, newLap)
	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowClose {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowClose on lap change after pit exit, got %+v", evs)
	}
	if m.pitWindowActive {
		t.Error("pitWindowActive should be false after close")
	}
}

// --- Iter-2: Distance-based pit entry warnings one-shot and reset ---

func TestMonitor_OneHundredMetresOncePerEntry(t *testing.T) {
	m := NewMonitor()
	// Crossing the 100m threshold (remainingDist=90m) should fire.
	f1 := mkFrameWith(frameConfig{inPits: false, lapDistance: 910, trackLength: 1000, lapNumber: 5})
	evs1 := m.Trigger(1000, nil, f1)
	has100m := false
	for _, e := range evs1 {
		if e.Type == EventPitOneHundredMetres {
			has100m = true
		}
	}
	if !has100m {
		t.Fatal("expected EventPitOneHundredMetres at 90m remaining")
	}
	// Same frame again (no state change) → must NOT re-fire.
	evs2 := m.Trigger(1100, f1, f1)
	for _, e := range evs2 {
		if e.Type == EventPitOneHundredMetres {
			t.Error("EventPitOneHundredMetres should not fire twice on same approach")
		}
	}
}

func TestMonitor_FiftyMetresOncePerEntry(t *testing.T) {
	m := NewMonitor()
	// First cross the 100m threshold (90m remaining).
	f1 := mkFrameWith(frameConfig{inPits: false, lapDistance: 910, trackLength: 1000, lapNumber: 5})
	m.Trigger(1000, nil, f1)
	// Then cross the 50m threshold (40m remaining).
	f2 := mkFrameWith(frameConfig{inPits: false, lapDistance: 960, trackLength: 1000, lapNumber: 5})
	evs2 := m.Trigger(2000, f1, f2)
	has50m := false
	for _, e := range evs2 {
		if e.Type == EventPitFiftyMetres {
			has50m = true
		}
	}
	if !has50m {
		t.Fatal("expected EventPitFiftyMetres at 40m remaining")
	}
	// Same frame again → must NOT re-fire.
	evs3 := m.Trigger(3000, f2, f2)
	for _, e := range evs3 {
		if e.Type == EventPitFiftyMetres {
			t.Error("EventPitFiftyMetres should not fire twice on same approach")
		}
	}
}

func TestMonitor_DistanceMessagesResetAfterExit(t *testing.T) {
	m := NewMonitor()
	// 1. Fire 100m on lap 5.
	f1 := mkFrameWith(frameConfig{inPits: false, lapDistance: 910, trackLength: 1000, lapNumber: 5})
	m.Trigger(1000, nil, f1)
	// 2. Enter pits (same lap).
	f2 := mkFrameWith(frameConfig{inPits: true, lapDistance: 950, trackLength: 1000, lapNumber: 5})
	m.Trigger(2000, f1, f2)
	// 3. Exit pits (same lap) — triggers resetPitApproachFlags.
	f3 := mkFrameWith(frameConfig{inPits: false, lapDistance: 200, trackLength: 1000, lapNumber: 5})
	m.Trigger(3000, f2, f3)
	// 4. New lap: approach 100m again — should re-fire.
	f4 := mkFrameWith(frameConfig{inPits: false, lapDistance: 910, trackLength: 1000, lapNumber: 6})
	evs4 := m.Trigger(4000, f3, f4)
	has100m := false
	for _, e := range evs4 {
		if e.Type == EventPitOneHundredMetres {
			has100m = true
		}
	}
	if !has100m {
		t.Error("expected EventPitOneHundredMetres to fire again after pit exit and new lap")
	}
}

func TestMonitor_NoDistanceMessages_UnknownTrackLength(t *testing.T) {
	m := NewMonitor()
	// TrackLength is 0 (unknown) → distance-based messages must be skipped.
	f := mkFrameWith(frameConfig{inPits: false, lapDistance: 910, trackLength: 0, lapNumber: 5})
	evs := m.Trigger(1000, nil, f)
	for _, e := range evs {
		if e.Type == EventPitOneHundredMetres || e.Type == EventPitFiftyMetres {
			t.Errorf("distance events should not fire when trackLength is 0, got %s", e.Type)
		}
	}
}

// --- Pit exit traffic tests (Feature 1) ---

// mkPitExitFrame creates a frame for pit exit testing with TimeBehindNext set.
func mkPitExitFrame(inPits bool, timeBehindNext float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, InPits: inPits, LapDistance: 100, TimeBehindNext: timeBehindNext},
		},
	}
}

func TestMonitor_PitExitTrafficBehind_Fires(t *testing.T) {
	m := NewMonitor()
	prev := mkPitExitFrame(true, 0)    // in pits
	curr := mkPitExitFrame(false, 2.5) // exited, traffic close behind
	evs := m.Trigger(1000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitExitTrafficBehind {
			found = true
			if e.Payload["timeBehind"].(float64) != 2.5 {
				t.Errorf("expected timeBehind=2.5, got %v", e.Payload["timeBehind"])
			}
		}
	}
	if !found {
		t.Errorf("expected EventPitExitTrafficBehind, got %+v", evs)
	}
}

func TestMonitor_PitExitTrafficClear_Fires(t *testing.T) {
	m := NewMonitor()
	prev := mkPitExitFrame(true, 0)    // in pits
	curr := mkPitExitFrame(false, 8.0) // exited, no traffic close
	evs := m.Trigger(1000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitExitTrafficClear {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventPitExitTrafficClear, got %+v", evs)
	}
}

func TestMonitor_PitExitTrafficClear_WhenUnknown(t *testing.T) {
	m := NewMonitor()
	prev := mkPitExitFrame(true, 0)     // in pits
	curr := mkPitExitFrame(false, -1.0) // unknown gap (negative)
	evs := m.Trigger(1000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitExitTrafficClear {
			found = true
		}
		if e.Type == EventPitExitTrafficBehind {
			t.Error("traffic_behind should NOT fire when TimeBehindNext is negative")
		}
	}
	if !found {
		t.Errorf("expected EventPitExitTrafficClear for unknown gap, got %+v", evs)
	}
}

// ---------------------------------------------------------------------------
// Feature 3: Pit window countdown tests
// ---------------------------------------------------------------------------

func mkRaceFrame(lap int32, sessionLapsTotal int32, sessionType int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: lap},
		Session: &telemetry.SessionInfo{
			SessionType:      sessionType,
			SessionLapsTotal: sessionLapsTotal,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 100},
		},
	}
}

func TestMonitor_PitWindowOpensIn5(t *testing.T) {
	// Total laps = 30, window open = 10 (30/3).
	// Fire at lap = 5 (10-5).
	m := NewMonitor()
	// First call with nil prev to initialize.
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))
	// Now trigger with a lap change: from lap 4 to lap 5.
	prev := mkRaceFrame(4, 30, 5)
	curr := mkRaceFrame(5, 30, 5)
	evs := m.Trigger(2000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn5 {
			found = true
			if p, ok := e.Payload["windowOpen"]; ok {
				if w, ok := p.(int32); ok && w != 10 {
					t.Errorf("expected windowOpen=10, got %d", w)
				}
			}
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowOpensIn5 at lap 5, got %+v", evs)
	}
}

func TestMonitor_PitWindowOpensIn3(t *testing.T) {
	m := NewMonitor()
	// Init: need one prev frame to set session change detection.
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))
	prev := mkRaceFrame(6, 30, 5)
	curr := mkRaceFrame(7, 30, 5) // window open=10, 10-3=7
	evs := m.Trigger(2000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn3 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowOpensIn3 at lap 7, got %+v", evs)
	}
}

func TestMonitor_PitWindowOpensIn1(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))
	prev := mkRaceFrame(8, 30, 5)
	curr := mkRaceFrame(9, 30, 5) // window open=10, 10-1=9
	evs := m.Trigger(2000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn1 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowOpensIn1 at lap 9, got %+v", evs)
	}
}

func TestMonitor_PitWindowClosesIn3(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))
	// window close = 20 (30*2/3), 20-3=17
	prev := mkRaceFrame(16, 30, 5)
	curr := mkRaceFrame(17, 30, 5)
	evs := m.Trigger(2000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowClosesIn3 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowClosesIn3 at lap 17, got %+v", evs)
	}
}

func TestMonitor_PitWindowClosesIn1(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))
	// window close = 20, 20-1=19
	prev := mkRaceFrame(18, 30, 5)
	curr := mkRaceFrame(19, 30, 5)
	evs := m.Trigger(2000, prev, curr)

	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowClosesIn1 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected EventPitWindowClosesIn1 at lap 19, got %+v", evs)
	}
}

func TestMonitor_PitWindowNoEventsForNonRace(t *testing.T) {
	// SessionType != 5 (Race) → no pit window countdown events.
	m := NewMonitor()
	prev := mkRaceFrame(4, 30, 3) // Practice
	curr := mkRaceFrame(5, 30, 3)
	evs := m.Trigger(1000, prev, curr)

	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn5 || e.Type == EventPitWindowOpensIn3 ||
			e.Type == EventPitWindowOpensIn1 || e.Type == EventPitWindowClosesIn3 ||
			e.Type == EventPitWindowClosesIn1 {
			t.Errorf("unexpected pit window event for non-race session: %+v", e)
		}
	}
}

func TestMonitor_PitWindowOneShot(t *testing.T) {
	// Events should only fire once per session.
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))
	prev := mkRaceFrame(4, 30, 5)
	curr := mkRaceFrame(5, 30, 5) // opens in 5

	// First call: fires.
	evs := m.Trigger(2000, prev, curr)
	count := 0
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn5 {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 EventPitWindowOpensIn5, got %d", count)
	}

	// Second call with same lap: should NOT re-fire.
	evs = m.Trigger(3000, curr, curr)
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn5 {
			t.Errorf("unexpected re-fire of EventPitWindowOpensIn5 (one-shot), got %+v", e)
		}
	}
}

func TestMonitor_PitWindowResetsOnSessionChange(t *testing.T) {
	m := NewMonitor()
	// First session (Race type 5, 30 laps).
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))
	// Transition to lap 5 — fires opens_in_5 (10-5=5).
	m.Trigger(2000, mkRaceFrame(1, 30, 5), mkRaceFrame(5, 30, 5))

	// Now session change: new session with 20-lap race, different session type (4).
	newSessionStart := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: 1},
		Session: &telemetry.SessionInfo{
			SessionType:      4,  // different from 5 (also a race type)
			SessionLapsTotal: 20,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, LapDistance: 100},
		},
	}
	// This call triggers session change (sessionType changes from 5 to 4).
	// The session change resets pitWindowCountdown (pitWindowInit=false).
	// Then the lap transition (lastLapNumber=5 → lap=1) triggers the pit
	// window countdown init: window open = 20/3 ≈ 6.
	// opens_in_5 fires at lap <= 6-5 = 1, so it fires here.
	evs := m.Trigger(3000, mkRaceFrame(5, 30, 5), newSessionStart)

	found := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn5 {
			found = true
			break
		}
	}
	if !found {
		if !m.pitWindowInit {
			t.Error("pitWindowInit should be true after session change")
		}
		if m.pitWindowOpenLap != 6 {
			t.Errorf("expected pitWindowOpenLap=6, got %d", m.pitWindowOpenLap)
		}
		t.Errorf("expected EventPitWindowOpensIn5 after session change reset, got %+v", evs)
	}
}

func TestMonitor_PitWindowMinWindowOpen(t *testing.T) {
	// Very short race (5 laps) should still produce reasonable window laps.
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(1, 5, 5))
	m.Trigger(2000, mkRaceFrame(1, 5, 5), mkRaceFrame(2, 5, 5))
	if m.pitWindowOpenLap < 2 {
		t.Errorf("pitWindowOpenLap should be at least 2 for short races, got %d", m.pitWindowOpenLap)
	}
}

func TestMonitor_PitWindowNoEventsWhenNoLapsTotal(t *testing.T) {
	// SessionLapsTotal = 0 (timed session) → no lap-based events.
	m := NewMonitor()
	prev := mkRaceFrame(4, 0, 5)
	curr := mkRaceFrame(5, 0, 5)
	evs := m.Trigger(1000, prev, curr)
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn5 || e.Type == EventPitWindowOpensIn3 ||
			e.Type == EventPitWindowOpensIn1 || e.Type == EventPitWindowClosesIn3 ||
			e.Type == EventPitWindowClosesIn1 {
			t.Errorf("unexpected pit window event when SessionLapsTotal=0: %+v", e)
		}
	}
}

func TestMonitor_PitWindowAllFiveEventsFireSequentially(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkRaceFrame(1, 30, 5))

	// opens_in_5 at lap 5 (10-5)
	evs := m.Trigger(5000, mkRaceFrame(4, 30, 5), mkRaceFrame(5, 30, 5))
	hasOpens5 := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn5 {
			hasOpens5 = true
		}
	}
	if !hasOpens5 {
		t.Error("expected EventPitWindowOpensIn5 at lap 5")
	}

	// opens_in_3 at lap 7 (10-3)
	evs = m.Trigger(7000, mkRaceFrame(6, 30, 5), mkRaceFrame(7, 30, 5))
	hasOpens3 := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn3 {
			hasOpens3 = true
		}
	}
	if !hasOpens3 {
		t.Error("expected EventPitWindowOpensIn3 at lap 7")
	}

	// opens_in_1 at lap 9 (10-1)
	evs = m.Trigger(9000, mkRaceFrame(8, 30, 5), mkRaceFrame(9, 30, 5))
	hasOpens1 := false
	for _, e := range evs {
		if e.Type == EventPitWindowOpensIn1 {
			hasOpens1 = true
		}
	}
	if !hasOpens1 {
		t.Error("expected EventPitWindowOpensIn1 at lap 9")
	}

	// closes_in_3 at lap 17 (20-3)
	evs = m.Trigger(17000, mkRaceFrame(16, 30, 5), mkRaceFrame(17, 30, 5))
	hasCloses3 := false
	for _, e := range evs {
		if e.Type == EventPitWindowClosesIn3 {
			hasCloses3 = true
		}
	}
	if !hasCloses3 {
		t.Error("expected EventPitWindowClosesIn3 at lap 17")
	}

	// closes_in_1 at lap 19 (20-1)
	evs = m.Trigger(19000, mkRaceFrame(18, 30, 5), mkRaceFrame(19, 30, 5))
	hasCloses1 := false
	for _, e := range evs {
		if e.Type == EventPitWindowClosesIn1 {
			hasCloses1 = true
		}
	}
	if !hasCloses1 {
		t.Error("expected EventPitWindowClosesIn1 at lap 19")
	}
}

func TestMonitor_PitWindowExitTraffic_Dedup5s(t *testing.T) {
	m := NewMonitor()
	prev := mkPitExitFrame(true, 0)
	curr := mkPitExitFrame(false, 2.5)

	// First fire at t=1000.
	evs1 := m.Trigger(1000, prev, curr)
	hasTraffic := false
	for _, e := range evs1 {
		if e.Type == EventPitExitTrafficBehind {
			hasTraffic = true
		}
	}
	if !hasTraffic {
		t.Fatalf("expected traffic_behind on first exit, got %+v", evs1)
	}

	// Re-enter pits in a separate trigger call to set m.lastInPits=true.
	reEnter := mkPitExitFrame(true, 0)
	m.Trigger(2500, curr, reEnter) // this triggers pit entry, sets lastInPits=true

	// Now re-exit within 5s ack window (pitExitAckMS=1000, now=3000 → 2000ms < 5000ms).
	reExit := mkPitExitFrame(false, 1.0)
	evs2 := m.Trigger(3000, reEnter, reExit)
	for _, e := range evs2 {
		if e.Type == EventPitExitTrafficBehind || e.Type == EventPitExitTrafficClear {
			t.Errorf("traffic event should NOT re-fire within 5s ack window, got %s", e.Type)
		}
	}

	// Re-enter again to set lastInPits for the delayed re-exit.
	m.Trigger(6500, reExit, reEnter)

	// After 5s ack expires (pitExitAckMS=1000, now=7000 → 6000ms >= 5000ms), should fire again.
	evs3 := m.Trigger(7000, reEnter, reExit)
	hasTraffic2 := false
	for _, e := range evs3 {
		if e.Type == EventPitExitTrafficBehind {
			hasTraffic2 = true
		}
	}
	if !hasTraffic2 {
		t.Errorf("expected traffic_behind after 5s ack expired, got %+v", evs3)
	}
}
