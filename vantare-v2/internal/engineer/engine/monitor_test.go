package engine

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/lmu"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func mkFrameSpeed(waterTemp, oilTemp int32, lapNumber int32, speed float64, opts ...frameOption) *telemetry.Frame {
	f := &telemetry.Frame{
		Connected: true,
		Player: &telemetry.PlayerTelemetry{
			ID:              1,
			EngineWaterTemp: waterTemp,
			EngineOilTemp:   oilTemp,
			LapNumber:       lapNumber,
			Speed:           speed,
		},
		Session: &telemetry.SessionInfo{
			GamePhase:   5,
			SessionTime: 300.0,
		},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true},
		},
	}
	return f
}

type frameOption func(*telemetry.Frame)

func mkFrame(waterTemp, oilTemp int32) *telemetry.Frame {
	return mkFrameSpeed(waterTemp, oilTemp, 5, 50)
}

// makeEngineReader creates a synthetic Extended reader for testing.
func makeEngineReader(warning bool) *lmu.ExtendedReader {
	buf := lmu.NewSyntheticExtendedBuffer()
	if warning {
		buf[lmu.OilPressureWarningOffset] = 1
	}
	return lmu.NewExtendedReaderFromBuffer(buf)
}

// TestMonitor_FuelPressureLow: Fuel pressure monitoring disabled until a
// dedicated Extended buffer offset is confirmed via live LMU capture.
func TestMonitor_FuelPressureLow(t *testing.T) {
	t.Skip("Fuel pressure proxy removed (caused duplicate events). Needs live LMU capture.")
}

func TestMonitor_FuelPressureLow_Cooldown(t *testing.T) {
	t.Skip("Fuel pressure proxy removed. Needs live LMU capture.")
}

func TestMonitor_FuelPressureLow_NoReader(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrameSpeed(100, 100, 50, 5))
	for _, e := range evs {
		if e.Type == EventEngineFuelPressureLow {
			t.Errorf("expected no FuelPressureLow without reader, got %s", e.Type)
		}
	}
}

func TestMonitor_FuelPressureLow_NoWarning(t *testing.T) {
	m := NewMonitor()
	reader := makeEngineReader(false)
	m.SetExtendedReader(reader)
	evs := m.Trigger(1000, nil, mkFrameSpeed(100, 100, 50, 5))
	for _, e := range evs {
		if e.Type == EventEngineFuelPressureLow {
			t.Errorf("expected no FuelPressureLow without warning, got %s", e.Type)
		}
	}
}

func TestMonitor_OilPressureLow_WithExtendedReader(t *testing.T) {
	m := NewMonitor()
	reader := makeEngineReader(true)
	m.SetExtendedReader(reader)
	evs := m.Trigger(1000, nil, mkFrameSpeed(100, 100, 50, 5))
	hasOil := false
	for _, e := range evs {
		if e.Type == EventEngineOilPressureLow {
			hasOil = true
		}
	}
	if !hasOil {
		t.Errorf("expected EventEngineOilPressureLow when reader reports warning, got %+v", evs)
	}
}

func TestMonitor_OilPressureLow_Cooldown(t *testing.T) {
	m := NewMonitor()
	reader := makeEngineReader(true)
	m.SetExtendedReader(reader)
	m.Trigger(1000, nil, mkFrameSpeed(100, 100, 50, 5))
	evs := m.Trigger(1000+1000, nil, mkFrameSpeed(100, 100, 50, 5))
	for _, e := range evs {
		if e.Type == EventEngineOilPressureLow {
			t.Errorf("expected cooldown to suppress oil pressure, got %s", e.Type)
		}
	}
}

func TestMonitor_OilPressureLow_NoReader(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, nil, mkFrameSpeed(100, 100, 50, 5))
	for _, e := range evs {
		if e.Type == EventEngineOilPressureLow {
			t.Errorf("expected no oil pressure without reader, got %s", e.Type)
		}
	}
}
