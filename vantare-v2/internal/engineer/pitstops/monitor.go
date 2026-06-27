// Package pitstops implements a minimal PitStops monitor for alpha 1:
// detects transitions into and out of the pit lane. The full CC
// PitStops.cs (and the related Strategy.cs for fuel prediction) covers
// pit window open/closing, "box now" advice, predicted laps of fuel,
// predicted pit entry/exit, etc. — all G2.x scope.
//
// Parity CC: Events/PitStops.cs (large, with embedded Strategy.cs
// hooks). MVP detects two rising edges: entering pits and leaving
// pits, using the public VehicleScoring.InPits bool (offset 198).
package pitstops

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventPitEntry = "pitstops.entry"
	EventPitExit  = "pitstops.exit"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks pit-lane entry/exit transitions.
type Monitor struct {
	lastInPits bool
	initialized bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects the player's InPits flag and returns events on
// rising/falling edges.
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
				m.lastInPits = p.InPits
			}
		}
		m.initialized = true
	}

	var out []Event

	lap := int32(0)
	if curr.Player != nil {
		lap = curr.Player.LapNumber
	}

	if player.InPits && !m.lastInPits {
		out = append(out, Event{
			Type:      EventPitEntry,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{"lap": lap},
		})
	} else if !player.InPits && m.lastInPits {
		out = append(out, Event{
			Type:      EventPitExit,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{"lap": lap},
		})
	}

	m.lastInPits = player.InPits
	return out
}