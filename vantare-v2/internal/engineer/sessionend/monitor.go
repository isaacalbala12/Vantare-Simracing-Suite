// Package sessionend implements a minimal SessionEndMessages monitor for
// alpha 1: detects when the session transitions to Finished/Over and
// emits events. The CC implementation has many sub-messages
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

// Session type constants matching RF2 enum.
const (
	sessionTypeRace    int32 = 5
	sessionTypeQualify int32 = 3
)

// Finish status constants derived from VehicleScoring.FinishStatus.
const (
	finishStatusFinished byte = 1
	finishStatusDNF      byte = 2
	finishStatusDSQ      byte = 3
)

// Event types emitted by the monitor.
const (
	EventSessionEnded    = "session.ended"
	EventSessionWon      = "session.won"
	EventSessionPodium   = "session.podium"
	EventSessionFinished = "session.finished"
	EventSessionGood     = "session.good_finish"
	EventSessionLast     = "session.finished_last"
	EventSessionDNF      = "session.dnf"
	EventSessionDSQ      = "session.disqualified"
	EventSessionPole     = "session.pole"
	EventSessionEndedQual = "session.ended_qual"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks session-end transitions.
type Monitor struct {
	lastFired       bool
	sessionStartMS  int64
	hasStartTime    bool
	lastSessionType int32
	startPosition   int32
	hasStartPos     bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects curr for Finished/Over game phase and emits
// at most one set of end-of-session events per session.
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

	// Track start position (from first frame where player has a place).
	player := telemetry.FindPlayerVehicle(curr)
	if !m.hasStartPos && player != nil && player.Place > 0 {
		m.startPosition = int32(player.Place)
		m.hasStartPos = true
	}

	// Track session type for branching.
	if curr.Session.SessionType > 0 {
		m.lastSessionType = curr.Session.SessionType
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

		// Determine finish details from player vehicle.
		finishPos := int32(0)
		isDNF := false
		isDSQ := false
		totalCars := int32(0)
		completedLaps := int32(0)
		if player != nil {
			finishPos = int32(player.Place)
			totalCars = curr.Session.NumVehicles
			completedLaps = int32(player.TotalLaps)
			// FinishStatus: "FINISHED", "DNF", "DSQ" or empty.
			switch player.FinishStatus {
			case "DNF":
				isDNF = true
			case "DSQ":
				isDSQ = true
			}
		}

		isRace := m.lastSessionType == sessionTypeRace
		isQual := m.lastSessionType == sessionTypeQualify

		var out []Event
		basePayload := map[string]any{
			"gamePhase":       curr.Session.GamePhase,
			"sessionRunSec":   sessionRunSec,
			"finishPosition":  finishPos,
			"startPosition":   m.startPosition,
			"numCars":         totalCars,
			"completedLaps":   completedLaps,
			"isDNF":           isDNF,
			"isDisqualified":  isDSQ,
		}

		// Session ended (generic, always fires).
		out = append(out, Event{
			Type:      EventSessionEnded,
			ExpiresAt: nowMS + 15_000,
			Payload:   cloneMap(basePayload),
		})

		if isRace {
			if isDSQ {
				out = append(out, Event{
					Type:      EventSessionDSQ,
					ExpiresAt: nowMS + 15_000,
					Payload:   cloneMap(basePayload),
				})
			} else if isDNF {
				out = append(out, Event{
					Type:      EventSessionDNF,
					ExpiresAt: nowMS + 15_000,
					Payload:   cloneMap(basePayload),
				})
			} else if finishPos == 1 {
				out = append(out, Event{
					Type:      EventSessionWon,
					ExpiresAt: nowMS + 20_000,
					Payload:   cloneMap(basePayload),
				})
			} else if finishPos < 4 {
				out = append(out, Event{
					Type:      EventSessionPodium,
					ExpiresAt: nowMS + 15_000,
					Payload:   cloneMap(basePayload),
				})
			} else if finishPos == totalCars {
				out = append(out, Event{
					Type:      EventSessionLast,
					ExpiresAt: nowMS + 15_000,
					Payload:   cloneMap(basePayload),
				})
			} else {
				// Check for good finish: improvement over start position.
				metExpectations := m.startPosition == 0 || m.startPosition > finishPos
				if metExpectations {
					out = append(out, Event{
						Type:      EventSessionGood,
						ExpiresAt: nowMS + 15_000,
						Payload:   cloneMap(basePayload),
					})
				} else {
					out = append(out, Event{
						Type:      EventSessionFinished,
						ExpiresAt: nowMS + 15_000,
						Payload:   cloneMap(basePayload),
					})
				}
			}
		} else if isQual {
			if finishPos == 1 {
				out = append(out, Event{
					Type:      EventSessionPole,
					ExpiresAt: nowMS + 15_000,
					Payload:   cloneMap(basePayload),
				})
			} else {
				out = append(out, Event{
					Type:      EventSessionEndedQual,
					ExpiresAt: nowMS + 15_000,
					Payload:   cloneMap(basePayload),
				})
			}
		} else {
			// Practice / other — EventSessionEnded already emitted above
			// (always fires once per session for any session type).
		}

		return out
	}
	if !finished {
		// Session reset (e.g. next session started). Allow re-firing.
		m.lastFired = false
	}
	return nil
}

func cloneMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
