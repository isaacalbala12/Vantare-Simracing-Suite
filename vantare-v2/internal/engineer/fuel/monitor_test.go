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

func TestMonitor_1LitreWarningRisingEdge(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5.0), mkFrame(0.5))
	if len(evs) != 1 || evs[0].Type != EventLowFuel1Litre {
		t.Fatalf("expected 1 EventLowFuel1Litre, got %+v", evs)
	}
}

func TestMonitor_NoFireIfAbove1L(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5.0), mkFrame(2.0))
	if evs != nil {
		t.Errorf("expected nil (fuel > 1L), got %+v", evs)
	}
}

func TestMonitor_NoDuplicate1L(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, mkFrame(5.0), mkFrame(0.5))
	evs := m.Trigger(2000, mkFrame(0.5), mkFrame(0.3))
	if evs != nil {
		t.Errorf("expected nil (already fired), got %+v", evs)
	}
}

func TestMonitor_ReArms1LAfterRefuel(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, mkFrame(5.0), mkFrame(0.5))
	// Refuel above 1.2L threshold (1.0 * 1.2 = 1.2L)
	evs := m.Trigger(2000, mkFrame(0.5), mkFrame(2.0))
	if evs != nil {
		t.Errorf("at fuel=2.0: expected nil, got %+v", evs)
	}
	// Drop again — should fire.
	evs = m.Trigger(3000, mkFrame(2.0), mkFrame(0.5))
	if len(evs) != 1 {
		t.Errorf("expected 1 event on re-arm, got %+v", evs)
	}
}

func TestMonitor_HalfTankWarning(t *testing.T) {
	m := NewMonitorWithCapacity(100.0) // 100L tank
	// Fuel=49, half=50, should fire.
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(49.0))
	if len(evs) != 1 || evs[0].Type != EventLowFuelHalfTank {
		t.Fatalf("expected 1 EventLowFuelHalfTank, got %+v", evs)
	}
}

func TestMonitor_NoHalfTankWithoutCapacity(t *testing.T) {
	m := NewMonitor() // no capacity
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(0.5))
	// Should still fire 1L warning but NOT half-tank.
	if len(evs) != 1 || evs[0].Type != EventLowFuel1Litre {
		t.Errorf("expected only 1L warning, got %+v", evs)
	}
}

func TestMonitor_NoHalfTankIfAboveHalf(t *testing.T) {
	m := NewMonitorWithCapacity(100.0)
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(60.0))
	if evs != nil {
		t.Errorf("expected nil (fuel > half), got %+v", evs)
	}
}

func TestMonitor_BothWarningsFireSimultaneously(t *testing.T) {
	m := NewMonitorWithCapacity(100.0)
	// Below half (50) AND below 1L: both fire.
	evs := m.Trigger(1000, mkFrame(100.0), mkFrame(0.5))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events, got %+v", evs)
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