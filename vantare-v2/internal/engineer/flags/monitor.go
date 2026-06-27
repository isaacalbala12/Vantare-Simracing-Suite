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
	EventFCYStarted = "flags.fcy_started"
	EventFCYEnded   = "flags.fcy_ended"
	EventBlueFlag   = "flags.blue_flag"
)

// Event is the monitor's output. It mirrors the shape consumed by
// spotter.Machine.Event so a future unified pipeline can route both
// spotter and flag events through the same queue.
type Event struct {
	Type      string
	ExpiresAt int64 // unix-ms; 0 means no expiry
}

// Cooldowns (ms). Parity CC FlagsMonitor.cs:26-29:
//   timeBetweenYellowFlagMessages=25s, others=15s.
const (
	fcyCooldownMS  = 25_000 // 25s — yellow flag family (includes FCY)
	blueCooldownMS = 15_000 // 15s — blue flag
)

// fcyGamePhase is the value of SessionInfo.GamePhase that indicates
// Full Course Yellow / Safety Car. Same as rF2GamePhase.FullCourseYellow=6
// in CC RF2Data.cs:68. Defined locally so this package has no import on
// spotter (separation: flags shouldn't depend on spotter).
const fcyGamePhase uint8 = 6

// Monitor tracks flag-phase transitions. Safe for single-goroutine use
// from the runtime; the runtime calls Trigger once per frame.
type Monitor struct {
	lastFCYState   bool
	lastFCYEmitMS  int64
	lastBlueEmitMS int64
}

// NewMonitor creates a Monitor with default cooldowns.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects the current frame and returns the events that the
// runtime should enqueue. prev is allowed to be nil on the first call.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}

	currFCY := IsFCY(curr)
	prevFCY := prev != nil && IsFCY(prev)

	var out []Event

	// FCY transitions: rising edge fires EventFCYStarted (cooldown 25s),
	// falling edge fires EventFCYEnded (no cooldown — green flag recovery
	// is critical information).
	//
	// Cooldown sentinel: the struct zero value (lastFCYEmitMS == 0) means
	// "never emitted" and must allow the first event through, so we
	// subtract the cooldown from nowMS in that case.
	cooldownStart := m.lastFCYEmitMS
	if cooldownStart == 0 {
		cooldownStart = nowMS - fcyCooldownMS
	}
	if currFCY && !prevFCY && nowMS-cooldownStart >= fcyCooldownMS {
		out = append(out, Event{Type: EventFCYStarted, ExpiresAt: nowMS + 5000})
		m.lastFCYEmitMS = nowMS
	} else if !currFCY && prevFCY {
		out = append(out, Event{Type: EventFCYEnded, ExpiresAt: nowMS + 5000})
	}
	m.lastFCYState = currFCY

	// Blue flag: if the player's vehicle has Flag=="BLUE" (parser public
	// already maps flag=6 -> "BLUE"), emit with 15s cooldown. Requires
	// the player to be identifiable in frame.Vehicles; falls back to
	// frame.Player if there is exactly one vehicle.
	blueCooldownStart := m.lastBlueEmitMS
	if blueCooldownStart == 0 {
		blueCooldownStart = nowMS - blueCooldownMS
	}
	if playerFlag(curr) == "BLUE" && nowMS-blueCooldownStart >= blueCooldownMS {
		out = append(out, Event{Type: EventBlueFlag, ExpiresAt: nowMS + 5000})
		m.lastBlueEmitMS = nowMS
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