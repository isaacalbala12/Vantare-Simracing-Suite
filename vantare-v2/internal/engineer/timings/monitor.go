// Package timings implements a minimal Timings monitor for alpha 1:
// periodic reports of the player's gap to the car ahead/behind. CC
// Timings.cs uses a per-game `frequency_of_gap_*_reports` setting; we
// hardcode a sensible default (60s) until the user setting lands.
//
// Parity CC: Events/Timings.cs (line 55, 58 gap-to-leader / gap-to-next
// frequencies). MVP emits EventGapReport on a fixed cadence.
package timings

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// EventGapReport is emitted periodically with the player's gap to
// leader and next car.
const EventGapReport = "timings.gap_report"

// DefaultReportIntervalSec is the cadence for gap reports. CC default
// is user-configurable; this is a reasonable middle ground.
const DefaultReportIntervalSec = 60

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks gap reporting cadence.
type Monitor struct {
	intervalMS  int64
	lastReportMS int64
	initialized bool
}

// NewMonitor creates a Monitor with the default 60s interval.
func NewMonitor() *Monitor {
	return &Monitor{intervalMS: DefaultReportIntervalSec * 1000}
}

// NewMonitorWithInterval creates a Monitor with a custom interval.
func NewMonitorWithInterval(intervalSec int64) *Monitor {
	return &Monitor{intervalMS: intervalSec * 1000}
}

// Trigger emits a gap report if enough time has elapsed since the last
// one. Race condition (player actually being lapped) is detected via
// TimeBehindLeader<=0 (no leader / wrong way).
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}
	player := playerVehicle(curr)
	if player == nil {
		return nil
	}

	// Skip if no leader or negative gap.
	if player.TimeBehindLeader < 0 {
		return nil
	}

	if !m.initialized {
		m.lastReportMS = nowMS
		m.initialized = true
		return nil
	}

	if nowMS-m.lastReportMS < m.intervalMS {
		return nil
	}
	m.lastReportMS = nowMS

	return []Event{{
		Type:      EventGapReport,
		ExpiresAt: nowMS + 5000,
		Payload: map[string]any{
			"gapToLeaderSec": player.TimeBehindLeader,
			"gapToNextSec":   player.TimeBehindNext,
		},
	}}
}

func playerVehicle(frame *telemetry.Frame) *telemetry.VehicleScoring {
	if frame == nil {
		return nil
	}
	for i := range frame.Vehicles {
		if frame.Vehicles[i].IsPlayer {
			return &frame.Vehicles[i]
		}
	}
	if frame.Player != nil {
		for i := range frame.Vehicles {
			if frame.Vehicles[i].ID == frame.Player.ID {
				return &frame.Vehicles[i]
			}
		}
	}
	if len(frame.Vehicles) == 1 {
		return &frame.Vehicles[0]
	}
	return nil
}