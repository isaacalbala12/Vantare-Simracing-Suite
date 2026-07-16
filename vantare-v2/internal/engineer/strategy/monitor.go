// Package strategy monitors sector times and fuel consumption to
// provide fuel strategy advice at sector boundaries.
//
// Parity CC: Events/Strategy.cs — sector timing and fuel prediction.
// This implementation focuses on the fuel-vs-sector-pace component:
// it computes per-lap duration at each sector boundary and, when fuel
// consumption data is available (via an injected callback), emits
// warnings if the remaining fuel won't last the remaining laps at the
// current pace.
package strategy

import (
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	// EventStrategySectorFuelLow fires when the player's remaining fuel
	// is insufficient for the remaining laps at the current sector pace.
	EventStrategySectorFuelLow = "strategy.sector_fuel_low"

	// EventStrategyFuelOk fires at sector boundaries when fuel is
	// adequate for the remaining distance.
	EventStrategyFuelOk = "strategy.fuel_ok"

	// EventPitPositionGain fires when a pit stop would gain positions
	// (estimated pit time < gap to car behind).
	EventPitPositionGain = "strategy.pit_position_gain"

	// EventPitPositionLoss fires when a pit stop would lose positions
	// (estimated pit time > gap to car ahead).
	EventPitPositionLoss = "strategy.pit_position_loss"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks per-sector session times and uses fuel consumption
// data to estimate how many laps remain. At each sector boundary it
// emits a fuel-status event.
type Monitor struct {
	lastSectorTimes   [3]float64 // session time when each sector (0-2) was last entered
	lastSector        int        // previous frame's sector index
	initialized       bool
	lastEventMS       int64          // cooldown gate: avoid spamming
	fuelConsumptionFn func() float64 // returns average litres per lap; may be nil

	// Pit position estimate tracking.
	lastPitPosCheckMS int64 // cooldown for position gain/loss events (30s)
}

// FuelConsumptionFn is the signature for a callback that returns the
// current average fuel consumption per lap in litres.
type FuelConsumptionFn func() float64

// NewMonitor creates a Monitor with an optional fuel consumption
// callback. When fn is nil, the monitor tracks sectors but does not
// emit fuel-related events.
func NewMonitor(fn FuelConsumptionFn) *Monitor {
	return &Monitor{
		fuelConsumptionFn: fn,
	}
}

// sectorIndex maps sector strings to 0-based indices.
func sectorIndex(sector string) int {
	switch sector {
	case "Sector1":
		return 0
	case "Sector2":
		return 1
	case "Sector3", "StartFinish":
		return 2
	default:
		return -1
	}
}

// Trigger inspects the current frame and returns sector-fuel and pit
// position-estimate events.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil || curr.Session == nil || curr.Player == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil || player.Sector == "" {
		return nil
	}

	sessionTime := curr.Session.SessionTime
	sector := sectorIndex(player.Sector)
	if sector < 0 {
		return nil
	}

	// First frame — seed state only.
	if !m.initialized {
		m.lastSectorTimes[sector] = sessionTime
		m.lastSector = sector
		m.initialized = true
		return nil
	}

	var out []Event

	// --- Pit position estimate (independent of sector boundaries) ---
	out = append(out, m.checkPitPosition(nowMS, curr, player)...)

	// --- Sector fuel logic ---
	// Detect sector boundary: the current sector's session time has
	// advanced past the last recorded entry (a new lap has brought us
	// back to this sector, or we crossed into it from the previous
	// sector).
	if sessionTime <= m.lastSectorTimes[sector] {
		m.lastSector = sector
		return out
	}

	lapDuration := sessionTime - m.lastSectorTimes[sector]
	m.lastSectorTimes[sector] = sessionTime
	m.lastSector = sector

	// Cooldown: only emit sector fuel events every 10 seconds at most
	// to avoid spam.
	if nowMS-m.lastEventMS < 10_000 {
		return out
	}

	// Fuel prediction (only if callback is set and returning data).
	avgConsumption := 0.0
	if m.fuelConsumptionFn != nil {
		avgConsumption = m.fuelConsumptionFn()
	}
	if avgConsumption <= 0 || curr.Player.Fuel <= 0 {
		return out
	}

	lapsRemaining := curr.Player.Fuel / avgConsumption

	// Estimate remaining laps in race (use session total if known).
	// If session is timed and we have lap duration, estimate total.
	remainingLaps := 0.0
	if curr.Session.SessionLapsTotal > 0 && player.TotalLaps > 0 {
		remainingLaps = float64(curr.Session.SessionLapsTotal - int32(player.TotalLaps))
	} else if curr.Session.IsTimedSession && lapDuration > 0 {
		timeRemaining := curr.Session.TimeRemainingInGamePhase
		if timeRemaining > 0 {
			remainingLaps = timeRemaining / lapDuration
		}
	} else {
		// No session bounds — just report laps remaining in tank.
		remainingLaps = lapsRemaining
	}

	// Emit low-fuel warning if fuel won't last.
	if lapsRemaining < remainingLaps && remainingLaps > 0 {
		out = append(out, Event{
			Type:      EventStrategySectorFuelLow,
			ExpiresAt: nowMS + 15_000,
			Payload: map[string]any{
				"lapsRemaining":  lapsRemaining,
				"lapDuration":    lapDuration,
				"sector":         player.Sector,
				"avgConsumption": avgConsumption,
				"remainingLaps":  remainingLaps,
			},
		})
	} else {
		out = append(out, Event{
			Type:      EventStrategyFuelOk,
			ExpiresAt: nowMS + 15_000,
			Payload: map[string]any{
				"lapsRemaining":  lapsRemaining,
				"lapDuration":    lapDuration,
				"sector":         player.Sector,
				"avgConsumption": avgConsumption,
			},
		})
	}

	m.lastEventMS = nowMS
	return out
}

// checkPitPosition computes an estimated pit stop time and compares it
// to the gap to the car ahead and behind. If the player is in or
// approaching the pits, events fire when pitting would gain or lose
// positions. 30-second cooldown prevents spam.
func (m *Monitor) checkPitPosition(nowMS int64, curr *telemetry.Frame, player *telemetry.VehicleScoring) []Event {
	// Cooldown: 30s between position estimate events.
	if m.lastPitPosCheckMS > 0 && nowMS-m.lastPitPosCheckMS < 30_000 {
		return nil
	}

	// Only fire when in pits or approaching pits (within ~200m of pit entry).
	trackLen := curr.Session.TrackLength
	approachingPits := !player.InPits && trackLen > 0 &&
		player.LapDistance >= 0 && (trackLen-player.LapDistance) <= 200

	if !player.InPits && !approachingPits {
		return nil
	}

	// Estimate pit stop time: 3s base + fuel fill time at ~5 L/s.
	fuel := curr.Player.Fuel
	fuelCap := curr.Player.FuelCap
	if fuelCap <= 0 {
		fuelCap = 100 // default capacity if unknown
	}
	fuelToAdd := fuelCap - fuel
	if fuelToAdd < 0 {
		fuelToAdd = 0
	}
	pitStopTime := 3.0 + fuelToAdd/5.0

	// Gap ahead: time to car in front.
	gapAhead := player.TimeBehindNext
	if gapAhead <= 0 {
		gapAhead = player.TimeBehindLeader
	}

	// Gap behind: find opponent immediately behind the player.
	var gapBehind float64
	playerPlace := int32(player.Place)
	for i := range curr.Vehicles {
		v := &curr.Vehicles[i]
		if !v.IsPlayer && int32(v.Place) == playerPlace+1 {
			gapBehind = player.TimeBehindLeader - v.TimeBehindLeader
			if gapBehind < 0 {
				gapBehind = 0
			}
			break
		}
	}

	m.lastPitPosCheckMS = nowMS

	var out []Event
	// Loss: pit stop time > gap ahead → will lose positions.
	if pitStopTime > gapAhead && gapAhead > 0 {
		out = append(out, Event{
			Type:      EventPitPositionLoss,
			ExpiresAt: nowMS + 15_000,
			Payload: map[string]any{
				"pitStopTime": pitStopTime,
				"gapAhead":    gapAhead,
				"gapBehind":   gapBehind,
				"inPits":      player.InPits,
			},
		})
	}
	// Gain: pit stop time < gap behind → will gain positions.
	if gapBehind > 0 && pitStopTime < gapBehind {
		out = append(out, Event{
			Type:      EventPitPositionGain,
			ExpiresAt: nowMS + 15_000,
			Payload: map[string]any{
				"pitStopTime": pitStopTime,
				"gapAhead":    gapAhead,
				"gapBehind":   gapBehind,
				"inPits":      player.InPits,
			},
		})
	}
	return out
}
