// Package multiclass monitors multi-class traffic and emits structured
// events when the player is being caught by faster class cars or is
// catching slower class cars, matching CrewChief (CC) MulticlassWarnings
// full behaviour for:
//   - 10 event types covering single/multiple, fighting, class-leader, and
//     session-first caught/catching messages
//   - TrackLengthClass-dependent gates (min laps / min time)
//   - Fighting detection (2+ opponents of same class within 30 m)
//   - Class leader detection
//   - Per-session caight-by / catching-slower tracking
//
// CC source: Events/MulticlassWarnings.cs (891 lines).
package multiclass

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor. These correspond one-to-one to the
// 10 CC audio folder groups (the two existing MVP events are preserved,
// making 10 total; faster_behind and slower_ahead are the base cases).
const (
	// Single faster car behind (non-fighting, non-leader).
	EventFasterBehind = "multiclass.faster_behind"
	// Single faster car behind, fighting another car for position.
	EventFasterBehindFighting = "multiclass.faster_behind_fighting"
	// Single faster car behind who is the class leader.
	EventFasterBehindClassLdr = "multiclass.faster_behind_class_leader"
	// Multiple faster cars behind.
	EventFasterCarsBehind = "multiclass.faster_cars_behind"
	// Single slower car ahead (non-fighting, non-leader).
	EventSlowerAhead = "multiclass.slower_ahead"
	// Single slower car ahead, fighting another car for position.
	EventSlowerAheadFighting = "multiclass.slower_ahead_fighting"
	// Single slower car ahead who is the class leader.
	EventSlowerAheadClassLdr = "multiclass.slower_ahead_class_leader"
	// Multiple slower cars ahead.
	EventSlowerCarsAhead = "multiclass.slower_cars_ahead"
	// First time this session that faster class opponents are detected
	// behind the player ("you are being caught by faster cars").
	EventCaughtByFasterCars = "multiclass.caught_by_faster_cars"
	// First time this session that slower class opponents are detected
	// ahead of the player ("you are catching slower cars").
	EventCatchingSlowerCars = "multiclass.catching_slower_cars"
)

// CC parity constants.
const (
	// Warning zones (metres).
	slowerCarWarningZoneStart         = -15.0 // opponent ahead closer than this is too close
	slowerCarWarningZoneEndMax        = -100.0
	slowerCarWarningZoneEndShort      = -150.0
	slowerCarWarningZoneEndNormal     = -200.0
	slowerCarWarningZoneEndLong       = -300.0
	fasterCarWarningZoneStartShort    = 100.0
	fasterCarWarningZoneStartMin      = 100.0
	fasterCarWarningZoneStartNormal   = 200.0
	fasterCarWarningZoneStartLong     = 250.0
	fasterCarWarningZoneEnd           = 15.0
	maxSeparateToBeConsideredFighting = 30.0
	classSeparationAdjustment         = 10.0

	// Timings (milliseconds).
	timeBetweenChecksMS int64 = 4_000
	timeToSettleMS      int64 = 6_000
)

// TrackLengthClass categories matching CC TrackData.TrackLengthClass.
type TrackLengthClass int

const (
	TrackVeryShort TrackLengthClass = iota
	TrackShort
	TrackMedium
	TrackLong
	TrackVeryLong
)

// minLapsForTrackLengthClass matches CC line 140-144.
var minLapsForTrackLengthClass = map[TrackLengthClass]int32{
	TrackVeryShort: 5,
	TrackShort:     4,
	TrackMedium:    3,
	TrackLong:      2,
	TrackVeryLong:  2,
}

// minTimeForTrackLengthClass in seconds (CC line 148-152).
var minTimeForTrackLengthClass = map[TrackLengthClass]float64{
	TrackVeryShort: 60,
	TrackShort:     90,
	TrackMedium:    120,
	TrackLong:      210,
	TrackVeryLong:  390,
}

// fasterClassSpeeds is a hardcoded lookup of CC car class speeds.
// Classes not listed are assumed same-speed as player (no warning).
var fasterClassSpeeds = map[string]float64{
	"HYPERCAR": 340,
	"LMP1":     340,
	"LMP2":     315,
	"GTE":      310,
	"GT3":      290,
	"GT4":      270,
	"LMP3":     300,
}

// classifySpeed returns "faster", "slower", or "same" relative to the
// player's class. If either class is unknown, returns "same".
func classifySpeed(playerClass, opponentClass string) string {
	playerSpeed, ok1 := fasterClassSpeeds[playerClass]
	if !ok1 {
		return "same"
	}
	oppSpeed, ok2 := fasterClassSpeeds[opponentClass]
	if !ok2 {
		return "same"
	}
	if oppSpeed > playerSpeed+5.0 {
		return "faster"
	}
	if oppSpeed < playerSpeed-5.0 {
		return "slower"
	}
	return "same"
}

// classifyTrackLength maps track length (metres) to a TrackLengthClass.
func classifyTrackLength(length float64) TrackLengthClass {
	switch {
	case length <= 0:
		return TrackMedium
	case length < 2500:
		return TrackVeryShort
	case length < 4000:
		return TrackShort
	case length < 6000:
		return TrackMedium
	case length < 8000:
		return TrackLong
	default:
		return TrackVeryLong
	}
}

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// scanResult aggregates multi-class opponent data for a single scan tick.
type scanResult struct {
	numFaster      int
	numSlower      int
	fasterLeader   bool
	slowerLeader   bool
	fasterFighting bool
	slowerFighting bool
	fasterIDs      []int32
	slowerIDs      []int32
	fasterClass    string
	slowerClass    string
}

// Monitor tracks faster/slower class opponents and emits structured
// multi-class events with full CC parity.
type Monitor struct {
	mu sync.Mutex

	playerClass string

	// Cooldown tracking.
	lastWarningMS    map[int32]int64
	lastFasterEmitMS int64
	lastSlowerEmitMS int64
	lastFasterOppID  int32
	lastSlowerOppID  int32
	lastCheckMS      int64

	// Session tracking (CC line 108-109).
	caughtByFasterClassInThisSession bool
	caughtSlowerClassInThisSession   bool

	// Track which opponent driver names we've warned about (to avoid
	// re-announcing the same cars; CC line 93-94).
	warnedFasterDrivers map[string]bool
	warnedSlowerDrivers map[string]bool
}

// NewMonitor creates a Monitor with no player class set.
func NewMonitor() *Monitor {
	return &Monitor{
		lastWarningMS:       make(map[int32]int64),
		warnedFasterDrivers: make(map[string]bool),
		warnedSlowerDrivers: make(map[string]bool),
	}
}

// SetPlayerClass sets the player's vehicle class for relative speed
// comparison. Without it, no multiclass warnings are emitted.
func (m *Monitor) SetPlayerClass(class string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.playerClass = class
}

// ResetSession resets per-session flags (called on session transition).
func (m *Monitor) ResetSession() {
	m.caughtByFasterClassInThisSession = false
	m.caughtSlowerClassInThisSession = false
	m.warnedFasterDrivers = make(map[string]bool)
	m.warnedSlowerDrivers = make(map[string]bool)
	m.lastFasterEmitMS = 0
	m.lastSlowerEmitMS = 0
	m.lastFasterOppID = 0
	m.lastSlowerOppID = 0
	m.lastCheckMS = 0
}

// Trigger inspects opponents and emits multi-class events.
// Full CC parity: fighting detection, class leader, multiple/single,
// session-first messages.
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
	if player == nil || curr.Session == nil {
		return nil
	}
	if curr.Player == nil {
		return nil
	}

	// --- Gates ---
	tlc := classifyTrackLength(curr.Session.TrackLength)
	minLaps := minLapsForTrackLengthClass[tlc]
	if curr.Player.LapNumber > 0 && curr.Player.LapNumber < minLaps {
		return nil
	}
	minTime := minTimeForTrackLengthClass[tlc]
	if curr.Session.SessionTime > 0 && curr.Session.SessionTime < minTime &&
		curr.Player.LapNumber < minLaps {
		return nil
	}

	// --- Cooldown: scan every 4 s (first call always passes) ---
	if m.lastCheckMS != 0 && nowMS-m.lastCheckMS < timeBetweenChecksMS {
		return nil
	}
	m.lastCheckMS = nowMS

	// --- Scan ---
	res := m.scanOpponents(curr, player, playerClass)
	if res == nil {
		return nil
	}

	return m.emitEvents(nowMS, res, curr)
}

// scanOpponents iterates vehicles and builds a scanResult.
func (m *Monitor) scanOpponents(curr *telemetry.Frame, player *telemetry.VehicleScoring, playerClass string) *scanResult {
	// Determine track-length-dependent zone sizes.
	slowerEnd := slowerCarWarningZoneEndNormal
	fasterStart := fasterCarWarningZoneStartNormal
	tlc := classifyTrackLength(curr.Session.TrackLength)
	if tlc == TrackLong || tlc == TrackVeryLong {
		slowerEnd = slowerCarWarningZoneEndLong
		fasterStart = fasterCarWarningZoneStartLong
	} else if tlc == TrackShort || tlc == TrackVeryShort {
		slowerEnd = slowerCarWarningZoneEndShort
		fasterStart = fasterCarWarningZoneStartShort
	}

	res := &scanResult{}

	// Collect ALL opponents of faster/slower classes for fighting
	// detection (even those outside the warning zone). We need to know
	// whether a detected car is fighting with another car, even if that
	// other car is outside the zone.
	var allFaster []oppInfo
	var allSlower []oppInfo

	for i := range curr.Vehicles {
		v := &curr.Vehicles[i]
		if v.IsPlayer || v.ID <= 0 || v.VehicleClass == "" {
			continue
		}
		if v.VehicleClass == playerClass {
			continue
		}

		rel := classifySpeed(playerClass, v.VehicleClass)
		if rel == "same" {
			continue
		}

		// Normalised longitudinal separation.
		playerLapDist := player.LapDistance
		trackLen := curr.Session.TrackLength
		if trackLen <= 0 {
			trackLen = 5000
		}
		halfTrack := trackLen / 2.0

		sep := playerLapDist - v.LapDistance
		if sep > halfTrack {
			sep = trackLen - sep
		} else if sep < -halfTrack {
			sep = trackLen + sep
		}

		// Collect separation info for fighting detection regardless of
		// zone status.
		if rel == "faster" {
			allFaster = append(allFaster, oppInfo{
				id: v.ID, driverName: v.DriverName,
				separation: sep, totalLaps: v.TotalLaps,
			})
			if res.fasterClass == "" {
				res.fasterClass = v.VehicleClass
			}
			// Only count if within the warning zone.
			if sep > fasterCarWarningZoneEnd && sep < fasterStart {
				res.numFaster++
				res.fasterIDs = append(res.fasterIDs, v.ID)
				if isClassLeader(v, &curr.Vehicles) {
					res.fasterLeader = true
				}
			}
		} else {
			allSlower = append(allSlower, oppInfo{
				id: v.ID, driverName: v.DriverName,
				separation: sep, totalLaps: v.TotalLaps,
			})
			if res.slowerClass == "" {
				res.slowerClass = v.VehicleClass
			}
			if sep < slowerCarWarningZoneStart && sep > slowerEnd {
				res.numSlower++
				res.slowerIDs = append(res.slowerIDs, v.ID)
				if isClassLeader(v, &curr.Vehicles) {
					res.slowerLeader = true
				}
			}
		}
	}

	// Fighting detection: check ALL same-class opponents (including those
	// outside the zone) for proximity within 30 m on the same lap.
	res.fasterFighting = hasFighting(allFaster)
	res.slowerFighting = hasFighting(allSlower)

	if res.numFaster == 0 && res.numSlower == 0 {
		return nil
	}
	return res
}

// isClassLeader returns true if the vehicle is first in its class
// (highest lap progress). Requires at least 2 vehicles of that class
// to be present — a single car alone is not a "class leader".
func isClassLeader(v *telemetry.VehicleScoring, vehicles *[]telemetry.VehicleScoring) bool {
	var classCount int
	vProgress := float64(v.TotalLaps)*1e6 + v.LapDistance
	for i := range *vehicles {
		o := &(*vehicles)[i]
		if o.VehicleClass != v.VehicleClass {
			continue
		}
		classCount++
		if o.ID == v.ID {
			continue
		}
		oProgress := float64(o.TotalLaps)*1e6 + o.LapDistance
		if oProgress > vProgress {
			return false
		}
	}
	return classCount >= 2
}

// hasFighting returns true if any two opponents on the same lap are
// within maxSeparateToBeConsideredFighting of each other.
func hasFighting(opps []oppInfo) bool {
	for i := 0; i < len(opps); i++ {
		for j := i + 1; j < len(opps); j++ {
			if opps[i].totalLaps != opps[j].totalLaps {
				continue
			}
			diff := opps[i].separation - opps[j].separation
			if diff < 0 {
				diff = -diff
			}
			if diff < maxSeparateToBeConsideredFighting {
				return true
			}
		}
	}
	return false
}

// emitEvents translates a scanResult into one or more Events.
func (m *Monitor) emitEvents(nowMS int64, res *scanResult, curr *telemetry.Frame) []Event {
	var out []Event

	// Session-first "caught by faster cars".
	if res.numFaster > 0 && !m.caughtByFasterClassInThisSession {
		m.caughtByFasterClassInThisSession = true
		payload := map[string]any{"numCars": res.numFaster}
		if res.fasterClass != "" {
			payload["class"] = res.fasterClass
		}
		out = append(out, Event{
			Type:      EventCaughtByFasterCars,
			ExpiresAt: nowMS + 10_000,
			Payload:   payload,
		})
	}

	// Session-first "catching slower cars".
	if res.numSlower > 0 && !m.caughtSlowerClassInThisSession {
		m.caughtSlowerClassInThisSession = true
		payload := map[string]any{"numCars": res.numSlower}
		if res.slowerClass != "" {
			payload["class"] = res.slowerClass
		}
		out = append(out, Event{
			Type:      EventCatchingSlowerCars,
			ExpiresAt: nowMS + 10_000,
			Payload:   payload,
		})
	}

	// Faster car(s) behind.
	if res.numFaster > 0 {
		m.lastFasterEmitMS = nowMS
		if len(res.fasterIDs) > 0 {
			m.lastFasterOppID = res.fasterIDs[0]
		}

		if res.numFaster == 1 {
			var typ string
			payload := map[string]any{"numCars": 1}
			if res.fasterClass != "" {
				payload["class"] = res.fasterClass
			}
			if res.fasterLeader {
				typ = EventFasterBehindClassLdr
				payload["classLeader"] = true
			} else if res.fasterFighting {
				typ = EventFasterBehindFighting
				payload["fighting"] = true
			} else {
				typ = EventFasterBehind
			}
			if len(res.fasterIDs) > 0 {
				payload["id"] = res.fasterIDs[0]
			}
			out = append(out, Event{
				Type:      typ,
				ExpiresAt: nowMS + 10_000,
				Payload:   payload,
			})
		} else {
			payload := map[string]any{
				"numCars": res.numFaster,
				"ids":     res.fasterIDs,
			}
			if res.fasterClass != "" {
				payload["class"] = res.fasterClass
			}
			out = append(out, Event{
				Type:      EventFasterCarsBehind,
				ExpiresAt: nowMS + 10_000,
				Payload:   payload,
			})
		}
	}

	// Slower car(s) ahead.
	if res.numSlower > 0 {
		m.lastSlowerEmitMS = nowMS
		if len(res.slowerIDs) > 0 {
			m.lastSlowerOppID = res.slowerIDs[0]
		}

		if res.numSlower == 1 {
			var typ string
			payload := map[string]any{"numCars": 1}
			if res.slowerClass != "" {
				payload["class"] = res.slowerClass
			}
			if res.slowerLeader {
				typ = EventSlowerAheadClassLdr
				payload["classLeader"] = true
			} else if res.slowerFighting {
				typ = EventSlowerAheadFighting
				payload["fighting"] = true
			} else {
				typ = EventSlowerAhead
			}
			if len(res.slowerIDs) > 0 {
				payload["id"] = res.slowerIDs[0]
			}
			out = append(out, Event{
				Type:      typ,
				ExpiresAt: nowMS + 10_000,
				Payload:   payload,
			})
		} else {
			payload := map[string]any{
				"numCars": res.numSlower,
				"ids":     res.slowerIDs,
			}
			if res.slowerClass != "" {
				payload["class"] = res.slowerClass
			}
			out = append(out, Event{
				Type:      EventSlowerCarsAhead,
				ExpiresAt: nowMS + 10_000,
				Payload:   payload,
			})
		}
	}

	return out
}

// canEmitFaster enforces CC-style cooldowns.
func (m *Monitor) canEmitFaster(oppID int32, nowMS int64) bool {
	if m.lastFasterEmitMS == 0 {
		return true
	}
	if nowMS-m.lastFasterEmitMS < timeBetweenChecksMS {
		return false
	}
	if oppID == m.lastFasterOppID && nowMS-m.lastFasterEmitMS < timeToSettleMS {
		return false
	}
	return true
}

// canEmitSlower mirrors canEmitFaster for the slower direction.
func (m *Monitor) canEmitSlower(oppID int32, nowMS int64) bool {
	if m.lastSlowerEmitMS == 0 {
		return true
	}
	if nowMS-m.lastSlowerEmitMS < timeBetweenChecksMS {
		return false
	}
	if oppID == m.lastSlowerOppID && nowMS-m.lastSlowerEmitMS < timeToSettleMS {
		return false
	}
	return true
}

// oppInfo is used internally for fighting detection.
type oppInfo struct {
	id         int32
	driverName string
	separation float64
	totalLaps  int16
}
