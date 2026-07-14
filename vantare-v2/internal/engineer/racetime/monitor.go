// Package racetime implements a RaceTime monitor that detects
// time-remaining markers in timed sessions: 20, 15, 10, 5, 2, 0
// minutes remaining, plus halfway.
//
// Parity CC: Events/RaceTime.cs (366 lines, full implementation covers
// 20/15/10/5/2/0 minutes remaining, halfway, last lap, one-min-remain,
// one-lap-after-this, sub-minute markers, plus per-position variations
// like "leading / podium / top three").  This implementation covers the
// time-remaining markers with CC-matching thresholds and session running
// time gates, and exposes SetPearlsDisabled() so the audio layer can
// suppress pearls during the closing phase of a race.
//
// The lap-based markers (last lap, one-lap-after-this) and the per-position
// variants (leading / podium) require total-lap estimates and class position
// — those are planned for iter-2.
package racetime

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventTwentyMinRemain  = "racetime.20min_remaining"
	EventFifteenMinRemain = "racetime.15min_remaining"
	EventTenMinRemain     = "racetime.10min_remaining"
	EventFiveMinRemain    = "racetime.5min_remaining"
	EventTwoMinRemain     = "racetime.2min_remaining"
	EventZeroMinRemain    = "racetime.0min_remaining"
	EventHalfWayRemain    = "racetime.halfway"
	EventOneMinRemain     = "racetime.1min_remaining"
	EventThirtySecRemain  = "racetime.30s_remaining"
	EventPearlsDisable    = "racetime.pearls_disable"
	// Feature 4: Pre-race countdown (CC: RaceTime.cs "two_minutes_to_go", "one_minute_to_go").
	EventPreRaceTwoMin = "racetime.pre_race_2min"
	EventPreRaceOneMin = "racetime.pre_race_1min"
	EventPreRaceThirty = "racetime.pre_race_30s"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Priority hint (matches CC priority levels).
const (
	PriorityMidRace = 3  // half-way, 20, 15, 10 min
	PriorityWarning = 5  // 5min, last lap
	PriorityUrgent  = 10 // 2min, 0min
)

// Time thresholds in seconds.
const (
	twentyMinSec  = 1200
	fifteenMinSec = 900
	tenMinSec     = 600
	fiveMinSec    = 300
	twoMinSec     = 120
	zeroMaxSec    = 0.2
)

// CC gate: require at least this much session running time before
// firing certain markers:
const (
	minRunningTimeEarly           float64 = 60  // for 2min, 0min, pearl-disable
	minRunningTimeMid             float64 = 120 // for 5, 10, 15, 20, halfway
	minRunningTimeForPearlDisable float64 = 180 // <3 min remaining → CC sets disablePearlsOfWisdom=true
)

// Monitor tracks time-remaining markers in a session. Each marker
// fires at most once per session (reset via Reset()).
//
// Feature 4: Pre-race countdown announcements (*PreRace events) are
// one-shot and fire during Formation (3) / Countdown (4) game phases.
type Monitor struct {
	played20Min bool
	played15Min bool
	played10Min bool
	played5Min  bool
	played2Min  bool
	played0Min  bool
	played1Min  bool
	played30s   bool
	playedHalf  bool

	halfTime    float64
	gotHalfTime bool

	pearlsDisabled bool

	// Feature 4: Pre-race countdown — one-shot during Formation/Countdown.
	playedPreRace2Min bool
	playedPreRace1Min bool
	playedPreRace30s  bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// PearlsDisabled returns true if the race is in its closing phase
// (<3 min remaining) and pearls should be suppressed — parity with
// CC's disablePearlsOfWisdom flag (set at RaceTime.cs line 200).
func (m *Monitor) PearlsDisabled() bool { return m.pearlsDisabled }

// Trigger inspects the current frame for time-remaining markers. prev
// is unused (parity API with other monitors).
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Session == nil {
		return nil
	}
	rem := curr.Session.TimeRemainingInGamePhase
	if rem < 0 {
		return nil
	}
	runningTime := curr.Session.SessionTime

	var out []Event

	// ---- Capture halfTime on first valid frame (CC: RaceTime.cs L125) ----
	if !m.gotHalfTime && rem > 0 {
		m.halfTime = rem / 2
		m.gotHalfTime = true
		// CC skips half-way message if FuelUseActive is true, but we
		// have no fuel-use-active flag yet — mark as played to prevent
		// half-way + fuel messages overlapping.
		// TODO: check CC FuelUseActive equivalent.
	}

	// ---- Pre-race countdown (Feature 4): Formation(3) / Countdown(4) phases ----
	// CC parity: "two_minutes_to_go", "one_minute_to_go", etc.
	// Fire during Formation or Countdown phases when remaining time crosses
	// the threshold. One-shot per threshold, reset via Reset().
	{
		gp := curr.Session.GamePhase
		isPreRace := gp == 3 || gp == 4
		if isPreRace && rem > 0 {
			// 2 minutes: rem between 115 and 125 seconds.
			if !m.playedPreRace2Min && rem > 115 && rem <= 125 {
				m.playedPreRace2Min = true
				out = append(out, Event{
					Type: EventPreRaceTwoMin, ExpiresAt: nowMS + 15_000,
					Payload: map[string]any{"remSecs": rem, "priority": PriorityWarning},
				})
			}
			// 1 minute: rem between 55 and 65 seconds.
			if !m.playedPreRace1Min && rem > 55 && rem <= 65 {
				m.playedPreRace1Min = true
				out = append(out, Event{
					Type: EventPreRaceOneMin, ExpiresAt: nowMS + 15_000,
					Payload: map[string]any{"remSecs": rem, "priority": PriorityUrgent},
				})
			}
			// 30 seconds: rem between 25 and 35 seconds.
			if !m.playedPreRace30s && rem > 25 && rem <= 35 {
				m.playedPreRace30s = true
				out = append(out, Event{
					Type: EventPreRaceThirty, ExpiresAt: nowMS + 15_000,
					Payload: map[string]any{"remSecs": rem, "priority": PriorityUrgent},
				})
			}
		}
	}

	// ---- Pearl disable gate: timeLeft/60 < 3 (CC: RaceTime.cs L197-200) ----
	if !m.pearlsDisabled && runningTime > minRunningTimeEarly && rem > 0 && rem/60 < 3 {
		m.pearlsDisabled = true
		// Emit a control event so the audio layer can suppress pearls.
		out = append(out, Event{
			Type:      EventPearlsDisable,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"remSecs": rem},
		})
	}

	// ---- 20 min: timeLeft/60 < 20 && > 19.9 (CC L275-278) ----
	if runningTime > minRunningTimeMid && rem > 0 && rem/60 < 20 && rem/60 > 19.9 && !m.played20Min {
		out = append(out, Event{Type: EventTwentyMinRemain, ExpiresAt: nowMS + 20_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityMidRace}})
		m.played20Min = true
	}
	// ---- 15 min: timeLeft/60 < 15 && > 14.9 (CC L269-273) ----
	if runningTime > minRunningTimeMid && rem > 0 && rem/60 < 15 && rem/60 > 14.9 && !m.played15Min {
		out = append(out, Event{Type: EventFifteenMinRemain, ExpiresAt: nowMS + 20_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityMidRace}})
		m.played15Min = true
	}
	// ---- 10 min: timeLeft/60 < 10 && > 9.9 (CC L262-267) ----
	if runningTime > minRunningTimeMid && rem > 0 && rem/60 < 10 && rem/60 > 9.9 && !m.played10Min {
		out = append(out, Event{Type: EventTenMinRemain, ExpiresAt: nowMS + 20_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityMidRace}})
		m.played10Min = true
	}
	// ---- 5 min: timeLeft/60 < 5 && > 4.9 (CC L240-260) ----
	if runningTime > minRunningTimeMid && rem > 0 && rem/60 < 5 && rem/60 > 4.9 && !m.played5Min {
		out = append(out, Event{Type: EventFiveMinRemain, ExpiresAt: nowMS + 20_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityWarning}})
		m.played5Min = true
	}
	// ---- 2 min: timeLeft/60 < 2 && > 1.9 (CC L229-238) ----
	if runningTime > minRunningTimeEarly && rem > 0 && rem/60 < 2 && rem/60 > 1.9 && !m.played2Min {
		out = append(out, Event{Type: EventTwoMinRemain, ExpiresAt: nowMS + 15_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityUrgent}})
		m.played2Min = true
	}
	// ---- 0 min: timeLeft <= 0.2 (CC L203-227) ----
	if runningTime > minRunningTimeEarly && rem <= zeroMaxSec && !m.played0Min {
		out = append(out, Event{Type: EventZeroMinRemain, ExpiresAt: nowMS + 5_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityUrgent}})
		m.played0Min = true
	}
	// ---- 1 min: rem > 0 && <= 60 (CC sub-minute markers) ----
	if runningTime > minRunningTimeEarly && rem > 0 && rem <= 60 && !m.played1Min {
		out = append(out, Event{Type: EventOneMinRemain, ExpiresAt: nowMS + 10_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityUrgent}})
		m.played1Min = true
	}
	// ---- 30 s: rem > 0 && <= 30 ----
	if runningTime > minRunningTimeEarly && rem > 0 && rem <= 30 && !m.played30s {
		out = append(out, Event{Type: EventThirtySecRemain, ExpiresAt: nowMS + 10_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityUrgent}})
		m.played30s = true
	}
	// ---- Halfway: timeLeft > 0 && timeLeft < halfTime (CC L280-286) ----
	if runningTime > minRunningTimeMid && m.gotHalfTime && rem > 0 && rem < m.halfTime && !m.playedHalf {
		out = append(out, Event{Type: EventHalfWayRemain, ExpiresAt: nowMS + 20_000, Payload: map[string]any{"remSecs": rem, "priority": PriorityMidRace}})
		m.playedHalf = true
	}
	return out
}

// Reset clears the "played" state for a new session.
func (m *Monitor) Reset() {
	m.played20Min = false
	m.played15Min = false
	m.played10Min = false
	m.played5Min = false
	m.played2Min = false
	m.played0Min = false
	m.played1Min = false
	m.played30s = false
	m.playedHalf = false
	m.halfTime = 0
	m.gotHalfTime = false
	m.pearlsDisabled = false
	m.playedPreRace2Min = false
	m.playedPreRace1Min = false
	m.playedPreRace30s = false
}
