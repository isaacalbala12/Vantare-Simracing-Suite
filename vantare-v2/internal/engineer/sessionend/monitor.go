// Package sessionend implements a minimal SessionEndMessages monitor for
// alpha 1: detects when the session transitions to Finished/Over and
// emits a single event. The CC implementation has many sub-messages
// (won, podium, finished, DNF, disqualified, end-of-session pole, etc.)
// that are G2.x scope.
//
// Parity CC: Events/SessionEndMessages.cs (228 lines, full). MVP fires
// once per session at the Finished transition. CC gate
// minSessionRunTimeForEndMessages=60s (SessionEndMessages.cs:33) is
// applied here; CC default 6s from vantare-go-master-plan.md § 5.2 is
// a Vantare product decision (NOT CC parity) and is implemented
// separately.
package sessionend

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// MinSessionRunTimeForEndMessagesSec is the CC gate: only announce end
// messages if the session has run at least this long.
const MinSessionRunTimeForEndMessagesSec = 60

// CC rF2GamePhase enum values for "session finished" states
// (RF2Data.cs:68). Defined locally so this package has no import on
// spotter/flags.
const (
	sessionStoppedPhase uint8 = 7
	sessionOverPhase    uint8 = 8
)

// EventSessionEnded is emitted when a session finishes.
const EventSessionEnded = "session.ended"

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks session-end transitions.
type Monitor struct {
	lastFired      bool
	sessionStartMS int64
	hasStartTime   bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects curr for Finished/Over game phase and emits at
// most one EventSessionEnded per session (rising edge on Finished).
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Session == nil {
		return nil
	}
	// Track session start time from the first frame we see.
	if !m.hasStartTime {
		m.sessionStartMS = nowMS
		m.hasStartTime = true
	}

	finished := curr.Session.GamePhase == sessionStoppedPhase ||
		curr.Session.GamePhase == sessionOverPhase

	if finished && !m.lastFired {
		// Apply CC gate: at least 60s of session runtime.
		sessionRunSec := (nowMS - m.sessionStartMS) / 1000
		if sessionRunSec < MinSessionRunTimeForEndMessagesSec {
			return nil
		}
		m.lastFired = true
		return []Event{{
			Type:      EventSessionEnded,
			ExpiresAt: nowMS + 10_000,
			Payload: map[string]any{
				"gamePhase":      curr.Session.GamePhase,
				"sessionRunSec": sessionRunSec,
			},
		}}
	}
	if !finished {
		// Session reset (e.g. next session started). Allow re-firing.
		m.lastFired = false
	}
	return nil
}