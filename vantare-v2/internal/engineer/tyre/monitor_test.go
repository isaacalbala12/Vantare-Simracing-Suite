package tyre

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// mkPlayerFrame creates a Frame with player telemetry populated with the
// given tyre temperatures (FL, FR, RL, RR in °C) and tyre wear values
// (FL, FR, RL, RR in percent 0–100).
func mkPlayerFrame(tempFL, tempFR, tempRL, tempRR int32, wearFL, wearFR, wearRL, wearRR uint8) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:         1,
			LapNumber:  3, // default: above 2-lap gate
			TyreTempFL: tempFL,
			TyreTempFR: tempFR,
			TyreTempRL: tempRL,
			TyreTempRR: tempRR,
			TyreWearFL: wearFL,
			TyreWearFR: wearFR,
			TyreWearRL: wearRL,
			TyreWearRR: wearRR,
		},
	}
}

func TestTyreTempHigh_RisingEdge(t *testing.T) {
	m := NewMonitor()
	// FL at 120°C, others cool — should fire temp_high (threshold 117).
	evs := m.Trigger(1000, nil, mkPlayerFrame(120, 70, 70, 70, 0, 0, 0, 0))
	if len(evs) != 1 || evs[0].Type != EventTyreTempHigh {
		t.Fatalf("expected 1 EventTyreTempHigh, got %+v", evs)
	}
	if evs[0].Payload["wheel"] != "FL" {
		t.Errorf("expected wheel=FL, got %v", evs[0].Payload["wheel"])
	}
}

func TestTyreTempOverheating_RisingEdge(t *testing.T) {
	m := NewMonitor()
	// FL at 140°C — fires temp_high (140 > 117) AND temp_overheating (140 > 137).
	evs := m.Trigger(1000, nil, mkPlayerFrame(140, 70, 70, 70, 0, 0, 0, 0))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (temp_high + temp_overheating), got %+v", evs)
	}
	found := false
	for _, e := range evs {
		if e.Type == EventTyreTempOverheating {
			found = true
			if e.Payload["wheel"] != "FL" {
				t.Errorf("expected wheel=FL, got %v", e.Payload["wheel"])
			}
		}
	}
	if !found {
		t.Errorf("expected EventTyreTempOverheating among events, got %+v", evs)
	}
}

func TestTyreTempOptimal_AllInWindow(t *testing.T) {
	m := NewMonitor()
	// All tyres at 90°C — should fire optimal.
	evs := m.Trigger(1000, nil, mkPlayerFrame(90, 90, 90, 90, 0, 0, 0, 0))
	if len(evs) != 1 || evs[0].Type != EventTyreTempOptimal {
		t.Fatalf("expected 1 EventTyreTempOptimal, got %+v", evs)
	}
}

func TestTyreWearHigh_RisingEdge(t *testing.T) {
	m := NewMonitor()
	// FL at 80% wear, temps below optimal range — only wear_high fires.
	evs := m.Trigger(1000, nil, mkPlayerFrame(60, 60, 60, 60, 80, 0, 0, 0))
	if len(evs) != 1 || evs[0].Type != EventTyreWearHigh {
		t.Fatalf("expected 1 EventTyreWearHigh, got %+v", evs)
	}
	if evs[0].Payload["wheel"] != "FL" {
		t.Errorf("expected wheel=FL, got %v", evs[0].Payload["wheel"])
	}
}

func TestNoFire_BelowThreshold(t *testing.T) {
	m := NewMonitor()
	// All tyres at 60°C, wear at 10% — no events (60°C below optimal min 70,
	// wear 10% below wearMinor threshold 20).
	evs := m.Trigger(1000, nil, mkPlayerFrame(60, 60, 60, 60, 10, 10, 10, 10))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestNoDuplicateFires_Hysteresis(t *testing.T) {
	m := NewMonitor()
	// First: fire temp_high.
	evs1 := m.Trigger(1000, nil, mkPlayerFrame(120, 70, 70, 70, 0, 0, 0, 0))
	if len(evs1) != 1 {
		t.Fatalf("expected 1 event on first trigger, got %+v", evs1)
	}
	// Second: still hot (120°C) but no re-arm yet — should NOT fire again.
	evs2 := m.Trigger(2000, nil, mkPlayerFrame(120, 70, 70, 70, 0, 0, 0, 0))
	if evs2 != nil {
		t.Errorf("expected nil (duplicate), got %+v", evs2)
	}
}

func TestReArm_AfterCooling(t *testing.T) {
	m := NewMonitor()
	// Fire temp_high.
	m.Trigger(1000, nil, mkPlayerFrame(120, 70, 70, 70, 0, 0, 0, 0))
	// Cool all tyres below 97°C re-arm — this triggers re-arm (tempHighFired = false).
	m.Trigger(2000, nil, mkPlayerFrame(70, 70, 70, 70, 0, 0, 0, 0))
	// Heat again — should fire once more.
	evs := m.Trigger(3000, nil, mkPlayerFrame(120, 70, 70, 70, 0, 0, 0, 0))
	if len(evs) != 1 || evs[0].Type != EventTyreTempHigh {
		t.Fatalf("expected 1 EventTyreTempHigh after re-arm, got %+v", evs)
	}
}

func TestMultipleWarnings_Simultaneous(t *testing.T) {
	m := NewMonitor()
	// FL temp 120°C (temp_high) AND FL wear 80% (wear_high).
	evs := m.Trigger(1000, nil, mkPlayerFrame(120, 70, 70, 70, 80, 0, 0, 0))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (temp_high + wear_high), got %+v", evs)
	}
	types := make(map[string]int)
	for _, e := range evs {
		types[e.Type]++
	}
	if types[EventTyreTempHigh] != 1 {
		t.Errorf("expected 1 EventTyreTempHigh, got %d", types[EventTyreTempHigh])
	}
	if types[EventTyreWearHigh] != 1 {
		t.Errorf("expected 1 EventTyreWearHigh, got %d", types[EventTyreWearHigh])
	}
}

func TestNilCurr_NoPanic(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestNilPlayer_NoPanic(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, &telemetry.Frame{})
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

// mkPlayerFrameLap creates a frame with explicit lap number.
func mkPlayerFrameLap(tempFL, tempFR, tempRL, tempRR int32, wearFL, wearFR, wearRL, wearRR uint8, lapNum int32) *telemetry.Frame {
	f := mkPlayerFrame(tempFL, tempFR, tempRL, tempRR, wearFL, wearFR, wearRL, wearRR)
	f.Player.LapNumber = lapNum
	return f
}

// TestLapGate_Below2_SuppressesEvents: lap 0 and lap 1 suppress all events.
func TestLapGate_Below2_SuppressesEvents(t *testing.T) {
	m := NewMonitor()
	// High temp + wear at lap 0 — no events should fire.
	evs0 := m.Trigger(1000, nil, mkPlayerFrameLap(120, 70, 70, 70, 80, 0, 0, 0, 0))
	if len(evs0) != 0 {
		t.Errorf("lap 0: expected 0 events (suppressed), got %+v", evs0)
	}
	// Lap 1 — still suppressed.
	evs1 := m.Trigger(2000, nil, mkPlayerFrameLap(120, 70, 70, 70, 80, 0, 0, 0, 1))
	if len(evs1) != 0 {
		t.Errorf("lap 1: expected 0 events (suppressed), got %+v", evs1)
	}
}

// TestLapGate_AtLap2_AllowsEvents: at lap 2, events fire normally.
func TestLapGate_AtLap2_AllowsEvents(t *testing.T) {
	m := NewMonitor()
	// Lap 2 with high temp and wear — should fire.
	evs := m.Trigger(1000, nil, mkPlayerFrameLap(120, 70, 70, 70, 80, 0, 0, 0, 2))
	if len(evs) != 2 {
		t.Fatalf("lap 2: expected 2 events (temp_high + wear_high), got %+v", evs)
	}
	types := make(map[string]int)
	for _, e := range evs {
		types[e.Type]++
	}
	if types[EventTyreTempHigh] != 1 {
		t.Errorf("expected 1 EventTyreTempHigh, got %d", types[EventTyreTempHigh])
	}
	if types[EventTyreWearHigh] != 1 {
		t.Errorf("expected 1 EventTyreWearHigh, got %d", types[EventTyreWearHigh])
	}
}

// TestLapGate_ReArmStillRunsBelowLap2: re-arm logic still updates even when
// events are suppressed, so state is ready at lap 2.
func TestLapGate_ReArmStillRunsBelowLap2(t *testing.T) {
	m := NewMonitor()
	// Lap 0: high temp but suppressed — still sets tempHighFired due to threshold crossing.
	m.Trigger(1000, nil, mkPlayerFrameLap(120, 70, 70, 70, 0, 0, 0, 0, 0))
	// Lap 0: cool below re-arm — should re-arm even at lap 0.
	m.Trigger(2000, nil, mkPlayerFrameLap(70, 70, 70, 70, 0, 0, 0, 0, 0))
	// Lap 2: heat again — should fire because re-arm happened.
	evs := m.Trigger(3000, nil, mkPlayerFrameLap(120, 70, 70, 70, 0, 0, 0, 0, 2))
	if len(evs) != 1 || evs[0].Type != EventTyreTempHigh {
		t.Fatalf("expected 1 EventTyreTempHigh after re-arm at lap 2, got %+v", evs)
	}
}

// TestTyreWearMinor_RisingEdge: wear at 30% (within 20-50%) fires wear_minor.
func TestTyreWearMinor_RisingEdge(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkPlayerFrame(60, 60, 60, 60, 30, 0, 0, 0))
	if len(evs) != 1 || evs[0].Type != EventTyreWearMinor {
		t.Fatalf("expected 1 EventTyreWearMinor, got %+v", evs)
	}
	if evs[0].Payload["wheel"] != "FL" {
		t.Errorf("expected wheel=FL, got %v", evs[0].Payload["wheel"])
	}
}

// TestTyreWearMinor_Cooldown: wear minor respects 2-minute cooldown.
func TestTyreWearMinor_Cooldown(t *testing.T) {
	m := NewMonitor()
	// Fire at t=1000.
	evs1 := m.Trigger(1000, nil, mkPlayerFrame(60, 60, 60, 60, 30, 0, 0, 0))
	if len(evs1) != 1 || evs1[0].Type != EventTyreWearMinor {
		t.Fatalf("expected 1 EventTyreWearMinor at t=1000, got %+v", evs1)
	}
	// Reset state (simulate cool-down then heat again).
	m.wearMinorFired = false
	// Fire again at t=2000 (within 2 min) — should be suppressed.
	evs2 := m.Trigger(2000, nil, mkPlayerFrame(60, 60, 60, 60, 35, 0, 0, 0))
	for _, e := range evs2 {
		if e.Type == EventTyreWearMinor {
			t.Errorf("wear_minor at t=2000 should be suppressed by cooldown")
		}
	}
	// After cooldown expires (t=121000), fire again.
	evs3 := m.Trigger(121000, nil, mkPlayerFrame(60, 60, 60, 60, 35, 0, 0, 0))
	hasMinor := false
	for _, e := range evs3 {
		if e.Type == EventTyreWearMinor {
			hasMinor = true
		}
	}
	if !hasMinor {
		t.Errorf("expected wear_minor at t=121000 after cooldown expired, got %+v", evs3)
	}
}

// TestTyreWearMinor_NotFiredAtHighWear: wear at 80% should NOT fire wear_minor.
func TestTyreWearMinor_NotFiredAtHighWear(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkPlayerFrame(60, 60, 60, 60, 80, 0, 0, 0))
	for _, e := range evs {
		if e.Type == EventTyreWearMinor {
			t.Errorf("wear_minor should NOT fire at 80%% wear")
		}
	}
}
