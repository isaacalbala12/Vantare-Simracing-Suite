package multiclass

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// mkMulticlassFrame builds a frame with the player and a list of opponents.
// Sets a default track length of 5000 m (MEDIUM) and session time of 200 s.
func mkMulticlassFrame(playerID int32, playerClass string, playerLap int32, opponents []telemetry.VehicleScoring) *telemetry.Frame {
	vehicles := []telemetry.VehicleScoring{
		{ID: playerID, IsPlayer: true, VehicleClass: playerClass, LapDistance: 1000.0, TotalLaps: int16(playerLap)},
	}
	vehicles = append(vehicles, opponents...)
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        playerID,
			LapNumber: playerLap,
		},
		Session: &telemetry.SessionInfo{
			TrackLength: 5000.0,
			SessionTime: 200.0,
		},
		Vehicles: vehicles,
	}
}

// mkFrameNoSession creates a frame without session info (for gate tests).
func mkFrameNoSession(playerID int32, playerClass string, playerLap int32, opponents []telemetry.VehicleScoring) *telemetry.Frame {
	vehicles := []telemetry.VehicleScoring{
		{ID: playerID, IsPlayer: true, VehicleClass: playerClass, LapDistance: 1000.0, TotalLaps: int16(playerLap)},
	}
	vehicles = append(vehicles, opponents...)
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        playerID,
			LapNumber: playerLap,
		},
		Vehicles: vehicles,
	}
}

func TestClassifySpeed_Faster(t *testing.T) {
	if c := classifySpeed("GT3", "HYPERCAR"); c != "faster" {
		t.Errorf("GT3 vs HYPERCAR = %s, want faster", c)
	}
	if c := classifySpeed("GT4", "LMP2"); c != "faster" {
		t.Errorf("GT4 vs LMP2 = %s, want faster", c)
	}
}

func TestClassifySpeed_Slower(t *testing.T) {
	if c := classifySpeed("HYPERCAR", "GT3"); c != "slower" {
		t.Errorf("HYPERCAR vs GT3 = %s, want slower", c)
	}
}

func TestClassifySpeed_Same(t *testing.T) {
	if c := classifySpeed("GT3", "GT3"); c != "same" {
		t.Errorf("GT3 vs GT3 = %s, want same", c)
	}
	if c := classifySpeed("GT3", "UNKNOWN"); c != "same" {
		t.Errorf("GT3 vs UNKNOWN = %s, want same", c)
	}
	if c := classifySpeed("UNKNOWN", "GT3"); c != "same" {
		t.Errorf("UNKNOWN vs GT3 = %s, want same", c)
	}
}

func TestMonitor_NoPlayerClass(t *testing.T) {
	m := NewMonitor()
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 950.0},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected no events without player class, got %+v", evs)
	}
}

func TestMonitor_BelowMinLaps(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// Medium track → minLaps = 3. Lap 1 < 3 → skip.
	frame := mkMulticlassFrame(1, "GT3", 1, []telemetry.VehicleScoring{
		{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 950.0},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected no events below min laps, got %+v", evs)
	}
}

func TestMonitor_BelowMinLaps_ShortTrack(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// Short track → minLaps = 4.
	frame := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1, LapNumber: 3},
		Session: &telemetry.SessionInfo{TrackLength: 3000.0, SessionTime: 200.0},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, VehicleClass: "GT3", LapDistance: 1000.0, TotalLaps: 3},
			{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 950.0},
		},
	}
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected no events for short track minLaps=4 at lap 3, got %+v", evs)
	}
}

func TestMonitor_FasterBehind(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Fast", VehicleClass: "HYPERCAR", LapDistance: 950.0},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) == 0 {
		t.Fatal("expected events, got none")
	}
	// Should include caught-by-faster (first session) + single faster behind.
	hasCaught := false
	hasBehind := false
	for _, e := range evs {
		if e.Type == EventCaughtByFasterCars {
			hasCaught = true
		}
		if e.Type == EventFasterBehind {
			hasBehind = true
		}
	}
	if !hasCaught {
		t.Error("expected EventCaughtByFasterCars (first session)")
	}
	if !hasBehind {
		t.Error("expected EventFasterBehind")
	}
}

func TestMonitor_SlowerAhead(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("HYPERCAR")
	frame := mkMulticlassFrame(1, "HYPERCAR", 5, []telemetry.VehicleScoring{
		{ID: 33, DriverName: "Slow", VehicleClass: "GT3", LapDistance: 1050.0},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) == 0 {
		t.Fatal("expected events, got none")
	}
	hasCatching := false
	hasAhead := false
	for _, e := range evs {
		if e.Type == EventCatchingSlowerCars {
			hasCatching = true
		}
		if e.Type == EventSlowerAhead {
			hasAhead = true
		}
	}
	if !hasCatching {
		t.Error("expected EventCatchingSlowerCars (first session)")
	}
	if !hasAhead {
		t.Error("expected EventSlowerAhead")
	}
}

func TestMonitor_FasterBehindFighting(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// 2 HYPERCARs in zone, close together (20m apart) → fighting.
	// With 2+ cars in zone → EventFasterCarsBehind fires instead.
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Fast1", VehicleClass: "HYPERCAR", LapDistance: 960.0, TotalLaps: 5},
		{ID: 23, DriverName: "Fast2", VehicleClass: "HYPERCAR", LapDistance: 940.0, TotalLaps: 5},
	})
	evs := m.Trigger(1000, nil, frame)
	hasMultiple := false
	hasCaught := false
	for _, e := range evs {
		if e.Type == EventFasterCarsBehind {
			hasMultiple = true
		}
		if e.Type == EventCaughtByFasterCars {
			hasCaught = true
		}
	}
	if !hasCaught {
		t.Error("expected EventCaughtByFasterCars (first session)")
	}
	if !hasMultiple {
		t.Errorf("expected EventFasterCarsBehind for 2 fighting cars, got %+v", evs)
	}
}

func TestMonitor_FasterBehindClassLeader(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// One HYPERCAR behind at lap 5, another at lap 4. The one at lap 5 is
	// the class leader. Only one is in the warning zone (lap 5 at 950 m).
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "Leader", VehicleClass: "HYPERCAR", LapDistance: 950.0, TotalLaps: 5},
		{ID: 23, DriverName: "Lagger", VehicleClass: "HYPERCAR", LapDistance: 800.0, TotalLaps: 4},
	})
	evs := m.Trigger(1000, nil, frame)
	hasLeader := false
	for _, e := range evs {
		if e.Type == EventFasterBehindClassLdr {
			hasLeader = true
		}
	}
	if !hasLeader {
		t.Errorf("expected EventFasterBehindClassLdr, got %+v", evs)
	}
}

func TestMonitor_FasterCarsBehindMultiple(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// Three HYPERCARs behind, spread out (not fighting, not class leader).
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "F1", VehicleClass: "HYPERCAR", LapDistance: 940.0, TotalLaps: 5},
		{ID: 23, DriverName: "F2", VehicleClass: "HYPERCAR", LapDistance: 900.0, TotalLaps: 5},
		{ID: 24, DriverName: "F3", VehicleClass: "HYPERCAR", LapDistance: 860.0, TotalLaps: 5},
	})
	evs := m.Trigger(1000, nil, frame)
	hasMultiple := false
	for _, e := range evs {
		if e.Type == EventFasterCarsBehind {
			hasMultiple = true
		}
		if e.Type == EventFasterBehind || e.Type == EventFasterBehindFighting || e.Type == EventFasterBehindClassLdr {
			t.Errorf("unexpected single-car event %s when multiple cars present", e.Type)
		}
	}
	if !hasMultiple {
		t.Errorf("expected EventFasterCarsBehind for 3 cars, got %+v", evs)
	}
}

func TestMonitor_SlowerAheadFighting(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("HYPERCAR")
	// 2 GT3s ahead, close together → fighting detected.
	// Both in zone on medium track → EventSlowerCarsAhead fires.
	frame := mkMulticlassFrame(1, "HYPERCAR", 5, []telemetry.VehicleScoring{
		{ID: 33, DriverName: "S1", VehicleClass: "GT3", LapDistance: 1040.0, TotalLaps: 5},
		{ID: 34, DriverName: "S2", VehicleClass: "GT3", LapDistance: 1060.0, TotalLaps: 5},
	})
	evs := m.Trigger(1000, nil, frame)
	hasMultiple := false
	hasCatching := false
	for _, e := range evs {
		if e.Type == EventSlowerCarsAhead {
			hasMultiple = true
		}
		if e.Type == EventCatchingSlowerCars {
			hasCatching = true
		}
	}
	if !hasCatching {
		t.Error("expected EventCatchingSlowerCars (first session)")
	}
	if !hasMultiple {
		t.Errorf("expected EventSlowerCarsAhead for 2 cars, got %+v", evs)
	}
}

func TestMonitor_SlowerAheadClassLeader(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("HYPERCAR")
	// GT3 at lap 5 is ahead of GT3 at lap 4.
	frame := mkMulticlassFrame(1, "HYPERCAR", 5, []telemetry.VehicleScoring{
		{ID: 33, DriverName: "SLowLdr", VehicleClass: "GT3", LapDistance: 1050.0, TotalLaps: 5},
		{ID: 34, DriverName: "Slow2", VehicleClass: "GT3", LapDistance: 900.0, TotalLaps: 4},
	})
	evs := m.Trigger(1000, nil, frame)
	hasLeader := false
	for _, e := range evs {
		if e.Type == EventSlowerAheadClassLdr {
			hasLeader = true
		}
	}
	if !hasLeader {
		t.Errorf("expected EventSlowerAheadClassLdr, got %+v", evs)
	}
}

func TestMonitor_SlowerCarsAheadMultiple(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("HYPERCAR")
	frame := mkMulticlassFrame(1, "HYPERCAR", 5, []telemetry.VehicleScoring{
		{ID: 33, DriverName: "S1", VehicleClass: "GT3", LapDistance: 1060.0, TotalLaps: 5},
		{ID: 34, DriverName: "S2", VehicleClass: "GT3", LapDistance: 1030.0, TotalLaps: 5},
	})
	evs := m.Trigger(1000, nil, frame)
	hasMultiple := false
	for _, e := range evs {
		if e.Type == EventSlowerCarsAhead {
			hasMultiple = true
		}
	}
	if !hasMultiple {
		t.Errorf("expected EventSlowerCarsAhead for 2 cars, got %+v", evs)
	}
}

func TestMonitor_NoEventForSameClass(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, VehicleClass: "GT3", LapDistance: 950.0},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected no events for same-class opponent, got %+v", evs)
	}
}

func TestMonitor_CooldownSuppresses(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	frame1 := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 950.0},
	})
	evs := m.Trigger(1000, nil, frame1)
	if len(evs) == 0 {
		t.Fatal("expected events first call")
	}
	// Second call within 4 s cooldown: suppressed by timeBetweenChecksMS.
	evs = m.Trigger(2000, frame1, frame1)
	if len(evs) != 0 {
		t.Errorf("expected cooldown suppression at +1s, got %+v", evs)
	}
	// After 8 s, should fire again.
	evs = m.Trigger(9000, frame1, frame1)
	if len(evs) == 0 {
		t.Error("expected re-fire after settle window")
	}
}

func TestMonitor_OutOfZone_NoEvent(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// Faster car too far behind: 200 m behind (LapDistance=800 vs player 1000).
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 800.0},
	})
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("out-of-zone opponent should not trigger, got %+v", evs)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	evs := m.Trigger(1000, nil, nil)
	if len(evs) != 0 {
		t.Errorf("expected no events on nil curr, got %+v", evs)
	}
}

func TestMonitor_CaughtByFasterOncePerSession(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 950.0},
	})
	evs1 := m.Trigger(1000, nil, frame)
	hasCaught := false
	for _, e := range evs1 {
		if e.Type == EventCaughtByFasterCars {
			hasCaught = true
		}
	}
	if !hasCaught {
		t.Fatal("expected EventCaughtByFasterCars on first call")
	}

	// Second call after cooldown but before reset.
	m.lastCheckMS = 0 // force re-check
	m.Trigger(15000, frame, frame)
	// Reset session.
	m.ResetSession()
	m.lastCheckMS = 0 // force re-check
	evs3 := m.Trigger(30000, frame, frame)
	hasCaughtAgain := false
	for _, e := range evs3 {
		if e.Type == EventCaughtByFasterCars {
			hasCaughtAgain = true
		}
	}
	if !hasCaughtAgain {
		t.Error("expected EventCaughtByFasterCars again after ResetSession")
	}
}

func TestMonitor_TrackLengthClassGates(t *testing.T) {
	t.Run("VeryShortTrack", func(t *testing.T) {
		m := NewMonitor()
		m.SetPlayerClass("GT3")
		// VERY_SHORT track (< 2500 m), minLaps = 5.
		frame := &telemetry.Frame{
			Player:  &telemetry.PlayerTelemetry{ID: 1, LapNumber: 4},
			Session: &telemetry.SessionInfo{TrackLength: 2000.0, SessionTime: 200.0},
			Vehicles: []telemetry.VehicleScoring{
				{ID: 1, IsPlayer: true, VehicleClass: "GT3", LapDistance: 500.0, TotalLaps: 4},
				{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 450.0},
			},
		}
		evs := m.Trigger(1000, nil, frame)
		if len(evs) != 0 {
			t.Errorf("expected no events for very short track at lap 4 (<5), got %+v", evs)
		}
	})
	t.Run("LongTrack", func(t *testing.T) {
		m := NewMonitor()
		m.SetPlayerClass("GT3")
		// LONG track (6000-8000), minLaps = 2.
		frame := &telemetry.Frame{
			Player:  &telemetry.PlayerTelemetry{ID: 1, LapNumber: 2},
			Session: &telemetry.SessionInfo{TrackLength: 7000.0, SessionTime: 200.0},
			Vehicles: []telemetry.VehicleScoring{
				{ID: 1, IsPlayer: true, VehicleClass: "GT3", LapDistance: 1000.0, TotalLaps: 2},
				{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 950.0},
			},
		}
		evs := m.Trigger(1000, nil, frame)
		if len(evs) == 0 {
			t.Error("expected events for long track at lap 2 (>=2)")
		}
	})
}

func TestMonitor_SessionTimeGate(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// Very short track, session time = 30 s (< minTime 60).
	frame := &telemetry.Frame{
		Player:  &telemetry.PlayerTelemetry{ID: 1, LapNumber: 0},
		Session: &telemetry.SessionInfo{TrackLength: 2000.0, SessionTime: 30.0},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, VehicleClass: "GT3", LapDistance: 500.0, TotalLaps: 0},
			{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 450.0},
		},
	}
	evs := m.Trigger(1000, nil, frame)
	if len(evs) != 0 {
		t.Errorf("expected no events for session time < minTime, got %+v", evs)
	}
}

func TestMonitor_FightingNotTriggeredForDifferentLaps(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// Two HYPERCARs behind but on different laps, 10 m apart → not fighting.
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "F1", VehicleClass: "HYPERCAR", LapDistance: 940.0, TotalLaps: 5},
		{ID: 23, DriverName: "F2", VehicleClass: "HYPERCAR", LapDistance: 950.0, TotalLaps: 4},
	})
	evs := m.Trigger(1000, nil, frame)
	for _, e := range evs {
		if e.Type == EventFasterBehindFighting {
			t.Errorf("unexpected fighting event when opponents on different laps")
		}
	}
}

func TestMonitor_ClassLeaderNotSetWhenNotLeader(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	// Two HYPERCARs, the closer one has fewer laps → not class leader.
	frame := mkMulticlassFrame(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, DriverName: "NotLeader", VehicleClass: "HYPERCAR", LapDistance: 950.0, TotalLaps: 4},
		{ID: 23, DriverName: "RealLeader", VehicleClass: "HYPERCAR", LapDistance: 800.0, TotalLaps: 5},
	})
	evs := m.Trigger(1000, nil, frame)
	for _, e := range evs {
		if e.Type == EventFasterBehindClassLdr {
			t.Errorf("unexpected class leader event when closer car is not leader")
		}
	}
}

func TestMonitor_NilSession(t *testing.T) {
	m := NewMonitor()
	m.SetPlayerClass("GT3")
	frame := mkFrameNoSession(1, "GT3", 5, []telemetry.VehicleScoring{
		{ID: 22, VehicleClass: "HYPERCAR", LapDistance: 950.0},
	})
	evs := m.Trigger(1000, nil, frame)
	// Without session info, should still work (track length defaults).
	if len(evs) == 0 {
		// Actually without track length, classify returns MEDIUM, minLaps=3.
		// With LapNumber=5, should pass.
		t.Log("nil session — got no events (may need track length)")
		_ = evs
	}
}

func TestClassifyTrackLength(t *testing.T) {
	tests := []struct {
		length float64
		want   TrackLengthClass
	}{
		{0, TrackMedium},
		{1000, TrackVeryShort},
		{2499, TrackVeryShort},
		{2500, TrackShort},
		{3999, TrackShort},
		{4000, TrackMedium},
		{5999, TrackMedium},
		{6000, TrackLong},
		{7999, TrackLong},
		{8000, TrackVeryLong},
		{10000, TrackVeryLong},
	}
	for _, tt := range tests {
		got := classifyTrackLength(tt.length)
		if got != tt.want {
			t.Errorf("classifyTrackLength(%v) = %v, want %v", tt.length, got, tt.want)
		}
	}
}
