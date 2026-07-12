// Package timings implements a minimal Timings monitor for alpha 1:
// periodic reports of the player's gap to the car ahead/behind. CC
// Timings.cs uses a per-game `frequency_of_gap_*_reports` setting; we
// hardcode a sensible default (60s) until the user setting lands.
//
// Parity CC: Events/Timings.cs (line 55, 58 gap-to-leader / gap-to-next
// frequencies). MVP emits EventGapReport on a fixed cadence with
// gap status (increasing/decreasing/close).
package timings

import (
	"math"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// GapStatus mirrors CC Timings.GapStatus enum.
type GapStatus string

const (
	GapStatusNone       GapStatus = "none"
	GapStatusClose      GapStatus = "close"
	GapStatusIncreasing GapStatus = "increasing"
	GapStatusDecreasing GapStatus = "decreasing"
	GapStatusStable     GapStatus = "stable"
)

// EventGapReport is emitted periodically with the player's gap to
// leader and next car.
const EventGapReport = "timings.gap_report"

// EventGapReportFreq is emitted alongside the next gap report when the
// report frequency is updated at runtime via SetReportInterval.
const EventGapReportFreq = "timings.gap_report_freq"

// EventBeingHeldUp fires when the player is stuck behind a slower car:
// gap to the car ahead is stable and < 3.0s (CC parity: Timings held-up check).
const EventBeingHeldUp = "timings.being_held_up"

// EventBeingPressured fires when a faster car is closing from behind:
// gap to the car ahead is decreasing and < 2.0s (CC parity: Timings pressured check).
const EventBeingPressured = "timings.being_pressured"

// DefaultReportIntervalSec is the cadence for gap reports. CC default
// is user-configurable; this is a reasonable middle ground.
const DefaultReportIntervalSec = 60

// Gap thresholds matching CC Timings.cs:753-769.
const (
	gapCloseThreshold     = 0.5  // seconds — CLOSE if under this for 2+ sectors
	gapReportMinThreshold = 0.5  // seconds — minimum gap to report
	gapReportMaxThreshold = 20.0 // seconds — maximum gap to report
	gapReadableMinMS      = 50   // milliseconds — minimum gap to read aloud
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// gapSample stores a single gap reading for trend analysis.
type gapSample struct {
	timeDelta float64
}

// Monitor tracks gap reporting cadence and status.
type Monitor struct {
	intervalMS          int64
	lastReportMS        int64
	initialized         bool
	intervalChanged     bool // set when SetReportInterval is called
	samplesInFront      []gapSample
	samplesBehind       []gapSample
	lastGapAhead        float64
	lastGapBehind       float64
	lastHeldUpEmitMS    int64
	lastPressuredEmitMS int64
}

// NewMonitor creates a Monitor with the default 60s interval.
func NewMonitor() *Monitor {
	return &Monitor{
		intervalMS:          DefaultReportIntervalSec * 1000,
		lastHeldUpEmitMS:    -30_000,
		lastPressuredEmitMS: -30_000,
	}
}

// NewMonitorWithInterval creates a Monitor with a custom interval.
func NewMonitorWithInterval(intervalSec int64) *Monitor {
	return &Monitor{
		intervalMS:          intervalSec * 1000,
		lastHeldUpEmitMS:    -30_000,
		lastPressuredEmitMS: -30_000,
	}
}

// NewMonitorWithReportInterval creates a Monitor with a custom report
// interval. Alias for NewMonitorWithInterval.
func NewMonitorWithReportInterval(intervalSec int64) *Monitor {
	return NewMonitorWithInterval(intervalSec)
}

// SetReportInterval updates the gap report interval at runtime. The new
// interval takes effect after the next scheduled report.
func (m *Monitor) SetReportInterval(sec int64) {
	m.intervalMS = sec * 1000
	m.intervalChanged = true
}

// Trigger emits a gap report if enough time has elapsed since the last
// one. Race condition (player actually being lapped) is detected via
// TimeBehindLeader<=0 (no leader / wrong way).
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	// Skip if no leader or negative gap.
	if player.TimeBehindLeader < 0 {
		return nil
	}

	// Skip if in pits (CC gate).
	if player.InPits {
		return nil
	}

	// Skip if session is null.
	session := curr.Session
	if session == nil {
		return nil
	}

	if !m.initialized {
		m.lastReportMS = nowMS
		m.initialized = true
		return nil
	}

	// Record a sample every time this is called (for trend analysis).
	gapLeader := player.TimeBehindLeader
	gapAhead := player.TimeBehindNext

	// Determine gap to car behind: find the opponent whose Place == playerPlace + 1.
	gapBehind := float64(0)
	if player.Place > 0 {
		targetPlace := player.Place + 1
		for i := range curr.Vehicles {
			if curr.Vehicles[i].Place == targetPlace && !curr.Vehicles[i].IsPlayer {
				gapBehind = curr.Vehicles[i].TimeBehindNext
				break
			}
		}
	}

	if gapLeader > 0 {
		m.samplesInFront = append(m.samplesInFront, gapSample{timeDelta: gapLeader})
		if len(m.samplesInFront) > 5 {
			m.samplesInFront = m.samplesInFront[1:]
		}
	}
	if gapBehind > 0 {
		m.samplesBehind = append(m.samplesBehind, gapSample{timeDelta: gapBehind})
		if len(m.samplesBehind) > 5 {
			m.samplesBehind = m.samplesBehind[1:]
		}
	}

	// Compute gap status for held up / pressured checks (and gap report).
	statusAhead := computeGapStatus(m.samplesInFront, 0)
	statusBehind := computeGapStatus(m.samplesBehind, 0)

	var out []Event

	// --- Being held up (slower car ahead, gap stable < 3.0s) ---
	if statusAhead == GapStatusStable && gapAhead > 0 && gapAhead < 3.0 &&
		nowMS-m.lastHeldUpEmitMS >= 30_000 {
		out = append(out, Event{
			Type:      EventBeingHeldUp,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{"gapSecs": gapAhead, "type": "ahead"},
		})
		m.lastHeldUpEmitMS = nowMS
	}

	// --- Being pressured (car behind closing, gap ahead decreasing < 2.0s) ---
	if statusBehind == GapStatusDecreasing && gapBehind > 0 && gapBehind < 2.0 &&
		nowMS-m.lastPressuredEmitMS >= 30_000 {
		out = append(out, Event{
			Type:      EventBeingPressured,
			ExpiresAt: nowMS + 5000,
			Payload:   map[string]any{"gapSecs": gapBehind, "type": "behind"},
		})
		m.lastPressuredEmitMS = nowMS
	}

	if nowMS-m.lastReportMS < m.intervalMS {
		if len(out) > 0 {
			return out
		}
		return nil
	}
	m.lastReportMS = nowMS

	m.lastGapAhead = gapLeader
	m.lastGapBehind = gapAhead

	// Apply CC thresholds: only report meaningful gaps.
	readGapAhead := gapLeader > gapReportMinThreshold && gapLeader < gapReportMaxThreshold &&
		(gapLeader > gapReadableMinMS/1000.0 || math.Mod(gapLeader*1000, 1000) > gapReadableMinMS)
	readGapBehind := gapAhead > gapReportMinThreshold && gapAhead < gapReportMaxThreshold &&
		(gapAhead > gapReadableMinMS/1000.0 || math.Mod(gapAhead*1000, 1000) > gapReadableMinMS)

	if !readGapAhead && !readGapBehind {
		if len(out) > 0 {
			return out
		}
		return nil
	}

	out = append(out, Event{
		Type:      EventGapReport,
		ExpiresAt: nowMS + 5000,
		Payload: map[string]any{
			"gapToLeaderSec":  gapLeader,
			"gapToNextSec":    gapAhead,
			"gapStatusAhead":  string(statusAhead),
			"gapStatusBehind": string(statusBehind),
			"sector":          player.Sector,
		},
	})

	// If the interval was changed since the last report, emit the freq event.
	if m.intervalChanged {
		out = append(out, Event{
			Type:      EventGapReportFreq,
			ExpiresAt: nowMS + 5000,
			Payload: map[string]any{
				"intervalSec": m.intervalMS / 1000,
			},
		})
		m.intervalChanged = false
	}

	return out
}

// computeGapStatus determines the gap trend from recent samples.
// Mirrors CC Timings.cs:735-779 (getGapStatus).
func computeGapStatus(samples []gapSample, lastReported float64) GapStatus {
	if len(samples) < 2 {
		return GapStatusNone
	}

	// Get the last 2-3 samples.
	n := len(samples)
	latest := samples[n-1].timeDelta
	prev1 := samples[n-2].timeDelta

	// CLOSE detection: 2+ consecutive samples under threshold.
	allClose := true
	for i := n - 2; i < n; i++ {
		if samples[i].timeDelta >= gapCloseThreshold || samples[i].timeDelta <= 0 {
			allClose = false
			break
		}
	}
	if allClose && latest > 0 {
		return GapStatusClose
	}

	// Need at least 3 samples for trend analysis.
	if n < 3 {
		return GapStatusNone
	}
	prev2 := samples[n-3].timeDelta

	// Validity checks (CC parity):
	if latest <= 0 || prev1 <= 0 || prev2 <= 0 {
		return GapStatusNone
	}
	if latest > gapReportMaxThreshold {
		return GapStatusNone
	}

	// Check that all samples refer to the same general trend (gap change not too large).
	if math.Abs(latest-prev1) > 5 || math.Abs(latest-prev2) > 5 {
		return GapStatusNone
	}

	// INCREASING: latest > prev1 > prev2.
	if math.Round(latest*10)/10 > math.Round(prev1*10)/10 &&
		math.Round(prev1*10)/10 > math.Round(prev2*10)/10 {
		return GapStatusIncreasing
	}

	// DECREASING: latest < prev1 < prev2.
	if math.Round(latest*10)/10 < math.Round(prev1*10)/10 &&
		math.Round(prev1*10)/10 < math.Round(prev2*10)/10 {
		return GapStatusDecreasing
	}

	// STABLE: gap hasn't changed by more than 1 second.
	if math.Abs(latest-prev1) < 1 && math.Abs(latest-prev2) < 1 {
		return GapStatusStable
	}

	return GapStatusNone
}
