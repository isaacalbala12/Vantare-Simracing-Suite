package driverswaps

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// mkFrame creates a telemetry frame with a player vehicle.
func mkFrame(lap int32, pitstops int32) *telemetry.Frame {
	return &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{
			ID:        1,
			LapNumber: lap,
		},
		Vehicles: []telemetry.VehicleScoring{
			{
				ID:       1,
				IsPlayer: true,
				Pitstops: pitstops,
			},
		},
	}
}

func TestMonitor_Initialization(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrame(1, 0))
	if evs != nil {
		t.Fatalf("expected nil on init, got %+v", evs)
	}
}

func TestMonitor_NilFrame(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NilPlayerNoPanic(t *testing.T) {
	m := NewMonitor()
	f := &telemetry.Frame{
		Player: &telemetry.PlayerTelemetry{ID: 1},
	}
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_StintHalfway(t *testing.T) {
	m := NewMonitor()
	m.Trigger(0, nil, mkFrame(1, 0))              // init
	evs := m.Trigger(910_000, nil, mkFrame(1, 0)) // 15 min + 10s = 910s
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %+v", evs)
	}
	if evs[0].Type != EventStintHalfway {
		t.Errorf("expected EventStintHalfway, got %s", evs[0].Type)
	}
	min, ok := evs[0].Payload["stintMinutes"].(float64)
	if !ok || min < 15.0 {
		t.Errorf("expected stintMinutes >= 15, got %v", min)
	}
}

func TestMonitor_StintHalfwayOneShot(t *testing.T) {
	m := NewMonitor()
	m.Trigger(0, nil, mkFrame(1, 0))
	// Fire halfway
	evs := m.Trigger(910_000, nil, mkFrame(1, 0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %v", len(evs))
	}
	// Second call at same time → no more halfway events
	evs = m.Trigger(920_000, nil, mkFrame(1, 0))
	for _, e := range evs {
		if e.Type == EventStintHalfway {
			t.Fatal("EventStintHalfway fired again despite one-shot")
		}
	}
}

func TestMonitor_StintLong(t *testing.T) {
	m := NewMonitor()
	m.Trigger(0, nil, mkFrame(1, 0))
	// 46 min = 2760s + some extra for safety
	evs := m.Trigger(2_770_000, nil, mkFrame(1, 0))
	if len(evs) == 0 {
		t.Fatal("expected at least 1 event")
	}
	var found bool
	for _, e := range evs {
		if e.Type == EventStintLong {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventStintLong among events, got %+v", evs)
	}
}

func TestMonitor_StintWillExceed(t *testing.T) {
	m := NewMonitor()
	m.Trigger(0, nil, mkFrame(1, 0))
	// 66 min = 3960s
	evs := m.Trigger(3_970_000, nil, mkFrame(1, 0))
	if len(evs) == 0 {
		t.Fatal("expected at least 1 event")
	}
	var found bool
	for _, e := range evs {
		if e.Type == EventStintWillExceed {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected EventStintWillExceed among events, got %+v", evs)
	}
}

func TestMonitor_PitStopResetsStint(t *testing.T) {
	m := NewMonitor()
	m.Trigger(0, nil, mkFrame(1, 0)) // init

	// After 46 min, fire StintLong
	evs := m.Trigger(2_770_000, nil, mkFrame(1, 0))
	var hasLong bool
	for _, e := range evs {
		if e.Type == EventStintLong {
			hasLong = true
		}
	}
	if !hasLong {
		t.Fatal("expected EventStintLong before pit stop")
	}

	// Pit stop: Pitstops rises from 0 to 1
	evs = m.Trigger(2_800_000, nil, mkFrame(2, 1))
	if evs != nil {
		t.Errorf("expected nil on pit stop transition, got %+v", evs)
	}

	// Verify state reset: after another 46 min, StintLong fires again
	evs = m.Trigger(5_570_000, nil, mkFrame(3, 1))
	hasLong = false
	for _, e := range evs {
		if e.Type == EventStintLong {
			hasLong = true
		}
	}
	if !hasLong {
		t.Fatalf("expected EventStintLong after pit-stop reset, got %+v", evs)
	}
}

func TestMonitor_NoEventsBeforeThresholds(t *testing.T) {
	m := NewMonitor()
	m.Trigger(0, nil, mkFrame(1, 0))
	evs := m.Trigger(60_000, nil, mkFrame(1, 0)) // 1 min
	if evs != nil {
		t.Errorf("expected nil before any threshold, got %+v", evs)
	}
}

func TestMonitor_PitStopCountNoChangeReturnsNil(t *testing.T) {
	m := NewMonitor()
	m.Trigger(0, nil, mkFrame(1, 0))
	// pitstops=0 both frames, elapsed=1min → no events
	evs := m.Trigger(60_000, nil, mkFrame(1, 0))
	if evs != nil {
		t.Errorf("expected nil for short stint, got %+v", evs)
	}
}
