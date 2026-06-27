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
//   MEDIUM <= 4 laps, LONG <= 2 laps, VERY_LONG == 1 lap
//   time window 120s < remaining < 240s
//
// The constant 1.0s here is a conservative single-threshold heuristic
// until the full logic lands. Tests assert on the threshold so changing
// it is a one-line edit.
package push

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// DefaultGapThresholdSec is the time gap (seconds) under which the
// monitor fires EventPushNow. Conservative single-threshold; full CC
// uses per-track-class windows (PushNow.cs:88, 96-98).
const DefaultGapThresholdSec = 1.0

// EventPushNow is emitted when the player is close enough to push.
const EventPushNow = "push.push_now"

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks push-now opportunities.
type Monitor struct {
	lastEmitMS int64
	cooldownMS int64
	threshold  float64
}

// NewMonitor creates a Monitor with the default 1.0s threshold and a
// 60s cooldown (avoid spam while still in the gap window).
func NewMonitor() *Monitor {
	return &Monitor{cooldownMS: 60_000, threshold: DefaultGapThresholdSec}
}

// NewMonitorWithThreshold creates a Monitor with a custom gap threshold
// (seconds). Used by tests and future per-track-class wiring.
func NewMonitorWithThreshold(thresholdSec float64) *Monitor {
	return &Monitor{cooldownMS: 60_000, threshold: thresholdSec}
}

// Trigger inspects the current frame and returns push events. prev is
// accepted for signature parity with other monitors but unused here
// (gap detection is stateful via cooldown alone). The player's
// VehicleScoring.TimeBehindNext is the field consulted.
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}
	// TimeBehindNext == 0 means no opponent ahead within range or no
	// telemetry for the gap. TimeBehindNext < 0 is invalid in CC.
	if player.TimeBehindNext <= 0 {
		return nil
	}

	cooldownStart := m.lastEmitMS
	if cooldownStart == 0 {
		cooldownStart = nowMS - m.cooldownMS
	}

	if player.TimeBehindNext < m.threshold && nowMS-cooldownStart >= m.cooldownMS {
		m.lastEmitMS = nowMS
		return []Event{{
			Type:      EventPushNow,
			ExpiresAt: nowMS + 5000,
			Payload: map[string]any{
				"gapSecs": player.TimeBehindNext,
			},
		}}
	}
	return nil
}