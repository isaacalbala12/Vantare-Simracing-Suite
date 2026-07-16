package fuel

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(fuel float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, Fuel: fuel},
	}
}

// mkFrameFull creates a frame with fuel, capacity, and lap number.
func mkFrameFull(fuel, cap float64, lap int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID: 1, Fuel: fuel, FuelCap: cap, LapNumber: lap,
		},
	}
}

// ---------------------------------------------------------------------------
// Iter-1 tests (absolute thresholds, one-shot, cooldown, refuel)
// ---------------------------------------------------------------------------

func TestMonitor_1LitreWarningRisingEdge(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5.0), mkFrame(0.5))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (2L+1L), got %+v", evs)
	}
	if evs[0].Type != EventLowFuel2Litres {
		t.Errorf("expected first event EventLowFuel2Litres, got %s", evs[0].Type)
	}
	if evs[1].Type != EventLowFuel1Litre {
		t.Errorf("expected second event EventLowFuel1Litre, got %s", evs[1].Type)
	}
}

func TestMonitor_2LitreWarningOnly(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5.0), mkFrame(2.0))
	if len(evs) != 1 || evs[0].Type != EventLowFuel2Litres {
		t.Fatalf("expected 1 EventLowFuel2Litres, got %+v", evs)
	}
}

func TestMonitor_1LitreOnlyWithout2L(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, mkFrame(3.0), mkFrame(0.5))
	evs := m.Trigger(32000, mkFrame(0.5), mkFrame(0.3))
	if evs != nil {
		t.Errorf("expected nil (both already fired), got %+v", evs)
	}
}

func TestMonitor_NoFireIfAbove2L(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5.0), mkFrame(3.0))
	if evs != nil {
		t.Errorf("expected nil (fuel > 2L), got %+v", evs)
	}
}

func TestMonitor_NoDuplicate2L(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, mkFrame(5.0), mkFrame(0.5))
	evs := m.Trigger(32000, mkFrame(0.5), mkFrame(0.3))
	if evs != nil {
		t.Errorf("expected nil (already fired), got %+v", evs)
	}
}

func TestMonitor_NoReArm1LAfterRefuel_CCOneShot(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5.0), mkFrame(0.5))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events, got %+v", evs)
	}
	evs = m.Trigger(2000, mkFrame(0.5), mkFrame(5.0))
	if evs != nil {
		t.Errorf("expected nil (no refuel, one-shot persists), got %+v", evs)
	}
	evs = m.Trigger(3000, mkFrame(5.0), mkFrame(15.0))
	if evs != nil {
		t.Errorf("expected nil during refuel (fuel > 1L), got %+v", evs)
	}
	evs = m.Trigger(40000, mkFrame(15.0), mkFrame(0.5))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events after refuel, got %+v", evs)
	}
	if evs[0].Type != EventLowFuel2Litres {
		t.Errorf("expected first event EventLowFuel2Litres, got %s", evs[0].Type)
	}
	if evs[1].Type != EventLowFuel1Litre {
		t.Errorf("expected second event EventLowFuel1Litre, got %s", evs[1].Type)
	}
}

func TestMonitor_HalfTankWarning(t *testing.T) {
	m := NewMonitorWithCapacity(100.0)
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(49.0))
	if len(evs) != 1 || evs[0].Type != EventLowFuelHalfTank {
		t.Fatalf("expected 1 EventLowFuelHalfTank, got %+v", evs)
	}
}

func TestMonitor_NoHalfTankWithoutCapacity(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(0.5))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (2L+1L), got %+v", evs)
	}
	if evs[0].Type != EventLowFuel2Litres {
		t.Errorf("expected first event EventLowFuel2Litres, got %s", evs[0].Type)
	}
	if evs[1].Type != EventLowFuel1Litre {
		t.Errorf("expected second event EventLowFuel1Litre, got %s", evs[1].Type)
	}
}

func TestMonitor_NoHalfTankIfAboveHalf(t *testing.T) {
	m := NewMonitorWithCapacity(100.0)
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(60.0))
	if evs != nil {
		t.Errorf("expected nil (fuel > half), got %+v", evs)
	}
}

func TestMonitor_AllWarningsFireSimultaneously(t *testing.T) {
	m := NewMonitorWithCapacity(100.0)
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(0.5))
	if len(evs) != 3 {
		t.Fatalf("expected 3 events (2L+1L+half), got %+v", evs)
	}
	if evs[0].Type != EventLowFuel2Litres {
		t.Errorf("expected first event EventLowFuel2Litres, got %s", evs[0].Type)
	}
	if evs[1].Type != EventLowFuel1Litre {
		t.Errorf("expected second event EventLowFuel1Litre, got %s", evs[1].Type)
	}
	if evs[2].Type != EventLowFuelHalfTank {
		t.Errorf("expected third event EventLowFuelHalfTank, got %s", evs[2].Type)
	}
}

func TestMonitor_NilCurr(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5.0), nil)
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

// ---------------------------------------------------------------------------
// Iter-2 tests: consumption tracking, laps remaining, pit-now
// ---------------------------------------------------------------------------

func TestMonitor_ConsumptionCalculated(t *testing.T) {
	m := NewMonitor() // no capacity, so no half-tank interference

	// Lap 1: initialise tracking (no sample yet).
	m.Trigger(1000, nil, mkFrameFull(51, 100, 1))
	if len(m.consumptionSamples) != 0 {
		t.Fatalf("expected 0 samples after first lap, got %d", len(m.consumptionSamples))
	}

	// Lap 2: records consumption of lap 1 (51-41=10).
	m.Trigger(2000, nil, mkFrameFull(41, 100, 2))
	if len(m.consumptionSamples) != 1 || m.consumptionSamples[0] != 10 {
		t.Fatalf("expected 1 sample of 10, got %v", m.consumptionSamples)
	}

	// Lap 3: records consumption of lap 2 (41-31=10).
	m.Trigger(3000, nil, mkFrameFull(31, 100, 3))
	if len(m.consumptionSamples) != 2 {
		t.Fatalf("expected 2 samples, got %d", len(m.consumptionSamples))
	}

	// Lap 4: records consumption of lap 3 (31-21=10).
	m.Trigger(4000, nil, mkFrameFull(21, 100, 4))
	if len(m.consumptionSamples) != 3 {
		t.Fatalf("expected 3 samples, got %d", len(m.consumptionSamples))
	}

	avg := m.averageConsumptionPerLap()
	if avg != 10 {
		t.Fatalf("expected avg consumption 10, got %f", avg)
	}
}

func TestMonitor_ConsumptionSlidingWindow(t *testing.T) {
	m := NewMonitor()

	// Feed 7 samples so the window slides past the first two.
	// Lap transitions: 1→2 (100→90, use=10), 2→3 (90→80, use=10),
	// 3→4 (80→70, use=10), 4→5 (70→60, use=10), 5→6 (60→50, use=10),
	// 6→7 (50→40, use=10), 7→8 (40→30, use=10).
	for i := 0; i < 7; i++ {
		fuel := float64(100 - i*10)
		lap := int32(i + 1)
		m.Trigger(int64(1000+i*1000), nil, mkFrameFull(fuel, 100, lap))
	}

	if len(m.consumptionSamples) > maxConsumptionSamples {
		t.Fatalf("samples exceeded max %d: %d", maxConsumptionSamples, len(m.consumptionSamples))
	}
	if len(m.consumptionSamples) != 5 {
		t.Fatalf("expected 5 samples after sliding, got %d: %v", len(m.consumptionSamples), m.consumptionSamples)
	}
	// After 7 transitions, oldest 2 should have fallen off; all remaining are 10.
	for i, s := range m.consumptionSamples {
		if s != 10 {
			t.Fatalf("sample %d expected 10, got %f", i, s)
		}
	}
}

func TestMonitor_LapsRemaining4(t *testing.T) {
	m := NewMonitor() // no external capacity — relies on FuelCap from telemetry

	// Build 3 consumption samples: avg = 10 L/lap.
	// FuelCap=100 in telemetry sets m.capacity.
	m.Trigger(1000, nil, mkFrameFull(51, 100, 1)) // FuelCap=100
	m.Trigger(2000, nil, mkFrameFull(41, 100, 2))
	m.Trigger(3000, nil, mkFrameFull(31, 100, 3))
	m.Trigger(4000, nil, mkFrameFull(21, 100, 4))

	// At t=4000: fuel=21, capacity=100, half=50 → fuel <= 50, half-tank
	// fires. lastFuelCallMS=4000. We need cooldown to pass.
	// Estimated = 38/10 = 3.8 → level 4.
	// At t=5000: canFire = 5000-4000=1000 < 30000 → blocked.
	// So fire at t=34000+.
	evs := m.Trigger(35000, nil, mkFrameFull(38, 100, 4))
	if len(evs) == 0 {
		t.Fatal("expected at least 1 event, got none")
	}
	var found bool
	for _, e := range evs {
		if e.Type == EventFuelLapsRemaining4 {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventFuelLapsRemaining4 in events, got %+v", evs)
	}

	// Second call with same level should NOT fire again (one-shot).
	evs = m.Trigger(66000, nil, mkFrameFull(38, 100, 4))
	for _, e := range evs {
		if e.Type == EventFuelLapsRemaining4 {
			t.Fatal("laps_remaining_4 fired again despite one-shot")
		}
	}
}

func TestMonitor_LapsRemainingNoFireOnZeroConsumption(t *testing.T) {
	m := NewMonitorWithCapacity(100)
	// No consumption samples yet.
	evs := m.Trigger(1000, nil, mkFrameFull(50, 100, 1))
	for _, e := range evs {
		if e.Type == EventFuelLapsRemaining4 ||
			e.Type == EventFuelLapsRemaining3 ||
			e.Type == EventFuelLapsRemaining2 ||
			e.Type == EventFuelLapsRemaining1 {
			t.Fatalf("unexpected laps remaining event with no consumption data: %s", e.Type)
		}
	}
}

func TestMonitor_FuelForPitNow(t *testing.T) {
	m := NewMonitor() // capacity comes from FuelCap in telemetry

	// Build consumption samples: avg = 10 L/lap.
	m.Trigger(1000, nil, mkFrameFull(100, 100, 1))
	m.Trigger(2000, nil, mkFrameFull(90, 100, 2))
	m.Trigger(3000, nil, mkFrameFull(80, 100, 3))
	// At t=3000: fuel=80, half=50, 80 > 50 → no half-tank.
	// avg = 10, lastFuelLevel=80, lastFuelCallMS=0.

	// Fuel for 3.5 laps: 35/10 = 3.5 < 4 → pit-now fires.
	// Also estimated <= 4 → laps_remaining_4 also fires.
	evs := m.Trigger(5000, nil, mkFrameFull(35, 100, 3))
	var hasPitNow bool
	for _, e := range evs {
		if e.Type == EventFuelForPitNow {
			hasPitNow = true
			break
		}
	}
	if !hasPitNow {
		t.Fatalf("expected fuel.for_pit_now in events, got %+v", evs)
	}

	// One-shot: same conditions after cooldown → no second pit-now.
	evs = m.Trigger(36000, nil, mkFrameFull(35, 100, 3))
	for _, e := range evs {
		if e.Type == EventFuelForPitNow {
			t.Fatal("pit-now fired again despite one-shot")
		}
	}
}

func TestMonitor_FuelForPitNow_ReArmAfterRefuel(t *testing.T) {
	m := NewMonitorWithCapacity(100)

	// Build consumption samples: avg = 10 L/lap.
	m.Trigger(1000, nil, mkFrameFull(100, 100, 1))
	m.Trigger(2000, nil, mkFrameFull(90, 100, 2))
	m.Trigger(3000, nil, mkFrameFull(80, 100, 3)) // 80 > half=50, no event

	// Fire pit-now: fuel=35, 35/10=3.5 < 4.
	evs := m.Trigger(5000, nil, mkFrameFull(35, 100, 3))
	var hasPitNow bool
	for _, e := range evs {
		if e.Type == EventFuelForPitNow {
			hasPitNow = true
			break
		}
	}
	if !hasPitNow {
		t.Fatal("expected pit-now in first call")
	}

	// lastFuelLevel=35, lastFuelCallMS=5000.
	// Refuel: fuel jumps to 95 (+60 ≥ 10) → resets playedPitNow and other flags.
	// New lap 4 to avoid negative consumption.
	evs = m.Trigger(6000, nil, mkFrameFull(95, 100, 4))
	for _, e := range evs {
		if e.Type == EventFuelForPitNow {
			t.Fatal("pit-now fired during refuel when estimated > 4")
		}
	}

	// After cooldown, fire pit-now again (refuel reset playedPitNow).
	evs = m.Trigger(37000, nil, mkFrameFull(35, 100, 4))
	hasPitNow = false
	for _, e := range evs {
		if e.Type == EventFuelForPitNow {
			hasPitNow = true
			break
		}
	}
	if !hasPitNow {
		t.Fatal("expected pit-now after refuel re-arm")
	}
}

func TestMonitor_NoFireForUnknownFuelCap(t *testing.T) {
	m := NewMonitor() // no external capacity, FuelCap=0 in telemetry

	// Build samples with FuelCap=0 (no capacity known).
	m.Trigger(1000, nil, mkFrameFull(100, 0, 1))
	m.Trigger(2000, nil, mkFrameFull(90, 0, 2))
	m.Trigger(3000, nil, mkFrameFull(80, 0, 3))
	// avg = 10, but capacity = 0 → laps remaining / pit-now are skipped.

	evs := m.Trigger(5000, nil, mkFrameFull(30, 0, 3))
	for _, e := range evs {
		if e.Type == EventFuelLapsRemaining4 ||
			e.Type == EventFuelLapsRemaining3 ||
			e.Type == EventFuelLapsRemaining2 ||
			e.Type == EventFuelLapsRemaining1 {
			t.Fatalf("unexpected laps remaining with FuelCap=0: %s", e.Type)
		}
		if e.Type == EventFuelForPitNow {
			t.Fatal("unexpected pit-now with FuelCap=0")
		}
		// Threshold events (2L, 1L) are still allowed — they don't need capacity.
		// fuel=30 > 2L, so no threshold events either.
	}
}

// mkFrameSession creates a frame with fuel, capacity, lap, and session info.
func mkFrameSession(fuel, cap float64, lap int32, isTimed bool, sessionTime, timeRemaining float64, totalLaps int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID: 1, Fuel: fuel, FuelCap: cap, LapNumber: lap,
		},
		Session: &telemetry.SessionInfo{
			IsTimedSession:           isTimed,
			SessionTime:              sessionTime,
			TimeRemainingInGamePhase: timeRemaining,
			SessionLapsTotal:         totalLaps,
		},
	}
}

// ---------------------------------------------------------------------------
// Iter-3 tests: half-time fuel estimate, 10-min and 5-min fuel warnings
// ---------------------------------------------------------------------------

func TestMonitor_FuelHalfTime_TimedSession(t *testing.T) {
	m := NewMonitor()
	// Timed: sessionTime=300, timeRemaining=100 → sessionTime >= timeRemaining → fire.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 5, true, 300, 100, 0))
	var found bool
	for _, e := range evs {
		if e.Type == EventFuelHalfTime {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventFuelHalfTime, got %+v", evs)
	}
}

func TestMonitor_FuelHalfTime_LapBasedSession(t *testing.T) {
	m := NewMonitor()
	// Lap-based: totalLaps=20, half=10, lapNumber=10 >= 10 → fire.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 10, false, 0, 0, 20))
	var found bool
	for _, e := range evs {
		if e.Type == EventFuelHalfTime {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventFuelHalfTime, got %+v", evs)
	}
}

func TestMonitor_FuelHalfTime_NoFireBeforeHalf(t *testing.T) {
	m := NewMonitor()
	// Lap-based: totalLaps=20, half=10, lapNumber=5 < 10 → no fire.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 5, false, 0, 0, 20))
	for _, e := range evs {
		if e.Type == EventFuelHalfTime {
			t.Fatal("unexpected EventFuelHalfTime before half distance")
		}
	}
}

func TestMonitor_FuelHalfTime_NoFireWhenZeroFuel(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrameSession(0, 100, 10, false, 0, 0, 20))
	for _, e := range evs {
		if e.Type == EventFuelHalfTime {
			t.Fatal("unexpected EventFuelHalfTime with zero fuel")
		}
	}
}

func TestMonitor_FuelHalfTime_OneShot(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 10, false, 0, 0, 20))
	var found bool
	for _, e := range evs {
		if e.Type == EventFuelHalfTime {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected first fire of EventFuelHalfTime")
	}
	// Second call after cooldown: should NOT fire again.
	evs = m.Trigger(35000, nil, mkFrameSession(60, 100, 10, false, 0, 0, 20))
	for _, e := range evs {
		if e.Type == EventFuelHalfTime {
			t.Fatal("EventFuelHalfTime fired again despite one-shot")
		}
	}
}

func TestMonitor_FuelTenMinRemaining(t *testing.T) {
	m := NewMonitor()
	// 599s rem → 599/60 = 9.983, <= 10 && > 5 → fire.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 1, true, 100, 599, 0))
	var found bool
	for _, e := range evs {
		if e.Type == EventFuelTenMinRemaining {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventFuelTenMinRemaining at 599s rem, got %+v", evs)
	}
}

func TestMonitor_FuelFiveMinRemaining(t *testing.T) {
	m := NewMonitor()
	// 300s rem → 300/60 = 5, <= 5 && > 0 → fire.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 1, true, 100, 300, 0))
	var found bool
	for _, e := range evs {
		if e.Type == EventFuelFiveMinRemaining {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventFuelFiveMinRemaining at 300s rem, got %+v", evs)
	}
}

func TestMonitor_FuelTimeWarnings_NoFireAbove10Min(t *testing.T) {
	m := NewMonitor()
	// 660s rem → 660/60 = 11 > 10 → no fire.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 1, true, 100, 660, 0))
	for _, e := range evs {
		if e.Type == EventFuelTenMinRemaining || e.Type == EventFuelFiveMinRemaining {
			t.Fatal("unexpected time warning above threshold")
		}
	}
}

func TestMonitor_FuelTimeWarnings_10MinThen5Min(t *testing.T) {
	m := NewMonitor()
	// First at 599s: 10-min fires.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 1, true, 100, 599, 0))
	has10 := false
	has5 := false
	for _, e := range evs {
		if e.Type == EventFuelTenMinRemaining {
			has10 = true
		}
		if e.Type == EventFuelFiveMinRemaining {
			has5 = true
		}
	}
	if !has10 {
		t.Fatal("expected 10-min warning at 599s")
	}
	if has5 {
		t.Fatal("unexpected 5-min warning at 599s (>5 min)")
	}

	// Later at 299s: 5-min fires.
	m = NewMonitor() // fresh monitor for clean state
	evs = m.Trigger(1000, nil, mkFrameSession(60, 100, 1, true, 100, 299, 0))
	has5 = false
	for _, e := range evs {
		if e.Type == EventFuelFiveMinRemaining {
			has5 = true
		}
	}
	if !has5 {
		t.Fatal("expected 5-min warning at 299s")
	}
}

func TestMonitor_FuelTimeWarnings_OneShot(t *testing.T) {
	m := NewMonitor()
	// Fire 10-min warning.
	evs := m.Trigger(1000, nil, mkFrameSession(60, 100, 1, true, 100, 599, 0))
	var found bool
	for _, e := range evs {
		if e.Type == EventFuelTenMinRemaining {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected first fire of 10-min warning")
	}
	// After cooldown, same conditions should not fire again.
	evs = m.Trigger(35000, nil, mkFrameSession(60, 100, 1, true, 100, 599, 0))
	for _, e := range evs {
		if e.Type == EventFuelTenMinRemaining {
			t.Fatal("10-min warning fired again despite one-shot")
		}
	}
}
