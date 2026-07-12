// Package engine implements an Engine monitor: detects when the player's
// engine water and oil temperatures cross high and critical thresholds and
// emits the corresponding events.
//
// Parity CC: Events/EngineMonitor.cs (full implementation enumerates
// many more triggers: oil pressure, engine wear, water temp gradient,
// cylinder head temp, oil level, fuel pressure, etc.).
//
// Iter-3 additions:
//   - 60-second moving average via ring buffer for all-clear events.
//   - EventWaterTempAllClear / EventOilTempAllClear when avg cools below re-arm.
//   - EventEngineStalled with speed gate and 2-min cooldown.
//   - Session phase gate: only green (5), checkered (8), full-course yellow (6).
//
// Con ExtendedReader opcional, el monitor puede leer la senal de
// advertencia de presion de aceite desde el buffer Extended de LMU
// (mOilPressureWarning). El offset actual es un placeholder — cuando
// el plugin de LMU exponga este campo, se actualizara en extended_offsets.go.
package engine

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/lmu"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Temperature thresholds in Celsius. Re-arm thresholds provide
// hysteresis to prevent flapping when temperature hovers at the
// boundary.
const (
	waterHighThreshold     = 105
	waterCriticalThreshold = 115
	waterHighReArm         = 95
	waterCriticalReArm     = 110

	oilHighThreshold     = 130
	oilCriticalThreshold = 140
	oilHighReArm         = 120
	oilCriticalReArm     = 130
)

// Oil / fuel pressure low thresholds.
const (
	oilPressureCooldownMS  = 120_000 // 2 minutes between firings
	fuelPressureCooldownMS = 120_000 // 2 minutes between firings
)

// Moving average constants (CC: statusMonitorWindowLength = 60, minSamplesForStatusData = 10).
const (
	avgWindowSeconds  = 60 // window length in seconds
	avgWindowMS       = 60_000
	minSamplesForAvg  = 10      // minimum samples before firing all-clear
	stalledCooldownMS = 120_000 // 2 minutes
)

// Session phase gates: only fire in Green (5), FullCourseYellow (6), Checkered (8).
const (
	phaseGreen            uint8 = 5
	phaseFullCourseYellow uint8 = 6
	phaseCheckered        uint8 = 8
)

// Event types emitted by Monitor.
const (
	EventWaterTempHigh         = "engine.water_temp_high"
	EventWaterTempCritical     = "engine.water_temp_critical"
	EventOilTempHigh           = "engine.oil_temp_high"
	EventOilTempCritical       = "engine.oil_temp_critical"
	EventWaterTempAllClear     = "engine.water_temp_all_clear"
	EventOilTempAllClear       = "engine.oil_temp_all_clear"
	EventEngineStalled         = "engine.stalled"
	EventEngineOilPressureLow  = "engine.oil_pressure_low"
	EventEngineFuelPressureLow = "engine.fuel_pressure_low"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// tempSample stores a single temperature reading for the moving average.
type tempSample struct {
	timeMS    int64
	waterTemp int32
	oilTemp   int32
}

// Monitor tracks engine temperature threshold crossings with
// hysteresis to avoid duplicate firings.
type Monitor struct {
	mu sync.Mutex

	playedWaterHigh     bool
	playedWaterCritical bool
	playedOilHigh       bool
	playedOilCritical   bool

	// Moving average ring buffer (iter-3).
	samples             []tempSample
	playedWaterAllClear bool
	playedOilAllClear   bool

	// Stalled engine detection (iter-3).
	lastStalledFire int64

	// Oil pressure low detection (iter-4, placeholder).
	// Lee del buffer Extended de LMU si el reader esta configurado.
	extendedReader       *lmu.ExtendedReader
	lastOilPressureFire  int64
	lastOilPressureMsg   string
	lastFuelPressureFire int64
	lastFuelPressureMsg  string
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{
		samples: make([]tempSample, 0, 64),
	}
}

// SetExtendedReader asigna un ExtendedReader opcional para leer la senal
// de advertencia de presion de aceite desde el buffer Extended de LMU.
//
// NOTA: El offset actual de mOilPressureWarning (OilPressureWarningOffset)
// es un placeholder. No hay datos reales de presion de aceite en el buffer
// Extended de LMU. Esta configuracion prepara la infraestructura para cuando
// el plugin exponga este campo.
func (m *Monitor) SetExtendedReader(reader *lmu.ExtendedReader) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.extendedReader = reader
}

// sessionPhaseOK checks whether the current session phase allows engine
// messages. CC only fires during Green, FullCourseYellow, and Checkered.
func sessionPhaseOK(curr *telemetry.Frame) bool {
	if curr == nil || curr.Session == nil {
		return false
	}
	switch curr.Session.GamePhase {
	case phaseGreen, phaseFullCourseYellow, phaseCheckered:
		return true
	default:
		return false
	}
}

// addAndPruneSamples appends a sample and removes entries older than 60s.
func (m *Monitor) addAndPruneSamples(nowMS int64, waterTemp, oilTemp int32) {
	m.samples = append(m.samples, tempSample{
		timeMS:    nowMS,
		waterTemp: waterTemp,
		oilTemp:   oilTemp,
	})
	cutoff := nowMS - avgWindowMS
	// Find first index within the window.
	first := 0
	for first < len(m.samples) && m.samples[first].timeMS < cutoff {
		first++
	}
	m.samples = m.samples[first:]
}

// avgWaterTemp returns the average water temp from the ring buffer, or 0 if
// fewer than minSamplesForAvg samples are available.
func (m *Monitor) avgWaterTemp() (int32, bool) {
	if len(m.samples) < minSamplesForAvg {
		return 0, false
	}
	var sum int64
	for _, s := range m.samples {
		sum += int64(s.waterTemp)
	}
	return int32(sum / int64(len(m.samples))), true
}

// avgOilTemp returns the average oil temp from the ring buffer, or 0 if
// fewer than minSamplesForAvg samples are available.
func (m *Monitor) avgOilTemp() (int32, bool) {
	if len(m.samples) < minSamplesForAvg {
		return 0, false
	}
	var sum int64
	for _, s := range m.samples {
		sum += int64(s.oilTemp)
	}
	return int32(sum / int64(len(m.samples))), true
}

// Trigger inspects the current frame and returns events for engine
// temperature threshold crossings.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Player == nil {
		return nil
	}

	// Session phase gate: only fire during allowed phases.
	phaseOK := sessionPhaseOK(curr)

	waterTemp := curr.Player.EngineWaterTemp
	oilTemp := curr.Player.EngineOilTemp

	var out []Event

	// --- Instantaneous threshold events (existing) ---
	if phaseOK {
		// Water temperature high (> 105C). Re-arms when water drops below 95C.
		if waterTemp > waterHighThreshold && !m.playedWaterHigh {
			out = append(out, Event{
				Type:      EventWaterTempHigh,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"waterTemp": waterTemp},
			})
			m.playedWaterHigh = true
		} else if waterTemp < waterHighReArm {
			m.playedWaterHigh = false
		}

		// Water temperature critical (> 115C). Re-arms when water drops below 110C.
		if waterTemp > waterCriticalThreshold && !m.playedWaterCritical {
			out = append(out, Event{
				Type:      EventWaterTempCritical,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"waterTemp": waterTemp},
			})
			m.playedWaterCritical = true
		} else if waterTemp < waterCriticalReArm {
			m.playedWaterCritical = false
		}

		// Oil temperature high (> 130C). Re-arms when oil drops below 120C.
		if oilTemp > oilHighThreshold && !m.playedOilHigh {
			out = append(out, Event{
				Type:      EventOilTempHigh,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"oilTemp": oilTemp},
			})
			m.playedOilHigh = true
		} else if oilTemp < oilHighReArm {
			m.playedOilHigh = false
		}

		// Oil temperature critical (> 140C). Re-arms when oil drops below 130C.
		if oilTemp > oilCriticalThreshold && !m.playedOilCritical {
			out = append(out, Event{
				Type:      EventOilTempCritical,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"oilTemp": oilTemp},
			})
			m.playedOilCritical = true
		} else if oilTemp < oilCriticalReArm {
			m.playedOilCritical = false
		}

		// --- Stalled engine detection (CC: CarSpeed < 5, cooldown 2 min) ---
		stalledOK := m.lastStalledFire == 0 || nowMS-m.lastStalledFire >= stalledCooldownMS
		if curr.Player.Speed < 5 && stalledOK {
			out = append(out, Event{
				Type:      EventEngineStalled,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"speed": curr.Player.Speed},
			})
			m.lastStalledFire = nowMS
		}

		// --- Oil pressure low detection (iter-4, placeholder) ---
		// Lee mOilPressureWarning del buffer Extended si el reader esta
		// configurado. Cooldown de 2 minutos entre disparos.
		oilOK := m.lastOilPressureFire == 0 || nowMS-m.lastOilPressureFire >= oilPressureCooldownMS
		m.mu.Lock()
		reader := m.extendedReader
		m.mu.Unlock()
		if oilOK && reader != nil {
			data, err := reader.Read()
			if err == nil && data.OilPressureWarning {
				out = append(out, Event{
					Type:      EventEngineOilPressureLow,
					ExpiresAt: nowMS + 7_000, // expira en 7 segundos
					Payload:   map[string]any{"oilPressureWarning": true},
				})
				m.lastOilPressureFire = nowMS
			}
		}

		// --- Fuel pressure low detection (simplificado, desactivado hasta que
		// el buffer Extended de LMU exponga un campo separado de presion de
		// combustible). Actualmente reusa OilPressureWarning como proxy, lo que
		// causa eventos duplicados con oil_pressure_low. Se reactivara cuando
		// se confirme un offset dedicado via live capture.
		// Ver: docs/engineer/audits/parity-review-cycle-1.md
	}

	// --- Moving average for all-clear events (60s window, min 10 samples) ---
	// Samples are always added (not gated by phase) to ensure the buffer fills
	// regardless of phase transitions.
	m.addAndPruneSamples(nowMS, waterTemp, oilTemp)

	if avgWater, ok := m.avgWaterTemp(); ok && phaseOK {
		// Fire water all-clear when avg drops below high re-arm.
		if avgWater < waterHighReArm && !m.playedWaterAllClear {
			out = append(out, Event{
				Type:      EventWaterTempAllClear,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"avgWaterTemp": avgWater},
			})
			m.playedWaterAllClear = true
		}
		// Re-arm: avg rises above high threshold.
		if avgWater >= waterHighThreshold {
			m.playedWaterAllClear = false
		}
	}

	if avgOil, ok := m.avgOilTemp(); ok && phaseOK {
		// Fire oil all-clear when avg drops below high re-arm.
		if avgOil < oilHighReArm && !m.playedOilAllClear {
			out = append(out, Event{
				Type:      EventOilTempAllClear,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"avgOilTemp": avgOil},
			})
			m.playedOilAllClear = true
		}
		// Re-arm: avg rises above high threshold.
		if avgOil >= oilHighThreshold {
			m.playedOilAllClear = false
		}
	}

	return out
}
