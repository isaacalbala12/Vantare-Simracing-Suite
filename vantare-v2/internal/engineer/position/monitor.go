// Package position implements a minimal Position + Timings monitor for
// alpha 1: detects position changes (gained/lost positions on track)
// and emits a single event. The full CC Position.cs and Timings.cs
// cover opponent-specific gaps, position predictions, "hold position"
// / "give position back" messages, etc. — all G2.x scope.
//
// Parity CC: Events/Position.cs (line 14, 20, 22, 27 constants 4s, 7s,
// 20s, 0.15s for overtake/lost detection) and Events/Timings.cs (line
// 55, 58 frequency_of_gap_*_reports). MVP uses a single rising-edge
// detector on Place (overall position) — once per change.
package position

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventPositionGained = "position.gained"
	EventPositionLost   = "position.lost"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks Place transitions.
type Monitor struct {
	lastPlace    uint8
	initialized  bool
	cooldownMS   int64
	lastEmitMS   int64
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{cooldownMS: 10_000} // 10s cooldown between position events
}

// Trigger inspects the player's overall position (Place) and returns
// events on changes.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	if !m.initialized {
		if prev != nil {
			if p := telemetry.FindPlayerVehicle(prev); p != nil {
				m.lastPlace = p.Place
			}
		}
		m.initialized = true
	}

	if player.Place == 0 || m.lastPlace == 0 {
		// Place == 0 means unknown / no scoring yet. Don't fire.
		m.lastPlace = player.Place
		return nil
	}

	if player.Place == m.lastPlace {
		return nil
	}

	cooldownStart := m.lastEmitMS
	if cooldownStart == 0 {
		cooldownStart = nowMS - m.cooldownMS
	}
	if nowMS-cooldownStart < m.cooldownMS {
		m.lastPlace = player.Place
		return nil
	}

	var evType string
	if player.Place < m.lastPlace {
		evType = EventPositionGained
	} else {
		evType = EventPositionLost
	}
	prevPlace := m.lastPlace
	m.lastPlace = player.Place
	m.lastEmitMS = nowMS
	return []Event{{
		Type:      evType,
		ExpiresAt: nowMS + 5000,
		Payload: map[string]any{
			"from": prevPlace,
			"to":   player.Place,
		},
	}}
}