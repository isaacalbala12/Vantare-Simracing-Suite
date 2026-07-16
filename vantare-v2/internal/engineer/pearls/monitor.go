// Package pearls implements a PearlsOfWisdom monitor.
//
// CC distinguishes GOOD / BAD / NEUTRAL pearl types, uses a probability
// mechanism (messageProbability * pearlsFrequency > random * 10), checks
// minTimeBetweenPearls before playing, and supports a disable flag set by
// RaceTime (< 3 min remaining) and LapCounter (last lap).
//
// Parity CC: CrewChiefV4/PearlsOfWisdom.cs (63 lines) + AudioPlayer.cs
// lines 27, 102, 1389-1549 (gate logic).  This implementation uses a
// combined approach: lap-interval based firing (every 12 laps) as
// fallback, plus PearlType-aware events and cooldown/disable support.
//
// CC defaults (estimated from code):
//
//	pearl_max_normal = 2
//	pearl_standard_lap_interval = 12 (one pearl every 12 laps)
//	minTimeBetweenPearls = 30 seconds (typical user setting)
//	pearlsFrequency = 5 (default, range 1-10)
//
// Iter-2 additions:
//   - probability gate (rand.Float64() < probability)
//   - context-based pearl type (GOOD/BAD/NEUTRAL from position change)
//   - disable in last 2 laps of a lap-counted session
package pearls

import (
	"math/rand"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// PearlType mirrors CC's PearlsOfWisdom.PearlType enum.
type PearlType uint8

const (
	PearlTypeNone    PearlType = 0
	PearlTypeGood    PearlType = 1
	PearlTypeBad     PearlType = 2
	PearlTypeNeutral PearlType = 3
)

// EventPearl is emitted when a pearl should be played.
const EventPearl = "pearls.pearl"

// DefaultMaxPearlsPerRace is the default max pearls per race.
const DefaultMaxPearlsPerRace = 2

// DefaultLapInterval is the default lap interval (every 12 laps).
const DefaultLapInterval = 12

// DefaultMinTimeBetweenPearlsMS is the default cooldown between pearls.
const DefaultMinTimeBetweenPearlsMS = 30_000 // 30 seconds

// DefaultProbability is the default pearl emission probability when
// no explicit value is provided. CC typical: 0.7 (time markers).
const DefaultProbability = 0.7

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks lap counter and emits periodic pearl events.
// It also respects cooldown, external disable signals, and probability gating.
type Monitor struct {
	mu sync.Mutex

	lapInterval  int32
	maxPearls    int
	pearlsFired  int
	lastPearlLap int32

	minTimeBetweenMS int64
	lastEmitMS       int64

	probability float64

	disabled bool
}

// NewMonitor creates a Monitor with CC-derived default settings.
// Probability defaults to 1.0 (no gating) for backward compat; use
// SetProbability or NewMonitorWithParams to enable probability gating.
func NewMonitor() *Monitor {
	return &Monitor{
		lapInterval:      DefaultLapInterval,
		maxPearls:        DefaultMaxPearlsPerRace,
		minTimeBetweenMS: DefaultMinTimeBetweenPearlsMS,
		probability:      1.0,
	}
}

// NewMonitorWithParams creates a Monitor with custom settings. Used
// by tests and future user setting wiring.
func NewMonitorWithParams(lapInterval int32, maxPearls int, probability float64) *Monitor {
	return &Monitor{
		lapInterval:      lapInterval,
		maxPearls:        maxPearls,
		minTimeBetweenMS: DefaultMinTimeBetweenPearlsMS,
		probability:      probability,
	}
}

// SetDisabled controls the disable flag (set by RaceTime when <3 min
// remaining, or by LapCounter on last lap).  When disabled, Trigger
// returns nil.  Parity with CC's disablePearlsOfWisdom flag.
func (m *Monitor) SetDisabled(v bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.disabled = v
}

// Disabled returns the current disable state.
func (m *Monitor) Disabled() bool { return m.disabled }

// SetMinTimeBetweenMS overrides the default cooldown duration.
func (m *Monitor) SetMinTimeBetweenMS(ms int64) { m.minTimeBetweenMS = ms }

// SetProbability overrides the pearl emission probability (0.0-1.0).
func (m *Monitor) SetProbability(p float64) { m.probability = p }

// probCheck returns true if the random probability gate passes.
// Always passes when probability >= 1.0.
func (m *Monitor) probCheck() bool {
	return rand.Float64() < m.probability
}

// playerPlace returns the Place (position) of the player vehicle, or 0
// if unknown.
func playerPlace(frame *telemetry.Frame) uint8 {
	if frame == nil {
		return 0
	}
	for i := range frame.Vehicles {
		if frame.Vehicles[i].IsPlayer {
			return frame.Vehicles[i].Place
		}
	}
	if frame.Player != nil {
		for i := range frame.Vehicles {
			if frame.Vehicles[i].ID == frame.Player.ID {
				return frame.Vehicles[i].Place
			}
		}
	}
	return 0
}

// resolvePearlType selects GOOD/BAD/NEUTRAL based on position change
// between prev and curr frames.  Place < prev → improvement → GOOD.
// Place > prev → worsening → BAD.  Otherwise NEUTRAL.
func resolvePearlType(prev, curr *telemetry.Frame) PearlType {
	currPlace := playerPlace(curr)
	if currPlace == 0 {
		return PearlTypeNeutral
	}
	if prev == nil {
		return PearlTypeNeutral
	}
	prevPlace := playerPlace(prev)
	if prevPlace == 0 {
		return PearlTypeNeutral
	}
	if currPlace < prevPlace {
		return PearlTypeGood
	}
	if currPlace > prevPlace {
		return PearlTypeBad
	}
	return PearlTypeNeutral
}

// Trigger inspects the current frame and emits a pearl event when
// enough laps have elapsed since the last pearl, respecting cooldown,
// disable flag, probability gate, position-change context, and the
// last-2-laps exclusion for lap-counted sessions.
func (m *Monitor) Trigger(nowMS int64, prev *telemetry.Frame, curr *telemetry.Frame) []Event {
	m.mu.Lock()
	disabled := m.disabled
	m.mu.Unlock()
	if disabled {
		return nil
	}
	if curr == nil || curr.Player == nil {
		return nil
	}
	lap := curr.Player.LapNumber
	if lap <= 0 {
		return nil
	}

	// Disable in last 2 laps for lap-counted sessions (CC parity).
	if curr.Session != nil && curr.Session.SessionLapsTotal > 0 {
		if lap >= curr.Session.SessionLapsTotal-1 {
			return nil
		}
	}

	if m.pearlsFired >= m.maxPearls {
		return nil
	}
	// CC cooldown: minTimeBetweenPearlsOfWisdom.
	if m.lastEmitMS > 0 && nowMS-m.lastEmitMS < m.minTimeBetweenMS {
		return nil
	}

	// Determine if we should emit a pearl this lap.
	shouldEmit := false
	if m.lastPearlLap == 0 {
		shouldEmit = true
	} else if lap-m.lastPearlLap >= m.lapInterval {
		shouldEmit = true
	}
	if !shouldEmit {
		return nil
	}

	// Probability gate.
	if !m.probCheck() {
		return nil
	}

	// Emit pearl.
	m.lastPearlLap = lap
	m.pearlsFired++
	m.lastEmitMS = nowMS
	pearlType := resolvePearlType(prev, curr)
	return []Event{{
		Type:      EventPearl,
		ExpiresAt: nowMS + 10_000,
		Payload: map[string]any{
			"lap": lap, "pearlNumber": m.pearlsFired,
			"pearlType": pearlType,
		},
	}}
}

// Reset clears the per-race state. Call on session start.  Also
// re-enables pearls (CC resets disablePearlsOfWisdom on session start).
func (m *Monitor) Reset() {
	m.pearlsFired = 0
	m.lastPearlLap = 0
	m.lastEmitMS = 0
	m.disabled = false
}
