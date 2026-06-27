// Package racetime implements a minimal RaceTime monitor for alpha 1:
// detects "5/2/0 minutes remaining" markers based on
// SessionInfo.TimeRemainingInGamePhase.
//
// Parity CC: Events/RaceTime.cs (366 lines, full implementation covers
// 20/15/10/5/2/0 minutes remaining, halfway, last lap, one-min-remain,
// one-lap-after-this, sub-minute markers, plus per-position variations
// like "leading / podium / top three"). MVP alpha 1 covers only the
// time-remaining markers. The lap-based markers (halfway, last lap)
// require TotalLaps in the engineer telemetry model which is NOT
// populated in alpha 1 (GAP, requires live capture of session info
// to determine total laps in non-timed sessions).
package racetime

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventFiveMinRemain = "racetime.5min_remaining"
	EventTwoMinRemain  = "racetime.2min_remaining"
	EventZeroMinRemain = "racetime.0min_remaining"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Time thresholds in seconds.
const (
	fiveMinSec  = 300
	twoMinSec   = 120
	zeroMinSec  = 0
)

// Monitor tracks time-remaining markers in a session. Each marker
// fires at most once per session (reset via Reset()).
type Monitor struct {
	played5Min bool
	played2Min bool
	played0Min bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

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

	var out []Event
	// 5min: 0 < rem <= 300 (still time, but 5min or less).
	if rem > 0 && rem <= fiveMinSec && !m.played5Min {
		out = append(out, Event{Type: EventFiveMinRemain, ExpiresAt: nowMS + 10_000, Payload: map[string]any{"remSecs": rem}})
		m.played5Min = true
	}
	// 2min: 0 < rem <= 120.
	if rem > 0 && rem <= twoMinSec && !m.played2Min {
		out = append(out, Event{Type: EventTwoMinRemain, ExpiresAt: nowMS + 10_000, Payload: map[string]any{"remSecs": rem}})
		m.played2Min = true
	}
	// 0min: rem == 0 (timer just expired). Negative rem is treated as
	// invalid (no telemetry / wrong way) and skipped.
	if rem == 0 && !m.played0Min {
		out = append(out, Event{Type: EventZeroMinRemain, ExpiresAt: nowMS + 10_000, Payload: map[string]any{"remSecs": rem}})
		m.played0Min = true
	}
	return out
}

// Reset clears the "played" state for a new session.
func (m *Monitor) Reset() {
	m.played5Min = false
	m.played2Min = false
	m.played0Min = false
}