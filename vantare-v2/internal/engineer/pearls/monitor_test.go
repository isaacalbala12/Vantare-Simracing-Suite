package pearls

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(lap int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1, LapNumber: lap},
	}
}

func TestMonitor_FirstPearlAtLap1(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(1))
	if len(evs) != 1 || evs[0].Type != EventPearl {
		t.Fatalf("expected 1 EventPearl, got %+v", evs)
	}
}

func TestMonitor_NoPearlAtLap0(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(0))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NextPearlAtInterval(t *testing.T) {
	m := NewMonitor() // interval=12
	m.Trigger(1000, nil, mkFrame(1))
	// Lap 2..12: no pearl.
	for lap := int32(2); lap <= 12; lap++ {
		evs := m.Trigger(1000+int64(lap)*1000, nil, mkFrame(lap))
		if evs != nil {
			t.Errorf("at lap %d: expected nil, got %+v", lap, evs)
		}
	}
	// Lap 13: pearl.
	evs := m.Trigger(14000, nil, mkFrame(13))
	if len(evs) != 1 {
		t.Errorf("at lap 13: expected 1 EventPearl, got %+v", evs)
	}
}

func TestMonitor_MaxPearlsPerRace(t *testing.T) {
	m := NewMonitor() // max=2
	m.Trigger(1000, nil, mkFrame(1))  // pearl 1
	m.Trigger(2000, nil, mkFrame(13)) // pearl 2
	evs := m.Trigger(3000, nil, mkFrame(25))
	if evs != nil {
		t.Errorf("after max: expected nil, got %+v", evs)
	}
}

func TestMonitor_CustomInterval(t *testing.T) {
	m := NewMonitorWithParams(3, 5)
	m.Trigger(1000, nil, mkFrame(1)) // pearl 1
	evs := m.Trigger(2000, nil, mkFrame(4))
	if len(evs) != 1 {
		t.Errorf("at lap 4 (interval 3): expected 1, got %+v", evs)
	}
	// 3 laps later again.
	evs = m.Trigger(3000, nil, mkFrame(7))
	if len(evs) != 1 {
		t.Errorf("at lap 7: expected 1, got %+v", evs)
	}
}

func TestMonitor_ResetReArms(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, nil, mkFrame(1))  // pearl 1
	m.Trigger(2000, nil, mkFrame(13)) // pearl 2
	m.Reset()
	evs := m.Trigger(3000, nil, mkFrame(1))
	if len(evs) != 1 {
		t.Errorf("after Reset: expected 1, got %+v", evs)
	}
}

func TestMonitor_NilFrame(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, nil)
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