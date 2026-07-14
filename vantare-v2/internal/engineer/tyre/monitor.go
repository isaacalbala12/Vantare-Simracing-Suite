// Package tyre implements a Tyre monitor: detects when the player's tyre
// temperature or wear crosses predefined thresholds and emits the
// corresponding events.
//
// Parity CC: CrewChief TyreMonitor (TyreMonitor.cs). CC thresholds:
//   - maxWarmUnknownRaceTyreTempPeak = 117 (°C) → tempHighFireThreshold
//   - maxHotUnknownRaceTyreTempPeak  = 137 (°C) → tempOverheatingFireThreshold
//   - optimal window                 = 70–117 °C
//   - WORN_OUT                       = 75 (% wear) → wearHighFireThreshold
//
// Vantare uses CC defaults to avoid confusing users who switch between tools.
// Hysteresis prevents event spam: 20°C for temperature, 10pp for wear.
//
// Iter-3 additions:
//   - Laps gate: temp/wear events suppressed when player lap < 2.
//   - EventTyreWearMinor: 20-50% wear pre-warning with 2-min cooldown.
package tyre

import "github.com/vantare/overlays/v2/internal/engineer/telemetry"

// Thresholds and hysteresis values for tyre temperature and wear events.
// Fire thresholds determine when the event first fires; re-arm thresholds
// (with hysteresis) prevent duplicate spam until the tyres have clearly
// left the problem zone. All values aligned with CrewChief defaults.
const (
	// Tyre temperature thresholds (Celsius).
	// CC: maxWarmUnknownRaceTyreTempPeak = 117
	tempHighFireThreshold  = 117
	tempHighReArmThreshold = 97 // 20°C below fire threshold

	tempOptimalMin      = 70
	tempOptimalMax      = 117
	tempOptimalReArmMin = 65
	tempOptimalReArmMax = 122

	// CC: maxHotUnknownRaceTyreTempPeak = 137
	tempOverheatingFireThreshold  = 137
	tempOverheatingReArmThreshold = 117 // 20°C below fire threshold

	// Tyre wear thresholds (percent 0–100).
	// CC uses WORN_OUT (>75%) as a single worn threshold.
	wearHighFireThreshold  = 75
	wearHighReArmThreshold = 65

	// Laps gate: suppress temp/wear events during first 2 laps.
	// CC: lapsIntoSessionBeforeTempMessage = 2
	minLapsBeforeTempMessages = 2

	// Wear minor thresholds (20-50%, pre-warning before worn-out).
	wearMinorFireThreshold  = 20
	wearMinorReArmThreshold = 10

	// wearMinorCooldownMS is the minimum interval between wear minor events.
	wearMinorCooldownMS = 120_000 // 2 minutes

	// Brake temperature thresholds (Celsius). CC: COLD < 200, WARM < 600,
	// HOT < 800, COOKING >= 800. We simplify to HOT > 500, COOKING > 700.
	brakeHotThreshold      = 500.0
	brakeCookingThreshold  = 700.0
	brakeReArmThreshold    = 300.0
)

// Event types emitted by Monitor.
const (
	EventTyreTempHigh        = "tyre.temp_high"
	EventTyreTempOptimal     = "tyre.temp_optimal"
	EventTyreTempOverheating = "tyre.temp_overheating"
	EventTyreWearHigh        = "tyre.wear_high"
	EventTyreWearMinor       = "tyre.wear_minor"
	// Brake temperature events (CC parity: cold/hot/cooking per axle).
	EventBrakeTempFrontHot   = "tyre.brake_front_hot"
	EventBrakeTempRearHot    = "tyre.brake_rear_hot"
	EventBrakeTempFrontCooking = "tyre.brake_front_cooking"
	EventBrakeTempRearCooking  = "tyre.brake_rear_cooking"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor tracks tyre temperature and wear thresholds with hysteresis
// to prevent duplicate event spam.
type Monitor struct {
	tempHighFired        bool
	tempOptimalFired     bool
	tempOverheatingFired bool
	wearHighFired        bool
	wearMinorFired       bool
	lastWearMinorFire    int64
	// Brake temp state (per axle, with hysteresis)
	brakeFrontHotFired   bool
	brakeRearHotFired    bool
	brakeFrontCookFired  bool
	brakeRearCookFired   bool
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// Trigger inspects the current frame's player tyre data and returns
// events for threshold crossings. prev is unused (kept for interface
// compatibility).
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Player == nil {
		return nil
	}
	p := curr.Player

	// Gate: suppress temp/wear events during first 2 laps (CC: lapsIntoSessionBeforeTempMessage = 2).
	// Re-arm logic still runs so state is ready when lap 2 arrives.
	lapOK := p.LapNumber >= minLapsBeforeTempMessages

	var out []Event

	// --- Tyre Temperature High (any tyre > 117°C) ---
	highTempWheel, highTempVal := firstExceedingTemp(p, tempHighFireThreshold)
	if lapOK && highTempWheel != "" && !m.tempHighFired {
		out = append(out, Event{
			Type:      EventTyreTempHigh,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"wheel": highTempWheel, "temperature": highTempVal},
		})
		m.tempHighFired = true
	}
	// Re-arm: all tyres below re-arm threshold.
	if allTempsBelow(p, tempHighReArmThreshold) {
		m.tempHighFired = false
	}

	// --- Tyre Temperature Overheating (any tyre > 137°C) ---
	overheatWheel, overheatVal := firstExceedingTemp(p, tempOverheatingFireThreshold)
	if lapOK && overheatWheel != "" && !m.tempOverheatingFired {
		out = append(out, Event{
			Type:      EventTyreTempOverheating,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"wheel": overheatWheel, "temperature": overheatVal},
		})
		m.tempOverheatingFired = true
	}
	// Re-arm: all tyres below re-arm threshold.
	if allTempsBelow(p, tempOverheatingReArmThreshold) {
		m.tempOverheatingFired = false
	}

	// --- Tyre Temperature Optimal (all tyres 70–117°C) ---
	if lapOK && allTempsInRange(p, tempOptimalMin, tempOptimalMax) && !m.tempOptimalFired {
		out = append(out, Event{
			Type:      EventTyreTempOptimal,
			ExpiresAt: nowMS + 15_000,
			Payload:   map[string]any{},
		})
		m.tempOptimalFired = true
	}
	// Re-arm: any tyre outside the wider hysteresis window.
	if !allTempsInRange(p, tempOptimalReArmMin, tempOptimalReArmMax) {
		m.tempOptimalFired = false
	}

	// --- Tyre Wear High (any tyre > 75%, CC WORN_OUT) ---
	highWearWheel, highWearVal := firstExceedingWear(p, wearHighFireThreshold)
	if lapOK && highWearWheel != "" && !m.wearHighFired {
		out = append(out, Event{
			Type:      EventTyreWearHigh,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"wheel": highWearWheel, "wearPercent": highWearVal},
		})
		m.wearHighFired = true
	}
	// Re-arm: all wear below re-arm threshold.
	if allWearsBelow(p, wearHighReArmThreshold) {
		m.wearHighFired = false
	}

	// --- Tyre Wear Minor (20-50%, pre-warning before worn-out, 2-min cooldown) ---
	minorWearWheel, minorWearVal := firstWearInRange(p, wearMinorFireThreshold, wearHighFireThreshold)
	minorCooldownOK := m.lastWearMinorFire == 0 || nowMS-m.lastWearMinorFire >= wearMinorCooldownMS
	if lapOK && minorWearWheel != "" && !m.wearMinorFired && minorCooldownOK {
		out = append(out, Event{
			Type:      EventTyreWearMinor,
			ExpiresAt: nowMS + 10_000,
			Payload:   map[string]any{"wheel": minorWearWheel, "wearPercent": minorWearVal},
		})
		m.wearMinorFired = true
		m.lastWearMinorFire = nowMS
	}
	// Re-arm: all wear below re-arm threshold.
	if allWearsBelow(p, wearMinorReArmThreshold) {
		m.wearMinorFired = false
	}

	// --- Brake Temperature Monitoring (CC: TyreMonitor brake temps) ---
	// Uses wheel struct data (doubles from DecodeWheels, already in Celsius).
	// Front axle average: FL and FR brake temps.
	bfAvg := (p.WheelBrakeTempFL + p.WheelBrakeTempFR) / 2
	brAvg := (p.WheelBrakeTempRL + p.WheelBrakeTempRR) / 2

	// Front HOT (> 500C, re-arm < 300C)
	if bfAvg >= brakeHotThreshold && !m.brakeFrontHotFired {
		out = append(out, Event{
			Type: EventBrakeTempFrontHot, ExpiresAt: nowMS + 10_000,
			Payload: map[string]any{"axle": "front", "avgTemp": bfAvg},
		})
		m.brakeFrontHotFired = true
	} else if bfAvg < brakeReArmThreshold {
		m.brakeFrontHotFired = false
	}

	// Front COOKING (> 700C)
	if bfAvg >= brakeCookingThreshold && !m.brakeFrontCookFired {
		out = append(out, Event{
			Type: EventBrakeTempFrontCooking, ExpiresAt: nowMS + 10_000,
			Payload: map[string]any{"axle": "front", "avgTemp": bfAvg},
		})
		m.brakeFrontCookFired = true
	} else if bfAvg < brakeReArmThreshold {
		m.brakeFrontCookFired = false
	}

	// Rear HOT
	if brAvg >= brakeHotThreshold && !m.brakeRearHotFired {
		out = append(out, Event{
			Type: EventBrakeTempRearHot, ExpiresAt: nowMS + 10_000,
			Payload: map[string]any{"axle": "rear", "avgTemp": brAvg},
		})
		m.brakeRearHotFired = true
	} else if brAvg < brakeReArmThreshold {
		m.brakeRearHotFired = false
	}

	// Rear COOKING
	if brAvg >= brakeCookingThreshold && !m.brakeRearCookFired {
		out = append(out, Event{
			Type: EventBrakeTempRearCooking, ExpiresAt: nowMS + 10_000,
			Payload: map[string]any{"axle": "rear", "avgTemp": brAvg},
		})
		m.brakeRearCookFired = true
	} else if brAvg < brakeReArmThreshold {
		m.brakeRearCookFired = false
	}

	return out
}

// --- internal helpers ---

type wheelIdx int

const (
	wheelFL wheelIdx = iota
	wheelFR
	wheelRL
	wheelRR
)

var wheelNames = [...]string{wheelFL: "FL", wheelFR: "FR", wheelRL: "RL", wheelRR: "RR"}

func tyreTemp(p *telemetry.PlayerTelemetry, i wheelIdx) int32 {
	switch i {
	case wheelFL:
		return p.TyreTempFL
	case wheelFR:
		return p.TyreTempFR
	case wheelRL:
		return p.TyreTempRL
	case wheelRR:
		return p.TyreTempRR
	default:
		return 0
	}
}

func tyreWear(p *telemetry.PlayerTelemetry, i wheelIdx) uint8 {
	switch i {
	case wheelFL:
		return p.TyreWearFL
	case wheelFR:
		return p.TyreWearFR
	case wheelRL:
		return p.TyreWearRL
	case wheelRR:
		return p.TyreWearRR
	default:
		return 0
	}
}

// firstExceedingTemp returns the wheel name and temperature of the first
// tyre whose temperature exceeds the given threshold, or ("", 0) if none.
func firstExceedingTemp(p *telemetry.PlayerTelemetry, threshold int32) (string, int32) {
	for i := wheelFL; i <= wheelRR; i++ {
		if t := tyreTemp(p, i); t > threshold {
			return wheelNames[i], t
		}
	}
	return "", 0
}

// allTempsBelow returns true when all four tyre temperatures are strictly
// below the given threshold.
func allTempsBelow(p *telemetry.PlayerTelemetry, threshold int32) bool {
	for i := wheelFL; i <= wheelRR; i++ {
		if tyreTemp(p, i) >= threshold {
			return false
		}
	}
	return true
}

// allTempsInRange returns true when all four tyre temperatures are within
// [minVal, maxVal] inclusive.
func allTempsInRange(p *telemetry.PlayerTelemetry, minVal, maxVal int32) bool {
	for i := wheelFL; i <= wheelRR; i++ {
		t := tyreTemp(p, i)
		if t < minVal || t > maxVal {
			return false
		}
	}
	return true
}

// firstExceedingWear returns the wheel name and wear of the first tyre
// whose wear exceeds the given threshold, or ("", 0) if none.
func firstExceedingWear(p *telemetry.PlayerTelemetry, threshold uint8) (string, uint8) {
	for i := wheelFL; i <= wheelRR; i++ {
		if w := tyreWear(p, i); w > threshold {
			return wheelNames[i], w
		}
	}
	return "", 0
}

// allWearsBelow returns true when all four tyre wear values are strictly
// below the given threshold.
func allWearsBelow(p *telemetry.PlayerTelemetry, threshold uint8) bool {
	for i := wheelFL; i <= wheelRR; i++ {
		if tyreWear(p, i) >= threshold {
			return false
		}
	}
	return true
}

// firstWearInRange returns the wheel name and wear of the first tyre whose
// wear is >= lower and < upper, or ("", 0) if none.
func firstWearInRange(p *telemetry.PlayerTelemetry, lower, upper uint8) (string, uint8) {
	for i := wheelFL; i <= wheelRR; i++ {
		if w := tyreWear(p, i); w >= lower && w < upper {
			return wheelNames[i], w
		}
	}
	return "", 0
}
