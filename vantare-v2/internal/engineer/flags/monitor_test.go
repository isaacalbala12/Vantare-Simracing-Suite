package flags

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(gamePhase uint8, playerFlag string) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{GamePhase: gamePhase},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Flag: playerFlag, LapDistance: 100},
		},
	}
}

func TestMonitor_TriggerFCYStart(t *testing.T) {
	m := NewMonitor()
	prev := mkFrame(5, "")            // green
	curr := mkFrame(fcyGamePhase, "") // 6 = FCY

	evs := m.Trigger(1000, prev, curr)
	if len(evs) != 1 || evs[0].Type != EventFCYStarted {
		t.Fatalf("expected 1 EventFCYStarted, got %+v", evs)
	}
}

func TestMonitor_TriggerFCYEnd(t *testing.T) {
	m := NewMonitor()
	prev := mkFrame(6, "")
	curr := mkFrame(5, "")

	evs := m.Trigger(1000, prev, curr)
	if len(evs) != 1 || evs[0].Type != EventFCYEnded {
		t.Fatalf("expected 1 EventFCYEnded, got %+v", evs)
	}
}

func TestMonitor_FCYCooldown25s(t *testing.T) {
	m := NewMonitor()
	prev := mkFrame(5, "")
	curr := mkFrame(6, "")

	now := int64(100_000)
	evs := m.Trigger(now, prev, curr)
	if len(evs) != 1 {
		t.Fatalf("first call: expected 1 event, got %+v", evs)
	}
	// 24s later, still in FCY — no new event (cooldown 25s).
	prev2 := curr
	curr2 := mkFrame(6, "")
	evs = m.Trigger(now+24_000, prev2, curr2)
	if len(evs) != 0 {
		t.Errorf("at 24s: expected 0 events (cooldown), got %+v", evs)
	}
	// 26s later, again no rising edge (FCY already active). Should be silent.
	evs = m.Trigger(now+26_000, prev2, curr2)
	if len(evs) != 0 {
		t.Errorf("at 26s: expected 0 events (no rising edge), got %+v", evs)
	}
}

func TestMonitor_NoEventWhenBothFCY(t *testing.T) {
	m := NewMonitor()
	// Both frames FCY — no transition.
	evs := m.Trigger(1000, mkFrame(6, ""), mkFrame(6, ""))
	if len(evs) != 0 {
		t.Errorf("expected 0 events (no transition), got %+v", evs)
	}
}

func TestMonitor_BlueFlagWithCooldown(t *testing.T) {
	m := NewMonitor()
	prev := mkBlueFrame("GREEN", 0)
	curr := mkBlueFrame("BLUE", 0.8)

	now := int64(100_000)
	evs := m.Trigger(now, prev, curr)
	if len(evs) < 1 || evs[0].Type != EventBlueFlag {
		t.Fatalf("first call: expected 1 EventBlueFlag, got %+v", evs)
	}
	// 14s later still BLUE — no event (cooldown 15s).
	evs = m.Trigger(now+14_000, curr, curr)
	if len(evs) != 0 {
		t.Errorf("at 14s: expected 0 events (cooldown), got %+v", evs)
	}
	// 16s later still BLUE — should fire again (cooldown elapsed, no transition needed).
	evs = m.Trigger(now+16_000, curr, curr)
	if len(evs) < 1 || evs[0].Type != EventBlueFlag {
		t.Errorf("at 16s: expected 1 EventBlueFlag, got %+v", evs)
	}
}

func TestMonitor_NilPrevFirstCall(t *testing.T) {
	m := NewMonitor()
	// nil prev on first call must not panic; rising edge from nil/zero
	// to FCY should fire.
	evs := m.Trigger(1000, nil, mkFrame(6, ""))
	if len(evs) != 1 || evs[0].Type != EventFCYStarted {
		t.Fatalf("expected 1 EventFCYStarted, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5, ""), nil)
	if evs != nil {
		t.Errorf("expected nil events for nil curr, got %+v", evs)
	}
}

func TestIsFCY(t *testing.T) {
	if !IsFCY(mkFrame(6, "")) {
		t.Error("IsFCY(6) should be true")
	}
	if IsFCY(mkFrame(5, "")) {
		t.Error("IsFCY(5) should be false")
	}
	if IsFCY(nil) {
		t.Error("IsFCY(nil) should be false")
	}
	f := &telemetry.Frame{} // no session
	if IsFCY(f) {
		t.Error("IsFCY without session should be false")
	}
}

func TestMonitor_DoesNotCrashOnRealisticFrame(t *testing.T) {
	m := NewMonitor()
	frame := &telemetry.Frame{
		Connected:        true,
		PlayerHasVehicle: true,
		Player: &telemetry.PlayerTelemetry{
			ID:    1,
			Speed: 20.0,
		},
		Session: &telemetry.SessionInfo{
			TrackName: "Spa",
			GamePhase: 5,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Flag: "GREEN", LapDistance: 100},
			{ID: 2, Flag: "GREEN", LapDistance: 105},
		},
		TimestampUnixMS: time.Now().UnixMilli(),
	}
	evs := m.Trigger(frame.TimestampUnixMS, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected 0 events on clean green-flag frame, got %+v", evs)
	}
}

// --- Sector-level yellow flag tests ---

func mkFrameWithSectors(gamePhase uint8, playerFlag string, sectorFlags []string) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{
			GamePhase:   gamePhase,
			SectorFlags: sectorFlags,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Flag: playerFlag, LapDistance: 100},
		},
	}
}

func TestMonitor_SectorYellowFlag_FiresForEachSector(t *testing.T) {
	m := NewMonitor()
	prev := mkFrameWithSectors(5, "GREEN", []string{"GREEN", "GREEN", "GREEN"})
	eventTypes := []string{EventYellowFlagSector1, EventYellowFlagSector2, EventYellowFlagSector3}

	for i := 0; i < 3; i++ {
		sectors := []string{"GREEN", "GREEN", "GREEN"}
		sectors[i] = "YELLOW"
		curr := mkFrameWithSectors(5, "GREEN", sectors)
		evs := m.Trigger(1000+int64(i)*20_000, prev, curr)
		if len(evs) != 1 || evs[0].Type != eventTypes[i] {
			t.Errorf("sector %d: expected 1 %s, got %+v", i+1, eventTypes[i], evs)
		}
		prev = curr
	}
}

func TestMonitor_SectorYellowCooldown(t *testing.T) {
	m := NewMonitor()
	prev := mkFrameWithSectors(5, "GREEN", []string{"GREEN", "GREEN", "GREEN"})
	curr := mkFrameWithSectors(5, "GREEN", []string{"YELLOW", "GREEN", "GREEN"})

	now := int64(100_000)
	evs := m.Trigger(now, prev, curr)
	if len(evs) != 1 || evs[0].Type != EventYellowFlagSector1 {
		t.Fatalf("first call: expected 1 EventYellowFlagSector1, got %+v", evs)
	}

	// 9s later still YELLOW — cooldown (10s) not elapsed.
	evs = m.Trigger(now+9_000, curr, curr)
	if len(evs) != 0 {
		t.Errorf("at +9s: expected 0 events (cooldown), got %+v", evs)
	}

	// 11s later still YELLOW — cooldown elapsed, but no transition (was already yellow).
	// Should NOT fire because prevNotYellow is false.
	evs = m.Trigger(now+11_000, curr, curr)
	if len(evs) != 0 {
		t.Errorf("at +11s: expected 0 events (no transition), got %+v", evs)
	}
}

func TestMonitor_SectorAllClear(t *testing.T) {
	m := NewMonitor()
	prev := mkFrameWithSectors(5, "GREEN", []string{"YELLOW", "GREEN", "GREEN"})
	curr := mkFrameWithSectors(5, "GREEN", []string{"GREEN", "GREEN", "GREEN"})

	evs := m.Trigger(1000, prev, curr)
	if len(evs) != 1 || evs[0].Type != EventYellowSectorAllClear {
		t.Fatalf("expected 1 EventYellowSectorAllClear, got %+v", evs)
	}
}

func TestMonitor_SectorAllClear_SkipsWhenAlreadyAllGreen(t *testing.T) {
	m := NewMonitor()
	prev := mkFrameWithSectors(5, "GREEN", []string{"GREEN", "GREEN", "GREEN"})
	curr := mkFrameWithSectors(5, "GREEN", []string{"GREEN", "GREEN", "GREEN"})

	evs := m.Trigger(1000, prev, curr)
	if len(evs) != 0 {
		t.Errorf("expected 0 events when already all green, got %+v", evs)
	}
}

func TestMonitor_SectorNoCrashOnNilSectorFlags(t *testing.T) {
	m := NewMonitor()
	// Frame with no SectorFlags — should not crash or emit sector events.
	frame := mkFrame(5, "GREEN")
	frame.Session = &telemetry.SessionInfo{GamePhase: 5}
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected 0 events with nil SectorFlags, got %+v", evs)
	}
}

// ---------------------------------------------------------------------------
// Pre-race and green-flag phase transitions (Features 4)
// ---------------------------------------------------------------------------

func TestMonitor_GetReadyToCountdown(t *testing.T) {
	m := NewMonitor()
	// First frame: Green(5) to establish lastGamePhase.
	m.Trigger(1000, nil, mkFrame(5, ""))
	// Second frame: Countdown(4) → should fire GetReady.
	evs := m.Trigger(2000, mkFrame(5, ""), mkFrame(4, ""))
	var found bool
	for _, e := range evs {
		if e.Type == EventGetReady {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventGetReady on transition to Countdown(4), got %+v", evs)
	}
}

func TestMonitor_GetReadyToFormation(t *testing.T) {
	m := NewMonitor()
	// First frame: Green(5) to establish lastGamePhase.
	m.Trigger(1000, nil, mkFrame(5, ""))
	// Second frame: Formation(3) → should fire GetReady.
	evs := m.Trigger(2000, mkFrame(5, ""), mkFrame(3, ""))
	var found bool
	for _, e := range evs {
		if e.Type == EventGetReady {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventGetReady on transition to Formation(3), got %+v", evs)
	}
}

func TestMonitor_NoGetReadyOnFirstFrame(t *testing.T) {
	m := NewMonitor()
	// First frame directly in Countdown(4): lastGamePhase=0, should NOT fire.
	evs := m.Trigger(1000, nil, mkFrame(4, ""))
	for _, e := range evs {
		if e.Type == EventGetReady {
			t.Fatal("unexpected EventGetReady on first frame (lastGamePhase=0)")
		}
	}
}

func TestMonitor_NoGetReadyOnSustainedCountdown(t *testing.T) {
	m := NewMonitor()
	// Establish Countdown.
	m.Trigger(1000, nil, mkFrame(4, ""))
	// Same phase again: no transition.
	evs := m.Trigger(2000, mkFrame(4, ""), mkFrame(4, ""))
	for _, e := range evs {
		if e.Type == EventGetReady {
			t.Fatal("unexpected EventGetReady on sustained Countdown")
		}
	}
}

func TestMonitor_GreenFlagFromCountdown(t *testing.T) {
	m := NewMonitor()
	// First frame: Countdown(4).
	m.Trigger(1000, nil, mkFrame(4, ""))
	// Second frame: Green(5) from Countdown(4) → should fire GreenFlag.
	evs := m.Trigger(2000, mkFrame(4, ""), mkFrame(5, ""))
	var found bool
	for _, e := range evs {
		if e.Type == EventGreenFlag {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventGreenFlag on Countdown→Green transition, got %+v", evs)
	}
}

func TestMonitor_GreenFlagFromFCY(t *testing.T) {
	m := NewMonitor()
	// First frame: FCY(6).
	m.Trigger(1000, nil, mkFrame(6, ""))
	// Second frame: Green(5) from FCY(6) → should fire GreenFlag.
	evs := m.Trigger(2000, mkFrame(6, ""), mkFrame(5, ""))
	var found bool
	for _, e := range evs {
		if e.Type == EventGreenFlag {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventGreenFlag on FCY→Green transition, got %+v", evs)
	}
}

func TestMonitor_GreenFlagFromFormation(t *testing.T) {
	m := NewMonitor()
	// First frame: Formation(3).
	m.Trigger(1000, nil, mkFrame(3, ""))
	// Second frame: Green(5) from Formation(3) → should fire GreenFlag.
	evs := m.Trigger(2000, mkFrame(3, ""), mkFrame(5, ""))
	var found bool
	for _, e := range evs {
		if e.Type == EventGreenFlag {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventGreenFlag on Formation→Green transition, got %+v", evs)
	}
}

func TestMonitor_NoGreenFlagOnSustainedGreen(t *testing.T) {
	m := NewMonitor()
	// Establish Green.
	m.Trigger(1000, nil, mkFrame(5, ""))
	// Same phase: no green flag event.
	evs := m.Trigger(2000, mkFrame(5, ""), mkFrame(5, ""))
	for _, e := range evs {
		if e.Type == EventGreenFlag {
			t.Fatal("unexpected EventGreenFlag on sustained Green")
		}
	}
}

func TestMonitor_NoGreenFlagOnIrrelevantTransitions(t *testing.T) {
	m := NewMonitor()
	// Establish Green.
	m.Trigger(1000, nil, mkFrame(5, ""))
	// Transition to FCY should NOT fire GreenFlag.
	evs := m.Trigger(2000, mkFrame(5, ""), mkFrame(6, ""))
	for _, e := range evs {
		if e.Type == EventGreenFlag {
			t.Fatal("unexpected EventGreenFlag on Green→FCY transition")
		}
	}
}

// ---------------------------------------------------------------------------
// Feature 1: Blue flag optimization — per-driver limit, close-gap check
// ---------------------------------------------------------------------------

// mkBlueFrame creates a frame where the player (id=1, place=5) has a blue
// flag and an opponent (id=2, place=6) is close behind with gap < 1.5 s
// (opponent's TimeBehindNext < 1.5 indicates they are close to the car
// ahead, which may be the player).
func mkBlueFrame(playerFlag string, opponentBehindGap float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50},
		Session: &telemetry.SessionInfo{
			GamePhase:                5,
			SessionTime:              30,
			TimeRemainingInGamePhase: 1000,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 5, Flag: playerFlag, LapDistance: 500},
			// Opponent behind player (Place=6 > Place=5), with small gap to car ahead (player).
			{ID: 2, IsPlayer: false, Place: 6, Flag: "BLUE", TimeBehindNext: opponentBehindGap, LapDistance: 490},
			{ID: 3, IsPlayer: false, Place: 4, Flag: "GREEN", LapDistance: 510},
		},
	}
}

func TestMonitor_BlueFlagFiresWhenOpponentClose(t *testing.T) {
	m := NewMonitor()
	prev := mkBlueFrame("GREEN", 0)
	curr := mkBlueFrame("BLUE", 0.8) // gap < 1.5 → real

	now := int64(100_000)
	evs := m.Trigger(now, prev, curr)
	found := false
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventBlueFlag for close opponent, got %+v", evs)
	}
}

func TestMonitor_BlueFlagSuppressedWhenOpponentFar(t *testing.T) {
	m := NewMonitor()
	prev := mkBlueFrame("GREEN", 0)
	curr := mkBlueFrame("BLUE", 3.0) // gap > 1.5 → not real

	now := int64(100_000)
	evs := m.Trigger(now, prev, curr)
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			t.Fatalf("expected no EventBlueFlag for distant opponent, got %+v", e)
		}
	}
}

func TestMonitor_BlueFlagSuppressedWhenNoFasterOpponentBehind(t *testing.T) {
	m := NewMonitor()
	// Player in first place (Place=1) — no one ahead, and that means
	// no opponent behind with Place > 1 has a small gap to the player.
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50},
		Session: &telemetry.SessionInfo{
			GamePhase:   5,
			SessionTime: 30,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 1, Flag: "BLUE", LapDistance: 500},
			{ID: 2, IsPlayer: false, Place: 2, Flag: "GREEN", TimeBehindNext: 3.0, LapDistance: 490},
			{ID: 3, IsPlayer: false, Place: 3, Flag: "GREEN", TimeBehindNext: 2.0, LapDistance: 480},
		},
	}
	m.ResetBlueFlagWarnings()
	evs := m.Trigger(100_000, mkFrame(5, "GREEN"), frame)
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			t.Fatalf("expected no EventBlueFlag when player is P1, got %+v", e)
		}
	}
}

func TestMonitor_BlueFlagPerDriverLimit(t *testing.T) {
	m := NewMonitor()
	prev := mkBlueFrame("GREEN", 0)
	// Same opponent (ID=2) close behind.
	now := int64(100_000)

	// First 3 warnings should fire.
	for i := 0; i < 3; i++ {
		curr := mkBlueFrame("BLUE", 0.8)
		evs := m.Trigger(now+int64(i)*20_000, prev, curr)
		found := false
		for _, e := range evs {
			if e.Type == EventBlueFlag {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected EventBlueFlag for i=%d (under limit), got %+v", i, evs)
		}
		prev = curr
	}

	// 4th warning for same driver should be suppressed.
	curr := mkBlueFrame("BLUE", 0.8)
	evs := m.Trigger(now+60_000, prev, curr)
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			t.Fatalf("expected no EventBlueFlag (per-driver limit reached), got %+v", e)
		}
	}
}

func TestMonitor_BlueFlagDifferentDriverResetsLimit(t *testing.T) {
	m := NewMonitor()
	prev := mkBlueFrame("GREEN", 0)
	now := int64(100_000)

	// 3 warnings for driver ID=2 (behind player at Place=6).
	for i := 0; i < 3; i++ {
		curr := mkBlueFrame("BLUE", 0.8)
		m.Trigger(now+int64(i)*20_000, prev, curr)
		prev = curr
	}

	// Now driver ID=4 is a different opponent behind player (Place=6).
	curr := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50},
		Session: &telemetry.SessionInfo{GamePhase: 5, SessionTime: 30, TimeRemainingInGamePhase: 1000},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 5, Flag: "BLUE", LapDistance: 500},
			{ID: 4, IsPlayer: false, Place: 6, Flag: "BLUE", TimeBehindNext: 0.5, LapDistance: 490},
		},
	}
	evs := m.Trigger(now+70_000, prev, curr)
	found := false
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventBlueFlag for different driver (fresh limit), got %+v", evs)
	}
}

func TestMonitor_ResetBlueFlagWarnings(t *testing.T) {
	m := NewMonitor()
	// Fire a warning.
	prev := mkBlueFrame("GREEN", 0)
	curr := mkBlueFrame("BLUE", 0.8)
	m.Trigger(100_000, prev, curr)
	if len(m.blueFlagWarningsPerDriver) == 0 {
		t.Fatal("expected warnings after blue flag")
	}
	// Reset.
	m.ResetBlueFlagWarnings()
	if len(m.blueFlagWarningsPerDriver) != 0 {
		t.Error("expected empty warnings after reset")
	}
}

func TestMonitor_BlueFlagSuppressedWhenInPits(t *testing.T) {
	m := NewMonitor()
	// Player in pits should suppress blue flag (and all flags).
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 0},
		Session: &telemetry.SessionInfo{
			GamePhase:   5,
			SessionTime: 30,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 5, Flag: "BLUE", InPits: true, LapDistance: 100},
			{ID: 2, IsPlayer: false, Place: 3, Flag: "BLUE", TimeBehindNext: 0.5, LapDistance: 110},
		},
	}
	evs := m.Trigger(100_000, nil, frame)
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			t.Fatalf("expected no EventBlueFlag when in pits, got %+v", e)
		}
	}
}

func TestMonitor_BlueFlagFiresOnlyRealBlue(t *testing.T) {
	// Opponent has Place > player (behind) but gap is huge (3.0s) → not close enough.
	m := NewMonitor()
	prev := mkBlueFrame("GREEN", 0)
	curr := mkBlueFrame("BLUE", 3.0) // gap > 1.5
	evs := m.Trigger(100_000, prev, curr)
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			t.Fatalf("expected no EventBlueFlag when opponent gap is large (3.0s), got %+v", e)
		}
	}
}

func TestMonitor_BlueFlagFiresOnlyRealBlue_OpponentAheadDoesNotCount(t *testing.T) {
	// Opponent has Place < player (ahead) — they cannot be the one blue-flagging the player.
	m := NewMonitor()
	frame := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Speed: 50},
		Session: &telemetry.SessionInfo{GamePhase: 5, SessionTime: 30, TimeRemainingInGamePhase: 1000},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Place: 5, Flag: "BLUE", LapDistance: 500},
			{ID: 2, IsPlayer: false, Place: 3, Flag: "BLUE", TimeBehindNext: 0.8, LapDistance: 510},
		},
	}
	evs := m.Trigger(100_000, mkFrame(5, "GREEN"), frame)
	for _, e := range evs {
		if e.Type == EventBlueFlag {
			t.Fatalf("expected no EventBlueFlag when opponent is ahead (Place < player), got %+v", e)
		}
	}
}
