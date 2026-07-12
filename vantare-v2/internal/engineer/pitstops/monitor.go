// Package pitstops implements a PitStops monitor that detects transitions
// into and out of the pit lane, pit limiter events, distance-based pit
// entry warnings (100m / 50m / box now), and pit window open/close.
//
// Parity CC: Events/PitStops.cs (large, with embedded Strategy.cs
// hooks). Uses VehicleScoring.InPits bool (offset 198) and optional
// PitInfoReader for extended pit data from the $rFactor2SMMP_PitInfo$
// shared memory buffer.
package pitstops

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/lmu"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	EventPitEntry            = "pitstops.entry"
	EventPitExit             = "pitstops.exit"
	EventPitEngageLimiter    = "pitstops.engage_limiter"
	EventPitDisengageLimiter = "pitstops.disengage_limiter"
	EventPitWatchSpeed       = "pitstops.watch_your_speed"

	// Distance-based pit entry warnings.
	EventPitOneHundredMetres = "pitstops.one_hundred_metres"
	EventPitFiftyMetres      = "pitstops.fifty_metres"
	EventPitBoxNow           = "pitstops.box_now"

	// Pit window state.
	EventPitWindowOpen  = "pitstops.pit_window_open"
	EventPitWindowClose = "pitstops.pit_window_close"

	// Feature 3: Pit window countdown (lap-based, one-shot per threshold).
	EventPitWindowOpensIn5  = "pitstops.window_opens_in_5"
	EventPitWindowOpensIn3  = "pitstops.window_opens_in_3"
	EventPitWindowOpensIn1  = "pitstops.window_opens_in_1"
	EventPitWindowClosesIn3 = "pitstops.window_closes_in_3"
	EventPitWindowClosesIn1 = "pitstops.window_closes_in_1"

	// Pit exit traffic detection (CC: folderPitExitTraffic).
	EventPitExitTrafficClear  = "pitstops.exit_traffic_clear"
	EventPitExitTrafficBehind = "pitstops.exit_traffic_behind"
)

// Cooldown constants matching CC.
const (
	limiterCooldownMS   = 30_000  // 30s between limiter messages (CC: timeOfLastLimiterWarning + 30s)
	speedWarnCooldownMS = 120_000 // 120s between speed warnings (CC: timeSpeedInPitsWarning + 120s)
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks pit-lane entry/exit transitions, distance-based pit
// entry warnings, and pit window state.
type Monitor struct {
	mu sync.Mutex

	// Core state.
	lastInPits           bool
	initialized          bool
	lastLimiterWarnMS    int64
	lastSpeedWarnMS      int64
	lastDisengageCheckMS int64
	inDisengageCheck     bool

	// Optional PitInfoReader for extended pit data.
	pitInfoReader *lmu.PitInfoReader

	// Lap-distance tracking for pit entry warnings.
	trackLength     float64 // stored track length (set via SetTrackLength or from SessionInfo)
	lastLapDistance float64
	lastLapNumber   int32
	fired100m       bool
	fired50m        bool
	firedBoxNow     bool

	// Pit window state.
	pitWindowActive bool

	// Pit exit traffic ack timestamp: avoid re-firing traffic events for 5s
	// after the most recent pit exit.
	pitExitAckMS int64

	// Session identity for reset detection (same pattern as position monitor).
	lastSessionType int32

	// Feature 3: Pit window countdown — one-shot per threshold, reset per session.
	pitWindowOpenLap   int32 // estimated lap when window opens (~25-33% of race)
	pitWindowClosedLap int32 // estimated lap when window closes (~75% of race)
	firedOpensIn5      bool
	firedOpensIn3      bool
	firedOpensIn1      bool
	firedClosesIn3     bool
	firedClosesIn1     bool
	pitWindowInit      bool // whether window laps have been calculated
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// SetPitInfoReader sets an optional PitInfoReader for extended pit data.
// The reader must already be Open()'d before being passed here.
func (m *Monitor) SetPitInfoReader(reader *lmu.PitInfoReader) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pitInfoReader = reader
}

// SetTrackLength sets the track length in metres. Used for distance-based
// pit entry warnings. If not set, track length is read from SessionInfo.
func (m *Monitor) SetTrackLength(length float64) {
	if length > 0 {
		m.trackLength = length
	}
}

// Trigger inspects the player's state and returns events on transitions,
// distance-based pit entry warnings, and pit window state changes.
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
				m.lastLapDistance = p.LapDistance
				m.lastLapNumber = int32(p.TotalLaps)
			}
		}
		if curr.Player != nil {
			m.lastLapNumber = curr.Player.LapNumber
		}
		if m.trackLength <= 0 && curr.Session != nil && curr.Session.TrackLength > 0 {
			m.trackLength = curr.Session.TrackLength
		}
		m.initialized = true
	}

	// ---- Session change detection (Feature 3: reset pit window countdown) ----
	sessionChanged := false
	if curr.Session != nil && curr.Session.SessionType != m.lastSessionType && m.lastSessionType != 0 {
		sessionChanged = true
	}
	if curr.Session != nil {
		m.lastSessionType = curr.Session.SessionType
	}
	if sessionChanged {
		m.resetPitWindowCountdown()
	}

	var out []Event

	lap := int32(0)
	if curr.Player != nil {
		lap = curr.Player.LapNumber
	}

	// Track lap distance and track length for pit entry warnings.
	lapDistance := player.LapDistance
	// Use stored track length; fall back to SessionInfo if not yet stored.
	if m.trackLength <= 0 && curr.Session != nil && curr.Session.TrackLength > 0 {
		m.trackLength = curr.Session.TrackLength
	}
	trackLength := m.trackLength

	// --- Lap transition detection ---
	if m.initialized && m.lastLapNumber > 0 && lap != m.lastLapNumber {
		// Started a new lap — reset lap-specific distance flags so they
		// can fire again on the next approach to pit entry.
		m.resetPitApproachFlags()

		// Pit window close on lap change after exiting pits.
		if m.pitWindowActive && !player.InPits {
			m.pitWindowActive = false
			out = append(out, Event{
				Type:      EventPitWindowClose,
				ExpiresAt: nowMS + 5000,
				Payload:   map[string]any{"lap": lap},
			})
		}

		// Feature 3: Pit window countdown — one-shot announcements based
		// on estimated pit window open/close laps.
		// CC: PitStops.cs L703-760 — uses game-provided pitWindowOpenLap
		// and pitWindowClosedLap. Since LMU may not expose these, we
		// estimate them from total race laps.
		// Only fire for race-like sessions (type 4 or 5 in rF2/LMU).
		// Practice/Qualify sessions don't have meaningful pit windows.
		if curr.Session != nil && curr.Session.SessionLapsTotal > 0 &&
			(curr.Session.SessionType == 4 || curr.Session.SessionType == 5) {
			if !m.pitWindowInit {
				m.pitWindowOpenLap = curr.Session.SessionLapsTotal / 3
				if m.pitWindowOpenLap < 2 {
					m.pitWindowOpenLap = 2
				}
				m.pitWindowClosedLap = (curr.Session.SessionLapsTotal * 2) / 3
				if m.pitWindowClosedLap < 3 {
					m.pitWindowClosedLap = 3
				}
				m.pitWindowInit = true
			}

			// Lap-based window open countdown.
			if !m.firedOpensIn5 && lap <= m.pitWindowOpenLap-5 && m.pitWindowOpenLap-5 >= 1 {
				m.firedOpensIn5 = true
				out = append(out, Event{
					Type:      EventPitWindowOpensIn5,
					ExpiresAt: nowMS + 10_000,
					Payload:   map[string]any{"lap": lap, "windowOpen": m.pitWindowOpenLap},
				})
			}
			if !m.firedOpensIn3 && lap == m.pitWindowOpenLap-3 && lap >= 1 {
				m.firedOpensIn3 = true
				out = append(out, Event{
					Type:      EventPitWindowOpensIn3,
					ExpiresAt: nowMS + 10_000,
					Payload:   map[string]any{"lap": lap, "windowOpen": m.pitWindowOpenLap},
				})
			}
			if !m.firedOpensIn1 && lap == m.pitWindowOpenLap-1 && lap >= 1 {
				m.firedOpensIn1 = true
				out = append(out, Event{
					Type:      EventPitWindowOpensIn1,
					ExpiresAt: nowMS + 10_000,
					Payload:   map[string]any{"lap": lap, "windowOpen": m.pitWindowOpenLap},
				})
			}

			// Lap-based window close countdown.
			if !m.firedClosesIn3 && lap == m.pitWindowClosedLap-3 && lap >= 1 {
				m.firedClosesIn3 = true
				out = append(out, Event{
					Type:      EventPitWindowClosesIn3,
					ExpiresAt: nowMS + 10_000,
					Payload:   map[string]any{"lap": lap, "windowClose": m.pitWindowClosedLap},
				})
			}
			if !m.firedClosesIn1 && lap == m.pitWindowClosedLap-1 && lap >= 1 {
				m.firedClosesIn1 = true
				out = append(out, Event{
					Type:      EventPitWindowClosesIn1,
					ExpiresAt: nowMS + 10_000,
					Payload:   map[string]any{"lap": lap, "windowClose": m.pitWindowClosedLap},
				})
			}
		}
	}

	// --- Distance-based pit entry warnings (CC: folderOneHundredMetreWarning, folderFiftyMetreWarning) ---
	// Approximation: pit entry is near the end of the lap (close to trackLength).
	if !player.InPits && trackLength > 0 && lapDistance >= 0 && lapDistance < trackLength {
		remainingDist := trackLength - lapDistance

		// 100 metres warning (fires when crossing the 100m threshold).
		if remainingDist <= 100 && !m.fired100m && remainingDist > 50 {
			m.fired100m = true
			out = append(out, Event{
				Type:      EventPitOneHundredMetres,
				ExpiresAt: nowMS + 8000,
				Payload:   map[string]any{"lap": lap, "remaining_m": remainingDist},
			})
		}

		// 50 metres warning (fires when crossing the 50m threshold).
		if remainingDist <= 50 && !m.fired50m {
			m.fired50m = true
			if !m.fired100m {
				m.fired100m = true
			}
			out = append(out, Event{
				Type:      EventPitFiftyMetres,
				ExpiresAt: nowMS + 8000,
				Payload:   map[string]any{"lap": lap, "remaining_m": remainingDist},
			})
		}
	}

	// --- Pit entry / exit transitions ---
	if player.InPits && !m.lastInPits {
		// Just entered pit lane.
		out = append(out, Event{
			Type:      EventPitEntry,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{"lap": lap},
		})

		// Box now (CC: folderBoxNow) — fires at pit entry.
		if !m.firedBoxNow {
			m.firedBoxNow = true
			out = append(out, Event{
				Type:      EventPitBoxNow,
				ExpiresAt: nowMS + 8000,
				Payload:   map[string]any{"lap": lap, "lap_distance": lapDistance},
			})
		}

		// Pit window open (CC: folderMandatoryPitStopsPitWindowOpen).
		if !m.pitWindowActive {
			m.pitWindowActive = true
			out = append(out, Event{
				Type:      EventPitWindowOpen,
				ExpiresAt: nowMS + 10000,
				Payload:   map[string]any{"lap": lap},
			})
		}

		// Engage limiter check (CC: folderEngageLimiter).
		if nowMS-m.lastLimiterWarnMS >= limiterCooldownMS {
			if curr.Player != nil && curr.Player.Speed > 1 {
				m.lastLimiterWarnMS = nowMS
				out = append(out, Event{
					Type:      EventPitEngageLimiter,
					ExpiresAt: nowMS + 5000,
					Payload:   map[string]any{"lap": lap, "speed": curr.Player.Speed},
				})
			}
		}

		// Watch your speed (CC: folderWatchYourPitSpeed).
		if nowMS-m.lastSpeedWarnMS >= speedWarnCooldownMS {
			m.lastSpeedWarnMS = nowMS
			out = append(out, Event{
				Type:      EventPitWatchSpeed,
				ExpiresAt: nowMS + 5000,
				Payload:   map[string]any{"lap": lap},
			})
		}

		m.inDisengageCheck = false

	} else if !player.InPits && m.lastInPits {
		// Just left pit lane.
		out = append(out, Event{
			Type:      EventPitExit,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{"lap": lap},
		})

		// Pit window close on pit exit.
		if m.pitWindowActive {
			m.pitWindowActive = false
			out = append(out, Event{
				Type:      EventPitWindowClose,
				ExpiresAt: nowMS + 5000,
				Payload:   map[string]any{"lap": lap},
			})
		}

		// Reset pit approach flags so distance-based warnings (100m/50m) can
		// fire again on the next lap's approach to pit entry.
		m.resetPitApproachFlags()

		m.inDisengageCheck = true
		m.lastDisengageCheckMS = nowMS

		// Pit exit traffic check: one-shot fired immediately after pit exit.
		// Re-firing suppressed for 5s via pitExitAckMS.
		if nowMS-m.pitExitAckMS >= 5000 || m.pitExitAckMS == 0 {
			m.pitExitAckMS = nowMS
			if player.TimeBehindNext > 0 && player.TimeBehindNext <= 5.0 {
				out = append(out, Event{
					Type:      EventPitExitTrafficBehind,
					ExpiresAt: nowMS + 5000,
					Payload:   map[string]any{"timeBehind": player.TimeBehindNext},
				})
			} else {
				out = append(out, Event{
					Type:      EventPitExitTrafficClear,
					ExpiresAt: nowMS + 5000,
					Payload:   map[string]any{},
				})
			}
		}
	}

	// Disengage limiter check: if we left the pits and are now in sector 1
	// with speed > 5 (CC: engaged limiter was active but we're out of pits).
	if m.inDisengageCheck && !player.InPits && nowMS-m.lastDisengageCheckMS >= 2000 {
		if nowMS-m.lastLimiterWarnMS >= limiterCooldownMS {
			if curr.Player != nil && curr.Player.Speed > 5 && curr.Player.Speed < 30 {
				m.lastLimiterWarnMS = nowMS
				m.inDisengageCheck = false
				out = append(out, Event{
					Type:      EventPitDisengageLimiter,
					ExpiresAt: nowMS + 5000,
					Payload:   map[string]any{"lap": lap, "speed": curr.Player.Speed},
				})
			}
		}
	}

	// Update tracked state.
	m.lastInPits = player.InPits
	m.lastLapDistance = lapDistance
	if curr.Player != nil {
		m.lastLapNumber = curr.Player.LapNumber
	}
	return out
}

// resetPitApproachFlags clears the distance-based warning flags so they can
// fire again on the next lap's approach to pit entry.
func (m *Monitor) resetPitApproachFlags() {
	m.fired100m = false
	m.fired50m = false
	m.firedBoxNow = false
}

// resetPitWindowCountdown clears the pit window countdown one-shot flags
// for a new session.
func (m *Monitor) resetPitWindowCountdown() {
	m.pitWindowOpenLap = 0
	m.pitWindowClosedLap = 0
	m.firedOpensIn5 = false
	m.firedOpensIn3 = false
	m.firedOpensIn1 = false
	m.firedClosesIn3 = false
	m.firedClosesIn1 = false
	m.pitWindowInit = false
	m.pitWindowActive = false
}
