// Package penalties implements a minimal Penalties monitor for alpha 1:
// detects when the player first receives a Drive-Through or Stop&Go
// penalty (rising edge on the public Penalties counter) and emits a
// single event the runtime can enqueue.
//
// Parity CC: Events/Penalties.cs (full implementation has many
// sub-types: cutting, false start, FCY pass, slow-down, time deduction,
// pit stop, meatball flag, plus 1/2/3 laps-to-serve, pit-now, etc.). For
// alpha 1 we only distinguish the two main buckets the user hears
// ("new drive-through" / "new stop-and-go"). The full mapping is G2.x
// scope and requires live capture of mLastHistoryMessage sub-strings
// in LMU (NO_VERIFICADO — see audit 2026-06-27).
package penalties

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Event types emitted by Monitor.
const (
	EventNewDriveThrough = "penalties.new_drivethrough"
	EventNewStopAndGo     = "penalties.new_stopgo"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64 // unix-ms; 0 means no expiry
}

// Drive-through and stop-and-go show up as a non-zero Penalties counter
// on the player vehicle. The public parser already populates
// VehicleScoring.Penalties from offset 194 of vehicleScoring (per LMU
// shared memory). At the monitor layer we just need the rising edge
// from 0 to >0 — we don't try to distinguish DT from S&G by counter
// value alone (LMU uses a single counter; the distinction comes from
// the history message which we don't decode in alpha 1).
//
// In alpha 1 the monitor emits EventNewDriveThrough by default when
// Penalties rises; for accurate DT vs S&G discrimination we need live
// capture (G2.x). This is a documented gap.
const (
	defaultEventType  = EventNewDriveThrough
	defaultCooldownMS = 30_000 // 30s — avoid double-firing on the same penalty
)

// Monitor tracks penalty counter transitions.
type Monitor struct {
	lastPenalties int32
	lastEmitMS    int64
	initialized   bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects the current frame and returns events for penalty
// transitions. prev may be nil on the first call.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	// On the first call (or after restart), seed lastPenalties from prev if
	// available so the first rising edge is detected correctly. Without
	// this, a nil prev followed by a non-zero current would be treated as
	// "already had penalty" and no event would fire.
	if !m.initialized {
		if prev != nil {
			if p := telemetry.FindPlayerVehicle(prev); p != nil {
				m.lastPenalties = p.Penalties
			}
		}
		m.initialized = true
	}

	cooldownStart := m.lastEmitMS
	if cooldownStart == 0 {
		cooldownStart = nowMS - defaultCooldownMS
	}

	if player.Penalties > 0 && m.lastPenalties == 0 && nowMS-cooldownStart >= defaultCooldownMS {
		m.lastEmitMS = nowMS
		m.lastPenalties = player.Penalties
		return []Event{{Type: defaultEventType, ExpiresAt: nowMS + 5000}}
	}
	m.lastPenalties = player.Penalties
	return nil
}