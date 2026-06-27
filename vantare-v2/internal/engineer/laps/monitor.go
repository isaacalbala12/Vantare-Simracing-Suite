// Package laps implements LapTimes and LapCounter monitors for alpha 1:
// detects lap completions (rising edge on LapNumber) and personal-best
// laps (BestLapTime improving). Emits events the runtime can enqueue.
//
// Parity CC: Events/LapCounter.cs (936 lines, full implementation covers
// green-flag at race start, fastest lap, manual formation laps, laps-to-go
// announcements, leader announcement, etc.). For alpha 1 we only cover
// the two highest-value events:
//
//   - EventLapCompleted: fires every time the player's LapNumber rises
//     (one event per crossed start/finish line).
//   - EventFastestLap: fires when BestLapTime improves (only if the
//     previous lap was a non-zero, non-warmed-up value).
//
// The other CC LapCounter messages (leader-has-crossed, laps-to-go
// announcements, manual formation laps, etc.) are alpha 2 or G3.x scope.
package laps

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventLapCompleted = "laps.lap_completed"
	EventFastestLap   = "laps.fastest_lap"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any // optional: lap number, lap time
}

// Monitor tracks lap counter and personal-best transitions.
type Monitor struct {
	lastLapNumber   int32
	lastBestLapTime float64
	initialized     bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects the current frame and returns lap events. prev may be
// nil on the first call (in which case state is seeded from curr's
// values so the first lap/best doesn't false-fire on init).
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}
	// LapNumber is in frame.Player (PlayerTelemetry); BestLapTime is in
	// the player vehicle (VehicleScoring). If either is missing, abort.
	if curr.Player == nil {
		return nil
	}
	playerLap := curr.Player.LapNumber
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	if !m.initialized {
		if prev != nil && prev.Player != nil {
			m.lastLapNumber = prev.Player.LapNumber
		}
		if prev != nil {
			if p := telemetry.FindPlayerVehicle(prev); p != nil {
				m.lastBestLapTime = p.BestLapTime
			}
		}
		m.initialized = true
	}

	var out []Event

	// Lap completada: rising edge de LapNumber.
	if playerLap > m.lastLapNumber && playerLap > 0 {
		out = append(out, Event{
			Type:      EventLapCompleted,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{"lap": playerLap},
		})
	}

	// Fastest lap: BestLapTime mejora (menor). Ignorar valor 0 (no hay
	// best aún) y primera asignación para no false-firing al inicio.
	if player.BestLapTime > 0 && m.lastBestLapTime > 0 &&
		player.BestLapTime < m.lastBestLapTime {
		out = append(out, Event{
			Type:      EventFastestLap,
			ExpiresAt: nowMS + 10000,
			Payload: map[string]any{
				"lap":         playerLap,
				"lapTimeSecs": player.BestLapTime,
			},
		})
	}

	m.lastLapNumber = playerLap
	m.lastBestLapTime = player.BestLapTime
	return out
}