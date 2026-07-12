// Package push implements a minimal PushNow monitor for alpha 1: detects
// when the player is within a small gap of the car ahead and emits a
// "push now" event. This is the highest-value push message in CC; the
// rest (qualify laps, pit exit, laps-to-go) is G2.x scope.
//
// Parity CC: Events/PushNow.cs (327 lines, full implementation covers
// track-length-class-based push windows, time/laps to end, qualy laps,
// pit exit with traffic behind, etc.). MVP alpha 1 fires on a fixed
// 1.0s gap threshold; the full per-track-class windows require
// TrackLengthClass data (NO_VERIFICADO en LMU offset) plus the
// decision of whether to use the static windows from
// vantare-go-master-plan.md § 5.2:
//
//	MEDIUM <= 4 laps, LONG <= 2 laps, VERY_LONG == 1 lap
//	time window 120s < remaining < 240s
//
// The constant 1.0s here is a conservative single-threshold heuristic
// until the full logic lands. Tests assert on the threshold so changing
// it is a one-line edit.
package push

import (
	"math"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Track length thresholds matching CC TrackData.cs:611.
// VERY_SHORT < 1000m, SHORT < 2400m, MEDIUM ≤ 10000m, LONG ≤ 20000m, VERY_LONG > 20000m.
const (
	trackLengthVeryShort = 1000.0
	trackLengthShort     = 2400.0
	trackLengthMedium    = 10000.0
	trackLengthLong      = 20000.0
)

// DefaultGapThresholdSec is the time gap (seconds) under which the
// monitor fires EventPushNow. Conservative single-threshold; full CC
// uses per-track-class windows (PushNow.cs:88, 96-98).
const DefaultGapThresholdSec = 1.0

// gapThresholdForTrackClass returns the gap threshold (seconds) appropriate
// for a given TrackLengthClass. Tighter tracks (shorter) use smaller thresholds
// because passing opportunities are rarer and the driver needs to commit
// earlier. Longer tracks use larger thresholds since there's more room to
// make a pass.
//
// TrackLengthClass values (same as trackLengthClass return):
//
//	0 = VERY_SHORT (< 1000m)
//	1 = SHORT (1000-2400m)
//	2 = MEDIUM (2400-10000m)
//	3 = LONG (10000-20000m)
//	4 = VERY_LONG (> 20000m)
func gapThresholdForTrackClass(tlc int) float64 {
	switch tlc {
	case 0, 1: // VERY_SHORT, SHORT — tight tracks
		return 0.8
	case 2: // MEDIUM
		return 1.0
	case 3: // LONG
		return 1.5
	case 4: // VERY_LONG
		return 2.0
	default:
		return 1.0
	}
}

// MinTimeToBeInThisPositionSec is the CC gate: only check push gaps if
// the player has been in their current relative position for this long.
const MinTimeToBeInThisPositionSec = 60

// LapsToCountBackForOpponentBest is how many recent laps to examine
// for the opponent's best lap (CC PushNow.cs:34).
const LapsToCountBackForOpponentBest = 4

// Event types emitted by the monitor.
const (
	EventPushNow         = "push.push_now"
	EventPushToImprove   = "push.push_to_improve"
	EventPushToGetWin    = "push.push_to_get_win"
	EventPushToGetSecond = "push.push_to_get_second"
	EventPushToGetThird  = "push.push_to_get_third"
	EventPushToHold      = "push.push_to_hold_position"
	EventQualExit        = "push.qual_exit"
	EventCornerAttack    = "push.corner_attack"
	EventCornerDefend    = "push.corner_defend"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// trackLengthClass maps a track length in metres to CC's TrackLengthClass.
func trackLengthClass(lengthMetres float64) int {
	// Returns: 0=VERY_SHORT, 1=SHORT, 2=MEDIUM, 3=LONG, 4=VERY_LONG
	if lengthMetres < trackLengthVeryShort {
		return 0
	}
	if lengthMetres < trackLengthShort {
		return 1
	}
	if lengthMetres <= trackLengthMedium {
		return 2
	}
	if lengthMetres <= trackLengthLong {
		return 3
	}
	return 4
}

// Monitor tracks push-now opportunities.
type Monitor struct {
	lastEmitMS     int64
	lastGainEmitMS int64
	lastHoldEmitMS int64
	cooldownMS     int64
	threshold      float64
	initialized    bool

	// Qual exit detection: track pit transitions and fire once per stint
	// when leaving pits during qualifying.
	lastInPits       bool
	lastPitEntryMS   int64
	firedQualExit    bool
	lastQualExitMS   int64
	lastGapAhead     float64
	lastGapBehind    float64
	lastAttackEmitMS int64
	lastDefendEmitMS int64
}

// NewMonitor creates a Monitor with the default 1.0s threshold and a
// 60s cooldown (avoid spam while still in the gap window).
func NewMonitor() *Monitor {
	return &Monitor{
		cooldownMS:       60_000,
		threshold:        DefaultGapThresholdSec,
		lastAttackEmitMS: -30_000,
		lastDefendEmitMS: -30_000,
	}
}

// NewMonitorWithThreshold creates a Monitor with a custom gap threshold
// (seconds). Used by tests and future per-track-class wiring.
func NewMonitorWithThreshold(thresholdSec float64) *Monitor {
	return &Monitor{
		cooldownMS:       60_000,
		threshold:        thresholdSec,
		lastAttackEmitMS: -30_000,
		lastDefendEmitMS: -30_000,
	}
}

// Trigger inspects the current frame and returns push events.
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	session := curr.Session
	if session == nil {
		return nil
	}

	if !m.initialized {
		m.initialized = true
		m.lastInPits = player.InPits
	}

	// --- Pit transition tracking (across all session types) ---
	var out []Event

	// Pit entry: reset qual exit flag so it can fire on next exit.
	if player.InPits && !m.lastInPits {
		m.lastPitEntryMS = nowMS
		m.firedQualExit = false
	}

	// Pit exit during qualifying: fire once per stint.
	if !player.InPits && m.lastInPits && !m.firedQualExit && session.SessionType == 3 {
		m.firedQualExit = true
		m.lastQualExitMS = nowMS
		out = append(out, Event{
			Type:      EventQualExit,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{},
		})
		return out
	}
	m.lastInPits = player.InPits

	// Only fire in race sessions, not in pits.
	if session.SessionType != 5 || player.InPits { // 5 = Race
		return nil
	}

	// ---- Corner attack / defend (CC parity: push corner suggestion) ----
	// Track gap ahead for attack: gap < 1.0s AND decreasing → car ahead catchable.
	gapAhead := player.TimeBehindNext
	gapAheadDecreasing := m.lastGapAhead > 0 && gapAhead > 0 && gapAhead < m.lastGapAhead
	if gapAhead > 0 && gapAhead < 1.0 && gapAheadDecreasing && nowMS-m.lastAttackEmitMS >= 30_000 {
		m.lastAttackEmitMS = nowMS
		out = append(out, Event{
			Type: EventCornerAttack, ExpiresAt: nowMS + 10000,
			Payload: map[string]any{"gapSecs": gapAhead, "direction": "ahead"},
		})
	}
	m.lastGapAhead = gapAhead

	// Track gap behind for defend: find car behind from Vehicles slice.
	var gapBehind float64
	for _, v := range curr.Vehicles {
		if v.Place == player.Place+1 && !v.IsPlayer && v.TimeBehindNext > 0 {
			gapBehind = v.TimeBehindNext
			break
		}
	}
	gapBehindDecreasing := m.lastGapBehind > 0 && gapBehind > 0 && gapBehind < m.lastGapBehind
	if gapBehind > 0 && gapBehind < 1.0 && gapBehindDecreasing && nowMS-m.lastDefendEmitMS >= 30_000 {
		m.lastDefendEmitMS = nowMS
		out = append(out, Event{
			Type: EventCornerDefend, ExpiresAt: nowMS + 10000,
			Payload: map[string]any{"gapSecs": gapBehind, "direction": "behind"},
		})
	}
	m.lastGapBehind = gapBehind

	// Note: CC also applies checkPushToGain/checkPushToHold gates
	// (minTimeToBeInThisPosition=60s). Simplified here: gates always open
	// during the push window. Full parity in G2.x.

	// Determine push window based on laps remaining or time remaining.
	lapsRemaining := int32(0)
	if curr.Session != nil && curr.Session.SessionLapsTotal > 0 {
		lapsRemaining = curr.Session.SessionLapsTotal - int32(player.TotalLaps)
	}

	inPushWindow := false
	var numLapsLeft int32

	if curr.Session.SessionLapsTotal > 0 {
		// Laps-based window per track length class.
		trackLen := curr.Session.TrackLength
		tlc := trackLengthClass(trackLen)
		numLapsLeft = lapsRemaining
		switch {
		case tlc <= 2: // VERY_SHORT, SHORT, MEDIUM
			inPushWindow = lapsRemaining <= 4 && lapsRemaining > 0
		case tlc == 3: // LONG
			inPushWindow = lapsRemaining <= 2 && lapsRemaining > 0
		case tlc >= 4: // VERY_LONG
			inPushWindow = lapsRemaining == 1
		}
	} else {
		// Time-based window: 120s < remaining < 240s.
		timeRemaining := curr.Session.TimeRemainingInGamePhase
		if timeRemaining > 120 && timeRemaining < 240 {
			inPushWindow = true
			// Estimate remaining laps.
			if player.BestLapTime > 0 {
				numLapsLeft = int32(math.Ceil(timeRemaining / player.BestLapTime))
			} else {
				numLapsLeft = 1
			}
		}
	}

	if !inPushWindow {
		if len(out) > 0 {
			return out
		}
		return nil
	}

	// Resolve gap threshold: use track-length-class threshold when
	// track length is known, otherwise fall back to m.threshold.
	threshold := m.threshold
	if session.TrackLength > 0 {
		threshold = gapThresholdForTrackClass(trackLengthClass(session.TrackLength))
	}

	// checkPushToGain: we can catch the car ahead.
	if int32(player.Place) > 1 {
		gapSecs := player.TimeBehindNext
		if gapSecs <= 0 {
			gapSecs = player.TimeBehindLeader
		}
		cooldownStart := m.lastGainEmitMS
		if cooldownStart == 0 {
			cooldownStart = nowMS - m.cooldownMS
		}
		if nowMS-cooldownStart >= m.cooldownMS && gapSecs > 0 && gapSecs < threshold {
			m.lastGainEmitMS = nowMS
			position := int32(player.Place)

			// Emit position-specific push message.
			var eventType string
			switch position {
			case 2:
				eventType = EventPushToGetWin
			case 3:
				eventType = EventPushToGetSecond
			case 4:
				eventType = EventPushToGetThird
			default:
				eventType = EventPushToImprove
			}
			out = append(out, Event{
				Type:      eventType,
				ExpiresAt: nowMS + 10000,
				Payload: map[string]any{
					"gapSecs":     gapSecs,
					"position":    position,
					"numLapsLeft": numLapsLeft,
				},
			})
		}
	}

	// checkPushToHold: the car behind may catch us.
	if int32(player.Place) < int32(curr.Session.NumVehicles) {
		gapSecs := player.TimeBehindNext // gap to car behind
		if gapSecs <= 0 {
			gapSecs = player.TimeBehindLeader
		}
		cooldownStart := m.lastHoldEmitMS
		if cooldownStart == 0 {
			cooldownStart = nowMS - m.cooldownMS
		}
		// Hold path uses a more permissive threshold (1.5x) to warn earlier.
		if nowMS-cooldownStart >= m.cooldownMS && gapSecs > 0 && gapSecs < 20 {
			m.lastHoldEmitMS = nowMS
			out = append(out, Event{
				Type:      EventPushToHold,
				ExpiresAt: nowMS + 10000,
				Payload: map[string]any{
					"gapSecs":     gapSecs,
					"position":    int32(player.Place),
					"numLapsLeft": numLapsLeft,
				},
			})
		}
	}

	return out
}
