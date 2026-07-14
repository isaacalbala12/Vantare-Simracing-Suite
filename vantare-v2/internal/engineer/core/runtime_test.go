package core_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/core"
	"github.com/vantare/overlays/v2/internal/engineer/simulator"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func TestRuntime_SpotterFlow(t *testing.T) {
	frames := simulator.Build(simulator.ScenarioLeftBasic)
	if len(frames) < 4 {
		t.Fatalf("expected at least 4 frames, got %d", len(frames))
	}

	queue := audio.NewQueue()
	rt := core.NewRuntime(queue, spotter.SensitivityNormal, true)

	// Timestamps spaced to trigger events:
	// Frame 0 (0ms): no overlap -> none, 0 events
	// Frame 1 (1000ms): left opponent -> car_left
	// Frame 2 (4000ms): left opponent -> still_there (4000-1000=3000 >= 3000 repeat)
	// Frame 3 (5500ms): no overlap -> debounce: 5500-4000=1500 >= 1000 holdExpiry
	//   → clear_left scheduled (fires after clearDelay)
	timestamps := []int64{0, 1000, 4000, 5500}

	for i, ts := range timestamps {
		rt.ProcessFrame(ts, &frames[i])
	}

	// Fire the pending clear after the clear delay boundary.
	rt.ProcessFrame(5650, &frames[3])

	// Check queued messages. Left→None now emits only clear_left, not all_clear.
	expectedKeys := map[string]bool{
		"spotter.car_left":    false,
		"spotter.still_there": false,
		"spotter.clear_left":  false,
	}

	var queuedKeys []string
	for {
		msg, ok := queue.Next(0)
		if !ok {
			break
		}
		queuedKeys = append(queuedKeys, msg.TextKey)
		if _, exists := expectedKeys[msg.TextKey]; exists {
			expectedKeys[msg.TextKey] = true
		}
	}

	t.Logf("Queued keys: %v", queuedKeys)

	for key, found := range expectedKeys {
		if !found {
			t.Errorf("expected text key %q to be queued, but it was not", key)
		}
	}
}

func TestIsMessageStillValid(t *testing.T) {
	leftFrames := simulator.Build(simulator.ScenarioLeftBasic)
	rightFrames := simulator.Build(simulator.ScenarioRightBasic)
	threeWide := simulator.Build(simulator.ScenarioThreeWide)
	allClear := simulator.Build(simulator.ScenarioAllClear)

	if len(leftFrames) < 2 || len(rightFrames) < 2 || len(threeWide) < 2 || len(allClear) < 1 {
		t.Fatal("simulator scenarios returned fewer frames than expected")
	}

	tests := []struct {
		name  string
		rule  string
		frame telemetry.Frame
		want  bool
	}{
		{
			name:  "NoRule_AlwaysValid",
			rule:  "",
			frame: leftFrames[0],
			want:  true,
		},
		{
			name:  "ActiveLeft_WithLeftZone",
			rule:  "spotter.active_left",
			frame: leftFrames[1],
			want:  true,
		},
		{
			name:  "ActiveLeft_NoLeftZone",
			rule:  "spotter.active_left",
			frame: leftFrames[0],
			want:  false,
		},
		{
			name:  "ActiveRight_WithRightZone",
			rule:  "spotter.active_right",
			frame: rightFrames[1],
			want:  true,
		},
		{
			name:  "ActiveRight_NoRightZone",
			rule:  "spotter.active_right",
			frame: rightFrames[0],
			want:  false,
		},
		{
			name:  "ClearLeft_NoLeftZone",
			rule:  "spotter.clear_left",
			frame: leftFrames[0],
			want:  true,
		},
		{
			name:  "ClearLeft_WithLeftZone",
			rule:  "spotter.clear_left",
			frame: leftFrames[1],
			want:  false,
		},
		{
			name:  "AllClear_NoZones",
			rule:  "spotter.all_clear",
			frame: allClear[0],
			want:  true,
		},
		{
			name:  "AllClear_WithZones",
			rule:  "spotter.all_clear",
			frame: threeWide[1],
			want:  false,
		},
		{
			name:  "UnknownRule_AlwaysValid",
			rule:  "foo",
			frame: leftFrames[1],
			want:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			queue := audio.NewQueue()
			rt := core.NewRuntime(queue, spotter.SensitivityNormal, true)
			msg := audio.Message{
				ID:           "test",
				TextKey:      "test",
				Priority:     audio.PrioritySpotter,
				ValidityRule: tt.rule,
			}
			got := rt.IsMessageStillValid(msg, &tt.frame)
			if got != tt.want {
				t.Errorf("IsMessageStillValid(%q) = %v, want %v", tt.rule, got, tt.want)
			}
		})
	}
}

func TestProcessFrame_DropsStaleMessage(t *testing.T) {
	frames := simulator.Build(simulator.ScenarioLeftBasic)
	if len(frames) < 4 {
		t.Fatalf("expected at least 4 frames, got %d", len(frames))
	}

	queue := audio.NewQueue()
	rt := core.NewRuntime(queue, spotter.SensitivityNormal, true)

	// Frame at t=1000 with left opponent → car_left (validityRule: spotter.active_left)
	rt.ProcessFrame(1000, &frames[1])

	// Frame at t=5500 with no opponent → clear scheduled (not yet fired)
	rt.ProcessFrame(5500, &frames[3])

	// Frame at t=5650 (after clearDelay=150ms) with no opponent → clear_left fires
	// validityRule: spotter.clear_left
	rt.ProcessFrame(5650, &frames[3])

	// Drain queue and verify rules.
	found := make(map[string]string)
	for {
		msg, ok := queue.Next(0)
		if !ok {
			break
		}
		found[msg.TextKey] = msg.ValidityRule
	}

	if rule, ok := found["spotter.car_left"]; !ok {
		t.Error("expected spotter.car_left to be enqueued")
	} else if rule != "spotter.active_left" {
		t.Errorf("spotter.car_left ValidityRule = %q, want %q", rule, "spotter.active_left")
	}

	if rule, ok := found["spotter.clear_left"]; !ok {
		t.Error("expected spotter.clear_left to be enqueued")
	} else if rule != "spotter.clear_left" {
		t.Errorf("spotter.clear_left ValidityRule = %q, want %q", rule, "spotter.clear_left")
	}

	if rule := found["spotter.still_there"]; rule != "" {
		t.Errorf("unexpected spotter.still_there enqueued with rule %q", rule)
	}
}

func TestRuntime_Disabled(t *testing.T) {
	frames := simulator.Build(simulator.ScenarioLeftBasic)
	if len(frames) < 2 {
		t.Fatalf("expected at least 2 frames, got %d", len(frames))
	}

	queue := audio.NewQueue()
	rt := core.NewRuntime(queue, spotter.SensitivityNormal, false)

	rt.ProcessFrame(1000, &frames[1])

	if queue.Len() > 0 {
		t.Errorf("expected queue to be empty when runtime is disabled, got %d messages", queue.Len())
	}
}

// TestProcessFrame_NoPlayerDoesNotCorruptPrevFrame verifies that a frame
// without a player does NOT overwrite prevFrame. If prevFrame were updated
// on no-player frames, the opponents monitor would lose the transition
// detection (e.g., opponent pitted) when crossing a no-player gap.
func TestProcessFrame_NoPlayerDoesNotCorruptPrevFrame(t *testing.T) {
	queue := audio.NewQueue()
	rt := core.NewRuntime(queue, spotter.SensitivityNormal, true)

	// Frame A: player + opponent not in pits.
	frameA := telemetry.Frame{
		Connected: true,
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, DriverName: "Player", IsPlayer: true},
			{ID: 2, DriverName: "Rival", IsPlayer: false, InPits: false},
		},
		Player: &telemetry.PlayerTelemetry{ID: 1},
	}

	// Frame B: no player at all (empty vehicles, nil Player).
	frameB := telemetry.Frame{
		Connected: true,
	}

	// Frame C: opponent now in pits — should fire opponents.pitted.
	frameC := telemetry.Frame{
		Connected: true,
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, DriverName: "Player", IsPlayer: true},
			{ID: 2, DriverName: "Rival", IsPlayer: false, InPits: true},
		},
		Player: &telemetry.PlayerTelemetry{ID: 1},
	}

	// Process A → B → C.
	rt.ProcessFrame(1000, &frameA)
	rt.ProcessFrame(2000, &frameB)
	rt.ProcessFrame(3000, &frameC)

	var foundPitted bool
	for {
		msg, ok := queue.Next(0)
		if !ok {
			break
		}
		if msg.TextKey == "opponents.pitted" {
			foundPitted = true
		}
	}

	if !foundPitted {
		t.Error("opponents.pitted not fired after no-player gap — prevFrame was likely corrupted")
	}
}

// TestMonitorEvent_CategoryAndSeverity verifies that monitor events carry
// the correct Category and Severity derived from their event type.
func TestMonitorEvent_CategoryAndSeverity(t *testing.T) {
	queue := audio.NewQueue()
	rt := core.NewRuntime(queue, spotter.SensitivityNormal, true)

	// Frame with high water temp to trigger engine.water_temp_high.
	frame := telemetry.Frame{
		Connected: true,
		Session:   &telemetry.SessionInfo{GamePhase: 5}, // Green
		Player: &telemetry.PlayerTelemetry{
			ID:              1,
			EngineWaterTemp: 106,
		},
	}

	rt.ProcessFrame(1000, &frame)

	var found bool
	for {
		msg, ok := queue.Next(0)
		if !ok {
			break
		}
		if msg.TextKey == "engine.water_temp_high" {
			found = true
			if string(msg.Category) != "engine" {
				t.Errorf("Category = %q, want %q", msg.Category, "engine")
			}
			if string(msg.Severity) != "info" {
				t.Errorf("Severity = %q, want %q", msg.Severity, "info")
			}
		}
	}

	if !found {
		t.Fatal("engine.water_temp_high not enqueued")
	}
}

// TestMonitorEvent_PayloadPropagated verifies that a monitor's Payload
// reaches the audio.Message ValidationData field.
func TestMonitorEvent_PayloadPropagated(t *testing.T) {
	queue := audio.NewQueue()
	rt := core.NewRuntime(queue, spotter.SensitivityNormal, true)

	// Frame with water temp 106 to trigger engine.water_temp_high,
	// whose Payload contains "waterTemp": 106.
	frame := telemetry.Frame{
		Connected: true,
		Session:   &telemetry.SessionInfo{GamePhase: 5}, // Green
		Player: &telemetry.PlayerTelemetry{
			ID:              1,
			EngineWaterTemp: 106,
		},
	}

	rt.ProcessFrame(1000, &frame)

	var found bool
	for {
		msg, ok := queue.Next(0)
		if !ok {
			break
		}
		if msg.TextKey == "engine.water_temp_high" {
			found = true
			if msg.ValidationData == nil {
				t.Fatal("expected ValidationData to be populated from monitor Payload")
			}
			temp, ok := msg.ValidationData["waterTemp"]
			if !ok {
				t.Fatal("expected ValidationData[\"waterTemp\"] to be set")
			}
			if temp != int32(106) {
				t.Errorf("waterTemp = %v, want 106", temp)
			}
		}
	}

	if !found {
		t.Fatal("engine.water_temp_high not enqueued")
	}
}
