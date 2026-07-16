package strategy

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// mkFrame creates a telemetry frame with a player vehicle in the given sector.
func mkFrame(lap int16, sector string, fuel float64, sessionTime float64, sessionLapsTotal int32, isTimed bool, timeRemaining float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        1,
			LapNumber: int32(lap),
			Fuel:      fuel,
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:        1,
				IsPlayer:  true,
				Sector:    sector,
				TotalLaps: int16(lap),
			},
		},
		Session: &telemetry.SessionInfo{
			SessionTime:              sessionTime,
			SessionLapsTotal:         sessionLapsTotal,
			IsTimedSession:           isTimed,
			TimeRemainingInGamePhase: timeRemaining,
			NumVehicles:              1,
		},
	}
}

func TestMonitor_Initialization(t *testing.T) {
	m := NewMonitor(func() float64 { return 0 })
	evs := m.Trigger(1000, nil, mkFrame(1, "Sector1", 50, 10, 20, false, 0))
	if evs != nil {
		t.Fatalf("expected nil on init, got %+v", evs)
	}
}

func TestMonitor_NilFrame(t *testing.T) {
	m := NewMonitor(nil)
	evs := m.Trigger(1000, nil, nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoEventsWithoutFuelCallback(t *testing.T) {
	m := NewMonitor(nil) // no fuel callback
	// Init
	m.Trigger(1000, nil, mkFrame(1, "Sector1", 50, 0, 20, false, 0))
	// Same sector → no boundary
	evs := m.Trigger(2000, nil, mkFrame(1, "Sector1", 50, 5, 20, false, 0))
	if evs != nil {
		t.Errorf("expected nil for same sector, got %+v", evs)
	}
}

func TestMonitor_FuelOkOnSectorBoundary(t *testing.T) {
	m := NewMonitor(func() float64 { return 5.0 }) // avg 5 L/lap
	// Init on sector 3
	m.Trigger(1000, nil, mkFrame(1, "Sector3", 50, 5, 10, false, 0))
	// Sector1 means lap completed → boundary with fuel 50/5 = 10 laps, need 9 more
	evs := m.Trigger(50000, nil, mkFrame(2, "Sector1", 50, 115, 10, false, 0))
	if len(evs) == 0 {
		t.Fatal("expected at least 1 event on sector boundary")
	}
	if evs[0].Type != EventStrategyFuelOk {
		t.Errorf("expected EventStrategyFuelOk, got %s", evs[0].Type)
	}
}

func TestMonitor_FuelLowOnSectorBoundary(t *testing.T) {
	m := NewMonitor(func() float64 { return 10.0 }) // avg 10 L/lap
	// Init
	m.Trigger(1000, nil, mkFrame(1, "Sector1", 50, 0, 10, false, 0))
	// Boundary: fuel 9L / 10 = 0.9 laps remaining, need 9 more → low
	evs := m.Trigger(50000, nil, mkFrame(2, "Sector2", 9, 80, 10, false, 0))
	if len(evs) == 0 {
		t.Fatal("expected at least 1 event")
	}
	if evs[0].Type != EventStrategySectorFuelLow {
		t.Errorf("expected EventStrategySectorFuelLow, got %s", evs[0].Type)
	}
	// Verify payload
	lr, ok := evs[0].Payload["lapsRemaining"].(float64)
	if !ok || lr != 0.9 {
		t.Errorf("expected lapsRemaining=0.9, got %v", evs[0].Payload["lapsRemaining"])
	}
}

func TestMonitor_CooldownGate(t *testing.T) {
	m := NewMonitor(func() float64 { return 5.0 })
	// Init
	m.Trigger(1000, nil, mkFrame(1, "Sector1", 50, 0, 10, false, 0))
	// First boundary at t=50000 → fires
	evs := m.Trigger(50000, nil, mkFrame(2, "Sector2", 50, 80, 10, false, 0))
	if len(evs) == 0 {
		t.Fatal("expected event on first boundary")
	}
	// Second boundary too soon (before 10s cooldown) → suppressed
	evs = m.Trigger(50500, nil, mkFrame(2, "Sector3", 40, 90, 10, false, 0))
	if evs != nil {
		t.Errorf("expected nil during cooldown, got %+v", evs)
	}
	// Third boundary after cooldown → fires again
	evs = m.Trigger(61000, nil, mkFrame(3, "Sector1", 30, 170, 10, false, 0))
	if len(evs) == 0 {
		t.Fatal("expected event after cooldown")
	}
}

func TestMonitor_MultipleSectors(t *testing.T) {
	m := NewMonitor(func() float64 { return 5.0 })
	sessionLapsTotal := int32(10)

	// Init on Sector1
	m.Trigger(1000, nil, mkFrame(1, "Sector1", 100, 0, sessionLapsTotal, false, 0))

	// Sector2 boundary: fuel 90, avg 5 → 18 laps remaining
	evs := m.Trigger(50000, nil, mkFrame(1, "Sector2", 90, 30, sessionLapsTotal, false, 0))
	if len(evs) == 0 {
		t.Fatal("expected event on Sector2 boundary")
	}
	if evs[0].Type != EventStrategyFuelOk {
		t.Errorf("expected EventStrategyFuelOk, got %s", evs[0].Type)
	}

	// Sector3 boundary (after cooldown)
	evs = m.Trigger(61000, nil, mkFrame(1, "Sector3", 85, 55, sessionLapsTotal, false, 0))
	if len(evs) == 0 {
		t.Fatal("expected event on Sector3 boundary")
	}
	if evs[0].Type != EventStrategyFuelOk {
		t.Errorf("expected EventStrategyFuelOk, got %s", evs[0].Type)
	}

	// Sector1 boundary (lap completed, after cooldown)
	evs = m.Trigger(72000, nil, mkFrame(2, "Sector1", 80, 85, sessionLapsTotal, false, 0))
	if len(evs) == 0 {
		t.Fatal("expected event on lap completion boundary")
	}
	if evs[0].Type != EventStrategyFuelOk {
		t.Errorf("expected EventStrategyFuelOk, got %s", evs[0].Type)
	}
}

func TestMonitor_NilPlayerNoPanic(t *testing.T) {
	m := NewMonitor(nil)
	f := &telemetry.Frame{
		Session: &telemetry.SessionInfo{SessionTime: 10},
	}
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_SectorIndex(t *testing.T) {
	tests := []struct {
		sector string
		want   int
	}{
		{"Sector1", 0},
		{"Sector2", 1},
		{"Sector3", 2},
		{"StartFinish", 2},
		{"", -1},
		{"Invalid", -1},
	}
	for _, tt := range tests {
		got := sectorIndex(tt.sector)
		if got != tt.want {
			t.Errorf("sectorIndex(%q) = %d, want %d", tt.sector, got, tt.want)
		}
	}
}

// --- Feature 4: Pit position estimates ---

// mkPitPosFrame creates a frame with the player in or near pits,
// plus an optional opponent behind for gap-behind calculation.
func mkPitPosFrame(inPits bool, place uint8, timeBehindNext, timeBehindLeader float64,
	lapDist float64, trackLen float64, fuel, fuelCap float64, lapNum int32,
	opponentBehind *telemetry.VehicleScoring) *telemetry.Frame {

	vehicles := []telemetry.VehicleScoring{
		{
			ID: 1, IsPlayer: true, InPits: inPits,
			Place: place, TimeBehindNext: timeBehindNext,
			TimeBehindLeader: timeBehindLeader, LapDistance: lapDist,
			TotalLaps: int16(lapNum),
			Sector:    "Sector1",
		},
	}
	if opponentBehind != nil {
		vehicles = append(vehicles, *opponentBehind)
	}
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID: 1, LapNumber: lapNum, Fuel: fuel, FuelCap: fuelCap,
		},
		Session: &telemetry.SessionInfo{
			TrackLength: trackLen,
		},
		Vehicles: vehicles,
	}
}

func TestMonitor_PitPositionLoss_InPits(t *testing.T) {
	// Player in pits with small TimeBehindNext (1.0s) → pit stop > gap ahead → loss.
	m := NewMonitor(nil)
	frame := mkPitPosFrame(true, 2, 1.0, 5.0, 100, 5000, 10, 100, 1, nil)
	m.Trigger(1000, nil, frame) // init

	evs := m.Trigger(2000, nil, frame)
	found := false
	for _, e := range evs {
		if e.Type == EventPitPositionLoss {
			found = true
			if pst, ok := e.Payload["pitStopTime"].(float64); ok {
				// 3 + (100-10)/5 = 3 + 18 = 21s
				if pst < 20 || pst > 22 {
					t.Errorf("expected pitStopTime ~21, got %v", pst)
				}
			}
		}
	}
	if !found {
		t.Errorf("expected EventPitPositionLoss, got %+v", evs)
	}
}

func TestMonitor_PitPositionGain_InPits(t *testing.T) {
	// Player in pits with opponent behind (gap 30s), low fuel (fast pit stop ~3.5s) → gain.
	m := NewMonitor(nil)
	oppBehind := &telemetry.VehicleScoring{
		ID: 22, IsPlayer: false, Place: 3,
		TimeBehindLeader: 10.0, // opponent 15s behind player (25-10=15)
		TimeBehindNext:   15.0,
	}
	// Player: Place=2, TimeBehindLeader=25, TimeBehindNext=3.0 (gap to car ahead = 3.0)
	// Opponent behind at Place=3, TimeBehindLeader=10 → gap behind = 25 - 10 = 15s
	// pitStopTime = 3 + (100-95)/5 = 3 + 1 = 4s
	// 4s < 15s → gain
	frame := mkPitPosFrame(true, 2, 3.0, 25.0, 100, 5000, 95, 100, 1, oppBehind)
	m.Trigger(1000, nil, frame) // init

	evs := m.Trigger(2000, nil, frame)
	found := false
	for _, e := range evs {
		if e.Type == EventPitPositionGain {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventPitPositionGain, got %+v", evs)
	}
}

func TestMonitor_PitPositionApproachingPits(t *testing.T) {
	// Player NOT in pits but close to pit entry (remaining < 200m).
	// Track=5000m, LapDistance=4850m → 150m remaining → approaching.
	m := NewMonitor(nil)
	frame := mkPitPosFrame(false, 2, 1.5, 5.0, 4850, 5000, 10, 100, 1, nil)
	m.Trigger(1000, nil, frame) // init

	// Second call should detect approaching pits and fire.
	evs := m.Trigger(2000, nil, frame)
	found := false
	for _, e := range evs {
		if e.Type == EventPitPositionLoss {
			found = true
		}
	}
	if !found {
		t.Errorf("expected EventPitPositionLoss when approaching pits, got %+v", evs)
	}
}

func TestMonitor_PitPositionNotFiringWhenNotNearPits(t *testing.T) {
	m := NewMonitor(nil)
	// Player not in pits and far from pit entry.
	frame := mkPitPosFrame(false, 2, 1.5, 5.0, 2000, 5000, 10, 100, 1, nil)
	m.Trigger(1000, nil, frame) // init

	evs := m.Trigger(2000, nil, frame)
	for _, e := range evs {
		if e.Type == EventPitPositionGain || e.Type == EventPitPositionLoss {
			t.Errorf("position events should NOT fire when not near pits, got %s", e.Type)
		}
	}
}

func TestMonitor_PitPositionCooldown(t *testing.T) {
	m := NewMonitor(nil)
	frame := mkPitPosFrame(true, 2, 1.0, 5.0, 100, 5000, 10, 100, 1, nil)
	m.Trigger(1000, nil, frame) // init

	// First fire at t=2000.
	evs1 := m.Trigger(2000, nil, frame)
	hasLoss1 := false
	for _, e := range evs1 {
		if e.Type == EventPitPositionLoss {
			hasLoss1 = true
		}
	}
	if !hasLoss1 {
		t.Fatalf("expected EventPitPositionLoss first fire, got %+v", evs1)
	}
	// 5s later → cooldown blocks (30s cooldown not elapsed).
	frame2 := mkPitPosFrame(true, 2, 0.5, 4.0, 100, 5000, 10, 100, 1, nil)
	evs2 := m.Trigger(7000, nil, frame2)
	for _, e := range evs2 {
		if e.Type == EventPitPositionGain || e.Type == EventPitPositionLoss {
			t.Errorf("position events should be suppressed during 30s cooldown, got %s", e.Type)
		}
	}
	// 31s later → cooldown elapsed.
	frame3 := mkPitPosFrame(true, 2, 0.5, 4.0, 100, 5000, 10, 100, 1, nil)
	evs3 := m.Trigger(33000, nil, frame3)
	hasLoss3 := false
	for _, e := range evs3 {
		if e.Type == EventPitPositionLoss {
			hasLoss3 = true
		}
	}
	if !hasLoss3 {
		t.Errorf("expected EventPitPositionLoss after cooldown, got %+v", evs3)
	}
}
