package app

import (
	"context"
	"sync"
	"testing"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/performance/sensor"
	"github.com/vantare/overlays/v2/pkg/config"
)

type runtimePolicyTarget struct {
	mu     sync.Mutex
	policy performancepolicy.Policy
}

func (target *runtimePolicyTarget) SetPerformancePolicy(policy performancepolicy.Policy) {
	target.mu.Lock()
	target.policy = performancepolicy.Resolve(policy, nil)
	target.mu.Unlock()
}
func (target *runtimePolicyTarget) PerformancePolicy() performancepolicy.Policy {
	target.mu.Lock()
	defer target.mu.Unlock()
	result := target.policy
	result.SourceHz = 60
	return result
}

type performanceEventEmitter struct {
	mu     sync.Mutex
	events []PerformanceLevelEvent
}

func (emitter *performanceEventEmitter) Emit(name string, value any) {
	if name != "performance:level" {
		return
	}
	emitter.mu.Lock()
	emitter.events = append(emitter.events, value.(PerformanceLevelEvent))
	emitter.mu.Unlock()
}

type performanceAnnouncer struct{ levels []performancepolicy.Level }

func (announcer *performanceAnnouncer) PublishPerformanceLevel(level performancepolicy.Level) error {
	announcer.levels = append(announcer.levels, level)
	return nil
}

func customRequestedPolicy(level performancepolicy.Level, standingsHz int) performancepolicy.Policy {
	policy := performancepolicy.Policy{Mode: performancepolicy.ModeCustom, Level: level, WidgetHz: performancepolicy.WidgetHzFor(level)}
	policy.WidgetHz["standings"] = performancepolicy.Hertz(standingsHz)
	return performancepolicy.Resolve(policy, nil)
}

func TestPerformanceRuntimeTracksProfileAToBWhileAutomaticIsActive(t *testing.T) {
	settings := PerformanceSettings{Mode: "auto", Level: 1}
	profileA := &config.ProfileDocumentV4{Performance: &config.ProfilePerformanceV4{
		Mode: config.ProfilePerformanceLevel, Level: 2,
	}}
	profileB := &config.ProfileDocumentV4{Performance: &config.ProfilePerformanceV4{
		Mode: config.ProfilePerformanceLevel, Level: 5,
	}}
	target := &runtimePolicyTarget{}
	runtime := NewPerformanceRuntime(
		func() PerformanceSampleRunner { return nil },
		settings,
		ResolvePerformancePolicy(settings, profileA),
		target, nil, nil, nil,
	)
	runtime.ApplyResolvedSettings(settings, ResolvePerformancePolicy(settings, profileA))
	if got := target.PerformancePolicy(); got.Mode != performancepolicy.ModeAuto || got.Level != performancepolicy.LevelBalanced {
		t.Fatalf("automatic profile A policy = %+v, want balanced floor", got)
	}

	runtime.ApplyResolvedSettings(settings, ResolvePerformancePolicy(settings, profileB))
	if got := target.PerformancePolicy(); got.Mode != performancepolicy.ModeAuto || got.Level != performancepolicy.LevelMinimum {
		t.Fatalf("automatic profile B policy = %+v, want profile floor level 5", got)
	}
}

func TestPerformanceRuntimeAppliesRequestedCapHotAndPreservesCustomOverrides(t *testing.T) {
	target := &runtimePolicyTarget{}
	settings := PerformanceSettings{Mode: "auto", Level: 3}
	runtime := NewPerformanceRuntime(func() PerformanceSampleRunner { return nil }, settings, customRequestedPolicy(performancepolicy.LevelHigh, 1), target, nil, nil, nil)
	start := time.Unix(1000, 0)
	runtime.Observe(sensor.Sample{At: start, Host: sensor.HostSample{CPUPct: 95}, Game: sensor.GameSample{Available: false}})
	runtime.Observe(sensor.Sample{At: start.Add(time.Second), Host: sensor.HostSample{CPUPct: 95}, Game: sensor.GameSample{Available: false}})
	if got := target.PerformancePolicy(); got.Level != performancepolicy.LevelSaving || got.WidgetHz["standings"].Signal() != "" {
		t.Fatalf("automatic drop policy = %+v", got)
	} else if hz, ok := got.WidgetHz["standings"].Hertz(); !ok || hz != 1 {
		t.Fatalf("custom standings override after drop = %+v", got.WidgetHz["standings"])
	}

	runtime.ApplyResolvedSettings(settings, customRequestedPolicy(performancepolicy.LevelMinimum, 1))
	if got := target.PerformancePolicy(); got.Level != performancepolicy.LevelMinimum {
		t.Fatalf("hot requested cap policy = %+v", got)
	} else if hz, ok := got.WidgetHz["standings"].Hertz(); !ok || hz != 1 {
		t.Fatalf("custom standings override after hot cap = %+v", got.WidgetHz["standings"])
	}
}

func TestPerformanceRuntimePreservesResolvedProfileCustomOverrideWhileAutoDrops(t *testing.T) {
	rate := config.ProfileWidgetRateV4{Hertz: 1}
	profile := &config.ProfileDocumentV4{
		Layouts: map[config.LayoutType]config.SessionLayoutV4{
			config.LayoutGeneral: {
				Type:    config.LayoutGeneral,
				Widgets: []config.WidgetInstanceV4{{ID: "standings-main", Type: config.WidgetTypeStandings}},
			},
		},
		Performance: &config.ProfilePerformanceV4{
			Mode: config.ProfilePerformanceCustom, Level: 3,
			Overrides: map[string]config.ProfilePerformanceOverrideV4{
				"standings-main": {Hz: &rate},
			},
		},
	}
	settings := PerformanceSettings{Mode: "auto", Level: 3}
	target := &runtimePolicyTarget{}
	runtime := NewPerformanceRuntime(
		func() PerformanceSampleRunner { return nil }, settings,
		ResolvePerformancePolicy(settings, profile), target, nil, nil, nil,
	)
	start := time.Unix(1000, 0)
	runtime.Observe(sensor.Sample{At: start, Host: sensor.HostSample{CPUPct: 95}})
	runtime.Observe(sensor.Sample{At: start.Add(time.Second), Host: sensor.HostSample{CPUPct: 95}})
	got := target.PerformancePolicy()
	if got.Level != performancepolicy.LevelSaving {
		t.Fatalf("automatic drop policy = %+v", got)
	}
	if hz, ok := got.WidgetHz["standings-main"].Hertz(); !ok || hz != 1 {
		t.Fatalf("resolved profile custom override after drop = %+v", got.WidgetHz["standings-main"])
	}
}

func TestPerformanceRuntimeFeedsAutoPolicyHotAndPublishesOnlyWhenVisible(t *testing.T) {
	target := &runtimePolicyTarget{}
	emitter := &performanceEventEmitter{}
	announcer := &performanceAnnouncer{}
	visible := false
	runtime := NewPerformanceRuntime(func() PerformanceSampleRunner { return nil }, PerformanceSettings{Mode: "auto", Level: 3}, performancepolicy.Policy{}, target, emitter, func() bool { return visible }, announcer)
	start := time.Unix(1000, 0)
	for second := 1; second <= 30; second++ {
		runtime.Observe(sensor.Sample{At: start.Add(time.Duration(second) * time.Second), Host: sensor.HostSample{CPUPct: 50}, Game: sensor.GameSample{Available: true, Foreground: true, FrametimeMS: 10}})
	}
	if got := target.PerformancePolicy(); got.Mode != performancepolicy.ModeAuto || got.Level != performancepolicy.LevelHigh || got.SourceHz != 60 {
		t.Fatalf("hot policy = %+v", got)
	}
	if len(emitter.events) != 0 {
		t.Fatalf("hidden hub received %d events", len(emitter.events))
	}
	if len(announcer.levels) != 1 || announcer.levels[0] != performancepolicy.LevelHigh {
		t.Fatalf("announcements = %v", announcer.levels)
	}
	visible = true
	runtime.Observe(sensor.Sample{At: start.Add(31 * time.Second), Host: sensor.HostSample{CPUPct: 50}, Game: sensor.GameSample{Available: false}})
	if len(emitter.events) != 1 || emitter.events[0].SourceHz != 60 || emitter.events[0].Host.GameFrametimeMS != nil {
		t.Fatalf("visible events = %+v", emitter.events)
	}
}

func TestPerformanceRuntimeReplacesHubVisibilityProviderAcrossRecreation(t *testing.T) {
	target := &runtimePolicyTarget{}
	emitter := &performanceEventEmitter{}
	runtime := NewPerformanceRuntime(func() PerformanceSampleRunner { return nil }, PerformanceSettings{Mode: "auto"}, performancepolicy.Policy{}, target, emitter, nil, nil)
	sample := sensor.Sample{At: time.Unix(1000, 0), Host: sensor.HostSample{CPUPct: 50}, Game: sensor.GameSample{Available: false}}

	runtime.SetHubVisibleProvider(func() bool { return true })
	runtime.Observe(sample)
	runtime.SetHubVisibleProvider(func() bool { return false })
	runtime.Observe(sample)
	runtime.Observe(sample)
	runtime.SetHubVisibleProvider(func() bool { return true })
	runtime.Observe(sample)

	if got := len(emitter.events); got != 2 {
		t.Fatalf("events across visible/destroyed/recreated hub = %d, want 2", got)
	}
}

func TestPerformanceRuntimeManualSettingStopsAutomaticAuthority(t *testing.T) {
	target := &runtimePolicyTarget{}
	runtime := NewPerformanceRuntime(func() PerformanceSampleRunner { return nil }, PerformanceSettings{Mode: "auto"}, performancepolicy.Policy{}, target, nil, nil, nil)
	runtime.ApplySettings(PerformanceSettings{Mode: "level", Level: 5})
	runtime.Observe(sensor.Sample{At: time.Now(), Host: sensor.HostSample{CPUPct: 20}})
	if got := target.PerformancePolicy(); got.Mode != performancepolicy.ModeLevel || got.Level != performancepolicy.LevelMinimum || got.Reason != "" {
		t.Fatalf("manual policy = %+v", got)
	}
}

func TestPerformanceRuntimeLifecycleStartsSamplerOnlyInAuto(t *testing.T) {
	started := make(chan struct{}, 1)
	runner := performanceRunnerFunc(func(ctx context.Context, _ func(sensor.Sample)) error {
		started <- struct{}{}
		<-ctx.Done()
		return nil
	})
	target := &runtimePolicyTarget{}
	runtime := NewPerformanceRuntime(func() PerformanceSampleRunner { return runner }, PerformanceSettings{Mode: "level", Level: 2}, performancepolicy.Policy{}, target, nil, nil, nil)
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
		t.Fatal("sampler started in manual")
	default:
	}
	runtime.ApplySettings(PerformanceSettings{Mode: "auto"})
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("sampler did not start in auto")
	}
	stopCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := runtime.Stop(stopCtx); err != nil {
		t.Fatal(err)
	}
}

type performanceRunnerFunc func(context.Context, func(sensor.Sample)) error

func (fn performanceRunnerFunc) Run(ctx context.Context, publish func(sensor.Sample)) error {
	return fn(ctx, publish)
}
