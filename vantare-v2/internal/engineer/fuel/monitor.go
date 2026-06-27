// Package fuel implements a minimal Fuel monitor for alpha 1: detects
// when the player crosses two thresholds (half-tank and 1-litre left)
// and emits the corresponding events. The full CC Fuel.cs (1899 lines)
// covers many more messages (per-lap-use-by-TrackLengthClass, 2/5/10
// minutes remaining, fuel-for-pit-now, half-time fuel estimate,
// FuelUsageStore persistence) — all G2.x scope.
//
// Parity CC: Events/Fuel.cs:127 (played1LitreWarning),
// Events/Fuel.cs:129 (played2LitreWarning), Events/Fuel.cs:121
// (playedHalfTankWarning). MVP uses 1L + half-tank only.
package fuel

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventLowFuelHalfTank = "fuel.low_half_tank"
	EventLowFuel1Litre   = "fuel.low_1l"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks fuel level crossings.
type Monitor struct {
	capacity              float64
	playedHalfTank        bool
	played1Litre          bool
	halfTankFraction      float64
	oneLitreAbsoluteLitres float64
}

// NewMonitor creates a Monitor with default thresholds (half-tank at 50%
// of capacity, 1-litre absolute).
func NewMonitor() *Monitor {
	return &Monitor{
		halfTankFraction:       0.5,
		oneLitreAbsoluteLitres: 1.0,
	}
}

// NewMonitorWithCapacity creates a Monitor that needs the player's fuel
// capacity to compute the half-tank threshold. Without it, only the
// 1-litre absolute trigger is meaningful.
func NewMonitorWithCapacity(capacity float64) *Monitor {
	return &Monitor{
		capacity:               capacity,
		halfTankFraction:       0.5,
		oneLitreAbsoluteLitres: 1.0,
	}
}

// SetCapacity allows the runtime to update the fuel capacity once it
// is known (typically the player's car class).
func (m *Monitor) SetCapacity(capacity float64) {
	m.capacity = capacity
}

// Trigger inspects the player's current fuel and returns the events for
// threshold crossings.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil || curr.Player == nil {
		return nil
	}
	fuel := curr.Player.Fuel

	var out []Event

	// 1-litre absolute warning. Rising edge: fire once when fuel drops
	// below 1L, do not refire until fuel recovers above 1.2L.
	if fuel > 0 && fuel < m.oneLitreAbsoluteLitres && !m.played1Litre {
		out = append(out, Event{
			Type:      EventLowFuel1Litre,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"fuelLitres": fuel},
		})
		m.played1Litre = true
	} else if fuel >= m.oneLitreAbsoluteLitres*1.2 {
		m.played1Litre = false
	}

	// Half-tank warning. Only meaningful if capacity is known.
	if m.capacity > 0 && fuel > 0 {
		half := m.capacity * m.halfTankFraction
		if fuel < half && !m.playedHalfTank {
			out = append(out, Event{
				Type:      EventLowFuelHalfTank,
				ExpiresAt: nowMS + 10_000,
				Payload: map[string]any{
					"fuelLitres": fuel,
					"capacity":   m.capacity,
				},
			})
			m.playedHalfTank = true
		} else if fuel >= half*1.1 {
			m.playedHalfTank = false
		}
	}

	return out
}