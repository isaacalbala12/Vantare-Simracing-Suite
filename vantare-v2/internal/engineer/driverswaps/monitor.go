// Package driverswaps monitors driver stint length and emits warnings
// when the current stint approaches or exceeds recommended duration.
//
// Parity CC: Events/DriverSwaps.cs — stint countdown warnings (15, 10,
// 5, 2 minutes remaining). Since our telemetry does not include
// DriverStintSecondsRemaining, we track elapsed stint time using
// session time and pit stop count transitions (rising edge on
// VehicleScoring.Pitstops).
package driverswaps

import (
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	// EventStintHalfway fires when the current stint exceeds half of
	// the typical stint duration (stintHalfMinutes / 2).
	EventStintHalfway = "driverswaps.stint_halfway"

	// EventStintLong fires when the stint exceeds stintLongMinutes.
	EventStintLong = "driverswaps.stint_long"

	// EventStintWillExceed fires when the stint exceeds
	// stintMaxMinutes.
	EventStintWillExceed = "driverswaps.stint_will_exceed"
)

// Stint thresholds in minutes (CC defaults).
const (
	stintHalfMinutes = 30.0 // halfway of a 60-min stint
	stintLongMinutes = 45.0 // approaching limit
	stintMaxMinutes  = 65.0 // maximum recommended stint length
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks driver stint duration using session time and pit stop
// count. It emits warnings as the stint approaches recommended limits.
type Monitor struct {
	sessionStartMS int64
	stintStartMS   int64
	lastPitCount   int32
	initialized    bool
	playedHalfway  bool
	playedLong     bool
	playedExceed   bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects the current frame and returns stint-warning events.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil || curr.Player == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	// First frame — initialise state.
	if !m.initialized {
		m.sessionStartMS = nowMS
		m.stintStartMS = nowMS
		m.lastPitCount = player.Pitstops
		m.initialized = true
		return nil
	}

	// Detect pit stop: rising edge on Pitstops counter. Reset stint
	// tracking on each pit stop (new stint begins).
	if player.Pitstops > m.lastPitCount {
		m.stintStartMS = nowMS
		m.lastPitCount = player.Pitstops
		m.playedHalfway = false
		m.playedLong = false
		m.playedExceed = false
		return nil
	}

	// Elapsed stint time in milliseconds.
	elapsedMS := nowMS - m.stintStartMS

	// Thresholds in milliseconds.
	halfwayMS := int64(stintHalfMinutes * 60 * 1000 / 2) // 15 min
	longMS := int64(stintLongMinutes * 60 * 1000)        // 45 min
	maxMS := int64(stintMaxMinutes * 60 * 1000)          // 65 min

	var out []Event

	// Emit events in priority order (most severe first to avoid
	// downgrading a warning once a more severe one has fired).
	if elapsedMS >= maxMS && !m.playedExceed {
		out = append(out, Event{
			Type:      EventStintWillExceed,
			ExpiresAt: nowMS + 30_000,
			Payload: map[string]any{
				"stintMinutes": float64(elapsedMS) / 60000.0,
			},
		})
		m.playedExceed = true
	} else if elapsedMS >= longMS && !m.playedLong {
		out = append(out, Event{
			Type:      EventStintLong,
			ExpiresAt: nowMS + 30_000,
			Payload: map[string]any{
				"stintMinutes": float64(elapsedMS) / 60000.0,
			},
		})
		m.playedLong = true
	} else if elapsedMS >= halfwayMS && !m.playedHalfway {
		out = append(out, Event{
			Type:      EventStintHalfway,
			ExpiresAt: nowMS + 30_000,
			Payload: map[string]any{
				"stintMinutes": float64(elapsedMS) / 60000.0,
			},
		})
		m.playedHalfway = true
	}

	return out
}
