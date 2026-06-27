package core

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Runtime connects telemetry frames to the spotter and audio queue.
type Runtime struct {
	queue       *audio.Queue
	machine     *spotter.Machine
	sensitivity spotter.Sensitivity
	enabled     bool
}

// NewRuntime creates a new Runtime instance.
func NewRuntime(queue *audio.Queue, sensitivity spotter.Sensitivity, enabled bool) *Runtime {
	return &Runtime{
		queue:       queue,
		machine:     spotter.NewMachine(),
		sensitivity: sensitivity,
		enabled:     enabled,
	}
}

// ProcessFrame processes a telemetry frame and enqueues any spotter events.
func (r *Runtime) ProcessFrame(nowMS int64, frame *telemetry.Frame) {
	if !r.enabled || frame == nil {
		return
	}

	// Check if player exists in the frame.
	playerExists := false
	for _, v := range frame.Vehicles {
		if v.IsPlayer {
			playerExists = true
			break
		}
	}
	if !playerExists && len(frame.Vehicles) == 1 {
		playerExists = true
	}
	if !playerExists && frame.Player != nil {
		playerExists = true
	}
	if !playerExists {
		return
	}

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
}

// IsMessageStillValid checks whether a message is still valid given the current frame.
// If msg.ValidityRule == "" the message is always valid (parity with CrewChief where a null
// abstractEvent is treated as valid). Rules are evaluated against zones in the current frame.
//
// Supported rules:
//   - "spotter.active_left"  → valid when at least one SideLeft zone exists
//   - "spotter.active_right" → valid when at least one SideRight zone exists
//   - "spotter.active_both"  → valid when both sides have zones
//   - "spotter.clear_left"   → valid when NO SideLeft zone exists
//   - "spotter.clear_right"  → valid when NO SideRight zone exists
//   - "spotter.all_clear"    → valid when no zones exist on either side
//   - default / unknown      → valid (fail-safe)
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

// validityRuleForEvent maps a spotter event type to its corresponding validity rule string.
// Events without a meaningful rule (e.g. still_there) return "".
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

// MapEventToTextKey maps a spotter event type to a localized text key string.
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

// SetEnabled enables or disables the runtime processing.
func (r *Runtime) SetEnabled(enabled bool) {
	r.enabled = enabled
}

// SetSensitivity updates the spotter sensitivity.
func (r *Runtime) SetSensitivity(s spotter.Sensitivity) {
	r.sensitivity = s
}
