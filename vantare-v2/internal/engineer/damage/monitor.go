// Package damage implements a Damage monitor: detects aero, suspension,
// engine, and brake/transmission damage severity changes and emits events
// when the level increases. Also detects detached wheels.
//
// Parity CC: Events/DamageReporting.cs — 5 components (engine, transmission,
// aero, suspension, brakes) with levels: none, trivial, minor, severe, busted.
//
// LMU provides mDentSeverity[8] (8 bytes) in PlayerTelemetry. The 8 dents map
// approximately to components:
//   - dents[0-1]: aero damage (front/rear)
//   - dents[2-3]: suspension damage (left/right)
//   - dents[4-5]: engine damage
//   - dents[6-7]: brake/transmission
package damage

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	EventDamageAeroMinor         = "damage.aero_minor"
	EventDamageAeroSevere        = "damage.aero_severe"
	EventDamageSuspensionMinor   = "damage.suspension_minor"
	EventDamageSuspensionSevere  = "damage.suspension_severe"
	EventDamageEngineMinor       = "damage.engine_minor"
	EventDamageEngineSevere      = "damage.engine_severe"
	EventDamageBusted            = "damage.component_busted"
	EventDetachedPart            = "damage.detached_part"
)

// Component identifies the damaged part.
type Component int

const (
	ComponentEngine Component = iota
	ComponentTransmission
	ComponentAero
	ComponentSuspension
	ComponentBrakes
)

func (c Component) String() string {
	switch c {
	case ComponentEngine:
		return "engine"
	case ComponentTransmission:
		return "transmission"
	case ComponentAero:
		return "aero"
	case ComponentSuspension:
		return "suspension"
	case ComponentBrakes:
		return "brakes"
	default:
		return "unknown"
	}
}

// DamageLevel represents the severity of damage to a component.
// 0=none, 1-99=minor, 100-199=severe, 200+=busted.
type DamageLevel int

const (
	LevelNone   DamageLevel = 0
	LevelMinor  DamageLevel = 1
	LevelSevere DamageLevel = 2
	LevelBusted DamageLevel = 3
)

// damageLevelForValue maps a dent severity value to a DamageLevel.
func damageLevelForValue(v int32) DamageLevel {
	switch {
	case v <= 0:
		return LevelNone
	case v < 100:
		return LevelMinor
	case v < 200:
		return LevelSevere
	default:
		return LevelBusted
	}
}

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// componentInfo holds the last reported damage level for a component.
type componentInfo struct {
	lastLevel DamageLevel
}

// Monitor tracks damage severity changes with hysteresis (only fires when
// level INCREASES). Also fires detached-part events with a 30s cooldown.
type Monitor struct {
	mu         sync.Mutex
	components map[Component]*componentInfo

	lastDetachedFire int64
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{
		components: map[Component]*componentInfo{
			ComponentEngine:       {},
			ComponentTransmission: {},
			ComponentAero:        {},
			ComponentSuspension:   {},
			ComponentBrakes:      {},
		},
	}
}

// componentForDentIndex returns the component associated with a dent index.
func componentForDentIndex(idx int) Component {
	switch {
	case idx < 2:
		return ComponentAero
	case idx < 4:
		return ComponentSuspension
	case idx < 6:
		return ComponentEngine
	default:
		return ComponentBrakes
	}
}

// Trigger inspects the current frame and returns events for damage level
// changes and detached parts.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	_ = prev
	if curr == nil || curr.Player == nil {
		return nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	var out []Event

	// Determine per-component damage levels from dents.
	componentLevels := map[Component]DamageLevel{}
	for i := 0; i < 8; i++ {
		comp := componentForDentIndex(i)
		level := damageLevelForValue(curr.Player.DentSeverity[i])
		if level > componentLevels[comp] {
			componentLevels[comp] = level
		}
	}

	// Check each component for level increases.
	for comp, newLevel := range componentLevels {
		info := m.components[comp]
		if info == nil {
			continue
		}
		if newLevel > info.lastLevel {
			// Only fire for minor, severe, busted (skip none→none and none→... well, none is 0)
			events := m.eventsForComponent(comp, newLevel, nowMS)
			out = append(out, events...)
			info.lastLevel = newLevel
		}
	}

	// Detached part detection: 30s cooldown.
	detachedCooldown := int64(30_000)
	if curr.Player.WheelDetachedCount > 0 {
		if m.lastDetachedFire == 0 || nowMS-m.lastDetachedFire >= detachedCooldown {
			out = append(out, Event{
				Type:      EventDetachedPart,
				ExpiresAt: nowMS + 10_000,
				Payload:   map[string]any{"wheelDetachedCount": curr.Player.WheelDetachedCount},
			})
			m.lastDetachedFire = nowMS
		}
	}

	return out
}

// eventsForComponent generates the appropriate events for a component at the given level.
func (m *Monitor) eventsForComponent(comp Component, level DamageLevel, nowMS int64) []Event {
	compName := comp.String()

	switch level {
	case LevelMinor:
		var eventType string
		switch comp {
		case ComponentAero:
			eventType = EventDamageAeroMinor
		case ComponentSuspension:
			eventType = EventDamageSuspensionMinor
		case ComponentEngine:
			eventType = EventDamageEngineMinor
		default:
			// Brakes/transmission minor → use engine minor as fallback or skip
			return nil
		}
		return []Event{{
			Type:      eventType,
			ExpiresAt: nowMS + 15_000,
			Payload:   map[string]any{"component": compName, "level": "minor"},
		}}

	case LevelSevere:
		var eventType string
		switch comp {
		case ComponentAero:
			eventType = EventDamageAeroSevere
		case ComponentSuspension:
			eventType = EventDamageSuspensionSevere
		case ComponentEngine:
			eventType = EventDamageEngineSevere
		default:
			// Brakes/transmission severe → fallback to severe
			eventType = EventDamageEngineSevere
		}
		return []Event{{
			Type:      eventType,
			ExpiresAt: nowMS + 15_000,
			Payload:   map[string]any{"component": compName, "level": "severe"},
		}}

	case LevelBusted:
		return []Event{{
			Type:      EventDamageBusted,
			ExpiresAt: nowMS + 20_000,
			Payload:   map[string]any{"component": compName, "level": "busted"},
		}}

	default:
		return nil
	}
}

// Reset clears all tracked state (useful for session restarts).
func (m *Monitor) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, info := range m.components {
		info.lastLevel = LevelNone
	}
	m.lastDetachedFire = 0
}
