package app

import (
	"context"
	"errors"
	"fmt"
	"sync"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/performance/sensor"
)

type PerformanceSampleRunner interface {
	Run(context.Context, func(sensor.Sample)) error
}

type performancePolicyTarget interface {
	SetPerformancePolicy(performancepolicy.Policy)
	PerformancePolicy() performancepolicy.Policy
}

type performanceLevelAnnouncer interface {
	PublishPerformanceLevel(performancepolicy.Level) error
}

type PerformanceSamplerFactory func() PerformanceSampleRunner

type PerformanceRuntime struct {
	mu sync.Mutex
	wg sync.WaitGroup

	factory    PerformanceSamplerFactory
	target     performancePolicyTarget
	emitter    EventEmitter
	visible    func() bool
	announcer  performanceLevelAnnouncer
	foreground func(bool)
	trace      func(sensor.Sample, sensor.Decision)
	settings   PerformanceSettings
	controller *sensor.AutoController

	rootCtx    context.Context
	rootCancel context.CancelFunc
	laneCancel context.CancelFunc
	laneDone   chan struct{}
	started    bool
}

func (runtime *PerformanceRuntime) SetGameForegroundHandler(handler func(bool)) {
	if runtime == nil {
		return
	}
	runtime.mu.Lock()
	runtime.foreground = handler
	runtime.mu.Unlock()
}

func (runtime *PerformanceRuntime) SetTrace(handler func(sensor.Sample, sensor.Decision)) {
	if runtime == nil {
		return
	}
	runtime.mu.Lock()
	runtime.trace = handler
	runtime.mu.Unlock()
}

func NewPerformanceRuntime(
	factory PerformanceSamplerFactory,
	settings PerformanceSettings,
	target performancePolicyTarget,
	emitter EventEmitter,
	visible func() bool,
	announcer performanceLevelAnnouncer,
) *PerformanceRuntime {
	return &PerformanceRuntime{
		factory: factory, settings: settings, target: target, emitter: emitter,
		visible: visible, announcer: announcer,
		controller: sensor.NewAutoController(performancepolicy.LevelHigh),
	}
}

func (runtime *PerformanceRuntime) Start(parent context.Context) error {
	if runtime == nil || runtime.factory == nil || runtime.target == nil {
		return errors.New("performance runtime: incomplete dependencies")
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.started {
		return nil
	}
	runtime.rootCtx, runtime.rootCancel = context.WithCancel(parent)
	runtime.started = true
	runtime.applyPolicyLocked()
	if runtime.settings.Mode == string(performancepolicy.ModeAuto) {
		runtime.startLaneLocked()
	}
	return nil
}

func (runtime *PerformanceRuntime) ApplySettings(settings PerformanceSettings) {
	if runtime == nil {
		return
	}
	runtime.mu.Lock()
	wasAuto := runtime.settings.Mode == string(performancepolicy.ModeAuto)
	isAuto := settings.Mode == string(performancepolicy.ModeAuto)
	runtime.settings = settings
	if isAuto && !wasAuto {
		runtime.controller = sensor.NewAutoController(performancepolicy.LevelHigh)
	}
	runtime.applyPolicyLocked()
	var stopped <-chan struct{}
	if runtime.started && isAuto != wasAuto {
		if isAuto {
			runtime.startLaneLocked()
		} else {
			stopped = runtime.stopLaneLocked()
		}
	}
	runtime.mu.Unlock()
	if stopped != nil {
		<-stopped
	}
}

func (runtime *PerformanceRuntime) Stop(ctx context.Context) error {
	if runtime == nil {
		return nil
	}
	runtime.mu.Lock()
	if runtime.rootCancel != nil {
		runtime.rootCancel()
	}
	runtime.stopLaneLocked()
	runtime.started = false
	runtime.mu.Unlock()
	done := make(chan struct{})
	go func() { runtime.wg.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (runtime *PerformanceRuntime) startLaneLocked() {
	if runtime.laneCancel != nil || runtime.rootCtx == nil {
		return
	}
	runner := runtime.factory()
	if runner == nil {
		return
	}
	ctx, cancel := context.WithCancel(runtime.rootCtx)
	runtime.laneCancel = cancel
	done := make(chan struct{})
	runtime.laneDone = done
	runtime.wg.Add(1)
	go func() {
		defer runtime.wg.Done()
		defer close(done)
		if err := runner.Run(ctx, runtime.Observe); err != nil && ctx.Err() == nil {
			// El evento no contiene rutas ni payloads; deja el fallo visible sin
			// inventar muestras.
			if runtime.emitter != nil {
				runtime.emitter.Emit("performance:error", map[string]any{"message": err.Error()})
			}
		}
	}()
}

func (runtime *PerformanceRuntime) stopLaneLocked() <-chan struct{} {
	done := runtime.laneDone
	if runtime.laneCancel != nil {
		runtime.laneCancel()
		runtime.laneCancel = nil
	}
	runtime.laneDone = nil
	return done
}

// Observe es público para harnesses deterministas; producción lo recibe del
// sampler de 1 Hz.
func (runtime *PerformanceRuntime) Observe(sample sensor.Sample) {
	runtime.mu.Lock()
	if runtime.settings.Mode != string(performancepolicy.ModeAuto) {
		runtime.mu.Unlock()
		return
	}
	decision := runtime.controller.Observe(sample)
	policy := ResolveAutomaticPerformancePolicy(decision.Level, decision.Reason)
	runtime.target.SetPerformancePolicy(policy)
	snapshot := runtime.target.PerformancePolicy()
	visible := runtime.visible == nil || runtime.visible()
	announcer := runtime.announcer
	foreground := runtime.foreground
	trace := runtime.trace
	emitter := runtime.emitter
	runtime.mu.Unlock()

	if foreground != nil {
		foreground(sample.Game.Foreground)
	}
	if trace != nil {
		trace(sample, decision)
	}
	if visible && emitter != nil {
		emitter.Emit("performance:level", PerformanceLevelEvent{Policy: snapshot, Host: decision.Host})
	}
	if decision.Changed && announcer != nil {
		_ = announcer.PublishPerformanceLevel(decision.Level)
	}
}

func (runtime *PerformanceRuntime) applyPolicyLocked() {
	if runtime.target == nil {
		return
	}
	if runtime.settings.Mode == string(performancepolicy.ModeAuto) {
		runtime.target.SetPerformancePolicy(ResolveAutomaticPerformancePolicy(runtime.controller.Level(), performancepolicy.ReasonUser))
		return
	}
	runtime.target.SetPerformancePolicy(ResolvePerformancePolicy(runtime.settings))
}

type PerformanceLevelEvent struct {
	performancepolicy.Policy
	Host sensor.HostPayload `json:"host"`
}

func (event PerformanceLevelEvent) Validate() error {
	if event.Level < performancepolicy.LevelMaximum || event.Level > performancepolicy.LevelMinimum {
		return fmt.Errorf("performance event level %d", event.Level)
	}
	return nil
}
