package sensor

import (
	"reflect"
	"testing"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
)

func autoSample(at time.Time, cpu, frametime float64, available bool) Sample {
	return Sample{
		At:   at,
		Host: HostSample{CPUPct: cpu, VantareCPUPct: 2.5, VantareRAMMB: 150, GPUPct: 4},
		Game: GameSample{FrametimeMS: frametime, Available: available, Foreground: true},
	}
}

func TestAutoStartsBalancedAndPromotesAfterThirtyHealthySeconds(t *testing.T) {
	controller := NewAutoController(performancepolicy.LevelHigh)
	start := time.Unix(100, 0)
	initial := controller.Observe(autoSample(start, 50, 10, true))
	if initial.Reason != performancepolicy.ReasonUser {
		t.Fatalf("initial reason = %q", initial.Reason)
	}
	for second := 1; second <= 28; second++ {
		if got := controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), 50, 10, true)); got.Changed {
			t.Fatalf("changed early at second %d: %+v", second, got)
		}
	}
	if got := controller.Observe(autoSample(start.Add(29*time.Second), 50, 10.2, true)); got.Changed {
		t.Fatalf("promotion before 30 seconds = %+v", got)
	}
	got := controller.Observe(autoSample(start.Add(30*time.Second), 50, 10.2, true))
	if !got.Changed || got.Level != performancepolicy.LevelHigh {
		t.Fatalf("promotion = %+v", got)
	}
}

func TestAutoDoesNotPromoteFromBurstOfThirtySamples(t *testing.T) {
	controller := NewAutoController(performancepolicy.LevelHigh)
	start := time.Unix(150, 0)
	for sample := 0; sample < 30; sample++ {
		at := start.Add(time.Duration(sample) * 100 * time.Millisecond)
		if got := controller.Observe(autoSample(at, 50, 10, true)); got.Changed {
			t.Fatalf("burst promoted at %s: %+v", at.Sub(start), got)
		}
	}
	if got := controller.Observe(autoSample(start.Add(30*time.Second-time.Nanosecond), 50, 10, true)); got.Changed {
		t.Fatalf("promoted before 30 real seconds: %+v", got)
	}
	if got := controller.Observe(autoSample(start.Add(30*time.Second), 50, 10, true)); !got.Changed || got.Level != performancepolicy.LevelHigh {
		t.Fatalf("did not promote at 30 real seconds: %+v", got)
	}
}

func TestAutoDropsWithinTwoSecondsForCPUOrFrametime(t *testing.T) {
	tests := []struct {
		name       string
		cpu        float64
		frametime  float64
		wantReason performancepolicy.Reason
	}{
		{name: "cpu", cpu: 91, frametime: 10, wantReason: performancepolicy.ReasonCPU},
		{name: "frametime", cpu: 50, frametime: 10.6, wantReason: performancepolicy.ReasonFrameTime},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			controller := NewAutoController(performancepolicy.LevelHigh)
			start := time.Unix(200, 0)
			controller.Observe(autoSample(start, 50, 10, true))
			if got := controller.Observe(autoSample(start.Add(time.Second), test.cpu, test.frametime, true)); got.Changed {
				t.Fatalf("changed after one sample: %+v", got)
			}
			got := controller.Observe(autoSample(start.Add(2*time.Second), test.cpu, test.frametime, true))
			if !got.Changed || got.Level != performancepolicy.LevelSaving || got.Reason != test.wantReason {
				t.Fatalf("drop = %+v", got)
			}
		})
	}
}

func TestAutoPromotionWaitsSixtySecondsAfterDrop(t *testing.T) {
	controller := NewAutoController(performancepolicy.LevelHigh)
	start := time.Unix(300, 0)
	controller.Observe(autoSample(start, 50, 10, true))
	controller.Observe(autoSample(start.Add(time.Second), 95, 10, true))
	drop := controller.Observe(autoSample(start.Add(2*time.Second), 95, 10, true))
	if !drop.Changed || drop.Level != performancepolicy.LevelSaving {
		t.Fatalf("drop = %+v", drop)
	}
	for second := 3; second < 62; second++ {
		if got := controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), 50, 10, true)); got.Changed {
			t.Fatalf("changed during hysteresis at second %d: %+v", second, got)
		}
	}
	got := controller.Observe(autoSample(start.Add(62*time.Second), 50, 10, true))
	if !got.Changed || got.Level != performancepolicy.LevelBalanced {
		t.Fatalf("recovery after hysteresis = %+v", got)
	}
}

func TestAutoStableSessionChangesAtMostTwiceInTenMinutes(t *testing.T) {
	controller := NewAutoController(performancepolicy.LevelHigh)
	start := time.Unix(400, 0)
	changes := 0
	for second := 1; second <= 600; second++ {
		frametime := 10.0 + float64(second%3-1)*0.01
		if controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), 55, frametime, true)).Changed {
			changes++
		}
	}
	if changes > 2 || controller.Level() != performancepolicy.LevelHigh {
		t.Fatalf("stable changes=%d level=%d", changes, controller.Level())
	}
}

func TestAutoWithoutPresentMonUsesCPUAndPublishesUnavailable(t *testing.T) {
	controller := NewAutoController(performancepolicy.LevelHigh)
	start := time.Unix(500, 0)
	controller.Observe(autoSample(start, 95, 0, false))
	got := controller.Observe(autoSample(start.Add(time.Second), 95, 0, false))
	if !got.Changed || got.Level != performancepolicy.LevelSaving || got.Reason != performancepolicy.ReasonUnavailable {
		t.Fatalf("CPU-only decision = %+v", got)
	}
	if got.Host.GameFrametimeMS != nil {
		t.Fatalf("unavailable frametime was published: %+v", got.Host)
	}
	recovered := controller.Observe(autoSample(start.Add(2*time.Second), 50, 10, true))
	if recovered.Reason == performancepolicy.ReasonUnavailable {
		t.Fatalf("recovered PresentMon kept unavailable: %+v", recovered)
	}
}

func TestAutoNeverOutperformsProfileRequestD4(t *testing.T) {
	controller := NewAutoController(performancepolicy.LevelSaving)
	if got := controller.Level(); got != performancepolicy.LevelSaving {
		t.Fatalf("initial level = %d", got)
	}
	start := time.Unix(600, 0)
	for second := 1; second <= 180; second++ {
		controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), 40, 10, true))
	}
	if got := controller.Level(); got != performancepolicy.LevelSaving {
		t.Fatalf("controller exceeded profile request: %d", got)
	}
	decision := controller.SetRequestedLevel(performancepolicy.LevelMinimum)
	if !decision.Changed || decision.Level != performancepolicy.LevelMinimum || decision.Reason != performancepolicy.ReasonUser {
		t.Fatalf("manual profile change = %+v", decision)
	}
}

func TestAutoDoesNotChangeWhenLMUIsNotForeground(t *testing.T) {
	controller := NewAutoController(performancepolicy.LevelHigh)
	start := time.Unix(700, 0)
	for second := 1; second <= 60; second++ {
		sample := autoSample(start.Add(time.Duration(second)*time.Second), 99, 20, true)
		sample.Game.Foreground = false
		controller.Observe(sample)
	}
	if got := controller.Level(); got != performancepolicy.LevelBalanced {
		t.Fatalf("background changed level to %d", got)
	}
}

func TestAutoControllerDoesNotExposeUnwiredVRState(t *testing.T) {
	if _, exists := reflect.TypeOf(NewAutoController(performancepolicy.LevelHigh)).MethodByName("SetVR"); exists {
		t.Fatal("SetVR is exported without a canonical production caller")
	}
}

func TestAutoThresholdBoundariesAndOscillationAreStable(t *testing.T) {
	t.Run("exact CPU boundaries", func(t *testing.T) {
		controller := NewAutoController(performancepolicy.LevelHigh)
		start := time.Unix(800, 0)
		controller.Observe(autoSample(start, 70, 10, true))
		for second := 1; second <= 90; second++ {
			cpu := 69.9
			if second%2 == 0 {
				cpu = 70.1
			}
			if got := controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), cpu, 10, true)); got.Changed {
				t.Fatalf("oscillation around 70 changed at %d: %+v", second, got)
			}
		}
		for second := 91; second <= 100; second++ {
			cpu := 90.0
			if second%2 == 0 {
				cpu = 90.1
			}
			if got := controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), cpu, 10, true)); got.Changed {
				t.Fatalf("non-consecutive overload changed at %d: %+v", second, got)
			}
		}
	})

	t.Run("exact frametime boundaries", func(t *testing.T) {
		controller := NewAutoController(performancepolicy.LevelHigh)
		start := time.Unix(900, 0)
		controller.Observe(autoSample(start, 50, 10, true))
		for second := 1; second <= 30; second++ {
			if got := controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), 50, 10.3, true)); second < 30 && got.Changed {
				t.Fatalf("+3%% boundary promoted early at %d: %+v", second, got)
			} else if second == 30 && (!got.Changed || got.Level != performancepolicy.LevelHigh) {
				t.Fatalf("+3%% boundary did not promote at 30s: %+v", got)
			}
		}

		controller = NewAutoController(performancepolicy.LevelHigh)
		controller.Observe(autoSample(start, 50, 10, true))
		for second := 1; second <= 10; second++ {
			frame := 10.5001
			if second%2 == 0 {
				frame = 10.5
			}
			if got := controller.Observe(autoSample(start.Add(time.Duration(second)*time.Second), 50, frame, true)); got.Changed {
				t.Fatalf("non-consecutive +5%% overload changed at %d: %+v", second, got)
			}
		}
	})
}
