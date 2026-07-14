// Package laps implements LapTimes and LapCounter monitors for alpha 1:
// detects lap completions (rising edge on LapNumber), personal-best
// laps (BestLapTime improving), and consistency analysis (lap times
// window). Emits events the runtime can enqueue.
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
//
// Consistency analysis parity: CC LapTimes.cs checkAgainstPreviousLaps
// (lines 800-891) uses a 5-lap window with 0.5 % pairwise comparison.
// We simplify to a 3-lap window and compare each lap against the average.
package laps

import (
	"math"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	EventLapCompleted  = "laps.lap_completed"
	EventFastestLap    = "laps.fastest_lap"
	EventLastLap       = "laps.last_lap"
	EventLastLapLeader = "laps.last_lap_leader"
	EventLastLapTop3   = "laps.last_lap_top3"
	EventTwoToGo       = "laps.two_to_go"
	EventTwoToGoLeader = "laps.two_to_go_leader"
	EventTwoToGoTop3   = "laps.two_to_go_top3"
	EventLapConsistent = "laps.consistent"
	EventLapImproving  = "laps.improving"
	EventLapWorsening  = "laps.worsening"
	EventFormationLap  = "laps.formation_lap"
)

// Consistency analysis constants (CC parity: LapTimes.cs line 148,
// consistencyLimit = 0.5f; range = lapTime * 0.5 / 100 = 0.005 * lapTime).
const (
	consistencyLimit      = 0.005 // 0.5 % of lap time
	lapsWindowSize        = 3     // look at last 3 laps for trend
	lapTimesMax           = 5     // ring buffer capacity
	consistencyCooldownMs = 5000  // suppress repeat messages
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any // optional: lap number, lap time, position
}

// Monitor tracks lap counter, personal-best transitions, and consistency
// analysis.
type Monitor struct {
	lastLapNumber       int32
	lastBestLapTime     float64
	lastCompletedLap    int32
	initialized         bool
	lapTimes            []float64 // ring buffer — last 5 lap times
	lastSectorTime      float64   // session time at last start/finish
	lastConsistencyType string    // last emitted consistency event type
	lastConsistencyTime int64     // timestamp of last consistency event
	playedFormation     bool      // one-shot formation lap message
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{
		lastConsistencyTime: -consistencyCooldownMs, // allow first check
	}
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
				m.lastCompletedLap = int32(p.TotalLaps)
			}
		}
		// Seed session time for lap-time measurement.
		if curr.Session != nil {
			m.lastSectorTime = curr.Session.SessionTime
		}
		m.initialized = true
	}

	var out []Event

	// --- Formation lap message (CC parity: LapCounter formation lap) ---
	// One-shot per formation phase entry. Reset when leaving phase 3 so
	// a new session (or restart) can re-fire.
	if curr.Session != nil {
		if curr.Session.GamePhase != 3 {
			m.playedFormation = false
		} else if !m.playedFormation {
			m.playedFormation = true
			out = append(out, Event{
				Type:      EventFormationLap,
				ExpiresAt: nowMS + 10000,
			})
		}
	}

	// Lap completada: rising edge de LapNumber.
	completedNewLap := playerLap > m.lastLapNumber && playerLap > 0
	if completedNewLap {
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

	// Laps-to-go messages (LapCounter parity).
	// CC fires on IsNewLap when CompletedLaps > 0, SessionType == Race,
	// not fixed-time sessions (or specific games).
	if completedNewLap && curr.Session != nil {
		completedLaps := int32(player.TotalLaps)
		sessionTotalLaps := curr.Session.SessionLapsTotal
		position := int32(player.Place)

		if sessionTotalLaps > 0 && completedLaps > 0 && !curr.Session.IsTimedSession &&
			curr.Session.SessionType == 5 { // 5 = Race (RF2 enum)
			remaining := sessionTotalLaps - completedLaps

			if remaining == 1 {
				evType := positionSuffixedEvent(EventLastLap, position)
				out = append(out, Event{
					Type:      evType,
					ExpiresAt: nowMS + 15000,
					Payload: map[string]any{
						"lap":              playerLap,
						"position":         position,
						"remaining":        remaining,
						"sessionLapsTotal": sessionTotalLaps,
					},
				})
			} else if remaining == 2 {
				evType := positionSuffixedEvent(EventTwoToGo, position)
				out = append(out, Event{
					Type:      evType,
					ExpiresAt: nowMS + 15000,
					Payload: map[string]any{
						"lap":              playerLap,
						"position":         position,
						"remaining":        remaining,
						"sessionLapsTotal": sessionTotalLaps,
					},
				})
			}
		}
	}

	// --- Consistency analysis (CC LapTimes.cs checkAgainstPreviousLaps) ---
	// Record lap time on completion and run trend detection on the last 3.
	if completedNewLap && curr.Session != nil {
		lapTime := curr.Session.SessionTime - m.lastSectorTime
		if lapTime > 0 {
			m.lapTimes = append(m.lapTimes, lapTime)
			if len(m.lapTimes) > lapTimesMax {
				m.lapTimes = m.lapTimes[1:]
			}
		}
		m.lastSectorTime = curr.Session.SessionTime

		if len(m.lapTimes) >= lapsWindowSize && nowMS-m.lastConsistencyTime >= consistencyCooldownMs {
			lts := m.lapTimes[len(m.lapTimes)-lapsWindowSize:] // last 3
			avg := (lts[0] + lts[1] + lts[2]) / 3
			best := math.Min(lts[0], math.Min(lts[1], lts[2]))
			range_ := best * consistencyLimit // CC: 0.5 % of lap time

			// All 3 within range of average → consistent.
			allWithinRange := true
			for _, lt := range lts {
				if math.Abs(lt-avg) > range_ {
					allWithinRange = false
					break
				}
			}

			// Each lap faster (lower time) than prior → improving.
			improving := lts[0] > lts[1] && lts[1] > lts[2]
			// Each lap slower (higher time) than prior → worsening.
			worsening := lts[0] < lts[1] && lts[1] < lts[2]

			// Priority: consistent > improving > worsening.
			// Cooldown (5s between any consistency event) is the only
			// suppression mechanism — we allow same-type repeats.
			if allWithinRange {
				out = append(out, Event{
					Type:      EventLapConsistent,
					ExpiresAt: nowMS + 5000,
					Payload:   map[string]any{"lap": playerLap, "lapTime": lapTime},
				})
				m.lastConsistencyTime = nowMS
			} else if improving {
				out = append(out, Event{
					Type:      EventLapImproving,
					ExpiresAt: nowMS + 5000,
					Payload:   map[string]any{"lap": playerLap, "lapTime": lapTime},
				})
				m.lastConsistencyTime = nowMS
			} else if worsening {
				out = append(out, Event{
					Type:      EventLapWorsening,
					ExpiresAt: nowMS + 5000,
					Payload:   map[string]any{"lap": playerLap, "lapTime": lapTime},
				})
				m.lastConsistencyTime = nowMS
			}
		}
	}
	m.lastLapNumber = playerLap
	m.lastBestLapTime = player.BestLapTime
	if player.TotalLaps > 0 {
		m.lastCompletedLap = int32(player.TotalLaps)
	}

	return out
}

// positionSuffixedEvent returns the position-variant event type for
// last-lap and two-to-go messages (CC parity: LapCounter uses different
// audio folders for leader, top 3, and normal).
func positionSuffixedEvent(base string, position int32) string {
	switch base {
	case EventLastLap:
		if position == 1 {
			return EventLastLapLeader
		} else if position <= 3 {
			return EventLastLapTop3
		}
		return EventLastLap
	case EventTwoToGo:
		if position == 1 {
			return EventTwoToGoLeader
		} else if position <= 3 {
			return EventTwoToGoTop3
		}
		return EventTwoToGo
	default:
		return base
	}
}
