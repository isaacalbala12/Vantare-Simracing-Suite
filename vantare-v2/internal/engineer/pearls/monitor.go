// Package pearls implements a minimal PearlsOfWisdom monitor for alpha 1:
// emits periodic "pearls of wisdom" messages based on lap interval.
// CC distinguishes GOOD / BAD / NEUTRAL perla types; alpha 1 MVP only
// fires a single "pearl" event with a placeholder type; downstream code
// can route it to a generic voice catalog.
//
// Parity CC: CrewChiefV4/PearlsOfWisdom.cs (63 lines, full). MVP
// covers the periodic-fire-on-lap-interval behaviour with a fixed
// per-race max. CC defaults:
//   pearl_max_normal = 2
//   pearl_max_detailed = 4
//   pearl_standard_lap_interval = 12 (one pearl every 12 laps in detailed)
package pearls

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// EventPearl is emitted when a pearl should be played. The actual
// content (GOOD/BAD/NEUTRAL) is selected downstream by the voice
// catalog; this monitor only signals the timing.
const EventPearl = "pearls.pearl"

// DefaultMaxPearlsPerRace is CC's pearl_max_normal default.
const DefaultMaxPearlsPerRace = 2

// DefaultLapInterval is CC's pearl_standard_lap_interval default (every
// 12 laps in detailed mode).
const DefaultLapInterval = 12

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks lap counter and emits periodic pearl events.
type Monitor struct {
	lapInterval   int32
	maxPearls     int
	pearlsFired   int
	lastPearlLap  int32
}

// NewMonitor creates a Monitor with CC default settings.
func NewMonitor() *Monitor {
	return &Monitor{
		lapInterval: DefaultLapInterval,
		maxPearls:   DefaultMaxPearlsPerRace,
	}
}

// NewMonitorWithParams creates a Monitor with custom settings. Used
// by tests and future user setting wiring.
func NewMonitorWithParams(lapInterval int32, maxPearls int) *Monitor {
	return &Monitor{
		lapInterval: lapInterval,
		maxPearls:   maxPearls,
	}
}

// Trigger inspects the current frame and emits a pearl event when
// enough laps have elapsed since the last pearl.
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Player == nil {
		return nil
	}
	lap := curr.Player.LapNumber
	if lap <= 0 {
		return nil
	}
	if m.pearlsFired >= m.maxPearls {
		return nil
	}
	// First pearl fires at lap 1 (any positive lap counts as "start");
	// subsequent ones every lapInterval laps.
	if m.lastPearlLap == 0 {
		m.lastPearlLap = lap
		m.pearlsFired++
		return []Event{{
			Type:      EventPearl,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"lap": lap, "pearlNumber": m.pearlsFired},
		}}
	}
	if lap-m.lastPearlLap >= m.lapInterval {
		m.lastPearlLap = lap
		m.pearlsFired++
		return []Event{{
			Type:      EventPearl,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"lap": lap, "pearlNumber": m.pearlsFired},
		}}
	}
	return nil
}

// Reset clears the per-race state. Call on session start.
func (m *Monitor) Reset() {
	m.pearlsFired = 0
	m.lastPearlLap = 0
}