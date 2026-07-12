// Package flags implements FlagsMonitor: detects FCY (Full Course Yellow)
// and other flag-phase transitions from telemetry frames and emits
// engineering events the runtime can enqueue.
//
// Status: alpha 1 MVP. Implements the FCY pause gate (LMU-15) at the
// spotter level and the FCY transition events at the monitor level. The
// 19 EU/US FCY sub-phase voice folders of CC FlagsMonitor.cs are NOT
// implemented here — they require a YellowFlagState offset and per-phase
// voice mapping that need live LMU capture to validate (NO_VERIFICADO).
//
// Parity CC:
//   - Events/FlagsMonitor.cs:1587 (full implementation, 19 EU/US FCY folders)
//   - GameState/GameStateData.cs:74 FullCourseYellowPhase enum
//   - RF2/RF2Data.cs:68 rF2GamePhase (Garage=0..SessionOver=8, Paused=9)
//
// We use the same rF2 numeric values: GamePhase=6 means FullCourseYellow.
package flags

import (
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor. These become audio.Message TextKeys in
// the runtime pipeline (see core.Runtime.MapEventToTextKey). Keep the
// list small and explicit.
const (
	EventFCYStarted           = "flags.fcy_started"
	EventFCYEnded             = "flags.fcy_ended"
	EventBlueFlag             = "flags.blue_flag"
	EventYellowFlag           = "flags.yellow_flag"
	EventDoubleYellow         = "flags.double_yellow_flag"
	EventWhiteFlag            = "flags.white_flag"
	EventBlackFlag            = "flags.black_flag"
	EventYellowFlagSector1    = "flags.yellow_sector_1"
	EventYellowFlagSector2    = "flags.yellow_sector_2"
	EventYellowFlagSector3    = "flags.yellow_sector_3"
	EventYellowSectorAllClear = "flags.yellow_sector_all_clear"
	EventGetReady             = "flags.get_ready"
	EventGreenFlag            = "flags.green_flag"
)

// Event is the monitor's output. It mirrors the shape consumed by
// spotter.Machine.Event so a future unified pipeline can route both
// spotter and flag events through the same queue.
type Event struct {
	Type      string
	ExpiresAt int64 // unix-ms; 0 means no expiry
}

// Cooldowns (ms). Parity CC FlagsMonitor.cs:26-29:
//
//	timeBetweenYellowFlagMessages=25s, others=15s.
//	minTimeBetweenNewYellowFlagMessages=10s for sector yellows.
const (
	fcyCooldownMS          = 25_000 // 25s — yellow flag family (includes FCY)
	blueCooldownMS         = 15_000 // 15s — blue flag
	yellowCooldownMS       = 25_000 // 25s — single/double yellow (timeBetweenYellowFlagMessages)
	whiteCooldownMS        = 15_000 // 15s — white flag
	blackCooldownMS        = 15_000 // 15s — black flag
	sectorYellowCooldownMS = 10_000 // 10s — sector yellow flags (CC minTimeBetweenNewYellowFlagMessages)
)

// fcyGamePhase is the value of SessionInfo.GamePhase that indicates
// Full Course Yellow / Safety Car. Same as rF2GamePhase.FullCourseYellow=6
// in CC RF2Data.cs:68. Defined locally so this package has no import on
// spotter (separation: flags shouldn't depend on spotter).
const fcyGamePhase uint8 = 6

// cooldownThreshold returns the effective emit time for cooldown
// computation, treating zero as "never emitted" so the first event is
// never blocked by the cooldown.
func cooldownThreshold(emitMS, nowMS, cooldown int64) int64 {
	if emitMS == 0 {
		return nowMS - cooldown
	}
	return emitMS
}

// Monitor tracks flag-phase transitions. Safe for single-goroutine use
// from the runtime; the runtime calls Trigger once per frame.
//
// Feature 1 (CC parity): blue flag is limited to 3 warnings per driver
// per session and only fires when the approaching car is close
// (gap < 1.5 s).
type Monitor struct {
	lastFCYState     bool
	lastFCYEmitMS    int64
	lastBlueEmitMS   int64
	lastYellowEmitMS int64
	lastWhiteEmitMS  int64
	lastBlackEmitMS  int64

	// Sector-level yellow flag tracking.
	lastSectorEmitMS   [3]int64 // cooldown per sector
	lastAllClearEmitMS int64    // cooldown for all-clear

	// Game phase tracking for pre-race and green-flag transitions.
	lastGamePhase uint8

	// Feature 1: Blue flag optimization — track per-opponent warnings
	// and reset on session change.
	blueFlagWarningsPerDriver map[int32]int
	lastBlueDriverID          int32
	sessionID                 int64 // unix-ms of first frame after session start
}

// NewMonitor creates a Monitor with default cooldowns.
func NewMonitor() *Monitor {
	return &Monitor{
		blueFlagWarningsPerDriver: make(map[int32]int),
	}
}

// helper applies zero-value sentinel: if emitMS == 0, treat as "never
// emitted" so the first event is not blocked by the cooldown.
func cooldownStart(emitMS, nowMS, cooldown int64) int64 {
	if emitMS == 0 {
		return nowMS - cooldown
	}
	return emitMS
}

// isBlueFlagReal checks whether the blue flag for the player is legitimate
// (i.e., a faster car is approaching from behind with gap < 1.5 s).
// Returns the opponent ID if real, or -1 if not real.
//
// Parity CC: FlagsMonitor.cs L376-393 — only warn when opponent is close
// (CC uses getOpponentKeyBehindOnTrack and checks gap is reasonable).
func (m *Monitor) isBlueFlagReal(curr *telemetry.Frame) int32 {
	if curr == nil {
		return -1
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil || player.Place <= 1 {
		return -1
	}
	// Iterate vehicles; find the opponent RIGHT BEHIND the player
	// (Place > player.Place, indicating they are behind on track).
	// The blue flag on the player car indicates a faster car is
	// approaching from behind. We validate by checking if the nearest
	// opponent behind is close (gap < 1.5 s). Since we don't have a
	// direct "gap to car behind" field, we use the opponent's
	// TimeBehindNext as a rough proxy for how close they are to the
	// car ahead (which may be the player).
	bestID := int32(-1)
	bestGap := 1000.0
	for _, v := range curr.Vehicles {
		if v.IsPlayer {
			continue
		}
		// Opponent is behind the player on track.
		if v.Place > player.Place && v.TimeBehindNext > 0 && v.TimeBehindNext < 1.5 {
			if v.TimeBehindNext < bestGap {
				bestGap = v.TimeBehindNext
				bestID = v.ID
			}
		}
	}
	return bestID
}

// ResetBlueFlagWarnings clears the per-driver blue flag warning counter
// for a new session (called when GamePhase transitions or SessionInfo
// indicates a new session).
func (m *Monitor) ResetBlueFlagWarnings() {
	m.blueFlagWarningsPerDriver = make(map[int32]int)
	m.lastBlueDriverID = 0
}

// Trigger inspects the current frame and returns the events that the
// runtime should enqueue. prev is allowed to be nil on the first call.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}

	// Gates: parity CC FlagsMonitor.cs:343-365
	// Don't process if in pits or session just started.
	player := telemetry.FindPlayerVehicle(curr)
	if player != nil && player.InPits {
		return nil
	}
	// Only apply session-time gate when session time is known (>0).
	// CC: SessionRunningTime < 10 seconds — skip flag processing.
	if curr.Session != nil && curr.Session.SessionTime > 0 && curr.Session.SessionTime < 10 {
		return nil
	}
	// Only apply speed gate when player telemetry is available.
	// CC: CarSpeed < 1 — parked.
	if curr.Player != nil && curr.Player.Speed < 1.0 {
		return nil
	}

	currFCY := IsFCY(curr)
	prevFCY := prev != nil && IsFCY(prev)

	var out []Event

	// FCY transitions: rising edge fires EventFCYStarted (cooldown 25s),
	// falling edge fires EventFCYEnded (no cooldown — green flag recovery
	// is critical information).
	if nowMS-cooldownStart(m.lastFCYEmitMS, nowMS, fcyCooldownMS) >= fcyCooldownMS &&
		currFCY && !prevFCY {
		out = append(out, Event{Type: EventFCYStarted, ExpiresAt: nowMS + 5000})
		m.lastFCYEmitMS = nowMS
	} else if !currFCY && prevFCY {
		out = append(out, Event{Type: EventFCYEnded, ExpiresAt: nowMS + 5000})
	}
	m.lastFCYState = currFCY

	pf := playerFlag(curr)

	// Yellow flag (single).
	if nowMS-cooldownStart(m.lastYellowEmitMS, nowMS, yellowCooldownMS) >= yellowCooldownMS &&
		pf == "YELLOW" {
		out = append(out, Event{Type: EventYellowFlag, ExpiresAt: nowMS + 5000})
		m.lastYellowEmitMS = nowMS
	}

	// Double yellow flag.
	if nowMS-cooldownStart(m.lastYellowEmitMS, nowMS, yellowCooldownMS) >= yellowCooldownMS &&
		pf == "DOUBLE_YELLOW" {
		out = append(out, Event{Type: EventDoubleYellow, ExpiresAt: nowMS + 5000})
		m.lastYellowEmitMS = nowMS
	}

	// Blue flag. Parity CC: gated by enableBlueFlagMessages (default true).
	// CC also tracks same-driver limit (blueFlagWarningCountForSingleDriver < 3).
	//
	// Feature 1 optimization: only warn when a faster car is actually close
	// (gap < 1.5s) and limit to 3 warnings per driver per session.
	if pf == "BLUE" && nowMS-cooldownThreshold(m.lastBlueEmitMS, nowMS, blueCooldownMS) >= blueCooldownMS {
		if driverID := m.isBlueFlagReal(curr); driverID >= 0 {
			// Check per-driver warning limit (max 3).
			count := m.blueFlagWarningsPerDriver[driverID]
			if count < 3 {
				m.blueFlagWarningsPerDriver[driverID] = count + 1
				m.lastBlueDriverID = driverID
				out = append(out, Event{Type: EventBlueFlag, ExpiresAt: nowMS + 5000})
				m.lastBlueEmitMS = nowMS
			}
		}
	}

	// White flag. CC: excludes iRacing with US terms + LapCounter.whiteFlagLastLapAnnounced.
	if nowMS-cooldownStart(m.lastWhiteEmitMS, nowMS, whiteCooldownMS) >= whiteCooldownMS &&
		pf == "WHITE" {
		out = append(out, Event{Type: EventWhiteFlag, ExpiresAt: nowMS + 5000})
		m.lastWhiteEmitMS = nowMS
	}

	// Black flag. CC: priority 10.
	if nowMS-cooldownStart(m.lastBlackEmitMS, nowMS, blackCooldownMS) >= blackCooldownMS &&
		pf == "BLACK" {
		out = append(out, Event{Type: EventBlackFlag, ExpiresAt: nowMS + 5000})
		m.lastBlackEmitMS = nowMS
	}

	// Sector-level yellow flags.
	// CC iterates 3 sectors, checks transition + cooldown, and emits
	// folderYellowFlagSectors[i] when sectorFlag == YELLOW.
	// We emit per-sector events when curr.SectorFlags[i] is YELLOW and
	// either prev had a different flag or prev is unknown (nil).
	if curr.Session != nil && len(curr.Session.SectorFlags) >= 3 {
		eventTypes := [...]string{EventYellowFlagSector1, EventYellowFlagSector2, EventYellowFlagSector3}
		for i := 0; i < 3; i++ {
			sf := curr.Session.SectorFlags[i]
			if sf == "YELLOW" {
				// Only emit on transition: prev was not YELLOW at this sector.
				prevNotYellow := prev == nil || prev.Session == nil ||
					len(prev.Session.SectorFlags) < i+1 ||
					prev.Session.SectorFlags[i] != "YELLOW"
				if prevNotYellow &&
					nowMS-cooldownStart(m.lastSectorEmitMS[i], nowMS, sectorYellowCooldownMS) >= sectorYellowCooldownMS {
					out = append(out, Event{Type: eventTypes[i], ExpiresAt: nowMS + 5000})
					m.lastSectorEmitMS[i] = nowMS
				}
			}
		}

		// All-clear: all 3 sectors are GREEN and at least one was not
		// GREEN in the previous frame.
		allGreen := curr.Session.SectorFlags[0] == "GREEN" &&
			curr.Session.SectorFlags[1] == "GREEN" &&
			curr.Session.SectorFlags[2] == "GREEN"
		if allGreen {
			prevNotAllGreen := prev == nil || prev.Session == nil ||
				len(prev.Session.SectorFlags) < 3 ||
				prev.Session.SectorFlags[0] != "GREEN" ||
				prev.Session.SectorFlags[1] != "GREEN" ||
				prev.Session.SectorFlags[2] != "GREEN"
			if prevNotAllGreen &&
				nowMS-cooldownStart(m.lastAllClearEmitMS, nowMS, sectorYellowCooldownMS) >= sectorYellowCooldownMS {
				out = append(out, Event{Type: EventYellowSectorAllClear, ExpiresAt: nowMS + 5000})
				m.lastAllClearEmitMS = nowMS
			}
		}
	}

	// ---- Pre-race and green-flag phase transitions (CC parity) ----
	if curr.Session != nil {
		gp := curr.Session.GamePhase
		prevGP := m.lastGamePhase

		// GetReady: rising edge to Countdown (4) or Formation (3).
		if (gp == 4 || gp == 3) && prevGP != gp && prevGP != 0 {
			out = append(out, Event{Type: EventGetReady, ExpiresAt: nowMS + 5000})
			// Reset blue flag warnings on new session (re-arming for
			// fresh per-driver warning budget).
			m.ResetBlueFlagWarnings()
		}

		// GreenFlag: rising edge to Green (5) from FCY (6), Countdown (4), or Formation (3).
		if gp == 5 && (prevGP == 6 || prevGP == 4 || prevGP == 3) {
			out = append(out, Event{Type: EventGreenFlag, ExpiresAt: nowMS + 5000})
		}

		m.lastGamePhase = gp
	}

	return out
}

// IsFCY returns whether the given frame is currently under FCY / Safety Car.
func IsFCY(frame *telemetry.Frame) bool {
	if frame == nil || frame.Session == nil {
		return false
	}
	return frame.Session.GamePhase == fcyGamePhase
}

// playerFlag returns the Flag string of the player vehicle in the frame, or
// "" if not found. The flag-per-vehicle field is read by the public parser
// and propagated into the engineer's VehicleScoring.Flag (string).
func playerFlag(frame *telemetry.Frame) string {
	if frame == nil {
		return ""
	}
	// Prefer explicit IsPlayer marker.
	for i := range frame.Vehicles {
		if frame.Vehicles[i].IsPlayer {
			return frame.Vehicles[i].Flag
		}
	}
	// Fallback: ID match against frame.Player.
	if frame.Player != nil {
		for i := range frame.Vehicles {
			if frame.Vehicles[i].ID == frame.Player.ID {
				return frame.Vehicles[i].Flag
			}
		}
	}
	// Fallback: single vehicle is the player.
	if len(frame.Vehicles) == 1 {
		return frame.Vehicles[0].Flag
	}
	return ""
}
