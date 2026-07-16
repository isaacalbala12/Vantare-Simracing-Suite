package conditions

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrame(ambientTemp, trackTemp float64) *telemetry.Frame {
	return &telemetry.Frame{
		Connected: true,
		Session: &telemetry.SessionInfo{
			AmbientTemp: ambientTemp,
			TrackTemp:   trackTemp,
			GamePhase:   5,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true},
		},
	}
}

func TestMonitor_NormalTemps(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(25, 30))
	if len(evs) != 0 {
		t.Errorf("expected 0 events for normal temps, got %d: %+v", len(evs), evs)
	}
}

func TestMonitor_Freezing(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(2, 3))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (freezing), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventTrackFreezing {
		t.Errorf("expected %q, got %q", EventTrackFreezing, evs[0].Type)
	}
	// Verify payload
	if evs[0].Payload["ambientTemp"] != 2.0 {
		t.Errorf("expected ambientTemp=2, got %v", evs[0].Payload["ambientTemp"])
	}
}

func TestMonitor_Freezing_OncePerSession(t *testing.T) {
	m := NewMonitor()
	evs1 := m.Trigger(1000, nil, mkFrame(2, 3))
	if len(evs1) != 1 {
		t.Fatalf("expected 1 event first time, got %d", len(evs1))
	}
	// Second trigger with same cold temps: should NOT fire again
	evs2 := m.Trigger(2000, nil, mkFrame(1, 2))
	if len(evs2) != 0 {
		t.Errorf("expected 0 events (once per session), got %d: %+v", len(evs2), evs2)
	}
}

func TestMonitor_HighTemp(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(42, 55))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (high temp), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventTrackTempHigh {
		t.Errorf("expected %q, got %q", EventTrackTempHigh, evs[0].Type)
	}
}

func TestMonitor_HighTemp_OncePerSession(t *testing.T) {
	m := NewMonitor()
	evs1 := m.Trigger(1000, nil, mkFrame(42, 55))
	if len(evs1) != 1 {
		t.Fatalf("expected 1 event first time, got %d", len(evs1))
	}
	// Even hotter — should not fire again
	evs2 := m.Trigger(2000, nil, mkFrame(45, 60))
	if len(evs2) != 0 {
		t.Errorf("expected 0 events (once per session), got %d: %+v", len(evs2), evs2)
	}
}

func TestMonitor_RainStarted(t *testing.T) {
	m := NewMonitor()
	// Rain approximation: trackTemp (10) < ambientTemp (20) - rainDeltaThreshold (5) → raining
	evs := m.Trigger(1000, nil, mkFrame(20, 10))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event (rain started), got %d: %+v", len(evs), evs)
	}
	if evs[0].Type != EventRainStarted {
		t.Errorf("expected %q, got %q", EventRainStarted, evs[0].Type)
	}
}

func TestMonitor_RainStopped(t *testing.T) {
	m := NewMonitor()
	// First trigger: raining
	evs1 := m.Trigger(1000, nil, mkFrame(20, 10))
	if len(evs1) != 1 || evs1[0].Type != EventRainStarted {
		t.Fatalf("expected rain started, got %+v", evs1)
	}
	// Second trigger: track temp recovered → rain stopped
	evs2 := m.Trigger(2000, nil, mkFrame(20, 18))
	if len(evs2) != 1 {
		t.Fatalf("expected 1 event (rain stopped), got %d: %+v", len(evs2), evs2)
	}
	if evs2[0].Type != EventRainStopped {
		t.Errorf("expected %q, got %q", EventRainStopped, evs2[0].Type)
	}
}

func TestMonitor_RainStopped_NoDuplicate(t *testing.T) {
	m := NewMonitor()
	// Start raining
	m.Trigger(1000, nil, mkFrame(20, 10))
	// Still raining: no event
	evs2 := m.Trigger(2000, nil, mkFrame(20, 10))
	if len(evs2) != 0 {
		t.Errorf("expected 0 events (still raining), got %d: %+v", len(evs2), evs2)
	}
}

func TestMonitor_FreezingAndRain(t *testing.T) {
	m := NewMonitor()
	// Cold ambient AND rain condition: should fire both freezing and rain
	evs := m.Trigger(1000, nil, mkFrame(2, -5))
	if len(evs) != 2 {
		t.Fatalf("expected 2 events (freezing + rain), got %d: %+v", len(evs), evs)
	}
	types := make(map[string]bool)
	for _, e := range evs {
		types[e.Type] = true
	}
	if !types[EventTrackFreezing] {
		t.Errorf("expected freezing event")
	}
	if !types[EventRainStarted] {
		t.Errorf("expected rain event")
	}
}

func TestMonitor_NilFrame(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, nil)
	if len(evs) != 0 {
		t.Errorf("expected 0 events for nil frame, got %d", len(evs))
	}
}

func TestMonitor_NilSession(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{Connected: true}
	evs := m.Trigger(1000, nil, f)
	if len(evs) != 0 {
		t.Errorf("expected 0 events for nil session, got %d", len(evs))
	}
}

func TestMonitor_Reset(t *testing.T) {
	m := NewMonitor()
	// Fire freezing
	evs1 := m.Trigger(1000, nil, mkFrame(2, 3))
	if len(evs1) != 1 {
		t.Fatalf("expected 1 event, got %d", len(evs1))
	}
	// Reset
	m.Reset()
	// Same conditions should fire again after reset
	evs2 := m.Trigger(2000, nil, mkFrame(1, 2))
	if len(evs2) != 1 {
		t.Errorf("expected 1 event after reset, got %d: %+v", len(evs2), evs2)
	}
	if evs2[0].Type != EventTrackFreezing {
		t.Errorf("expected %q, got %q", EventTrackFreezing, evs2[0].Type)
	}
}
