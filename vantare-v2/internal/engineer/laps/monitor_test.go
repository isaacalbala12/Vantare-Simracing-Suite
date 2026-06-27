package laps

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(lapNumber int32, bestLapTime float64) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        1,
			LapNumber: lapNumber,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, BestLapTime: bestLapTime},
		},
	}
}

func TestMonitor_LapCompleted(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0, 0), mkFrame(1, 0))
	if len(evs) != 1 || evs[0].Type != EventLapCompleted {
		t.Fatalf("expected 1 EventLapCompleted, got %+v", evs)
	}
	if lap, ok := evs[0].Payload["lap"].(int32); !ok || lap != 1 {
		t.Errorf("expected payload lap=1, got %v", evs[0].Payload)
	}
}

func TestMonitor_NoLapEventWhenSameNumber(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(5, 0), mkFrame(5, 0))
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_FastestLap(t *testing.T) {
	m := NewMonitor()
	// Lap 1 done, BestLapTime 105.5.
	m.Trigger(1000, mkFrame(0, 0), mkFrame(1, 105.5))
	// Lap 2, BestLapTime 104.2 (improvement).
	evs := m.Trigger(2000, mkFrame(1, 105.5), mkFrame(2, 104.2))
	if len(evs) != 2 {
		// 1 EventLapCompleted + 1 EventFastestLap
		t.Fatalf("expected 2 events, got %+v", evs)
	}
	var types []string
	for _, e := range evs {
		types = append(types, e.Type)
	}
	hasFastest := false
	for _, t := range types {
		if t == EventFastestLap {
			hasFastest = true
		}
	}
	if !hasFastest {
		t.Errorf("expected EventFastestLap among %v", types)
	}
}

func TestMonitor_NoFastestIfSlower(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, mkFrame(0, 0), mkFrame(1, 105.0))
	evs := m.Trigger(2000, mkFrame(1, 105.0), mkFrame(2, 106.5))
	// Only EventLapCompleted; no fastest.
	if len(evs) != 1 || evs[0].Type != EventLapCompleted {
		t.Errorf("expected 1 EventLapCompleted, got %+v", evs)
	}
}

func TestMonitor_NilPrevFiresOnFirstLap(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(1, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %+v", evs)
	}
}

func TestMonitor_NilPlayer(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{} // no Player
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NilCurrNoPanic(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0, 0), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}