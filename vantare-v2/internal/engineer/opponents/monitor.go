// Package opponents implements an Opponents monitor: tracks each opponent's
// pitting state and detects rival best lap improvements.
//
// Parity CC: Events/Opponents.cs (tracks per-opponent state across
// laps to detect improvements, pitting transitions, and lead changes).
//
// v2.0 additions (iter-2):
//   - Class filtering: only fire best_lap/pitted for same-class opponents.
//   - Minimum laps: best_lap fires only when curr.Player.LapNumber >= 2.
//   - Cooldown: 60s suppression per event+opponent to prevent spam.
//   - EventOpponentClassDifferent fires once per different-class opponent
//     detected at first sighting.
//
// Iter-3 additions:
//   - EventLeaderPitted, EventCarAheadPitted, EventCarBehindPitted:
//     contextual pitting messages based on opponent place relative to player.
//   - EventLeadChanged: fires when player.Place == 1 (new leader). 60s cooldown.
//   - minImprovementBeforeReadingOpponentRaceTime = 0.05: best_lap requires
//     at least 0.05s improvement.
package opponents

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

const (
	// minLapsBeforeBestLap is the minimum player lap number before best_lap
	// events are emitted for opponents (mirrors CC behaviour).
	minLapsBeforeBestLap = 2
	// cooldownDurationMS is the minimum interval between re-firing the same
	// event type for the same opponent (in milliseconds).
	cooldownDurationMS = 60_000
	// minImprovementBeforeReadingOpponentRaceTime is the minimum best lap
	// improvement in seconds required to fire EventOpponentBestLap.
	// CC default: 0.05s.
	minImprovementForBestLap = 0.05
	// leadChangeCooldownMS is the minimum interval between lead change events.
	leadChangeCooldownMS = 60_000

	// retirementCooldownMS is the minimum interval between any retirement/DSQ
	// messages (global cooldown).
	retirementCooldownMS = 5_000
	// swapCooldownMS is the minimum interval between driver swap messages.
	swapCooldownMS = 10_000
)

// Event types emitted by Monitor.
const (
	// EventOpponentPitted fires when a previously-on-track opponent enters the
	// pit lane. Payload includes driver name and ID.
	EventOpponentPitted = "opponents.pitted"
	// EventOpponentBestLap fires when an opponent improves their personal best
	// lap time. Payload includes driver name, ID, and new best lap time.
	EventOpponentBestLap = "opponents.best_lap"
	// EventOpponentClassDifferent fires once when a vehicle of a different
	// class is first detected. Payload includes driver name, ID, and class.
	EventOpponentClassDifferent = "opponents.class_different"
	// EventLeaderPitted fires when the race leader (Place == 1) enters pits.
	EventLeaderPitted = "opponents.leader_pitted"
	// EventCarAheadPitted fires when the car immediately ahead
	// (Place == playerPlace - 1) enters pits.
	EventCarAheadPitted = "opponents.car_ahead_pitted"
	// EventCarBehindPitted fires when the car immediately behind
	// (Place == playerPlace + 1) enters pits.
	EventCarBehindPitted = "opponents.car_behind_pitted"
	// EventLeadChanged fires when the player becomes the new race leader
	// (Place becomes 1). 60-second cooldown.
	EventLeadChanged = "opponents.lead_changed"
	// EventOpponentRetired fires when an opponent's FinishStatus becomes "DNF".
	// CC: _announceAnyRetiredDrivers via retriedDriverNames in game state.
	EventOpponentRetired = "opponents.retired"
	// EventOpponentDSQ fires when an opponent's FinishStatus becomes "DSQ".
	// CC: _announceAnyDisqualifiedDrivers via disqualifiedDriverNames.
	EventOpponentDSQ = "opponents.disqualified"
	// EventDriverSwapped fires when an opponent disappears from the vehicle
	// list mid-session without a DNF/DSQ status. Lower confidence indicator
	// of a retirement or driver swap. 10s global cooldown.
	EventDriverSwapped = "opponents.driver_swapped"
	// EventOpponentExitedPits fires when an opponent leaves the pit lane.
	// Fires once per opponent per stint (dedup via notedExit).
	EventOpponentExitedPits = "opponents.exited_pits"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// opponentState tracks per-opponent state across frames.
type opponentState struct {
	InPits            bool
	BestLapTime       float64
	initialized       bool
	classDiffNotified bool
	announcedRetired  bool
	announcedDSQ      bool
	notedExit         bool // one-shot dedup for pit exit detection
}

// Monitor tracks per-opponent state for pitting transitions and best lap
// improvements. State is keyed by vehicle ID.
type Monitor struct {
	states       map[int32]*opponentState
	cooldowns    map[string]int64
	playerClass  string
	prevPlace    uint8 // player's place from previous frame (for lead change detection)
	lastLeadFire int64 // last time EventLeadChanged fired (cooldown)

	// Retirement/DSQ tracking.
	announcedGone    map[int32]bool // one-shot per opponent (swap/retirement/DSQ)
	lastRetirementMS int64          // global cooldown for DNF/DSQ messages (5s)
	lastSwapMS       int64          // global cooldown for swap messages (10s)
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{
		states:        make(map[int32]*opponentState),
		cooldowns:     make(map[string]int64),
		announcedGone: make(map[int32]bool),
	}
}

// SetPlayerClass sets the player's vehicle class for class-based filtering.
// Opponents with a different class will be reported via EventOpponentClassDifferent
// and excluded from best_lap and pitted events.
func (m *Monitor) SetPlayerClass(class string) {
	m.playerClass = class
}

// cooldownKey returns a unique string key for an event type + vehicle ID.
func cooldownKey(eventType string, vehicleID int32) string {
	return eventType + ":" + fmt.Sprint(vehicleID)
}

// canFire checks if an event can fire given the cooldown, and records the
// fire time if allowed.
func (m *Monitor) canFire(eventType string, vehicleID int32, nowMS int64) bool {
	key := cooldownKey(eventType, vehicleID)
	lastFire, ok := m.cooldowns[key]
	if ok && nowMS-lastFire < cooldownDurationMS {
		return false
	}
	m.cooldowns[key] = nowMS
	return true
}

// playerPlaceFromFrame extracts the player's current race position from
// the frame's vehicle list. Falls back to the previous known place.
func playerPlaceFromFrame(curr *telemetry.Frame) uint8 {
	if curr == nil {
		return 0
	}
	for i := range curr.Vehicles {
		if curr.Vehicles[i].IsPlayer {
			return curr.Vehicles[i].Place
		}
	}
	if curr.Player != nil {
		for i := range curr.Vehicles {
			if curr.Vehicles[i].ID == curr.Player.ID {
				return curr.Vehicles[i].Place
			}
		}
	}
	if len(curr.Vehicles) == 1 {
		return curr.Vehicles[0].Place
	}
	return 0
}

// Trigger inspects the current frame's vehicle list and returns events for
// opponents that changed pitting state or improved their best lap time.
// Player vehicle is excluded. Class filtering, min laps, and cooldown
// logic mirrors CrewChief behaviour.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}

	// Player lap number for min laps check.
	playerLaps := int32(0)
	playerPlace := uint8(0)
	if curr.Player != nil {
		playerLaps = curr.Player.LapNumber
		playerPlace = playerPlaceFromFrame(curr)
	}

	// Build prev lookup for state seeding.
	prevByID := make(map[int32]*telemetry.VehicleScoring)
	if prev != nil {
		for i := range prev.Vehicles {
			if !prev.Vehicles[i].IsPlayer && prev.Vehicles[i].ID > 0 {
				prevByID[prev.Vehicles[i].ID] = &prev.Vehicles[i]
			}
		}
	}

	var out []Event
	seen := make(map[int32]bool, len(curr.Vehicles))

	for i := range curr.Vehicles {
		v := &curr.Vehicles[i]
		if v.IsPlayer || v.ID <= 0 {
			continue
		}
		seen[v.ID] = true

		// Determine class match: same-class only if playerClass is set.
		sameClass := m.playerClass == "" || v.VehicleClass == "" || v.VehicleClass == m.playerClass

		st, ok := m.states[v.ID]
		if !ok {
			// First sighting: seed state from prev if available.
			pv, hasPrev := prevByID[v.ID]
			if hasPrev {
				st = &opponentState{
					InPits:      pv.InPits,
					BestLapTime: pv.BestLapTime,
					initialized: true,
				}
			} else {
				st = &opponentState{
					InPits:      v.InPits,
					BestLapTime: v.BestLapTime,
					initialized: true,
				}
			}
			m.states[v.ID] = st

			// Class-different notification at first sighting (once per opponent).
			out = append(out, m.checkClassDiff(v, st, nowMS, sameClass)...)

			if !hasPrev {
				// No prev: seed only, no events this frame.
				continue
			}
			// Fall through to compare seeded (prev) vs curr.
		}

		// Pitted: rising edge on InPits (same-class only, with cooldown).
		if sameClass && v.InPits && !st.InPits {
			st.notedExit = false // reset for next exit detection
			out = append(out, m.checkPitting(v, st, playerPlace, nowMS)...)
		}

		// Exited pits: falling edge on InPits, one-shot per stint.
		if sameClass && !v.InPits && st.InPits && !st.notedExit {
			st.notedExit = true
			out = append(out, Event{
				Type:      EventOpponentExitedPits,
				ExpiresAt: nowMS + 5000,
				Payload: map[string]any{
					"id":         v.ID,
					"driverName": v.DriverName,
				},
			})
		}

		// Best lap improvement: same-class only, min laps, cooldown, plus
		// min improvement threshold (CC: minImprovementBeforeReadingOpponentRaceTime = 0.05s).
		if sameClass {
			out = append(out, m.checkBestLap(v, st, playerLaps, nowMS)...)
		}

		// Retirement/DSQ detection: check FinishStatus for DNF/DSQ.
		out = append(out, m.checkRetirementDSQ(v, st, nowMS)...)

		st.InPits = v.InPits
		st.BestLapTime = v.BestLapTime
	}

	// --- Disappearance detection: opponent was in prev frame but is no longer
	// in curr, and hasn't been announced as DNF/DSQ → lower-confidence swap.
	out = append(out, m.checkDisappearance(prevByID, seen, nowMS)...)

	// --- Iter-3: Lead change detection (player.Place == 1, rising edge) ---
	out = append(out, m.checkLeadChange(playerPlace, nowMS)...)

	// Cleanup states, cooldowns, and announced maps for opponents no longer
	// in the session.
	for id := range m.states {
		if !seen[id] {
			delete(m.states, id)
			delete(m.announcedGone, id)
		}
	}
	for key := range m.cooldowns {
		// Parse cooldown key to extract vehicle ID (format: "eventType:ID").
		// Simple cleanup: delete cooldowns whose ID is no longer seen.
		var vid int32
		if _, err := fmt.Sscanf(key, "%*[^:]:%d", &vid); err == nil {
			if !seen[vid] {
				delete(m.cooldowns, key)
			}
		}
	}

	return out
}

// checkClassDiff returns an EventOpponentClassDifferent event on first sighting
// of a different-class opponent (once per opponent, requires playerClass set).
func (m *Monitor) checkClassDiff(v *telemetry.VehicleScoring, st *opponentState, nowMS int64, sameClass bool) []Event {
	if !st.classDiffNotified && m.playerClass != "" && v.VehicleClass != "" && !sameClass {
		st.classDiffNotified = true
		return []Event{{
			Type:      EventOpponentClassDifferent,
			ExpiresAt: nowMS + 10_000,
			Payload: map[string]any{
				"id":         v.ID,
				"driverName": v.DriverName,
				"class":      v.VehicleClass,
			},
		}}
	}
	return nil
}

// checkPitting returns events for rising-edge InPits detection including
// contextual variants (leader, car-ahead, car-behind).
func (m *Monitor) checkPitting(v *telemetry.VehicleScoring, st *opponentState, playerPlace uint8, nowMS int64) []Event {
	var out []Event
	if m.canFire(EventOpponentPitted, v.ID, nowMS) {
		out = append(out, Event{
			Type:      EventOpponentPitted,
			ExpiresAt: nowMS + 5000,
			Payload: map[string]any{
				"id":         v.ID,
				"driverName": v.DriverName,
			},
		})
	}
	// Leader pitting (Place == 1).
	if v.Place == 1 && m.canFire(EventLeaderPitted, v.ID, nowMS) {
		out = append(out, Event{
			Type:      EventLeaderPitted,
			ExpiresAt: nowMS + 5000,
			Payload: map[string]any{
				"id":         v.ID,
				"driverName": v.DriverName,
				"place":      v.Place,
			},
		})
	}
	// Car ahead pitting (Place == playerPlace - 1).
	if playerPlace > 1 && v.Place == playerPlace-1 && m.canFire(EventCarAheadPitted, v.ID, nowMS) {
		out = append(out, Event{
			Type:      EventCarAheadPitted,
			ExpiresAt: nowMS + 5000,
			Payload: map[string]any{
				"id":         v.ID,
				"driverName": v.DriverName,
				"place":      v.Place,
			},
		})
	}
	// Car behind pitting (Place == playerPlace + 1).
	if v.Place == playerPlace+1 && m.canFire(EventCarBehindPitted, v.ID, nowMS) {
		out = append(out, Event{
			Type:      EventCarBehindPitted,
			ExpiresAt: nowMS + 5000,
			Payload: map[string]any{
				"id":         v.ID,
				"driverName": v.DriverName,
				"place":      v.Place,
			},
		})
	}
	return out
}

// checkBestLap returns an EventOpponentBestLap when an opponent improves
// their personal best lap time beyond the minimum improvement threshold.
func (m *Monitor) checkBestLap(v *telemetry.VehicleScoring, st *opponentState, playerLaps int32, nowMS int64) []Event {
	if playerLaps >= minLapsBeforeBestLap && v.BestLapTime > 0 && st.BestLapTime > 0 &&
		v.BestLapTime < st.BestLapTime-minImprovementForBestLap {
		if m.canFire(EventOpponentBestLap, v.ID, nowMS) {
			return []Event{{
				Type:      EventOpponentBestLap,
				ExpiresAt: nowMS + 8000,
				Payload: map[string]any{
					"id":             v.ID,
					"driverName":     v.DriverName,
					"bestLapTimeSec": v.BestLapTime,
					"improvement":    st.BestLapTime - v.BestLapTime,
				},
			}}
		}
	}
	return nil
}

// checkRetirementDSQ returns events when an opponent's FinishStatus becomes
// "DNF" (retired) or "DSQ" (disqualified), with global 5-second cooldown.
func (m *Monitor) checkRetirementDSQ(v *telemetry.VehicleScoring, st *opponentState, nowMS int64) []Event {
	var out []Event
	globalRetirementOK := m.lastRetirementMS == 0 || nowMS-m.lastRetirementMS >= retirementCooldownMS
	if v.FinishStatus == "DNF" && !st.announcedRetired {
		if globalRetirementOK {
			m.lastRetirementMS = nowMS
			st.announcedRetired = true
			out = append(out, Event{
				Type:      EventOpponentRetired,
				ExpiresAt: nowMS + 8000,
				Payload: map[string]any{
					"id":         v.ID,
					"driverName": v.DriverName,
				},
			})
		}
	}
	if v.FinishStatus == "DSQ" && !st.announcedDSQ {
		// Re-check global cooldown with updated lastRetirementMS (in case
		// a DNF just fired on this same frame, the DSQ is suppressed).
		globalOK := m.lastRetirementMS == 0 || nowMS-m.lastRetirementMS >= retirementCooldownMS
		if globalOK {
			m.lastRetirementMS = nowMS
			st.announcedDSQ = true
			out = append(out, Event{
				Type:      EventOpponentDSQ,
				ExpiresAt: nowMS + 8000,
				Payload: map[string]any{
					"id":         v.ID,
					"driverName": v.DriverName,
				},
			})
		}
	}
	return out
}

// checkDisappearance returns EventDriverSwapped events for opponents that
// were present in the previous frame but are no longer visible, have not
// been announced as DNF/DSQ, and are within the global swap cooldown.
func (m *Monitor) checkDisappearance(prevByID map[int32]*telemetry.VehicleScoring, seen map[int32]bool, nowMS int64) []Event {
	var out []Event
	globalSwapOK := m.lastSwapMS == 0 || nowMS-m.lastSwapMS >= swapCooldownMS
	for id, pv := range prevByID {
		if !seen[id] && globalSwapOK && !m.announcedGone[id] {
			if !pv.IsPlayer && isOpponentAnnounced(m, id) {
				continue
			}
			m.announcedGone[id] = true
			m.lastSwapMS = nowMS
			out = append(out, Event{
				Type:      EventDriverSwapped,
				ExpiresAt: nowMS + 8000,
				Payload: map[string]any{
					"id":         id,
					"driverName": pv.DriverName,
				},
			})
		}
	}
	return out
}

// checkLeadChange returns EventLeadChanged when the player becomes the new
// race leader (Place == 1, rising edge) respecting the lead change cooldown.
func (m *Monitor) checkLeadChange(playerPlace uint8, nowMS int64) []Event {
	leadOK := m.lastLeadFire == 0 || nowMS-m.lastLeadFire >= leadChangeCooldownMS
	if playerPlace == 1 && m.prevPlace != 1 && playerPlace != 0 && leadOK {
		m.lastLeadFire = nowMS
		m.prevPlace = playerPlace
		return []Event{{
			Type:      EventLeadChanged,
			ExpiresAt: nowMS + 8000,
			Payload: map[string]any{
				"place": playerPlace,
			},
		}}
	}
	m.prevPlace = playerPlace
	return nil
}

// isOpponentAnnounced checks if an opponent (by ID) has already been announced
// as retired, DSQ, or gone. Checks opponentState fields (if available) and the
// announcedGone map.
func isOpponentAnnounced(m *Monitor, id int32) bool {
	if m.announcedGone[id] {
		return true
	}
	if st, ok := m.states[id]; ok {
		return st.announcedRetired || st.announcedDSQ
	}
	return false
}
