package core

import (
	"fmt"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/conditions"
	"github.com/vantare/overlays/v2/internal/engineer/damage"
	"github.com/vantare/overlays/v2/internal/engineer/driverswaps"
	"github.com/vantare/overlays/v2/internal/engineer/engine"
	"github.com/vantare/overlays/v2/internal/engineer/flags"
	"github.com/vantare/overlays/v2/internal/engineer/fuel"
	"github.com/vantare/overlays/v2/internal/engineer/laps"
	"github.com/vantare/overlays/v2/internal/engineer/multiclass"
	"github.com/vantare/overlays/v2/internal/engineer/opponents"
	"github.com/vantare/overlays/v2/internal/engineer/pearls"
	"github.com/vantare/overlays/v2/internal/engineer/penalties"
	"github.com/vantare/overlays/v2/internal/engineer/pitstops"
	"github.com/vantare/overlays/v2/internal/engineer/position"
	"github.com/vantare/overlays/v2/internal/engineer/push"
	"github.com/vantare/overlays/v2/internal/engineer/racetime"
	"github.com/vantare/overlays/v2/internal/engineer/sessionend"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/strategy"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
	"github.com/vantare/overlays/v2/internal/engineer/timings"
	"github.com/vantare/overlays/v2/internal/engineer/tyre"
	"github.com/vantare/overlays/v2/internal/engineer/watchedopponents"
)

// monitorEventAdapter is the common shape exposed by all monitors after
// their bespoke Event structs are normalized. The runtime calls Trigger
// to receive []genericEvent which it can enqueue uniformly.
type monitorEventAdapter struct {
	Type      string
	ExpiresAt int64
	Payload   map[string]any
}

// Monitor is the interface all non-spotter monitors satisfy. Each
// monitor package implements Trigger; the runtime wires a tiny adapter
// that converts each monitor's typed Event into a generic monitorEventAdapter.
type Monitor interface {
	Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter
}

// TriggerFn is the signature every monitor's adapter wraps.
type TriggerFn func(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter

// fnMonitor wraps a TriggerFn as a Monitor.
type fnMonitor struct{ fn TriggerFn }

func (f *fnMonitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	return f.fn(nowMS, prev, curr)
}

// Engine / Tyre / Opponents / Multiclass already have bespoke event
// adapters — we keep them as separate small wrappers. The other
// monitors each have their own concrete adapter struct below.

// === Bespoke adapters (4 monitors with richer events) ===

type engineEvent struct{ e engine.Event }

func (a engineEvent) Type() string            { return a.e.Type }
func (a engineEvent) ExpiresAt() int64        { return a.e.ExpiresAt }
func (a engineEvent) Payload() map[string]any { return a.e.Payload }

type engineMonitor struct{ m *engine.Monitor }

func (a *engineMonitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

type tyreMonitorWrap struct{ m *tyre.Monitor }

func (a *tyreMonitorWrap) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

type opponentsMonitorWrap struct{ m *opponents.Monitor }

func (a *opponentsMonitorWrap) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

type multiclassMonitorWrap struct{ m *multiclass.Monitor }

func (a *multiclassMonitorWrap) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

type watchedOpponentsAdapter struct{ m *watchedopponents.Monitor }

func (a *watchedOpponentsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// Runtime connects telemetry frames to the spotter and audio queue.
type Runtime struct {
	mu          sync.Mutex
	queue       *audio.Queue
	machine     *spotter.Machine
	sensitivity spotter.Sensitivity
	enabled     bool
	monitors    []Monitor
	prevFrame   *telemetry.Frame
}

// NewRuntime creates a new Runtime instance with all 14 monitors wired.
func NewRuntime(queue *audio.Queue, sensitivity spotter.Sensitivity, enabled bool) *Runtime {
	r := &Runtime{
		queue:       queue,
		machine:     spotter.NewMachine(),
		sensitivity: sensitivity,
		enabled:     enabled,
	}
	// Create fuel monitor first so strategy can reference it.
	fuelMon := fuel.NewMonitor()

	r.monitors = []Monitor{
		// Four monitors with bespoke adapters (richer Event types).
		&engineMonitor{m: engine.NewMonitor()},
		&tyreMonitorWrap{m: tyre.NewMonitor()},
		&opponentsMonitorWrap{m: opponents.NewMonitor()},
		&multiclassMonitorWrap{m: multiclass.NewMonitor()},
		&watchedOpponentsAdapter{m: watchedopponents.NewMonitor()},
		// Ten monitors via simple adapters (standard Event struct).
		newFlagsAdapter(flags.NewMonitor()),
		newFuelAdapter(fuelMon),
		newPenaltiesAdapter(penalties.NewMonitor()),
		newLapsAdapter(laps.NewMonitor()),
		newPositionAdapter(position.NewMonitor()),
		newPushAdapter(push.NewMonitor()),
		newRaceTimeAdapter(racetime.NewMonitor()),
		newSessionEndAdapter(sessionend.NewMonitor()),
		newTimingsAdapter(timings.NewMonitor()),
		newPearlsAdapter(pearls.NewMonitor()),
		newPitStopsAdapter(pitstops.NewMonitor()),
		// Strategy monitor — receives fuel consumption from fuel monitor.
		newStrategyAdapter(strategy.NewMonitor(func() float64 {
			return fuelMon.AverageConsumptionPerLap()
		})),
		// DriverSwaps monitor.
		newDriverSwapsAdapter(driverswaps.NewMonitor()),
		// Damage monitor (G1.3).
		newDamageAdapter(damage.NewMonitor()),
		// Conditions monitor (G1.4).
		newConditionsAdapter(conditions.NewMonitor()),
	}
	return r
}

// === Simple adapters for the 10 monitors with standard Event struct ===

// flagsAdapter wraps flags.Monitor to satisfy the Monitor interface.
type flagsAdapter struct{ m *flags.Monitor }

func newFlagsAdapter(m *flags.Monitor) Monitor { return &flagsAdapter{m: m} }
func (a *flagsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt}
	}
	return out
}

// fuelAdapter wraps fuel.Monitor.
type fuelAdapter struct{ m *fuel.Monitor }

func newFuelAdapter(m *fuel.Monitor) Monitor { return &fuelAdapter{m: m} }
func (a *fuelAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// penaltiesAdapter wraps penalties.Monitor.
type penaltiesAdapter struct{ m *penalties.Monitor }

func newPenaltiesAdapter(m *penalties.Monitor) Monitor { return &penaltiesAdapter{m: m} }
func (a *penaltiesAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt}
	}
	return out
}

// lapsAdapter wraps laps.Monitor.
type lapsAdapter struct{ m *laps.Monitor }

func newLapsAdapter(m *laps.Monitor) Monitor { return &lapsAdapter{m: m} }
func (a *lapsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// positionAdapter wraps position.Monitor.
type positionAdapter struct{ m *position.Monitor }

func newPositionAdapter(m *position.Monitor) Monitor { return &positionAdapter{m: m} }
func (a *positionAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// pushAdapter wraps push.Monitor.
type pushAdapter struct{ m *push.Monitor }

func newPushAdapter(m *push.Monitor) Monitor { return &pushAdapter{m: m} }
func (a *pushAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// raceTimeAdapter wraps racetime.Monitor.
type raceTimeAdapter struct{ m *racetime.Monitor }

func newRaceTimeAdapter(m *racetime.Monitor) Monitor { return &raceTimeAdapter{m: m} }
func (a *raceTimeAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// sessionEndAdapter wraps sessionend.Monitor.
type sessionEndAdapter struct{ m *sessionend.Monitor }

func newSessionEndAdapter(m *sessionend.Monitor) Monitor { return &sessionEndAdapter{m: m} }
func (a *sessionEndAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// timingsAdapter wraps timings.Monitor.
type timingsAdapter struct{ m *timings.Monitor }

func newTimingsAdapter(m *timings.Monitor) Monitor { return &timingsAdapter{m: m} }
func (a *timingsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// pearlsAdapter wraps pearls.Monitor.
type pearlsAdapter struct{ m *pearls.Monitor }

func newPearlsAdapter(m *pearls.Monitor) Monitor { return &pearlsAdapter{m: m} }
func (a *pearlsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// pitStopsAdapter wraps pitstops.Monitor.
type pitStopsAdapter struct{ m *pitstops.Monitor }

func newPitStopsAdapter(m *pitstops.Monitor) Monitor { return &pitStopsAdapter{m: m} }
func (a *pitStopsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// strategyAdapter wraps strategy.Monitor.
type strategyAdapter struct{ m *strategy.Monitor }

func newStrategyAdapter(m *strategy.Monitor) Monitor { return &strategyAdapter{m: m} }
func (a *strategyAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// driverSwapsAdapter wraps driverswaps.Monitor.
type driverSwapsAdapter struct{ m *driverswaps.Monitor }

func newDriverSwapsAdapter(m *driverswaps.Monitor) Monitor { return &driverSwapsAdapter{m: m} }
func (a *driverSwapsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// damageAdapter wraps damage.Monitor.
type damageAdapter struct{ m *damage.Monitor }

func newDamageAdapter(m *damage.Monitor) Monitor { return &damageAdapter{m: m} }
func (a *damageAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// conditionsAdapter wraps conditions.Monitor.
type conditionsAdapter struct{ m *conditions.Monitor }

func newConditionsAdapter(m *conditions.Monitor) Monitor { return &conditionsAdapter{m: m} }
func (a *conditionsAdapter) Trigger(nowMS int64, prev, curr *telemetry.Frame) []monitorEventAdapter {
	evs := a.m.Trigger(nowMS, prev, curr)
	out := make([]monitorEventAdapter, len(evs))
	for i, e := range evs {
		out[i] = monitorEventAdapter{Type: e.Type, ExpiresAt: e.ExpiresAt, Payload: e.Payload}
	}
	return out
}

// channelForCategory returns the audio channel for a given message category.
// Spotter events use the spotter channel; all other events use the engineer channel.
func channelForCategory(cat audio.Category) audio.Channel {
	switch cat {
	case audio.CategorySpotter:
		return audio.ChannelSpotter
	default:
		return audio.ChannelEngineer
	}
}

// ProcessFrame processes a telemetry frame and enqueues any spotter or
// monitor events into the audio queue.
func (r *Runtime) ProcessFrame(nowMS int64, frame *telemetry.Frame) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.enabled || frame == nil {
		return
	}

	playerExists := false
	for _, v := range frame.Vehicles {
		if v.IsPlayer {
			playerExists = true
			break
		}
	}
	if !playerExists && len(frame.Vehicles) == 1 && frame.Vehicles[0].IsPlayer {
		playerExists = true
	}
	if !playerExists && frame.Player != nil {
		playerExists = true
	}
	if !playerExists {
		return
	}

	// Spotter events.
	active := r.machine.ActiveSides()
	zones := spotter.ClassifyWithActiveSides(frame, r.sensitivity, active)
	events := r.machine.Process(nowMS, zones)

	for _, event := range events {
		textKey := r.MapEventToTextKey(event.Type)
		if textKey == "" {
			continue
		}
		msg := audio.Message{
			ID:           fmt.Sprintf("spotter-%s-%d", event.Type, nowMS),
			TextKey:      textKey,
			Category:     audio.CategorySpotter,
			Channel:      channelForCategory(audio.CategorySpotter),
			Severity:     audio.SeverityInfo,
			Priority:     audio.PrioritySpotter,
			CreatedAt:    nowMS,
			ExpiresAt:    event.ExpiresAt,
			ValidityRule: validityRuleForEvent(event.Type),
		}
		if !r.IsMessageStillValid(msg, frame) {
			continue
		}
		r.queue.Enqueue(msg)
	}

	// Non-spotter monitors (14 of them).
	for _, mon := range r.monitors {
		for _, ev := range mon.Trigger(nowMS, r.prevFrame, frame) {
			textKey := monitorEventToTextKey(ev.Type)
			if textKey == "" {
				continue
			}
			cat := deriveCategory(ev.Type)
			msg := audio.Message{
				ID:        fmt.Sprintf("mon-%s-%d", ev.Type, nowMS),
				TextKey:   textKey,
				Category:  cat,
				Channel:   channelForCategory(cat),
				Severity:  deriveSeverity(ev.Type),
				Priority:  audio.PriorityNormal,
				CreatedAt: nowMS,
				ExpiresAt: ev.ExpiresAt,
			}
			if len(ev.Payload) > 0 {
				msg.ValidationData = ev.Payload
				if className, ok := ev.Payload["class"].(string); ok {
					classKey := "car_class." + strings.ToLower(className)
					if _, exists := eventTextKeyMap[classKey]; exists {
						classMsg := audio.Message{
							ID:        fmt.Sprintf("mon-%s-class-%d", ev.Type, nowMS),
							TextKey:   classKey,
							Category:  cat,
							Channel:   msg.Channel,
							Severity:  msg.Severity,
							Priority:  audio.PriorityNormal,
							CreatedAt: nowMS,
							ExpiresAt: ev.ExpiresAt,
						}
						r.queue.Enqueue(classMsg)
					}
				}
			}
			r.queue.Enqueue(msg)
		}
	}

	r.prevFrame = frame
}

// IsMessageStillValid checks whether a message is still valid given the current frame.
func (r *Runtime) IsMessageStillValid(msg audio.Message, frame *telemetry.Frame) bool {
	if msg.ValidityRule == "" {
		return true
	}
	active := r.machine.ActiveSides()
	zones := spotter.ClassifyWithActiveSides(frame, r.sensitivity, active)
	hasLeft := false
	hasRight := false
	for _, z := range zones {
		if z.Side == spotter.SideLeft {
			hasLeft = true
		} else if z.Side == spotter.SideRight {
			hasRight = true
		}
	}
	switch msg.ValidityRule {
	case "spotter.active_left":
		return hasLeft
	case "spotter.active_right":
		return hasRight
	case "spotter.active_both":
		return hasLeft && hasRight
	case "spotter.clear_left":
		return !hasLeft
	case "spotter.clear_right":
		return !hasRight
	case "spotter.all_clear":
		return !hasLeft && !hasRight
	default:
		return true
	}
}

func validityRuleForEvent(eventType string) string {
	switch eventType {
	case spotter.EventCarLeft:
		return "spotter.active_left"
	case spotter.EventCarRight:
		return "spotter.active_right"
	case spotter.EventThreeWide:
		return "spotter.active_both"
	case spotter.EventClearLeft:
		return "spotter.clear_left"
	case spotter.EventClearRight:
		return "spotter.clear_right"
	case spotter.EventAllClear:
		return "spotter.all_clear"
	default:
		return ""
	}
}

// MapEventToTextKey maps a spotter event type to a localized text key.
func (r *Runtime) MapEventToTextKey(eventType string) string {
	switch eventType {
	case spotter.EventCarLeft:
		return "spotter.car_left"
	case spotter.EventCarRight:
		return "spotter.car_right"
	case spotter.EventStillThere:
		return "spotter.still_there"
	case spotter.EventClearLeft:
		return "spotter.clear_left"
	case spotter.EventClearRight:
		return "spotter.clear_right"
	case spotter.EventAllClear:
		return "spotter.all_clear"
	case spotter.EventThreeWide:
		return "spotter.three_wide"
	default:
		return ""
	}
}

func (r *Runtime) SetEnabled(enabled bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.enabled = enabled
}

func (r *Runtime) SetSensitivity(s spotter.Sensitivity) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sensitivity = s
}

// eventTextKeyMap maps monitor event types to their localized text keys.
// Kept as a map for O(1) lookup alongside the switch for documentation.
var eventTextKeyMap = map[string]string{
	// Engine monitor
	engine.EventWaterTempHigh:         "engine.water_temp_high",
	engine.EventWaterTempCritical:     "engine.water_temp_critical",
	engine.EventOilTempHigh:           "engine.oil_temp_high",
	engine.EventOilTempCritical:       "engine.oil_temp_critical",
	engine.EventWaterTempAllClear:     "engine.water_temp_all_clear",
	engine.EventOilTempAllClear:       "engine.oil_temp_all_clear",
	engine.EventEngineStalled:         "engine.stalled",
	engine.EventEngineOilPressureLow:  "engine.oil_pressure_low",
	engine.EventEngineFuelPressureLow: "engine.fuel_pressure_low",
	// Tyre monitor
	tyre.EventTyreTempHigh:          "tyre.temp_high",
	tyre.EventTyreTempOptimal:       "tyre.temp_optimal",
	tyre.EventTyreTempOverheating:   "tyre.temp_overheating",
	tyre.EventTyreWearHigh:          "tyre.wear_high",
	tyre.EventTyreWearMinor:         "tyre.wear_minor",
	tyre.EventBrakeTempFrontHot:     "tyre.brake_front_hot",
	tyre.EventBrakeTempRearHot:      "tyre.brake_rear_hot",
	tyre.EventBrakeTempFrontCooking: "tyre.brake_front_cooking",
	tyre.EventBrakeTempRearCooking:  "tyre.brake_rear_cooking",
	// Opponents monitor
	opponents.EventOpponentPitted:         "opponents.pitted",
	opponents.EventOpponentBestLap:        "opponents.best_lap",
	opponents.EventOpponentClassDifferent: "opponents.class_different",
	opponents.EventLeaderPitted:           "opponents.leader_pitted",
	opponents.EventCarAheadPitted:         "opponents.car_ahead_pitted",
	opponents.EventCarBehindPitted:        "opponents.car_behind_pitted",
	opponents.EventLeadChanged:            "opponents.lead_changed",
	opponents.EventOpponentRetired:        "opponents.retired",
	opponents.EventOpponentDSQ:            "opponents.disqualified",
	opponents.EventDriverSwapped:          "opponents.driver_swapped",
	opponents.EventOpponentExitedPits:     "opponents.exited_pits",
	// Multiclass monitor (full CC parity)
	multiclass.EventFasterBehind:         "multiclass.faster_behind",
	multiclass.EventFasterBehindFighting: "multiclass.faster_behind_fighting",
	multiclass.EventFasterBehindClassLdr: "multiclass.faster_behind_class_leader",
	multiclass.EventFasterCarsBehind:     "multiclass.faster_cars_behind",
	multiclass.EventSlowerAhead:          "multiclass.slower_ahead",
	multiclass.EventSlowerAheadFighting:  "multiclass.slower_ahead_fighting",
	multiclass.EventSlowerAheadClassLdr:  "multiclass.slower_ahead_class_leader",
	multiclass.EventSlowerCarsAhead:      "multiclass.slower_cars_ahead",
	multiclass.EventCaughtByFasterCars:   "multiclass.caught_by_faster_cars",
	multiclass.EventCatchingSlowerCars:    "multiclass.catching_slower_cars",
	// Car class audio keys (resolved to car_class.{class}.mp3 in audio cache).
	"car_class.hypercar": "car_class.hypercar",
	"car_class.lmp1":     "car_class.lmp1",
	"car_class.lmp2":     "car_class.lmp2",
	"car_class.lmp3":     "car_class.lmp3",
	"car_class.gt3":      "car_class.gt3",
	"car_class.gte":      "car_class.gte",
	"car_class.gt4":      "car_class.gt4",
	// Flags monitor
	flags.EventFCYStarted:           "flags.fcy_started",
	flags.EventFCYEnded:             "flags.fcy_ended",
	flags.EventBlueFlag:             "flags.blue_flag",
	flags.EventYellowFlag:           "flags.yellow_flag",
	flags.EventDoubleYellow:         "flags.double_yellow_flag",
	flags.EventWhiteFlag:            "flags.white_flag",
	flags.EventBlackFlag:            "flags.black_flag",
	flags.EventYellowFlagSector1:    "flags.yellow_sector_1",
	flags.EventYellowFlagSector2:    "flags.yellow_sector_2",
	flags.EventYellowFlagSector3:    "flags.yellow_sector_3",
	flags.EventYellowSectorAllClear: "flags.yellow_sector_all_clear",
	flags.EventGetReady:             "flags.get_ready",
	flags.EventGreenFlag:            "flags.green_flag",
	// Fuel monitor
	fuel.EventLowFuelHalfTank:      "fuel.low_half_tank",
	fuel.EventLowFuel1Litre:        "fuel.low_1l",
	fuel.EventLowFuel2Litres:       "fuel.low_2l",
	fuel.EventFuelLapsRemaining4:   "fuel.laps_remaining_4",
	fuel.EventFuelLapsRemaining3:   "fuel.laps_remaining_3",
	fuel.EventFuelLapsRemaining2:   "fuel.laps_remaining_2",
	fuel.EventFuelLapsRemaining1:   "fuel.laps_remaining_1",
	fuel.EventFuelForPitNow:        "fuel.for_pit_now",
	fuel.EventFuelHalfTime:         "fuel.half_time",
	fuel.EventFuelTenMinRemaining:  "fuel.minutes_10",
	fuel.EventFuelFiveMinRemaining: "fuel.minutes_5",
	// Penalties monitor
	penalties.EventNewDriveThrough: "penalties.new_drivethrough",
	penalties.EventNewStopAndGo:    "penalties.new_stopgo",
	penalties.EventPenaltyServed:   "penalties.penalty_served",
	// Laps monitor
	laps.EventLapCompleted:  "laps.lap_completed",
	laps.EventFastestLap:    "laps.fastest_lap",
	laps.EventLastLap:       "laps.last_lap",
	laps.EventTwoToGo:       "laps.two_to_go",
	laps.EventLapConsistent: "laps.consistent",
	laps.EventLapImproving:  "laps.improving",
	laps.EventLapWorsening:  "laps.worsening",
	laps.EventLastLapLeader: "laps.last_lap_leader",
	laps.EventLastLapTop3:   "laps.last_lap_top3",
	laps.EventTwoToGoLeader: "laps.two_to_go_leader",
	laps.EventTwoToGoTop3:   "laps.two_to_go_top3",
	laps.EventFormationLap:  "laps.formation_lap",
	// Position monitor
	position.EventPositionGained:       "position.gained",
	position.EventPositionLost:         "position.lost",
	position.EventStartTerrible:        "position.start_terrible",
	position.EventStartBad:             "position.start_bad",
	position.EventStartGood:            "position.start_good",
	position.EventStartOK:              "position.start_ok",
	position.EventOvertakeCompleted:    "position.overtake_completed",
	position.EventOvertakeLost:         "position.overtake_lost",
	position.EventLastPlaceForManyLaps: "position.last_place_many_laps",
	position.EventFormationPosition:    "position.formation",
	position.EventGivePositionBack:     "position.give_position_back",
	position.EventGivePositionBackNow:  "position.give_position_back_now",
	// Push monitor
	push.EventPushNow:         "push.push_now",
	push.EventPushToImprove:   "push.push_to_improve",
	push.EventPushToGetWin:    "push.push_to_get_win",
	push.EventPushToGetSecond: "push.push_to_get_second",
	push.EventPushToGetThird:  "push.push_to_get_third",
	push.EventPushToHold:      "push.push_to_hold_position",
	push.EventQualExit:        "push.qual_exit",
	push.EventCornerAttack:    "push.corner_attack",
	push.EventCornerDefend:    "push.corner_defend",
	// RaceTime monitor
	racetime.EventTwentyMinRemain:  "racetime.20min_remaining",
	racetime.EventFifteenMinRemain: "racetime.15min_remaining",
	racetime.EventTenMinRemain:     "racetime.10min_remaining",
	racetime.EventFiveMinRemain:    "racetime.5min_remaining",
	racetime.EventTwoMinRemain:     "racetime.2min_remaining",
	racetime.EventZeroMinRemain:    "racetime.0min_remaining",
	racetime.EventHalfWayRemain:    "racetime.halfway",
	racetime.EventPearlsDisable:    "racetime.pearls_disable",
	racetime.EventOneMinRemain:     "racetime.1min_remaining",
	racetime.EventThirtySecRemain:  "racetime.30s_remaining",
	racetime.EventPreRaceTwoMin:    "racetime.pre_race_2min",
	racetime.EventPreRaceOneMin:    "racetime.pre_race_1min",
	racetime.EventPreRaceThirty:    "racetime.pre_race_30s",
	// SessionEnd monitor
	sessionend.EventSessionEnded:     "session.ended",
	sessionend.EventSessionWon:       "session.won",
	sessionend.EventSessionPodium:    "session.podium",
	sessionend.EventSessionFinished:  "session.finished",
	sessionend.EventSessionGood:      "session.good_finish",
	sessionend.EventSessionLast:      "session.finished_last",
	sessionend.EventSessionDNF:       "session.dnf",
	sessionend.EventSessionDSQ:       "session.disqualified",
	sessionend.EventSessionPole:      "session.pole",
	sessionend.EventSessionEndedQual: "session.ended_qual",
	// Timings monitor
	timings.EventGapReport:      "timings.gap_report",
	timings.EventGapReportFreq:  "timings.gap_report_freq",
	timings.EventBeingHeldUp:    "timings.being_held_up",
	timings.EventBeingPressured: "timings.being_pressured",
	// Pearls monitor
	pearls.EventPearl: "pearls.pearl",
	// WatchedOpponents monitor
	watchedopponents.EventWatchedNew:           "watched.new_opponent",
	watchedopponents.EventWatchedGone:          "watched.opponent_gone",
	watchedopponents.EventWatchedGapIncreasing: "watched.gap_increasing",
	watchedopponents.EventWatchedGapDecreasing: "watched.gap_decreasing",
	// PitStops monitor
	pitstops.EventPitEntry:             "pitstops.entry",
	pitstops.EventPitExit:              "pitstops.exit",
	pitstops.EventPitEngageLimiter:     "pitstops.engage_limiter",
	pitstops.EventPitDisengageLimiter:  "pitstops.disengage_limiter",
	pitstops.EventPitWatchSpeed:        "pitstops.watch_your_speed",
	pitstops.EventPitOneHundredMetres:  "pitstops.one_hundred_metres",
	pitstops.EventPitFiftyMetres:       "pitstops.fifty_metres",
	pitstops.EventPitBoxNow:            "pitstops.box_now",
	pitstops.EventPitWindowOpen:        "pitstops.pit_window_open",
	pitstops.EventPitWindowClose:       "pitstops.pit_window_close",
	pitstops.EventPitWindowOpensIn5:    "pitstops.window_opens_in_5",
	pitstops.EventPitWindowOpensIn3:    "pitstops.window_opens_in_3",
	pitstops.EventPitWindowOpensIn1:    "pitstops.window_opens_in_1",
	pitstops.EventPitWindowClosesIn3:   "pitstops.window_closes_in_3",
	pitstops.EventPitWindowClosesIn1:   "pitstops.window_closes_in_1",
	pitstops.EventPitExitTrafficClear:  "pitstops.exit_traffic_clear",
	pitstops.EventPitExitTrafficBehind: "pitstops.exit_traffic_behind",
	// Strategy monitor
	strategy.EventStrategySectorFuelLow: "strategy.sector_fuel_low",
	strategy.EventStrategyFuelOk:        "strategy.fuel_ok",
	strategy.EventPitPositionGain:       "strategy.pit_position_gain",
	strategy.EventPitPositionLoss:       "strategy.pit_position_loss",
	// DriverSwaps monitor
	driverswaps.EventStintHalfway:    "driverswaps.stint_halfway",
	driverswaps.EventStintLong:       "driverswaps.stint_long",
	driverswaps.EventStintWillExceed: "driverswaps.stint_will_exceed",
	// Damage monitor (G1.3)
	damage.EventDamageAeroMinor:        "damage.aero_minor",
	damage.EventDamageAeroSevere:       "damage.aero_severe",
	damage.EventDamageSuspensionMinor:  "damage.suspension_minor",
	damage.EventDamageSuspensionSevere: "damage.suspension_severe",
	damage.EventDamageEngineMinor:      "damage.engine_minor",
	damage.EventDamageEngineSevere:     "damage.engine_severe",
	damage.EventDamageBusted:           "damage.component_busted",
	damage.EventDetachedPart:           "damage.detached_part",
	// Conditions monitor (G1.4)
	conditions.EventRainStarted:   "conditions.rain_started",
	conditions.EventRainStopped:   "conditions.rain_stopped",
	conditions.EventTrackTempHigh: "conditions.track_temp_high",
	conditions.EventTrackFreezing: "conditions.track_freezing",
}

// monitorEventToTextKey maps a monitor event type to a localized text key.
// Returns "" for unmapped events (silently dropped).
func monitorEventToTextKey(eventType string) string {
	// Prefer map lookup for O(1) performance.
	if textKey, ok := eventTextKeyMap[eventType]; ok {
		return textKey
	}
	// Fall back to switch for documentation parity.
	switch eventType {
	// Engine monitor
	case engine.EventWaterTempHigh:
		return "engine.water_temp_high"
	case engine.EventWaterTempCritical:
		return "engine.water_temp_critical"
	case engine.EventOilTempHigh:
		return "engine.oil_temp_high"
	case engine.EventOilTempCritical:
		return "engine.oil_temp_critical"
	case engine.EventWaterTempAllClear:
		return "engine.water_temp_all_clear"
	case engine.EventOilTempAllClear:
		return "engine.oil_temp_all_clear"
	case engine.EventEngineStalled:
		return "engine.stalled"
	case engine.EventEngineOilPressureLow:
		return "engine.oil_pressure_low"
	case engine.EventEngineFuelPressureLow:
		return "engine.fuel_pressure_low"
	// Tyre monitor
	case tyre.EventTyreTempHigh:
		return "tyre.temp_high"
	case tyre.EventTyreTempOptimal:
		return "tyre.temp_optimal"
	case tyre.EventTyreTempOverheating:
		return "tyre.temp_overheating"
	case tyre.EventTyreWearHigh:
		return "tyre.wear_high"
	case tyre.EventTyreWearMinor:
		return "tyre.wear_minor"
	case tyre.EventBrakeTempFrontHot:
		return "tyre.brake_front_hot"
	case tyre.EventBrakeTempRearHot:
		return "tyre.brake_rear_hot"
	case tyre.EventBrakeTempFrontCooking:
		return "tyre.brake_front_cooking"
	case tyre.EventBrakeTempRearCooking:
		return "tyre.brake_rear_cooking"
	// Opponents monitor
	case opponents.EventOpponentPitted:
		return "opponents.pitted"
	case opponents.EventOpponentBestLap:
		return "opponents.best_lap"
	case opponents.EventOpponentClassDifferent:
		return "opponents.class_different"
	case opponents.EventLeaderPitted:
		return "opponents.leader_pitted"
	case opponents.EventCarAheadPitted:
		return "opponents.car_ahead_pitted"
	case opponents.EventCarBehindPitted:
		return "opponents.car_behind_pitted"
	case opponents.EventLeadChanged:
		return "opponents.lead_changed"
	case opponents.EventOpponentRetired:
		return "opponents.retired"
	case opponents.EventOpponentDSQ:
		return "opponents.disqualified"
	case opponents.EventDriverSwapped:
		return "opponents.driver_swapped"
	// Multiclass monitor (full CC parity)
	case multiclass.EventFasterBehind:
		return "multiclass.faster_behind"
	case multiclass.EventFasterBehindFighting:
		return "multiclass.faster_behind_fighting"
	case multiclass.EventFasterBehindClassLdr:
		return "multiclass.faster_behind_class_leader"
	case multiclass.EventFasterCarsBehind:
		return "multiclass.faster_cars_behind"
	case multiclass.EventSlowerAhead:
		return "multiclass.slower_ahead"
	case multiclass.EventSlowerAheadFighting:
		return "multiclass.slower_ahead_fighting"
	case multiclass.EventSlowerAheadClassLdr:
		return "multiclass.slower_ahead_class_leader"
	case multiclass.EventSlowerCarsAhead:
		return "multiclass.slower_cars_ahead"
	case multiclass.EventCaughtByFasterCars:
		return "multiclass.caught_by_faster_cars"
	case multiclass.EventCatchingSlowerCars:
		return "multiclass.catching_slower_cars"
	// Flags monitor
	case flags.EventFCYStarted:
		return "flags.fcy_started"
	case flags.EventFCYEnded:
		return "flags.fcy_ended"
	case flags.EventBlueFlag:
		return "flags.blue_flag"
	case flags.EventYellowFlag:
		return "flags.yellow_flag"
	case flags.EventDoubleYellow:
		return "flags.double_yellow_flag"
	case flags.EventWhiteFlag:
		return "flags.white_flag"
	case flags.EventBlackFlag:
		return "flags.black_flag"
	case flags.EventYellowFlagSector1:
		return "flags.yellow_sector_1"
	case flags.EventYellowFlagSector2:
		return "flags.yellow_sector_2"
	case flags.EventYellowFlagSector3:
		return "flags.yellow_sector_3"
	case flags.EventYellowSectorAllClear:
		return "flags.yellow_sector_all_clear"
	// Fuel monitor
	case fuel.EventLowFuelHalfTank:
		return "fuel.low_half_tank"
	case fuel.EventLowFuel1Litre:
		return "fuel.low_1l"
	case fuel.EventLowFuel2Litres:
		return "fuel.low_2l"
	case fuel.EventFuelLapsRemaining4:
		return "fuel.laps_remaining_4"
	case fuel.EventFuelLapsRemaining3:
		return "fuel.laps_remaining_3"
	case fuel.EventFuelLapsRemaining2:
		return "fuel.laps_remaining_2"
	case fuel.EventFuelLapsRemaining1:
		return "fuel.laps_remaining_1"
	case fuel.EventFuelForPitNow:
		return "fuel.for_pit_now"
	// Penalties monitor
	case penalties.EventNewDriveThrough:
		return "penalties.new_drivethrough"
	case penalties.EventNewStopAndGo:
		return "penalties.new_stopgo"
	case penalties.EventPenaltyServed:
		return "penalties.penalty_served"
	// Laps monitor
	case laps.EventLapCompleted:
		return "laps.lap_completed"
	case laps.EventFastestLap:
		return "laps.fastest_lap"
	case laps.EventLastLap:
		return "laps.last_lap"
	case laps.EventTwoToGo:
		return "laps.two_to_go"
	case laps.EventLapConsistent:
		return "laps.consistent"
	case laps.EventLapImproving:
		return "laps.improving"
	case laps.EventLapWorsening:
		return "laps.worsening"
	// Position monitor
	case position.EventPositionGained:
		return "position.gained"
	case position.EventPositionLost:
		return "position.lost"
	case position.EventStartTerrible:
		return "position.start_terrible"
	case position.EventStartBad:
		return "position.start_bad"
	case position.EventStartGood:
		return "position.start_good"
	case position.EventStartOK:
		return "position.start_ok"
	case position.EventOvertakeCompleted:
		return "position.overtake_completed"
	case position.EventOvertakeLost:
		return "position.overtake_lost"
	case position.EventLastPlaceForManyLaps:
		return "position.last_place_many_laps"
	case position.EventGivePositionBack:
		return "position.give_position_back"
	case position.EventGivePositionBackNow:
		return "position.give_position_back_now"
	// Push monitor
	case push.EventPushNow:
		return "push.push_now"
	case push.EventPushToImprove:
		return "push.push_to_improve"
	case push.EventPushToGetWin:
		return "push.push_to_get_win"
	case push.EventPushToGetSecond:
		return "push.push_to_get_second"
	case push.EventPushToGetThird:
		return "push.push_to_get_third"
	case push.EventPushToHold:
		return "push.push_to_hold_position"
	// RaceTime monitor
	case racetime.EventTwentyMinRemain:
		return "racetime.20min_remaining"
	case racetime.EventFifteenMinRemain:
		return "racetime.15min_remaining"
	case racetime.EventTenMinRemain:
		return "racetime.10min_remaining"
	case racetime.EventFiveMinRemain:
		return "racetime.5min_remaining"
	case racetime.EventTwoMinRemain:
		return "racetime.2min_remaining"
	case racetime.EventZeroMinRemain:
		return "racetime.0min_remaining"
	case racetime.EventHalfWayRemain:
		return "racetime.halfway"
	case racetime.EventPearlsDisable:
		return "racetime.pearls_disable"
	case racetime.EventPreRaceTwoMin:
		return "racetime.pre_race_2min"
	case racetime.EventPreRaceOneMin:
		return "racetime.pre_race_1min"
	case racetime.EventPreRaceThirty:
		return "racetime.pre_race_30s"
	// SessionEnd monitor
	case sessionend.EventSessionEnded:
		return "session.ended"
	case sessionend.EventSessionWon:
		return "session.won"
	case sessionend.EventSessionPodium:
		return "session.podium"
	case sessionend.EventSessionFinished:
		return "session.finished"
	case sessionend.EventSessionGood:
		return "session.good_finish"
	case sessionend.EventSessionLast:
		return "session.finished_last"
	case sessionend.EventSessionDNF:
		return "session.dnf"
	case sessionend.EventSessionDSQ:
		return "session.disqualified"
	case sessionend.EventSessionPole:
		return "session.pole"
	case sessionend.EventSessionEndedQual:
		return "session.ended_qual"
	// Timings monitor
	case timings.EventGapReport:
		return "timings.gap_report"
	case timings.EventGapReportFreq:
		return "timings.gap_report_freq"
	// Pearls monitor
	case pearls.EventPearl:
		return "pearls.pearl"
	// WatchedOpponents monitor
	case watchedopponents.EventWatchedNew:
		return "watched.new_opponent"
	case watchedopponents.EventWatchedGone:
		return "watched.opponent_gone"
	case watchedopponents.EventWatchedGapIncreasing:
		return "watched.gap_increasing"
	case watchedopponents.EventWatchedGapDecreasing:
		return "watched.gap_decreasing"
	// PitStops monitor
	case pitstops.EventPitEntry:
		return "pitstops.entry"
	case pitstops.EventPitExit:
		return "pitstops.exit"
	case pitstops.EventPitEngageLimiter:
		return "pitstops.engage_limiter"
	case pitstops.EventPitDisengageLimiter:
		return "pitstops.disengage_limiter"
	case pitstops.EventPitWatchSpeed:
		return "pitstops.watch_your_speed"
	case pitstops.EventPitOneHundredMetres:
		return "pitstops.one_hundred_metres"
	case pitstops.EventPitFiftyMetres:
		return "pitstops.fifty_metres"
	case pitstops.EventPitBoxNow:
		return "pitstops.box_now"
	case pitstops.EventPitWindowOpen:
		return "pitstops.pit_window_open"
	case pitstops.EventPitWindowClose:
		return "pitstops.pit_window_close"
	case pitstops.EventPitWindowOpensIn5:
		return "pitstops.window_opens_in_5"
	case pitstops.EventPitWindowOpensIn3:
		return "pitstops.window_opens_in_3"
	case pitstops.EventPitWindowOpensIn1:
		return "pitstops.window_opens_in_1"
	case pitstops.EventPitWindowClosesIn3:
		return "pitstops.window_closes_in_3"
	case pitstops.EventPitWindowClosesIn1:
		return "pitstops.window_closes_in_1"
	// Strategy monitor
	case strategy.EventStrategySectorFuelLow:
		return "strategy.sector_fuel_low"
	case strategy.EventStrategyFuelOk:
		return "strategy.fuel_ok"
	// DriverSwaps monitor
	case driverswaps.EventStintHalfway:
		return "driverswaps.stint_halfway"
	case driverswaps.EventStintLong:
		return "driverswaps.stint_long"
	case driverswaps.EventStintWillExceed:
		return "driverswaps.stint_will_exceed"
	// Damage monitor (G1.3)
	case damage.EventDamageAeroMinor:
		return "damage.aero_minor"
	case damage.EventDamageAeroSevere:
		return "damage.aero_severe"
	case damage.EventDamageSuspensionMinor:
		return "damage.suspension_minor"
	case damage.EventDamageSuspensionSevere:
		return "damage.suspension_severe"
	case damage.EventDamageEngineMinor:
		return "damage.engine_minor"
	case damage.EventDamageEngineSevere:
		return "damage.engine_severe"
	case damage.EventDamageBusted:
		return "damage.component_busted"
	case damage.EventDetachedPart:
		return "damage.detached_part"
	// Conditions monitor (G1.4)
	case conditions.EventRainStarted:
		return "conditions.rain_started"
	case conditions.EventRainStopped:
		return "conditions.rain_stopped"
	case conditions.EventTrackTempHigh:
		return "conditions.track_temp_high"
	case conditions.EventTrackFreezing:
		return "conditions.track_freezing"
	default:
		return ""
	}
}

// categoryPrefixes maps event type prefixes to audio categories.
// Order matters: first match wins.
var categoryPrefixes = []struct {
	prefix string
	cat    audio.Category
}{
	{"engine.", audio.CategoryEngine},
	{"tyre.", audio.CategoryTyre},
	{"opponents.", audio.CategoryOpponents},
	{"multiclass.", audio.CategoryMulticlass},
	{"flags.", audio.CategoryFlags},
	{"fuel.", audio.CategoryFuel},
	{"penalties.", audio.CategoryPenalties},
	{"laps.", audio.CategoryLaps},
	{"position.", audio.CategoryPosition},
	{"push.", audio.CategoryPush},
	{"racetime.", audio.CategoryRaceTime},
	{"session.", audio.CategorySessionEnd},
	{"timings.", audio.CategoryTimings},
	{"pearls.", audio.CategoryPearls},
	{"pitstops.", audio.CategoryPitStops},
	{"watched.", audio.CategoryWatched},
	{"strategy.", audio.CategoryStrategy},
	{"driverswaps.", audio.CategoryDriverSwaps},
	{"damage.", audio.CategoryDamage},
	{"conditions.", audio.CategoryConditions},
}

// deriveCategory returns the audio.Category for an event type string.
func deriveCategory(eventType string) audio.Category {
	for _, p := range categoryPrefixes {
		if strings.HasPrefix(eventType, p.prefix) {
			return p.cat
		}
	}
	return audio.CategorySpotter
}

// deriveSeverity returns SeverityCritical / Warning / Info based on event type.
func deriveSeverity(eventType string) audio.Severity {
	if strings.Contains(eventType, "critical") {
		return audio.SeverityCritical
	}
	if strings.Contains(eventType, "stalled") || strings.Contains(eventType, "overheating") {
		return audio.SeverityWarning
	}
	return audio.SeverityInfo
}
