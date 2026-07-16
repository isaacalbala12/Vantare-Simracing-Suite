// Package watchedopponents tracks opponents that are "watched" (same
// class, within 5 positions of the player). It emits events when:
//   - A new opponent enters watched range
//   - An opponent leaves watched range (>5 positions or pitted)
//   - The gap to a watched opponent increases (>1 s change)
//   - The gap to a watched opponent decreases (>1 s change)
//
// Parity CC: Events/WatchedOpponents.cs (602 lines). CC additionally
// tracks sector times, tyre type changes, class changes, pit exits,
// and position changes — those are G3+ scope.
package watchedopponents

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	// EventWatchedNew fires when an opponent enters the watched range
	// (same class, within 5 positions).
	EventWatchedNew = "watched.new_opponent"
	// EventWatchedGone fires when a watched opponent leaves the watched
	// range (>5 positions away, pitted, or removed from frame).
	EventWatchedGone = "watched.opponent_gone"
	// EventWatchedGapIncreasing fires when the gap to a watched opponent
	// grows by more than 1 second since the last frame where they were
	// within range.
	EventWatchedGapIncreasing = "watched.gap_increasing"
	// EventWatchedGapDecreasing fires when the gap to a watched opponent
	// shrinks by more than 1 second since the last frame.
	EventWatchedGapDecreasing = "watched.gap_decreasing"
)

// WatchedOpponent stores per-opponent state between frames.
type WatchedOpponent struct {
	ID            int32
	DriverName    string
	VehicleClass  string
	GapSecs       float64
	GapTrend      string // "increasing", "decreasing", "stable"
	LastGapSecs   float64
	SeenInSectors [3]bool
}

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks opponents close to the player (same class, within 5
// positions) and emits gap/status events.
type Monitor struct {
	mu sync.Mutex

	playerClass string
	watched     map[int32]*WatchedOpponent
}

// NewMonitor creates a new Monitor with no watched opponents.
func NewMonitor() *Monitor {
	return &Monitor{
		watched: make(map[int32]*WatchedOpponent),
	}
}

// SetPlayerClass sets the player's vehicle class. Only opponents of the
// same class are eligible to be watched.
func (m *Monitor) SetPlayerClass(class string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.playerClass = class
}

// ResetSession clears all watched opponents (called on session change).
func (m *Monitor) ResetSession() {
	m.watched = make(map[int32]*WatchedOpponent)
}

// Trigger inspects vehicles in the current frame and emits watched
// opponent events based on gap changes and status transitions.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil {
		return nil
	}
	m.mu.Lock()
	playerClass := m.playerClass
	m.mu.Unlock()
	if playerClass == "" {
		return nil
	}

	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	// Current watched set for this frame (ids of opponents currently in range).
	currentWatched := make(map[int32]bool)
	var out []Event

	for i := range curr.Vehicles {
		v := &curr.Vehicles[i]
		if v.IsPlayer || v.ID <= 0 || v.VehicleClass == "" {
			continue
		}
		if v.VehicleClass != playerClass {
			continue
		}

		// Check if within 5 positions.
		if !withinFivePositions(player.Place, v.Place) {
			// If previously watched, emit gone.
			if _, wasWatched := m.watched[v.ID]; wasWatched {
				out = append(out, m.makeGoneEvent(nowMS, v))
				delete(m.watched, v.ID)
			}
			continue
		}

		currentWatched[v.ID] = true

		// Gap computation: use timeBehindLeader for both ahead and behind.
		// If opponent is ahead (lower TimeBehindLeader), gap = player - opp.
		// If opponent is behind (higher TimeBehindLeader), gap = opp - player.
		// Simplified: use the absolute difference in TimeBehindLeader.
		gap := v.TimeBehindLeader - player.TimeBehindLeader
		if gap < 0 {
			gap = -gap
		}

		existing, ok := m.watched[v.ID]
		if !ok {
			// New opponent entering watched range.
			m.watched[v.ID] = &WatchedOpponent{
				ID:           v.ID,
				DriverName:   v.DriverName,
				VehicleClass: v.VehicleClass,
				GapSecs:      gap,
				LastGapSecs:  gap,
				GapTrend:     "stable",
			}
			out = append(out, Event{
				Type:      EventWatchedNew,
				ExpiresAt: nowMS + 10_000,
				Payload: map[string]any{
					"id":         v.ID,
					"driverName": v.DriverName,
					"class":      v.VehicleClass,
					"gapSecs":    gap,
				},
			})
		} else {
			// Existing watched opponent — check gap trend.
			lastGap := existing.GapSecs
			existing.LastGapSecs = lastGap
			existing.GapSecs = gap

			delta := gap - lastGap
			if delta > 1.0 {
				existing.GapTrend = "increasing"
				out = append(out, Event{
					Type:      EventWatchedGapIncreasing,
					ExpiresAt: nowMS + 10_000,
					Payload: map[string]any{
						"id":         v.ID,
						"driverName": v.DriverName,
						"gapSecs":    gap,
						"deltaSecs":  delta,
					},
				})
			} else if delta < -1.0 {
				existing.GapTrend = "decreasing"
				out = append(out, Event{
					Type:      EventWatchedGapDecreasing,
					ExpiresAt: nowMS + 10_000,
					Payload: map[string]any{
						"id":         v.ID,
						"driverName": v.DriverName,
						"gapSecs":    gap,
						"deltaSecs":  delta,
					},
				})
			} else {
				existing.GapTrend = "stable"
			}
		}
	}

	// Check for opponents that were watched but are no longer in the frame
	// or no longer in range.
	for id, w := range m.watched {
		if !currentWatched[id] {
			out = append(out, Event{
				Type:      EventWatchedGone,
				ExpiresAt: nowMS + 10_000,
				Payload: map[string]any{
					"id":         id,
					"driverName": w.DriverName,
					"class":      w.VehicleClass,
				},
			})
			delete(m.watched, id)
		}
	}

	return out
}

// makeGoneEvent creates a WatchedGone event for an opponent leaving range.
func (m *Monitor) makeGoneEvent(nowMS int64, v *telemetry.VehicleScoring) Event {
	return Event{
		Type:      EventWatchedGone,
		ExpiresAt: nowMS + 10_000,
		Payload: map[string]any{
			"id":         v.ID,
			"driverName": v.DriverName,
			"class":      v.VehicleClass,
		},
	}
}

// withinFivePositions returns true if the opponent's position is within
// 5 places of the player's position. Both use 1-indexed race position.
func withinFivePositions(playerPlace, oppPlace uint8) bool {
	if playerPlace == 0 || oppPlace == 0 {
		return true // assume within range if position unknown
	}
	diff := int32(playerPlace) - int32(oppPlace)
	if diff < 0 {
		diff = -diff
	}
	return diff <= 5
}
