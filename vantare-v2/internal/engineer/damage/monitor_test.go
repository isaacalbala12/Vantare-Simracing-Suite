package damage

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(dents [8]int32, detached int32) *telemetry.Frame {
	return &telemetry.Frame{
		Connected: true,
		Player: &telemetry.PlayerTelemetry{
			ID:                 1,
			DentSeverity:       dents,
			WheelDetachedCount: detached,
		},
		Session: &telemetry.SessionInfo{
			GamePhase: 5,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true},
		},
	}
}

func TestMonitor_NoDamage(t *testing.T) {
	m := NewMonitor()
	var dents [8]int32
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 0 {
		t.Errorf("expected 0 events for no damage, got %d: %+v", len(evs), evs)
	}
}

func TestMonitor_AeroMinor(t *testing.T) {
	m := NewMonitor()
	// dents[0] = 50 → aero minor
	dents := [8]int32{50, 0, 0, 0, 0, 0, 0, 0}
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (aero minor), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDamageAeroMinor {
		t.Errorf("expected %q, got %q", EventDamageAeroMinor, evs[0].Type)
	}
	if evs[0].Payload["component"] != "aero" {
		t.Errorf("expected component 'aero', got %v", evs[0].Payload["component"])
	}
}

func TestMonitor_AeroSevere(t *testing.T) {
	m := NewMonitor()
	// dents[0] = 150 → aero severe
	dents := [8]int32{150, 0, 0, 0, 0, 0, 0, 0}
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (aero severe), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDamageAeroSevere {
		t.Errorf("expected %q, got %q", EventDamageAeroSevere, evs[0].Type)
	}
}

func TestMonitor_EngineMinor(t *testing.T) {
	m := NewMonitor()
	dents := [8]int32{0, 0, 0, 0, 80, 0, 0, 0}
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (engine minor), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDamageEngineMinor {
		t.Errorf("expected %q, got %q", EventDamageEngineMinor, evs[0].Type)
	}
}

func TestMonitor_EngineSevere(t *testing.T) {
	m := NewMonitor()
	dents := [8]int32{0, 0, 0, 0, 180, 0, 0, 0}
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (engine severe), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDamageEngineSevere {
		t.Errorf("expected %q, got %q", EventDamageEngineSevere, evs[0].Type)
	}
}

func TestMonitor_SuspensionMinor(t *testing.T) {
	m := NewMonitor()
	dents := [8]int32{0, 0, 50, 0, 0, 0, 0, 0}
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (suspension minor), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDamageSuspensionMinor {
		t.Errorf("expected %q, got %q", EventDamageSuspensionMinor, evs[0].Type)
	}
}

func TestMonitor_SuspensionSevere(t *testing.T) {
	m := NewMonitor()
	dents := [8]int32{0, 0, 150, 0, 0, 0, 0, 0}
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (suspension severe), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDamageSuspensionSevere {
		t.Errorf("expected %q, got %q", EventDamageSuspensionSevere, evs[0].Type)
	}
}

func TestMonitor_BustedComponent(t *testing.T) {
	m := NewMonitor()
	// dent[4] = 250 → engine busted
	dents := [8]int32{0, 0, 0, 0, 250, 0, 0, 0}
	evs := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (busted), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDamageBusted {
		t.Errorf("expected %q, got %q", EventDamageBusted, evs[0].Type)
	}
	if evs[0].Payload["component"] != "engine" {
		t.Errorf("expected component 'engine', got %v", evs[0].Payload["component"])
	}
}

func TestMonitor_Hysteresis_NoRepeat(t *testing.T) {
	m := NewMonitor()
	dents := [8]int32{50, 0, 0, 0, 0, 0, 0, 0}
	// First trigger: aero minor
	evs1 := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs1) != 1 {
		t.Fatalf("expected 1 event first time, got %d", len(evs1))
	}
	// Second trigger with same data: should NOT fire again (hysteresis)
	evs2 := m.Trigger(2000, nil, mkFrame(dents, 0))
	if len(evs2) != 0 {
		t.Errorf("expected 0 events (hysteresis), got %d: %+v", len(evs2), evs2)
	}
}

func TestMonitor_Hysteresis_IncreaseOnly(t *testing.T) {
	m := NewMonitor()
	// Start with minor
	dentsMinor := [8]int32{50, 0, 0, 0, 0, 0, 0, 0}
	evs1 := m.Trigger(1000, nil, mkFrame(dentsMinor, 0))
	if len(evs1) != 1 || evs1[0].Type != EventDamageAeroMinor {
		t.Fatalf("expected aero minor, got %+v", evs1)
	}
	// Increase to severe
	dentsSevere := [8]int32{150, 0, 0, 0, 0, 0, 0, 0}
	evs2 := m.Trigger(2000, nil, mkFrame(dentsSevere, 0))
	if len(evs2) != 1 || evs2[0].Type != EventDamageAeroSevere {
		t.Errorf("expected aero severe, got %+v", evs2)
	}
	// Decrease back to minor: should NOT fire (only increase)
	dentsMinorAgain := [8]int32{50, 0, 0, 0, 0, 0, 0, 0}
	evs3 := m.Trigger(3000, nil, mkFrame(dentsMinorAgain, 0))
	if len(evs3) != 0 {
		t.Errorf("expected 0 events for decrease, got %d: %+v", len(evs3), evs3)
	}
}

func TestMonitor_DetachedPart(t *testing.T) {
	m := NewMonitor()
	var dents [8]int32
	// Detected wheel detached
	evs := m.Trigger(1000, nil, mkFrame(dents, 2))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (detached), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventDetachedPart {
		t.Errorf("expected %q, got %q", EventDetachedPart, evs[0].Type)
	}
	if evs[0].Payload["wheelDetachedCount"] != int32(2) {
		t.Errorf("expected wheelDetachedCount=2, got %v", evs[0].Payload["wheelDetachedCount"])
	}
}

func TestMonitor_DetachedPart_Cooldown(t *testing.T) {
	m := NewMonitor()
	var dents [8]int32
	// First fire
	evs1 := m.Trigger(1000, nil, mkFrame(dents, 1))
	if len(evs1) != 1 {
		t.Fatalf("expected 1 event first time, got %d", len(evs1))
	}
	// Too soon (within 30s cooldown)
	evs2 := m.Trigger(1000+5000, nil, mkFrame(dents, 1))
	if len(evs2) != 0 {
		t.Errorf("expected 0 events during cooldown, got %d: %+v", len(evs2), evs2)
	}
	// After cooldown expires
	evs3 := m.Trigger(1000+35000, nil, mkFrame(dents, 1))
	if len(evs3) != 1 {
		t.Errorf("expected 1 event after cooldown, got %d: %+v", len(evs3), evs3)
	}
	if evs3[0].Type != EventDetachedPart {
		t.Errorf("expected %q, got %q", EventDetachedPart, evs3[0].Type)
	}
}

func TestMonitor_NilFrame(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, nil)
	if len(evs) != 0 {
		t.Errorf("expected 0 events for nil frame, got %d", len(evs))
	}
}

func TestMonitor_NilPlayer(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{Connected: true}
	evs := m.Trigger(1000, nil, f)
	if len(evs) != 0 {
		t.Errorf("expected 0 events for nil player, got %d", len(evs))
	}
}

func TestMonitor_Reset(t *testing.T) {
	m := NewMonitor()
	dents := [8]int32{50, 0, 0, 0, 0, 0, 0, 0}
	// Fire aero minor
	evs1 := m.Trigger(1000, nil, mkFrame(dents, 0))
	if len(evs1) != 1 {
		t.Fatalf("expected 1 event, got %d", len(evs1))
	}
	// Reset
	m.Reset()
	// Same data should fire again after reset
	evs2 := m.Trigger(2000, nil, mkFrame(dents, 0))
	if len(evs2) != 1 {
		t.Errorf("expected 1 event after reset, got %d: %+v", len(evs2), evs2)
	}
	if evs2[0].Type != EventDamageAeroMinor {
		t.Errorf("expected %q, got %q", EventDamageAeroMinor, evs2[0].Type)
	}
}
