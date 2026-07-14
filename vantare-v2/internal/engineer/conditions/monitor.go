// Package conditions implements a Conditions monitor: detects ambient/track
// temperature extremes (freezing, high heat) and approximates rain state
// from temperature deltas.
//
// Parity CC: Events/ConditionsMonitor.cs — full implementation covers rain
// density, air/track temp changes, ACC forecasts, etc.
//
// LMU (Vantare) provides AmbientTemp and TrackTemp on SessionInfo. Rain
// density is not directly available from the current LMU telemetry, so we
// approximate it from the delta between track and ambient temperatures.
package conditions

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	EventRainStarted   = "conditions.rain_started"
	EventRainStopped   = "conditions.rain_stopped"
	EventTrackTempHigh = "conditions.track_temp_high"
	EventTrackFreezing = "conditions.track_freezing"
)

// Temperature thresholds.
const (
	freezingThresholdC = 4.0  // ambient below this → freezing warning
	highTempThresholdC = 40.0 // ambient above this → high temp warning
	rainDeltaThreshold = 5.0  // trackTemp < ambientTemp - rainDelta → rain detected
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks conditions changes — temperature extremes and rain state
// approximation — with per-session one-shot flags.
type Monitor struct {
	mu sync.Mutex

	freezingReported bool
	highTempReported bool

	wasRaining bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects the current frame and returns events for conditions changes.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Session == nil {
		return nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	var out []Event

	ambientTemp := curr.Session.AmbientTemp
	trackTemp := curr.Session.TrackTemp

	// Freezing warning (once per session).
	if ambientTemp < freezingThresholdC && !m.freezingReported {
		out = append(out, Event{
			Type:      EventTrackFreezing,
			ExpiresAt: nowMS + 30_000,
			Payload:   map[string]any{"ambientTemp": ambientTemp, "trackTemp": trackTemp},
		})
		m.freezingReported = true
	}

	// High track temp warning (once per session).
	if ambientTemp > highTempThresholdC && !m.highTempReported {
		out = append(out, Event{
			Type:      EventTrackTempHigh,
			ExpiresAt: nowMS + 30_000,
			Payload:   map[string]any{"ambientTemp": ambientTemp, "trackTemp": trackTemp},
		})
		m.highTempReported = true
	}

	// Rain approximation: when track temp is significantly below ambient,
	// it's likely raining (evaporative cooling). Conversely, when track
	// temp recovers to near ambient, rain has stopped.
	isRaining := trackTemp < ambientTemp-rainDeltaThreshold

	if isRaining && !m.wasRaining {
		out = append(out, Event{
			Type:      EventRainStarted,
			ExpiresAt: nowMS + 60_000,
			Payload:   map[string]any{"ambientTemp": ambientTemp, "trackTemp": trackTemp},
		})
		m.wasRaining = true
	} else if !isRaining && m.wasRaining {
		out = append(out, Event{
			Type:      EventRainStopped,
			ExpiresAt: nowMS + 60_000,
			Payload:   map[string]any{"ambientTemp": ambientTemp, "trackTemp": trackTemp},
		})
		m.wasRaining = false
	}

	return out
}

// Reset clears all tracked state (useful for session restarts).
func (m *Monitor) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.freezingReported = false
	m.highTempReported = false
	m.wasRaining = false
}
