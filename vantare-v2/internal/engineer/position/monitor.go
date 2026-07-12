// Package position implements a Position monitor: detects position
// changes (gained/lost positions), race start evaluations (terrible/bad/
// good/ok start), overtake detection via gap analysis, and last-place
// tracking. Emits events for each.
//
// Parity CC: Events/Position.cs (738 lines). CC covers overtake
// detection with gap analysis, last-place detection, position reminders,
// "expected finish position" reports (Q → race), and voice responses.
// This implementation covers position changes, race-start evaluation,
// overtake detection (iter-2), and last-place detection (iter-2).
package position

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventPositionGained       = "position.gained"
	EventPositionLost         = "position.lost"
	EventStartTerrible        = "position.start_terrible"
	EventStartBad             = "position.start_bad"
	EventStartGood            = "position.start_good"
	EventStartOK              = "position.start_ok"
	EventOvertakeCompleted    = "position.overtake_completed"
	EventOvertakeLost         = "position.overtake_lost"
	EventLastPlaceForManyLaps = "position.last_place_many_laps"
	EventFormationPosition    = "position.formation"
	EventGivePositionBack     = "position.give_position_back"
	EventGivePositionBackNow  = "position.give_position_back_now"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// gapSample stores a snapshot of the gap to the car ahead for overtake
// detection. Ring buffer holds up to maxGapBufferSize samples.
type gapSample struct {
	timeBehindNext float64
	place          uint8
	tsMS           int64
}

// CC constants for overtake and last-place detection.
const (
	// Overtake / being-passed detection
	minTimeBetweenOvertakeMessages        = 20_000 // ms (CC: minTimeBetweenOvertakeMessages=20s)
	maxSecondsToWaitBeforeReportingPassMS = 7_000  // ms (CC: maxSecondsToWaitBeforeReportingPass=7s)
	maxGapBufferSize                      = 10

	// Last-place detection
	lastPlaceMinLaps = 5 // CC: numberOfLapsInLastPlace > 5
)

// CC thresholds for start quality evaluation (based on delta from
// start position, following CC Position.cs deltaPos logic):
//
//	deltaPos > 5 → terrible (lost more than 5 positions)
//	deltaPos > 3 → bad      (lost more than 3 positions)
//	deltaPos < 0 → good     (gained positions)
//	default      → ok       (maintained or within expectations)
//
// Monitor tracks Place transitions, race start evaluation, overtake
// detection via gap ring buffer, and last-place tracking.
//
// Feature 2 (give position back): tracks recent position gains (last 10 s)
// and emits give_position_back / give_position_back_now when an opponent
// is close behind after a gain.
type Monitor struct {
	lastPlace   uint8
	initialized bool
	cooldownMS  int64
	lastEmitMS  int64

	// Race start tracking
	sessionStartPlace  uint8
	startEvaluated     bool
	playedStartMessage bool

	// Session identity for reset detection
	lastSessionType    int32
	lastSessionMaxLaps int32

	// Overtake detection (Gap 1)
	gapBuffer          []gapSample
	lastOvertakeEmitMS int64

	// Last-place tracking (Gap 2)
	lapsInLastPlace    int32
	lastPlaceLapNumber int16
	lastPlaceEmitted   bool

	// Formation lap one-shot
	playedFormation bool

	// Feature 2: Give position back — track recent position gains.
	lastGainMS        int64 // when the most recent position gain happened
	lastGainFromPlace uint8 // the place we gained from
	lastGainToPlace   uint8 // the place we gained to
	giveBackCooldown  int64 // cooldown for give_position_back messages (60s)
	giveBackLastEmit  int64 // when we last emitted give_position_back
	giveBackLastNowMS int64 // when we last emitted give_position_back_now
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{
		cooldownMS:       10_000, // 10s cooldown between position events
		giveBackCooldown: 60_000, // 60s cooldown for give_position_back messages
	}
}

// Trigger inspects the player's overall position (Place) and returns
// events on changes.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	var out []Event

	// ---- Session change detection ----
	// Reset on SessionType change (normal) OR when lap number drops below
	// the previous max (heuristic for multi-race events where SessionType
	// stays "Race" across consecutive races).
	sessionChanged := curr.Session != nil && curr.Session.SessionType != m.lastSessionType && m.lastSessionType != 0
	if !sessionChanged && curr.Player != nil && curr.Player.LapNumber > 0 && m.lastSessionMaxLaps > curr.Player.LapNumber && m.lastSessionMaxLaps > 2 {
		sessionChanged = true
	}
	if curr.Player != nil && curr.Player.LapNumber > m.lastSessionMaxLaps {
		m.lastSessionMaxLaps = curr.Player.LapNumber
	}
	if sessionChanged {
		m.startEvaluated = false
		m.playedStartMessage = false
		m.sessionStartPlace = 0
		m.initialized = false
		m.lastPlace = 0
		m.lastEmitMS = 0
		m.gapBuffer = nil
		m.lastOvertakeEmitMS = 0
		m.lapsInLastPlace = 0
		m.lastPlaceLapNumber = 0
		m.lastPlaceEmitted = false
		m.playedFormation = false
		m.lastSessionMaxLaps = 0
		m.lastGainMS = 0
		m.giveBackLastEmit = 0
		m.giveBackLastNowMS = 0
	}
	if curr.Session != nil {
		m.lastSessionType = curr.Session.SessionType
	}

	// ---- Initialization ----
	if !m.initialized {
		if prev != nil {
			if p := telemetry.FindPlayerVehicle(prev); p != nil {
				m.lastPlace = p.Place
			}
		}
		m.initialized = true
	}

	// ---- Record session start place on first valid position ----
	// Do this BEFORE any early-return so start position is always captured.
	if m.sessionStartPlace == 0 && player.Place > 0 {
		m.sessionStartPlace = player.Place
	}

	// ---- Race start evaluation (CC: Position.cs L415-458) ----
	// CC evaluates start quality based on how many positions were LOST
	// from the starting grid position (deltaPos = currentPos - startPos):
	//
	//	deltaPos > 5 → terrible  (lost more than 5 positions)
	//	deltaPos > 3 → bad       (lost more than 3 positions)
	//	deltaPos < 0 → good      (gained positions)
	//	default      → ok        (maintained or within expectations)
	//
	// Only evaluate once, when position has diverged from start position
	// (signals the race has started and we have live racing data).
	if !m.playedStartMessage && m.sessionStartPlace > 0 && player.Place > 0 && player.Place != m.sessionStartPlace {
		if curr.Session != nil && curr.Session.SessionType == 5 { // 5 = Race in LMU/RF2
			deltaPos := int32(player.Place) - int32(m.sessionStartPlace)
			switch {
			case deltaPos > 5:
				m.playedStartMessage = true
				out = append(out, Event{
					Type: EventStartTerrible, ExpiresAt: nowMS + 30_000,
					Payload: map[string]any{"startPos": m.sessionStartPlace, "currentPos": player.Place, "delta": deltaPos},
				})
			case deltaPos > 3:
				m.playedStartMessage = true
				out = append(out, Event{
					Type: EventStartBad, ExpiresAt: nowMS + 30_000,
					Payload: map[string]any{"startPos": m.sessionStartPlace, "currentPos": player.Place, "delta": deltaPos},
				})
			case deltaPos < 0:
				m.playedStartMessage = true
				out = append(out, Event{
					Type: EventStartGood, ExpiresAt: nowMS + 30_000,
					Payload: map[string]any{"startPos": m.sessionStartPlace, "currentPos": player.Place, "delta": deltaPos},
				})
			default:
				m.playedStartMessage = true
				out = append(out, Event{
					Type: EventStartOK, ExpiresAt: nowMS + 30_000,
					Payload: map[string]any{"startPos": m.sessionStartPlace, "currentPos": player.Place, "delta": deltaPos},
				})
			}
		}
	}

	// ---- Formation position (CC parity: Position.cs formation lap display) ----
	if curr.Session != nil && curr.Session.GamePhase == 3 && !m.playedFormation {
		m.playedFormation = true
		out = append(out, Event{
			Type: EventFormationPosition, ExpiresAt: nowMS + 10000,
		})
	}

	if player.Place == 0 || m.lastPlace == 0 {
		// Place == 0 means unknown / no scoring yet. Don't fire position events.
		m.lastPlace = player.Place
		if len(out) > 0 {
			return out
		}
		return nil
	}

	// ---- Overtake / being-passed detection (before gap sampling) ----
	// Compare current frame against the most recent gap sample (from a
	// previous trigger) to detect position changes consistent with an
	// on-track pass.
	//
	// Overtake completed: the player's Place improved and the last gap
	// sample had a car ahead (TimeBehindNext > 0), indicating the player
	// was chasing someone and now has passed them.
	//
	// Overtake lost (being passed): the player's Place worsened and
	// there is now a car ahead (TimeBehindNext > 0), indicating someone
	// overtook the player.
	//
	// Both use the overtake-specific cooldown (minTimeBetweenOvertakeMessages)
	// which is independent of the general position-change cooldown.
	cooldownStart := m.lastOvertakeEmitMS
	if cooldownStart == 0 {
		cooldownStart = nowMS - minTimeBetweenOvertakeMessages // allow first emission
	}
	if len(m.gapBuffer) > 0 && nowMS-cooldownStart >= minTimeBetweenOvertakeMessages {
		last := m.gapBuffer[len(m.gapBuffer)-1]

		if player.Place < last.place && last.timeBehindNext > 0 {
			timeSince := nowMS - last.tsMS
			if timeSince < maxSecondsToWaitBeforeReportingPassMS {
				out = append(out, Event{
					Type: EventOvertakeCompleted, ExpiresAt: nowMS + 30_000,
					Payload: map[string]any{"positionsGained": 1, "newPlace": player.Place},
				})
				m.lastOvertakeEmitMS = nowMS
			}
		}

		if player.Place > last.place && player.TimeBehindNext > 0 {
			timeSince := nowMS - last.tsMS
			if timeSince < maxSecondsToWaitBeforeReportingPassMS {
				out = append(out, Event{
					Type: EventOvertakeLost, ExpiresAt: nowMS + 30_000,
					Payload: map[string]any{"positionsLost": 1, "newPlace": player.Place},
				})
				m.lastOvertakeEmitMS = nowMS
			}
		}
	}

	// ---- Gap sampling ----
	// Append a sample whenever the player has a car ahead to track.
	if player.TimeBehindNext > 0 && player.Place > 0 {
		m.gapBuffer = append(m.gapBuffer, gapSample{
			timeBehindNext: player.TimeBehindNext,
			place:          player.Place,
			tsMS:           nowMS,
		})
		if len(m.gapBuffer) > maxGapBufferSize {
			m.gapBuffer = m.gapBuffer[1:]
		}
	}

	// ---- Last-place tracking (CC: numberOfLapsInLastPlace > 5) ----
	// Tracks consecutive laps spent in last position and emits a one-shot
	// event when threshold is reached.
	if curr.Session != nil && curr.Session.NumVehicles > 0 && player.Place == uint8(curr.Session.NumVehicles) {
		if player.TotalLaps > m.lastPlaceLapNumber {
			m.lapsInLastPlace++
			m.lastPlaceLapNumber = player.TotalLaps
		}
	} else {
		// Not in last place → reset counter.
		m.lapsInLastPlace = 0
		m.lastPlaceLapNumber = 0
		m.lastPlaceEmitted = false
	}
	if m.lapsInLastPlace >= lastPlaceMinLaps && !m.lastPlaceEmitted {
		out = append(out, Event{
			Type: EventLastPlaceForManyLaps, ExpiresAt: nowMS + 60_000,
			Payload: map[string]any{"lapsInLastPlace": m.lapsInLastPlace, "place": player.Place},
		})
		m.lastPlaceEmitted = true
	}

	// ---- Position change detection ----
	if player.Place == m.lastPlace {
		if len(out) > 0 {
			return out
		}
		return nil
	}

	posCooldownStart := m.lastEmitMS
	if posCooldownStart == 0 {
		posCooldownStart = nowMS - m.cooldownMS
	}
	if nowMS-posCooldownStart < m.cooldownMS {
		m.lastPlace = player.Place
		if len(out) > 0 {
			return out
		}
		return nil
	}

	var evType string
	if player.Place < m.lastPlace {
		evType = EventPositionGained
		// Feature 2: Record the position gain for give-back detection.
		m.lastGainMS = nowMS
		m.lastGainFromPlace = m.lastPlace
		m.lastGainToPlace = player.Place
	} else {
		evType = EventPositionLost
		// If we lost a position, reset the gain window (we no longer
		// need to consider giving back that position).
		m.lastGainMS = 0
	}
	prevPlace := m.lastPlace
	m.lastPlace = player.Place
	m.lastEmitMS = nowMS
	out = append(out, Event{
		Type:      evType,
		ExpiresAt: nowMS + 5000,
		Payload: map[string]any{
			"from": prevPlace,
			"to":   player.Place,
		},
	})

	// ---- Feature 2: Give position back check ----
	// If we recently gained a position (within 10s) and there is an
	// opponent close behind, we may need to give it back.
	// Allow first emission when giveBackLastEmit == 0.
	if m.lastGainMS > 0 && nowMS-m.lastGainMS < 10_000 && player.TimeBehindNext > 0 {
		giveBackLast := m.giveBackLastEmit
		if giveBackLast == 0 {
			giveBackLast = nowMS - m.giveBackCooldown // allow first emit
		}
		giveBackLastNow := m.giveBackLastNowMS
		if giveBackLastNow == 0 {
			giveBackLastNow = nowMS - m.giveBackCooldown // allow first emit
		}

		// Urgent: gap < 0.3 s
		if player.TimeBehindNext < 0.3 && nowMS-giveBackLastNow >= m.giveBackCooldown {
			m.giveBackLastNowMS = nowMS
			out = append(out, Event{
				Type:      EventGivePositionBackNow,
				ExpiresAt: nowMS + 10_000,
				Payload: map[string]any{
					"from":   m.lastGainFromPlace,
					"to":     m.lastGainToPlace,
					"gap":    player.TimeBehindNext,
					"urgent": true,
				},
			})
		} else if player.TimeBehindNext < 1.0 && nowMS-giveBackLast >= m.giveBackCooldown {
			// Regular: gap < 1.0 s
			m.giveBackLastEmit = nowMS
			out = append(out, Event{
				Type:      EventGivePositionBack,
				ExpiresAt: nowMS + 10_000,
				Payload: map[string]any{
					"from":   m.lastGainFromPlace,
					"to":     m.lastGainToPlace,
					"gap":    player.TimeBehindNext,
					"urgent": false,
				},
			})
		}
	}

	return out
}
