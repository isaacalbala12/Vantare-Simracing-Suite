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

// Half-tank fires when fuel drops below this fraction of capacity (CC
// Fuel.cs:121 playedHalfTankWarning). The 1-litre absolute threshold
// is independent of fuel tank size.
const (
	defaultHalfTankFraction       = 0.5
	defaultOneLitreAbsoluteLitres = 1.0
)

// Re-arm hysteresis: once a warning has fired, it must not refire
// until fuel recovers by this factor. Prevents the "flapping" warning
// when fuel hovers right at the threshold.
const (
	oneLitreReArmFactor   = 1.2
	halfTankReArmFactor   = 1.1
)

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

// Monitor tracks fuel level crossings. capacity is supplied externally
// once known (typically the player's car class). playedHalfTank and
// played1Litre implement the rising-edge-with-hysteresis state.
type Monitor struct {
	capacity        float64
	playedHalfTank  bool
	played1Litre    bool
}

// NewMonitor creates a Monitor with default thresholds.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// NewMonitorWithCapacity creates a Monitor with the player's fuel
// capacity. Without it, only the 1-litre absolute trigger is meaningful.
func NewMonitorWithCapacity(capacity float64) *Monitor {
	return &Monitor{capacity: capacity}
}

// SetCapacity allows the runtime to update the fuel capacity once it
// is known (typically the player's car class).
func (m *Monitor) SetCapacity(capacity float64) {
	m.capacity = capacity
}

// Trigger inspects the player's current fuel and returns the events for
// threshold crossings.
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Player == nil {
		return nil
	}
	fuel := curr.Player.Fuel

	var out []Event

	// 1-litre absolute warning. Rising edge: fire once when fuel drops
	// below 1L, do not refire until fuel recovers above 1.2L.
	if fuel > 0 && fuel < defaultOneLitreAbsoluteLitres && !m.played1Litre {
		out = append(out, Event{
			Type:      EventLowFuel1Litre,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"fuelLitres": fuel},
		})
		m.played1Litre = true
	} else if fuel >= defaultOneLitreAbsoluteLitres*oneLitreReArmFactor {
		m.played1Litre = false
	}

	// Half-tank warning. Only meaningful if capacity is known.
	if m.capacity > 0 && fuel > 0 {
		half := m.capacity * defaultHalfTankFraction
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
		} else if fuel >= half*halfTankReArmFactor {
			m.playedHalfTank = false
		}
	}

	return out
}