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
	// Frame 2 (3500ms): left opponent -> still_there (3500-1000=2500 >= 2500 repeat)
	// Frame 3 (5500ms): no overlap -> debounce: 5500-3500=2000 >= 1000 holdExpiry
	//   → clear_left scheduled (fires after clearDelay)
	timestamps := []int64{0, 1000, 3500, 5500}

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
