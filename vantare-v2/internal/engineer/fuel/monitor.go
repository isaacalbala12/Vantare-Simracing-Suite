// Package fuel implements a Fuel monitor with per-lap consumption
// tracking, laps-remaining prediction, and pit-now alerts.
//
// Parity CC: Events/Fuel.cs — played1LitreWarning (127),
// played2LitreWarning (129), playedHalfTankWarning (121), folderFuel
// messages for 4/3/2/1 laps remaining, and fuel-for-pit-now (148).
// Consumption uses a sliding window of up to 5 lap samples (CC uses
// fuelUseByLapsWindowLengthToUse = 3–5 depending on track length).
package fuel

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Thresholds and behaviour constants aligned with CC Fuel.cs.
const (
	defaultHalfTankFraction       = 0.5
	defaultOneLitreAbsoluteLitres = 1.0
	defaultTwoLitreAbsoluteLitres = 2.0
	minRefuelLitres               = 10.0
	canPlayFuelMessageCooldownMS  = 30_000
)

// Consumption tracking constants.
const (
	// maxConsumptionSamples is the sliding window size for per-lap fuel
	// consumption (CC fuelUseByLapsWindowLengthVeryShort = 5).
	maxConsumptionSamples = 5
	// lapsForLowFuelRun is the threshold below which we emit pit-now
	// (CC Fuel.cs:210 — lapsForLowFuelRun = 4f).
	lapsForLowFuelRun = 4.0
	// pitNowReArmFraction is the fuel fraction above which pit-now is
	// re-armed (CC resets on refuel; we also re-arm at >90 % tank).
	pitNowReArmFraction = 0.9
)

// Event types emitted by Monitor.
const (
	EventLowFuelHalfTank      = "fuel.low_half_tank"
	EventLowFuel1Litre        = "fuel.low_1l"
	EventLowFuel2Litres       = "fuel.low_2l"
	EventFuelLapsRemaining4   = "fuel.laps_remaining_4"
	EventFuelLapsRemaining3   = "fuel.laps_remaining_3"
	EventFuelLapsRemaining2   = "fuel.laps_remaining_2"
	EventFuelLapsRemaining1   = "fuel.laps_remaining_1"
	EventFuelForPitNow        = "fuel.for_pit_now"
	EventFuelHalfTime         = "fuel.half_time"
	EventFuelTenMinRemaining  = "fuel.minutes_10"
	EventFuelFiveMinRemaining = "fuel.minutes_5"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks fuel level crossings, per-lap consumption, laps
// remaining prediction, and pit-now alerts.
//
// CC one-shot behaviour: warnings fire at most once per stint until a
// refuel (>minRefuelLitres increase) resets them. A 30 s cooldown
// (canPlayFuelMessage) gates the batch of automatic messages so
// multiple warnings can fire together in one frame.
type Monitor struct {
	mu sync.Mutex

	capacity       float64
	playedHalfTank bool
	played1Litre   bool
	played2Litre   bool
	lastFuelCallMS int64
	lastFuelLevel  float64 // last fuel level seen, for refuel detection

	// Lap consumption tracking (sliding window).
	fuelAtLapStart     float64
	lapAtLastSample    int32
	consumptionSamples []float64

	// One-shot flags for laps remaining (4/3/2/1 levels).
	playedLaps4 bool
	playedLaps3 bool
	playedLaps2 bool
	playedLaps1 bool

	// One-shot flag for fuel-for-pit-now (re-arms at >90 % tank).
	playedPitNow bool

	// One-shot flags for session half-time and time-remaining fuel warnings.
	playedFuelHalfTime bool
	played10Min        bool
	played5Min         bool
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
// is known (typically the player's car class). Must be called before
// Trigger to avoid data races on the capacity field.
func (m *Monitor) SetCapacity(capacity float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.capacity = capacity
}

// Trigger inspects the player's current fuel and returns the events for
// threshold crossings, laps remaining, and pit-now.
//
// CC one-shot behaviour: each warning fires at most once per stint.
// A refuel (fuel increase > minRefuelLitres) resets all warnings.
// A 30 s cooldown (canPlayFuelMessage) gates the batch of automatic
// messages so multiple warnings can fire together in one frame.
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	if curr == nil || curr.Player == nil {
		return nil
	}
	fuel := curr.Player.Fuel

	// Update capacity from telemetry if known (CC Fuel.cs:164 — fuelCapacity).
	if curr.Player.FuelCap > 0 {
		m.capacity = curr.Player.FuelCap
	}

	// Detect refuel: if fuel increased significantly (>= minRefuelLitres),
	// reset all warnings for the new stint. CC Fuel.cs:295 (currentFuel <
	// currentGameState.FuelData.FuelLeft) detects increases; we use a
	// threshold to avoid noise from rounding.
	if m.lastFuelLevel > 0 && fuel-m.lastFuelLevel >= minRefuelLitres {
		m.playedHalfTank = false
		m.played1Litre = false
		m.played2Litre = false
		m.playedLaps4 = false
		m.playedLaps3 = false
		m.playedLaps2 = false
		m.playedLaps1 = false
		m.playedPitNow = false
		m.playedFuelHalfTime = false
		m.played10Min = false
		m.played5Min = false
		// Reset lap tracking for the new stint (fuelAtLapStart is now
		// the post-refuel level, so the next completed lap records
		// consumption correctly).
		m.fuelAtLapStart = fuel
		m.lapAtLastSample = curr.Player.LapNumber
	}
	m.lastFuelLevel = fuel

	// Track per-lap fuel consumption (sliding window, up to 5 samples).
	m.trackConsumption(curr)

	// Re-arm pit-now when fuel rises above 90 % of capacity (CC resets
	// on refuel; this handles mid-stint fuel gifts or corrections).
	if m.playedPitNow && m.capacity > 0 && fuel > m.capacity*pitNowReArmFraction {
		m.playedPitNow = false
	}

	// Cooldown check for this batch: allow first call or if 30s elapsed.
	canFire := m.lastFuelCallMS == 0 || nowMS-m.lastFuelCallMS >= canPlayFuelMessageCooldownMS
	if !canFire {
		return nil
	}

	var out []Event

	// ---- Absolute threshold warnings (CC Fuel.cs:552–786) ----

	// 2-litre warning (one-shot).
	if fuel > 0 && fuel <= defaultTwoLitreAbsoluteLitres && !m.played2Litre {
		out = append(out, Event{
			Type:      EventLowFuel2Litres,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"fuelLitres": fuel},
		})
		m.played2Litre = true
	}

	// 1-litre warning (one-shot).
	if fuel > 0 && fuel <= defaultOneLitreAbsoluteLitres && !m.played1Litre {
		out = append(out, Event{
			Type:      EventLowFuel1Litre,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"fuelLitres": fuel},
		})
		m.played1Litre = true
	}

	// Half-tank warning (CC Fuel.cs:786 — fuel/initialFuelLevel <= 0.50).
	// Only meaningful if capacity is known.
	if m.capacity > 0 && fuel > 0 && !m.playedHalfTank {
		half := m.capacity * defaultHalfTankFraction
		if fuel <= half {
			out = append(out, Event{
				Type:      EventLowFuelHalfTank,
				ExpiresAt: nowMS + 10_000,
				Payload: map[string]any{
					"fuelLitres": fuel,
					"capacity":   m.capacity,
				},
			})
			m.playedHalfTank = true
		}
	}

	// ---- Session half-time fuel estimate (CC: fuel.half_time) ----
	if !m.playedFuelHalfTime && fuel > 0 && curr.Session != nil {
		if curr.Session.IsTimedSession && curr.Session.TimeRemainingInGamePhase > 0 {
			// Timed session: half when elapsed time >= remaining time.
			if curr.Session.SessionTime >= curr.Session.TimeRemainingInGamePhase {
				out = append(out, Event{
					Type:      EventFuelHalfTime,
					ExpiresAt: nowMS + 10_000,
					Payload:   map[string]any{"sessionTime": curr.Session.SessionTime},
				})
				m.playedFuelHalfTime = true
			}
		} else if !curr.Session.IsTimedSession && curr.Session.SessionLapsTotal > 0 && curr.Player != nil {
			halfLaps := curr.Session.SessionLapsTotal / 2
			if curr.Player.LapNumber >= halfLaps {
				out = append(out, Event{
					Type:      EventFuelHalfTime,
					ExpiresAt: nowMS + 10_000,
					Payload:   map[string]any{"lapNumber": curr.Player.LapNumber},
				})
				m.playedFuelHalfTime = true
			}
		}
	}

	// ---- Laps remaining prediction and pit-now (CC Fuel.cs:573–663) ----
	if m.capacity > 0 {
		avg := m.averageConsumptionPerLap()
		if avg > 0 && fuel > 0 {
			estimatedLapsRemaining := fuel / avg

			// Laps remaining events: fire once per level as fuel drops
			// through the thresholds (CC FolderFuel messages).
			if lapsEvent := m.lapsRemainingEvent(nowMS, estimatedLapsRemaining); lapsEvent != nil {
				out = append(out, *lapsEvent)
			}

			// Fuel for pit now (CC Fuel.cs:654 — playedPitForFuelNow).
			if estimatedLapsRemaining < lapsForLowFuelRun && !m.playedPitNow {
				out = append(out, Event{
					Type:      EventFuelForPitNow,
					ExpiresAt: nowMS + 10_000,
					Payload: map[string]any{
						"fuelLitres":             fuel,
						"estimatedLapsRemaining": estimatedLapsRemaining,
					},
				})
				m.playedPitNow = true
			}
		}
	}

	// ---- 10-min and 5-min fuel warnings (CC: fuel.minutes_10, fuel.minutes_5) ----
	if curr.Session != nil && fuel > 0 {
		timeRemainingMin := curr.Session.TimeRemainingInGamePhase / 60
		if timeRemainingMin <= 10 && timeRemainingMin > 5 && !m.played10Min {
			out = append(out, Event{
				Type:      EventFuelTenMinRemaining,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"timeRemainingMin": timeRemainingMin},
			})
			m.played10Min = true
		}
		if timeRemainingMin <= 5 && timeRemainingMin > 0 && !m.played5Min {
			out = append(out, Event{
				Type:      EventFuelFiveMinRemaining,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"timeRemainingMin": timeRemainingMin},
			})
			m.played5Min = true
		}
	}

	// Update cooldown only if at least one event was emitted.
	if len(out) > 0 {
		m.lastFuelCallMS = nowMS
	}

	return out
}

// trackConsumption records a per-lap fuel consumption sample when the
// active lap advances. Samples are stored in a sliding window of up to
// maxConsumptionSamples entries (CC fuelLevelWindowByLap).
func (m *Monitor) trackConsumption(curr *telemetry.Frame) {
	if curr.Player == nil {
		return
	}
	lap := curr.Player.LapNumber
	fuel := curr.Player.Fuel

	// On lap transition, record the consumption for the completed lap.
	if m.lapAtLastSample > 0 && lap > m.lapAtLastSample {
		consumption := m.fuelAtLapStart - fuel
		if consumption > 0 {
			m.consumptionSamples = append(m.consumptionSamples, consumption)
			if len(m.consumptionSamples) > maxConsumptionSamples {
				m.consumptionSamples = m.consumptionSamples[1:]
			}
		}
	}

	// Update lap start tracking when lap changes.
	if lap != m.lapAtLastSample {
		m.fuelAtLapStart = fuel
		m.lapAtLastSample = lap
	}
}

// AverageConsumptionPerLap returns the mean consumption across the
// sliding window, or 0 if no samples are available. Public so that
// the strategy monitor can integrate consumption data.
func (m *Monitor) AverageConsumptionPerLap() float64 {
	return m.averageConsumptionPerLap()
}

// averageConsumptionPerLap returns the mean consumption across the
// sliding window, or 0 if no samples are available.
func (m *Monitor) averageConsumptionPerLap() float64 {
	if len(m.consumptionSamples) == 0 {
		return 0
	}
	sum := 0.0
	for _, s := range m.consumptionSamples {
		sum += s
	}
	return sum / float64(len(m.consumptionSamples))
}

// lapsRemainingEvent fires at most once per level (4/3/2/1) as the
// estimated laps remaining drops through each threshold.
// Returns nil if the level has already been played or estimated is
// outside the range.
func (m *Monitor) lapsRemainingEvent(nowMS int64, estimated float64) *Event {
	if estimated <= 0 || estimated > 4 {
		return nil
	}

	// Determine which level we are at (ceiling semantics: 3.8 → level 4).
	var level int
	switch {
	case estimated <= 1:
		level = 1
	case estimated <= 2:
		level = 2
	case estimated <= 3:
		level = 3
	case estimated <= 4:
		level = 4
	}

	// Check one-shot per level.
	switch level {
	case 1:
		if m.playedLaps1 {
			return nil
		}
		m.playedLaps1 = true
	case 2:
		if m.playedLaps2 {
			return nil
		}
		m.playedLaps2 = true
	case 3:
		if m.playedLaps3 {
			return nil
		}
		m.playedLaps3 = true
	case 4:
		if m.playedLaps4 {
			return nil
		}
		m.playedLaps4 = true
	}

	// Map level to event type.
	var eventType string
	switch level {
	case 4:
		eventType = EventFuelLapsRemaining4
	case 3:
		eventType = EventFuelLapsRemaining3
	case 2:
		eventType = EventFuelLapsRemaining2
	case 1:
		eventType = EventFuelLapsRemaining1
	}

	return &Event{
		Type:      eventType,
		ExpiresAt: nowMS + 10_000,
		Payload:   map[string]any{"estimatedLapsRemaining": estimated},
	}
}
