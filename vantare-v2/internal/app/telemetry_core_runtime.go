package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	telemetryengine "github.com/vantare/overlays/v2/internal/telemetry/engine"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

const (
	telemetryCoreStatusInterval   = 100 * time.Millisecond
	defaultTelemetryWatchdogDelay = time.Second
	sourceRateWindow              = 2 * time.Second
	sourceRateMaxSamples          = 2048
)

type telemetryRuntimeLifecycle uint8

const (
	telemetryRuntimeNew telemetryRuntimeLifecycle = iota
	telemetryRuntimeStarting
	telemetryRuntimeRunning
	telemetryRuntimeTerminal
)

type engineerInitialStatusDelivery uint8

const (
	engineerInitialStatusIdle engineerInitialStatusDelivery = iota
	engineerInitialStatusPending
	engineerInitialStatusDelivering
	engineerInitialStatusDelivered
	engineerInitialStatusSkipped
)

// EngineerProjectionConsumer is the in-process product boundary owned by the
// composition root. Implementations consume versioned product values and must
// never be given a driver, mapping or canonical mutable state. Callbacks are
// delivered by an isolated port. Implementations must not call
// TelemetryCoreRuntime.Start or Stop. The composition root owns lifecycle.
type EngineerProjectionConsumer interface {
	ConsumeSourceStatus(engineerprojection.SourceStatusV1) error
	ConsumeObservation(engineerprojection.ObservationSnapshotV1) error
	ConsumeFact(engineerprojection.FactEnvelopeV1) error
}

// TelemetryCoreRuntimeConfig configures the canonical product runtime.
type TelemetryCoreRuntimeConfig struct {
	Enabled bool
	// PerformancePolicy es el nivel efectivo inicial decidido desde Ajustes.
	PerformancePolicy performancepolicy.Policy
	// Now is injectable for deterministic freshness tests. It defaults to
	// time.Now and must preserve the monotonic component in production.
	Now func() time.Time
	// WatchdogTimeout is the maximum age of the last accepted frame before a
	// live source is published as stale. Values <= 0 use the one-second default.
	WatchdogTimeout time.Duration
	// TelemetryWatchdogEnabled defaults to on when nil. Point it to false for
	// one-cycle rollback to the previous frozen-fresh behavior.
	TelemetryWatchdogEnabled *bool
	// TelemetryFailurePolicyV2 defaults to on when nil. Point it to false for
	// one-cycle rollback to the legacy fail-stop consumer policy.
	TelemetryFailurePolicyV2 *bool
	// TelemetryEngineApply defaults to on when nil. Point it to false for
	// one-cycle rollback to the previous explicit stage orchestration.
	TelemetryEngineApply *bool
	// OverlayFrameV2Shadow defaults to on. It remains observational: without
	// an active v2 consumer the frame is neither built nor published.
	OverlayFrameV2Shadow *bool
	// EngineerAsyncPort defaults to on when nil. Point it to false for a
	// one-cycle rollback to synchronous Engineer delivery.
	EngineerAsyncPort *bool
	// EngineerConsumeTimeout bounds each asynchronous observation callback.
	// Values <= 0 use 250 milliseconds.
	EngineerConsumeTimeout time.Duration
	// EngineerFactQueueCapacity bounds the ordered facts channel and retained
	// resync window. Values <= 0 use 64 facts.
	EngineerFactQueueCapacity int
	// StrategyPublicTransport restores the previous Strategy Hub, Wails and
	// SSE publication for one rollback cycle. It is off by default.
	StrategyPublicTransport bool
	// TelemetryShadowEvery controls semantic comparison sampling while the
	// engine flag is on. Zero uses one comparison every 30 accepted batches.
	TelemetryShadowEvery uint64
	// TelemetryShadowBudget bounds one isolated legacy shadow application.
	// Values <= 0 use two milliseconds; overruns disable only the shadow.
	TelemetryShadowBudget time.Duration
	// Emit runs on an adapter goroutine owned by Stop. Implementations must
	// return from Emit and must not call Stop synchronously from that callback.
	Emitter  telemetrytransport.EventEmitter
	Engineer EngineerProjectionConsumer
	// Simulator registers the active simulator. Nil uses
	// DefaultTelemetrySimulator, which is LMU. The composition root never
	// names a driver observation type, so a second simulator is a
	// configuration change rather than a runtime change.
	Simulator *TelemetrySimulator
	// TelemetrySimXDriver registers the synthetic diagnostic driver instead of
	// the default one. It is off unless explicitly pointed at true, and an
	// explicit Simulator always wins over it.
	TelemetrySimXDriver *bool
}

// TelemetryCoreMetrics is a payload-free operational summary. It is safe to
// expose through local diagnostics because it contains only counters and
// bounded transport state. StrategyProjectionsPublished keeps its current
// semantics and StrategyTransport is the single surviving product transport.
type TelemetryCoreMetrics struct {
	ObservationsReceived         uint64
	ObservationsRejected         uint64
	BatchesApplied               uint64
	StrategyProjectionsPublished uint64
	EngineerStatusesDelivered    uint64
	EngineerObservations         uint64
	EngineerFacts                uint64
	EngineerDeliveryFailures     uint64
	FramesDropped                map[string]uint64
	FramesRejected               map[string]uint64
	PublishFailures              map[string]uint64
	ConsumerPanics               map[string]uint64
	ConsumerRecover              map[string]uint64
	FailStops                    uint64
	LastFrameAgeMs               uint64
	WatchdogDegradations         uint64
	PayloadBytes                 map[string]TelemetryPayloadPercentiles
	LifecycleTransitions         map[string]uint64
	StrategyTransport            telemetrytransport.HubMetrics
	ShadowMismatches             map[string]uint64
	ShadowDisabled               bool
	EngineSequence               uint64
	SlotGraceReopen              uint64
	SlotGenerationBumps          uint64
	IdentityEvicted              uint64
	ApplyDurationUs              TelemetryDurationPercentiles
	OverlayV2PayloadBytes        map[string]TelemetryPayloadPercentiles
	OverlayV2BuildDurationUs     TelemetryDurationPercentiles
	PublisherDroppedFrames       map[string]uint64
	EngineerConsumeLatencyMs     TelemetryDurationPercentiles
	EngineerStatesDropped        uint64
	EngineerTimeouts             uint64
	EngineerFactResync           uint64
	EngineerFactQueueDepth       uint64
	EngineerFactsDropped         uint64
}

type telemetryCoreCounters struct {
	observationsReceived      atomic.Uint64
	observationsRejected      atomic.Uint64
	batchesApplied            atomic.Uint64
	strategyProjections       atomic.Uint64
	engineerStatusesDelivered atomic.Uint64
	engineerObservations      atomic.Uint64
	engineerFacts             atomic.Uint64
	engineerFailures          atomic.Uint64
	failStops                 atomic.Uint64
	engineSequence            atomic.Uint64
}

// TelemetryCoreRuntime owns the canonical pipeline of the registered
// simulator and publishes only versioned product projections.
type TelemetryCoreRuntime struct {
	lifecycleMu sync.Mutex
	mu          sync.Mutex
	lifecycle   telemetryRuntimeLifecycle
	startDone   chan struct{}
	cleanupDone chan struct{}
	cleanupErr  error

	managerStarted         bool
	initialStatusDelivery  engineerInitialStatusDelivery
	stoppedStatusPending   bool
	stoppedStatusDelivered bool

	enabled                  bool
	telemetryFailurePolicyV2 bool
	telemetryEngineApply     bool
	overlayFrameV2Shadow     bool
	engineerAsyncPort        bool
	emitter                  telemetrytransport.EventEmitter
	strategyHub              *telemetrytransport.Hub
	overlayV2Publishers      *telemetrytransport.PublisherRegistry
	simulator                telemetrycore.SimulatorRuntime
	reducer                  *telemetrycore.Reducer
	coord                    *telemetrycore.SessionCoordinator
	derive                   *derive.Pipeline
	engine                   *telemetryengine.TelemetryEngine
	shadow                   *telemetryShadow
	engineer                 EngineerProjectionConsumer
	engineerPort             *engineerPort
	engineerManifest         engineerprojection.Manifest
	capabilities             capability.Set
	capabilityDeclaration    capability.Declaration
	descriptorCapabilities   []string

	statusState     driver.State
	statusAttempt   int
	now             func() time.Time
	watchdogDelay   time.Duration
	watchdogEnabled bool
	lastFrameAt     time.Time
	sourceFrameAt   []time.Time
	sourceHz        float64
	watchdogStale   bool
	// Solo lo toca la goroutine monitor; sirve para no repetir la misma linea
	// de error terminal en cada tick.
	lastTerminalErr error
	statusRev       uint64

	cancel                    context.CancelFunc
	wg                        sync.WaitGroup
	runErr                    error
	engineerErr               error
	engineerStatusErr         error
	counters                  telemetryCoreCounters
	metricStore               telemetryCoreMetricStore
	overlayV2Project          func(envelope.Snapshot[derive.FinalState], overlayv2.SourceContextV2, overlayv2.PreferencesV2, uint64) (overlayv2.UpdateV2, error)
	overlayV2SetCadence       func(overlayv2.SectionCadence)
	overlayV2DeliveryRevision uint64
	performancePolicy         performancepolicy.Policy
	performanceRevision       uint64
}

// NewTelemetryCoreRuntime is side-effect free; Start owns all goroutines and
// the LMU mapping lifecycle.
func NewTelemetryCoreRuntime(config TelemetryCoreRuntimeConfig) (*TelemetryCoreRuntime, error) {
	now := config.Now
	if now == nil {
		now = time.Now
	}
	watchdogDelay := config.WatchdogTimeout
	if watchdogDelay <= 0 {
		watchdogDelay = defaultTelemetryWatchdogDelay
	}
	watchdogEnabled := true
	if config.TelemetryWatchdogEnabled != nil {
		watchdogEnabled = *config.TelemetryWatchdogEnabled
	}
	failurePolicyV2 := true
	if config.TelemetryFailurePolicyV2 != nil {
		failurePolicyV2 = *config.TelemetryFailurePolicyV2
	}
	engineApply := true
	if config.TelemetryEngineApply != nil {
		engineApply = *config.TelemetryEngineApply
	}
	overlayFrameV2Shadow := true
	if config.OverlayFrameV2Shadow != nil {
		overlayFrameV2Shadow = *config.OverlayFrameV2Shadow
	}
	engineerAsyncPort := true
	if config.EngineerAsyncPort != nil {
		engineerAsyncPort = *config.EngineerAsyncPort
	}
	overlayV2Publishers, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{
		Product: telemetrytransport.ProductOverlayV2,
	})
	if err != nil {
		return nil, fmt.Errorf("build Overlay v2 publisher registry: %w", err)
	}
	simulatorConfig := resolveTelemetrySimulator(config)
	if err := simulatorConfig.validate(); err != nil {
		return nil, err
	}
	// Capabilities are declared by the driver, never by the composition root.
	// No session evidence exists yet at construction time, so every supported
	// capability starts as declared-but-not-yet-observed.
	capabilities, err := capability.Resolve(simulatorConfig.Capabilities, nil)
	if err != nil {
		return nil, fmt.Errorf("resolve active driver capabilities: %w", err)
	}
	// The reconnect budget is deliberately large: "the simulator is not
	// running" is indistinguishable from a transient disconnect here, and it
	// is the normal state whenever the Hub is open without a session. The
	// budget is also restored by RetryPolicy.StableRun after any run that
	// lasted, so an evening of sessions no longer spends it down towards a
	// permanent death.
	simulator, err := simulatorConfig.New(telemetrycore.ManagerConfig{
		Retry: telemetrycore.RetryPolicy{MaxReconnects: 1_000},
		TerminalRunError: func(err error) bool {
			return !failurePolicyV2 || classifyTelemetryError(err) == failureProgramming
		},
	})
	if err != nil {
		return nil, fmt.Errorf("build telemetry simulator runtime: %w", err)
	}
	engineerManifest, err := engineerprojection.NewManifest(engineerCapabilities(capabilities))
	if err != nil {
		return nil, fmt.Errorf("build Engineer capability manifest: %w", err)
	}
	reducer := telemetrycore.NewReducer()
	coordinator := telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{Now: now})
	pipeline := derive.NewPipeline(derive.Config{FuelUsageWindow: derive.DefaultFuelUsageWindowProduct})
	var strategyHub *telemetrytransport.Hub
	if config.StrategyPublicTransport {
		strategyHub = telemetrytransport.NewHub(telemetrytransport.HubConfig{
			Product: telemetrytransport.ProductStrategy,
			Versions: projection.VersionPolicy{
				Current:          strategyprojection.CurrentVersion,
				MinimumSupported: strategyprojection.MinimumSupportedVersion,
			},
		})
	}
	overlayV2Project, overlayV2SetCadence := newCachedOverlayV2Project()
	effectivePerformance := performancepolicy.Resolve(config.PerformancePolicy, nil)
	logPerformanceDiagnostics(config.PerformancePolicy, effectivePerformance)
	runtime := &TelemetryCoreRuntime{
		enabled:                  config.Enabled,
		telemetryFailurePolicyV2: failurePolicyV2,
		telemetryEngineApply:     engineApply,
		overlayFrameV2Shadow:     overlayFrameV2Shadow,
		engineerAsyncPort:        engineerAsyncPort,
		emitter:                  config.Emitter,
		strategyHub:              strategyHub,
		overlayV2Publishers:      overlayV2Publishers,
		simulator:                simulator,
		reducer:                  reducer,
		coord:                    coordinator,
		derive:                   pipeline,
		engine:                   telemetryengine.New(reducer, coordinator, pipeline),
		shadow:                   newTelemetryShadow(config.TelemetryShadowEvery, config.TelemetryShadowBudget, now),
		engineer:                 config.Engineer,
		engineerManifest:         engineerManifest,
		capabilities:             capabilities,
		capabilityDeclaration:    simulatorConfig.Capabilities,
		descriptorCapabilities:   descriptorCapabilityTokens(simulatorConfig.Descriptor, capabilities),
		now:                      now,
		watchdogDelay:            watchdogDelay,
		watchdogEnabled:          watchdogEnabled,
		overlayV2Project:         overlayV2Project,
		overlayV2SetCadence:      overlayV2SetCadence,
		performancePolicy:        effectivePerformance,
		performanceRevision:      1,
	}
	if engineerAsyncPort {
		runtime.engineerPort = newEngineerPort(runtime, config.Engineer, config.EngineerConsumeTimeout, config.EngineerFactQueueCapacity)
	}
	return runtime, nil
}

// StrategyHub exposes the single surviving product transport.
func (runtime *TelemetryCoreRuntime) StrategyHub() *telemetrytransport.Hub {
	if runtime == nil {
		return nil
	}
	return runtime.strategyHub
}

func (runtime *TelemetryCoreRuntime) OverlayV2Publishers() *telemetrytransport.PublisherRegistry {
	if runtime == nil {
		return nil
	}
	return runtime.overlayV2Publishers
}

// SetPerformancePolicy publica una nueva decisión de Go. El projector toma la
// cadencia y el contrato juntos en el siguiente tick V2.
func (runtime *TelemetryCoreRuntime) SetPerformancePolicy(policy performancepolicy.Policy) {
	if runtime == nil {
		return
	}
	resolved := performancepolicy.Resolve(policy, nil)
	runtime.mu.Lock()
	if samePerformancePolicy(runtime.performancePolicy, resolved) {
		runtime.mu.Unlock()
		return
	}
	logPerformanceDiagnostics(policy, resolved)
	runtime.performancePolicy = resolved
	runtime.performanceRevision++
	runtime.mu.Unlock()
	runtime.emitPerformanceLevel(resolved)
}

// EmitPerformanceLevel refreshes the hub from the same Go authority carried
// by OverlayFrame v2. It does not infer policy in the web layer.
func (runtime *TelemetryCoreRuntime) EmitPerformanceLevel() {
	if runtime == nil {
		return
	}
	runtime.mu.Lock()
	policy := runtime.performancePolicy
	runtime.mu.Unlock()
	runtime.emitPerformanceLevel(policy)
}

func (runtime *TelemetryCoreRuntime) emitPerformanceLevel(policy performancepolicy.Policy) {
	if runtime.emitter != nil {
		runtime.emitter.Emit("performance:level", overlayPerformancePolicy(policy, 0))
	}
}

// PerformancePolicy devuelve el mismo snapshot que publica Overlay v2,
// incluida la frecuencia real observada del driver.
func (runtime *TelemetryCoreRuntime) PerformancePolicy() performancepolicy.Policy {
	if runtime == nil {
		return performancepolicy.Resolve(performancepolicy.Policy{}, nil)
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	result := runtime.performancePolicy
	result.SourceHz = runtime.sourceHz
	result.WidgetHz = make(map[string]performancepolicy.WidgetRate, len(runtime.performancePolicy.WidgetHz))
	for widget, rate := range runtime.performancePolicy.WidgetHz {
		result.WidgetHz[widget] = rate
	}
	if runtime.performancePolicy.RafCap != nil {
		value := *runtime.performancePolicy.RafCap
		result.RafCap = &value
	}
	return result
}

func logPerformanceDiagnostics(requested, resolved performancepolicy.Policy) {
	// Una configuración vacía es habitual en tests y significa fallback, no una
	// elección explícita del usuario que merezca diagnóstico operativo.
	if requested.Level < performancepolicy.LevelBalanced || requested.Level > performancepolicy.LevelMinimum {
		return
	}
	for _, diagnostic := range performancepolicy.Diagnostics(resolved) {
		log.Printf("performance diagnostic: %s", diagnostic)
	}
}

func samePerformancePolicy(left, right performancepolicy.Policy) bool {
	if left.Level != right.Level || left.Mode != right.Mode || left.Effects != right.Effects ||
		left.Reason != right.Reason || len(left.WidgetHz) != len(right.WidgetHz) {
		return false
	}
	if (left.RafCap == nil) != (right.RafCap == nil) || left.RafCap != nil && *left.RafCap != *right.RafCap {
		return false
	}
	for widget, rate := range left.WidgetHz {
		if right.WidgetHz[widget] != rate {
			return false
		}
	}
	return true
}

func (runtime *TelemetryCoreRuntime) Metrics() TelemetryCoreMetrics {
	if runtime == nil {
		return TelemetryCoreMetrics{}
	}
	details := runtime.metricStore.snapshot()
	shadow := runtime.shadow.metrics()
	mapper := runtime.simulator.MapperMetrics()
	coordinator := runtime.coord.Metrics()
	return TelemetryCoreMetrics{
		ObservationsReceived:         runtime.counters.observationsReceived.Load(),
		ObservationsRejected:         runtime.counters.observationsRejected.Load(),
		BatchesApplied:               runtime.counters.batchesApplied.Load(),
		StrategyProjectionsPublished: runtime.counters.strategyProjections.Load(),
		EngineerStatusesDelivered:    runtime.counters.engineerStatusesDelivered.Load(),
		EngineerObservations:         runtime.counters.engineerObservations.Load(),
		EngineerFacts:                runtime.counters.engineerFacts.Load(),
		EngineerDeliveryFailures:     runtime.counters.engineerFailures.Load(),
		FramesDropped:                details.framesDropped,
		FramesRejected:               details.framesRejected,
		PublishFailures:              details.publishFailures,
		ConsumerPanics:               details.consumerPanics,
		ConsumerRecover:              details.consumerRecover,
		FailStops:                    runtime.counters.failStops.Load(),
		LastFrameAgeMs:               runtime.lastFrameAgeMilliseconds(),
		WatchdogDegradations:         details.watchdogDegradations,
		PayloadBytes:                 details.payloadBytes,
		LifecycleTransitions:         details.lifecycleTransitions,
		StrategyTransport:            strategyHubMetrics(runtime.strategyHub),
		ShadowMismatches:             shadow.mismatches,
		ShadowDisabled:               shadow.disabled,
		EngineSequence:               runtime.counters.engineSequence.Load(),
		SlotGraceReopen:              mapper.SlotGraceReopen,
		SlotGenerationBumps:          mapper.SlotGenerationBumps,
		IdentityEvicted:              coordinator.IdentityEvicted,
		ApplyDurationUs:              details.applyDurationUs,
		OverlayV2PayloadBytes:        details.overlayV2PayloadBytes,
		OverlayV2BuildDurationUs:     details.overlayV2BuildDurationUs,
		PublisherDroppedFrames: map[string]uint64{
			string(telemetrytransport.ProductOverlayV2): runtime.overlayV2Publishers.DroppedFrames(telemetrytransport.ProductOverlayV2),
		},
		EngineerConsumeLatencyMs: details.engineerConsumeLatencyMs,
		EngineerStatesDropped:    details.engineerStatesDropped,
		EngineerTimeouts:         details.engineerTimeouts,
		EngineerFactResync:       details.engineerFactResync,
		EngineerFactQueueDepth:   details.engineerFactQueueDepth,
		EngineerFactsDropped:     details.engineerFactsDropped,
	}
}

func strategyHubMetrics(hub *telemetrytransport.Hub) telemetrytransport.HubMetrics {
	if hub == nil {
		return telemetrytransport.HubMetrics{}
	}
	return hub.Metrics()
}

// SourceStatus returns the canonical runtime's closed connection summary.
// Live identifies a real simulator source; Available requires a usable live or
// degraded driver state. No telemetry payload or internal error crosses this
// boundary.
func (runtime *TelemetryCoreRuntime) SourceStatus() driver.SourceStatus {
	if runtime == nil || !runtime.enabled {
		return driver.UnknownSourceStatus()
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return driver.SourceStatus{
		Kind: "lmu",
		Name: "Le Mans Ultimate",
		Live: true,
		// Available responde a "hay conexion con el simulador", que es para lo
		// que lo usan sus consumidores: el indicador del Topbar y si se puede
		// elegir la fuente LIVE en el Studio. Stale no rompe esa conexion --
		// significa que el simulador no ha movido su reloj de sesion, tipico de
		// una pausa o un menu -- y excluirlo deshabilitaba LIVE por un bache de
		// medio segundo. Quedaba ademas al reves que degraded, que significa "no
		// reconozco esta version" y si contaba como disponible. La frescura
		// sigue expuesta en State para quien la necesite.
		Available:        runtime.statusState == driver.StateLive || runtime.statusState == driver.StateDegraded || runtime.statusState == driver.StateStale,
		State:            runtime.statusState.String(),
		ReconnectAttempt: runtime.statusAttempt,
	}
}

// EngineerError reports only the current product-consumer failure. Engineer
// delivery is isolated: a consumer failure never stops LMU or Overlay.
func (runtime *TelemetryCoreRuntime) EngineerError() error {
	if runtime == nil {
		return nil
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return errors.Join(runtime.engineerErr, runtime.engineerStatusErr)
}

func (runtime *TelemetryCoreRuntime) Start(parent context.Context) error {
	if runtime == nil || parent == nil {
		return errors.New("telemetry core runtime requires a parent context")
	}
	if err := parent.Err(); err != nil {
		return err
	}
	runtime.lifecycleMu.Lock()
	if err := parent.Err(); err != nil {
		runtime.lifecycleMu.Unlock()
		return err
	}
	switch runtime.lifecycle {
	case telemetryRuntimeTerminal:
		runtime.lifecycleMu.Unlock()
		return telemetrytransport.ErrClosed
	case telemetryRuntimeStarting, telemetryRuntimeRunning:
		runtime.lifecycleMu.Unlock()
		return telemetrycore.ErrManagerAlreadyStarted
	}
	ctx, cancel := context.WithCancel(parent)
	runtime.transitionLifecycleLocked(telemetryRuntimeStarting)
	runtime.cancel = cancel
	runtime.startDone = make(chan struct{})
	runtime.initialStatusDelivery = engineerInitialStatusPending
	runtime.lifecycleMu.Unlock()

	initial := driver.StateStopped
	if runtime.enabled {
		initial = driver.StateDetecting
	}
	if err := runtime.setStatus(initial, 0); err != nil {
		return runtime.abortStart(err)
	}
	runtime.lifecycleMu.Lock()
	if runtime.lifecycle == telemetryRuntimeStarting {
		runtime.transitionLifecycleLocked(telemetryRuntimeRunning)
	}
	terminal := runtime.lifecycle == telemetryRuntimeTerminal
	runtime.finishStartLocked()
	runtime.lifecycleMu.Unlock()
	if terminal {
		return telemetrytransport.ErrClosed
	}
	if runtime.engineerAsyncPort {
		runtime.engineerPort.Start()
	}
	runtime.deliverInitialEngineerStatus(initial, 0)

	runtime.lifecycleMu.Lock()
	terminal = runtime.lifecycle == telemetryRuntimeTerminal
	if terminal {
		runtime.lifecycleMu.Unlock()
		return telemetrytransport.ErrClosed
	}
	if err := ctx.Err(); err != nil {
		runtime.lifecycleMu.Unlock()
		return runtime.abortStart(err)
	}
	if runtime.enabled {
		if err := runtime.simulator.Start(ctx, runtimeBatchSink{runtime: runtime}, telemetrycore.SimulatorHooks{
			ObservationReceived: func() { runtime.counters.observationsReceived.Add(1) },
			ObservationRejected: runtime.recordRejectedObservation,
		}); err != nil {
			runtime.lifecycleMu.Unlock()
			return runtime.abortStart(fmt.Errorf("start telemetry core manager: %w", err))
		}
		runtime.managerStarted = true
		runtime.wg.Add(1)
		go runtime.monitor(ctx)
	}
	// Overlay delivery is pull-based and window-targeted at the Wails
	// composition boundary. Starting a global bridge here broadcasts every
	// frame to Hub and can queue unbounded ExecuteScript calls in WebView2.
	if runtime.emitter != nil && runtime.strategyHub != nil {
		runtime.wg.Add(1)
		go runtime.serveWails(ctx, telemetrytransport.ProductStrategy, runtime.strategyHub)
	}
	runtime.lifecycleMu.Unlock()
	return nil
}

func (runtime *TelemetryCoreRuntime) Stop(ctx context.Context) error {
	if runtime == nil || ctx == nil {
		return nil
	}
	runtime.lifecycleMu.Lock()
	if runtime.cleanupDone != nil {
		done := runtime.cleanupDone
		runtime.lifecycleMu.Unlock()
		select {
		case <-done:
			return runtime.stopResult()
		case <-ctx.Done():
			return errors.Join(runtime.stopResult(), fmt.Errorf("stop telemetry core runtime: %w", ctx.Err()))
		}
	}
	previous := runtime.lifecycle
	runtime.transitionLifecycleLocked(telemetryRuntimeTerminal)
	runtime.cleanupDone = make(chan struct{})
	done := runtime.cleanupDone
	cancel := runtime.cancel
	runtime.cancel = nil
	startDone := runtime.startDone
	hadOwnership := previous == telemetryRuntimeStarting || previous == telemetryRuntimeRunning ||
		cancel != nil || runtime.managerStarted
	runtime.lifecycleMu.Unlock()

	if cancel != nil {
		cancel()
	}
	if startDone != nil {
		<-startDone
	}
	runtime.lifecycleMu.Lock()
	managerStarted := runtime.managerStarted
	runtime.managerStarted = false
	runtime.lifecycleMu.Unlock()

	var stopErr error
	if managerStarted {
		stopErr = runtime.simulator.Stop(ctx)
	}
	waitDone := make(chan struct{})
	go func() {
		runtime.wg.Wait()
		close(waitDone)
	}()
	select {
	case <-waitDone:
	case <-ctx.Done():
		stopErr = errors.Join(stopErr, fmt.Errorf("stop telemetry core runtime: %w", ctx.Err()))
	}
	if hadOwnership {
		runtime.requestStoppedEngineerStatus()
	}
	runtime.requestEngineerPortStopWhenReady()
	// Normal teardown lets adapters and the monitor observe cancellation before
	// hubs close. A timed-out wait still reaches Close so no transport remains
	// usable after Stop returns.
	stopErr = errors.Join(stopErr, runtime.closeProductHubs())

	runtime.mu.Lock()
	runtime.statusState = driver.StateStopped
	runtime.statusAttempt = 0
	runtime.mu.Unlock()
	runtime.lifecycleMu.Lock()
	runtime.cleanupErr = errors.Join(runtime.cleanupErr, stopErr)
	close(done)
	runtime.lifecycleMu.Unlock()
	return runtime.stopResult()
}

func (runtime *TelemetryCoreRuntime) finishStartLocked() {
	if runtime.startDone == nil {
		return
	}
	close(runtime.startDone)
	runtime.startDone = nil
}

func (runtime *TelemetryCoreRuntime) transitionLifecycleLocked(next telemetryRuntimeLifecycle) {
	previous := runtime.lifecycle
	if previous == next {
		return
	}
	runtime.lifecycle = next
	runtime.metricStore.lifecycleTransition(previous, next)
}

func (runtime *TelemetryCoreRuntime) abortStart(startErr error) error {
	runtime.lifecycleMu.Lock()
	runtime.transitionLifecycleLocked(telemetryRuntimeTerminal)
	cancel := runtime.cancel
	runtime.cancel = nil
	runtime.managerStarted = false
	initialStatusDelivered := runtime.initialStatusDelivery == engineerInitialStatusDelivered
	if runtime.initialStatusDelivery == engineerInitialStatusPending {
		runtime.initialStatusDelivery = engineerInitialStatusSkipped
	}
	runtime.finishStartLocked()
	cleanupOwner := runtime.cleanupDone == nil
	if cleanupOwner {
		runtime.cleanupDone = make(chan struct{})
	}
	done := runtime.cleanupDone
	runtime.lifecycleMu.Unlock()

	if cancel != nil {
		cancel()
	}
	if initialStatusDelivered {
		runtime.requestStoppedEngineerStatusAndWait()
	}
	runtime.requestEngineerPortStopWhenReady()
	var cleanupErr error
	if cleanupOwner {
		cleanupErr = errors.Join(cleanupErr, runtime.closeProductHubs())
		runtime.wg.Wait()
		runtime.lifecycleMu.Lock()
		runtime.cleanupErr = errors.Join(runtime.cleanupErr, cleanupErr)
		close(done)
		runtime.lifecycleMu.Unlock()
	} else {
		<-done
	}
	return errors.Join(startErr, runtime.cleanupError())
}

func (runtime *TelemetryCoreRuntime) closeProductHubs() error {
	var result error
	if runtime.strategyHub != nil {
		if err := runtime.strategyHub.Close(); err != nil {
			result = errors.Join(result, fmt.Errorf("close Strategy telemetry hub: %w", err))
		}
	}
	return result
}

func (runtime *TelemetryCoreRuntime) cleanupError() error {
	runtime.lifecycleMu.Lock()
	defer runtime.lifecycleMu.Unlock()
	return runtime.cleanupErr
}

func (runtime *TelemetryCoreRuntime) stopResult() error {
	return errors.Join(runtime.cleanupError(), runtime.currentRunError())
}

func (runtime *TelemetryCoreRuntime) currentRunError() error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.runErr
}

func (runtime *TelemetryCoreRuntime) deliverInitialEngineerStatus(state driver.State, attempt int) {
	runtime.lifecycleMu.Lock()
	if runtime.lifecycle != telemetryRuntimeRunning ||
		runtime.initialStatusDelivery != engineerInitialStatusPending {
		runtime.lifecycleMu.Unlock()
		return
	}
	if runtime.engineer == nil {
		runtime.initialStatusDelivery = engineerInitialStatusSkipped
		runtime.lifecycleMu.Unlock()
		return
	}
	runtime.initialStatusDelivery = engineerInitialStatusDelivering
	runtime.lifecycleMu.Unlock()

	runtime.deliverInitialEngineerStatusValue(state, attempt)

	runtime.lifecycleMu.Lock()
	runtime.initialStatusDelivery = engineerInitialStatusDelivered
	deliverStopped := runtime.stoppedStatusPending && !runtime.stoppedStatusDelivered
	if deliverStopped {
		runtime.stoppedStatusPending = false
		runtime.stoppedStatusDelivered = true
	}
	runtime.lifecycleMu.Unlock()
	if deliverStopped {
		runtime.deliverInitialEngineerStatusValue(driver.StateStopped, 0)
	}
	runtime.requestEngineerPortStopWhenReady()
}

func (runtime *TelemetryCoreRuntime) deliverInitialEngineerStatusValue(state driver.State, attempt int) {
	if runtime.engineer == nil {
		return
	}
	status, err := engineerprojection.NewSourceStatusV1(engineerSourceState(state), attempt)
	if err != nil {
		runtime.counters.engineerFailures.Add(1)
		runtime.mu.Lock()
		runtime.engineerStatusErr = err
		runtime.mu.Unlock()
		return
	}
	if runtime.engineerAsyncPort && runtime.engineerPort.DeliverStatus(status) {
		return
	}
	runtime.consumeEngineerStatus(status)
}

func (runtime *TelemetryCoreRuntime) requestStoppedEngineerStatus() {
	runtime.lifecycleMu.Lock()
	if runtime.stoppedStatusDelivered {
		runtime.lifecycleMu.Unlock()
		return
	}
	if runtime.initialStatusDelivery == engineerInitialStatusDelivering {
		runtime.stoppedStatusPending = true
		runtime.lifecycleMu.Unlock()
		return
	}
	if runtime.initialStatusDelivery == engineerInitialStatusPending {
		runtime.initialStatusDelivery = engineerInitialStatusSkipped
	}
	runtime.stoppedStatusPending = false
	runtime.stoppedStatusDelivered = true
	runtime.lifecycleMu.Unlock()
	runtime.deliverEngineerStatus(driver.StateStopped, 0)
}

func (runtime *TelemetryCoreRuntime) requestStoppedEngineerStatusAndWait() {
	runtime.lifecycleMu.Lock()
	if runtime.stoppedStatusDelivered {
		runtime.lifecycleMu.Unlock()
		return
	}
	runtime.stoppedStatusPending = false
	runtime.stoppedStatusDelivered = true
	runtime.lifecycleMu.Unlock()
	runtime.deliverInitialEngineerStatusValue(driver.StateStopped, 0)
}

func (runtime *TelemetryCoreRuntime) requestEngineerPortStopWhenReady() {
	if runtime.engineerPort == nil {
		return
	}
	runtime.lifecycleMu.Lock()
	ready := runtime.lifecycle == telemetryRuntimeTerminal &&
		runtime.initialStatusDelivery != engineerInitialStatusDelivering
	runtime.lifecycleMu.Unlock()
	if ready {
		runtime.engineerPort.RequestStop()
	}
}

func (runtime *TelemetryCoreRuntime) serveWails(
	ctx context.Context,
	product telemetrytransport.ProductID,
	hub *telemetrytransport.Hub,
) {
	defer runtime.wg.Done()
	err := telemetrytransport.ServeWails(ctx, hub, runtime.emitter)
	if err == nil || ctx.Err() != nil || errors.Is(err, context.Canceled) {
		return
	}
	runtime.lifecycleMu.Lock()
	expectedClose := runtime.lifecycle == telemetryRuntimeTerminal
	runtime.lifecycleMu.Unlock()
	if errors.Is(err, telemetrytransport.ErrClosed) && expectedClose {
		return
	}
	runtime.failStop(fmt.Errorf("serve %s telemetry: %w", productName(product), err))
}

func productName(product telemetrytransport.ProductID) string {
	switch product {
	case telemetrytransport.ProductStrategy:
		return "Strategy"
	default:
		return string(product)
	}
}

func (runtime *TelemetryCoreRuntime) monitor(ctx context.Context) {
	defer runtime.wg.Done()
	ticker := time.NewTicker(telemetryCoreStatusInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			status := runtime.simulator.Status()
			// status.Err se descartaba por completo: el manager guarda el
			// error terminal y nadie lo leia nunca, asi que un driver muerto
			// era indistinguible desde fuera de "el simulador no esta abierto".
			// Solo en StateError y una vez por error, para no inundar el log
			// en cada tick del monitor.
			if status.State == driver.StateError && status.Err != nil {
				if runtime.lastTerminalErr == nil || runtime.lastTerminalErr.Error() != status.Err.Error() {
					runtime.lastTerminalErr = status.Err
					log.Printf("telemetry driver terminal error (attempt=%d): %v", status.ReconnectAttempt, status.Err)
				}
			}
			if err := runtime.setStatus(runtime.watchdogAdjustedState(status.State), status.ReconnectAttempt); err != nil {
				runtime.failStop(err)
				return
			}
			if err := runtime.evaluateWatchdog(); err != nil {
				runtime.failStop(err)
				return
			}
			runtime.mu.Lock()
			publishedState := runtime.statusState
			runtime.mu.Unlock()
			runtime.deliverEngineerStatus(publishedState, status.ReconnectAttempt)
		}
	}
}

// recordRejectedObservation es la mitad del recuento que pertenece al
// composition root. El runtime del simulador decide si absorbe un frame no
// mapeable -- un garaje o un cambio de sesion llegarian a DriverManager, que
// los clasifica como no reintentables y apagaria la telemetria hasta reiniciar
// la aplicacion -- y aqui solo se registra. Rechazado no es fatal, y perder el
// contador dejaria esos descartes invisibles en las metricas.
func (runtime *TelemetryCoreRuntime) recordRejectedObservation(err error, unmappable bool) {
	runtime.counters.observationsRejected.Add(1)
	if unmappable {
		_, reason := telemetryRejectedFrameLabel(err)
		runtime.metricStore.rejectFrame("map", reason)
	}
}

type runtimeBatchSink struct{ runtime *TelemetryCoreRuntime }

func (sink runtimeBatchSink) WriteBatch(ctx context.Context, batch telemetrycore.Batch) error {
	var final envelope.Snapshot[derive.FinalState]
	var factValues []envelope.Fact[telemetrycore.SessionFact]
	if sink.runtime.telemetryEngineApply {
		started := time.Now()
		result, err := sink.runtime.engine.Apply(ctx, batch)
		sink.runtime.metricStore.observeApplyDuration(time.Since(started))
		if err != nil {
			stage, reason := telemetryRejectedFrameLabel(err)
			sink.runtime.metricStore.rejectFrame(stage, reason)
			return err
		}
		sink.runtime.counters.engineSequence.Store(uint64(result.Cursor.Sequence))
		final = result.State
		factValues = result.Facts
		sink.runtime.shadow.observe(ctx, batch, result)
	} else {
		observed, err := sink.runtime.reducer.Apply(batch)
		if err != nil {
			return err
		}
		coordinated, err := sink.runtime.coord.Prepare(ctx, observed)
		if err != nil {
			return err
		}
		factValues = coordinated.Facts()
		sink.runtime.coord.Commit(coordinated)
		final, err = sink.runtime.derive.Apply(ctx, coordinated.Snapshot())
		if err != nil {
			return err
		}
	}
	sink.runtime.recordFrameArrival()
	sink.runtime.counters.batchesApplied.Add(1)
	strategyProjected, err := strategyprojection.ProjectV1(final)
	strategyReady := err == nil
	if err != nil {
		if failureErr := sink.runtime.handlePostCommitFailure(
			telemetrytransport.ProductStrategy,
			"projection",
			fmt.Errorf("project Strategy telemetry: %w", err),
		); failureErr != nil {
			return failureErr
		}
	}
	status := sink.runtime.simulator.Status()
	publication := sink.runtime.publishProjections(
		strategyProjected,
		strategyReady,
		status.State,
		status.ReconnectAttempt,
	)
	if publication.statusErr != nil {
		if failureErr := sink.runtime.handlePostCommitFailure("", "status", publication.statusErr); failureErr != nil {
			return failureErr
		}
	}
	if publication.strategyErr != nil {
		if failureErr := sink.runtime.handlePostCommitFailure(
			telemetrytransport.ProductStrategy, "publish", publication.strategyErr,
		); failureErr != nil {
			return failureErr
		}
	}
	if err := sink.runtime.publishOverlayV2(final, status.State, status.ReconnectAttempt); err != nil {
		sink.runtime.handleOverlayV2Failure(err)
	}
	sink.runtime.deliverEngineerStatus(status.State, status.ReconnectAttempt)
	sink.runtime.deliverEngineer(final, factValues)
	return nil
}

// newCachedOverlayV2Project regula por seccion antes de proyectar y serializar.
// Devuelve también la entrada de cadencia para aplicarla en el tick siguiente.
func newCachedOverlayV2Project() (
	func(envelope.Snapshot[derive.FinalState], overlayv2.SourceContextV2, overlayv2.PreferencesV2, uint64) (overlayv2.UpdateV2, error),
	func(overlayv2.SectionCadence),
) {
	projector := overlayv2.NewCachedProjector(overlayv2.DefaultSectionCadence())
	project := func(snapshot envelope.Snapshot[derive.FinalState], source overlayv2.SourceContextV2, preferences overlayv2.PreferencesV2, revision uint64) (overlayv2.UpdateV2, error) {
		return projector.Project(snapshot, source, preferences, revision, time.Now())
	}
	return project, projector.SetCadence
}

func overlayPerformancePolicy(policy performancepolicy.Policy, sourceHz float64) overlayv2.PerformanceV2 {
	mode := overlayv2.PerformanceModeManual
	switch policy.Mode {
	case performancepolicy.ModeCustom:
		mode = overlayv2.PerformanceModeCustom
	case performancepolicy.ModeAuto:
		mode = overlayv2.PerformanceModeAuto
	}
	effects := overlayv2.PerformanceEffectsV2(policy.Effects)
	rates := make(map[string]json.RawMessage, len(policy.WidgetHz))
	for widget, rate := range policy.WidgetHz {
		if rate.IsMonitor() {
			continue
		}
		encoded, err := json.Marshal(rate)
		if err != nil {
			continue
		}
		rates[widget] = encoded
	}
	var rafCap *int
	if policy.RafCap != nil {
		value := *policy.RafCap
		rafCap = &value
	}
	return overlayv2.PerformanceV2{
		Level: uint8(policy.Level), Mode: mode, Effects: effects, RafCap: rafCap,
		WidgetHz: rates, Reason: overlayv2.PerformanceReasonV2(policy.Reason), SourceHz: sourceHz,
	}
}

func (runtime *TelemetryCoreRuntime) publishOverlayV2(
	final envelope.Snapshot[derive.FinalState],
	state driver.State,
	attempt int,
) error {
	if !runtime.overlayFrameV2Shadow {
		return nil
	}
	publisher, active := runtime.overlayV2Publishers.Lookup(telemetrytransport.ProductOverlayV2)
	if !active {
		return nil
	}
	runtime.mu.Lock()
	lastFrameAt := runtime.lastFrameAt
	policy := runtime.performancePolicy
	performanceRevision := runtime.performanceRevision
	sourceHz := runtime.sourceHz
	runtime.mu.Unlock()
	age := runtime.now().Sub(lastFrameAt).Milliseconds()
	if age < 0 {
		age = 0
	}
	value, ok := final.Value()
	if !ok {
		return fmt.Errorf("%w: count Overlay v2 vehicles", telemetrytransport.ErrInvalidPayload)
	}
	started := time.Now()
	runtime.overlayV2SetCadence(performancepolicy.CadenceFor(policy.Level))
	update, err := runtime.overlayV2Project(final, overlayv2.SourceContextV2{
		State: state.String(), ReconnectAttempt: attempt, LastFrameAgeMS: age,
		DescriptorCapabilities: runtime.descriptorCapabilities,
		Modes:                  overlayCapabilityModes(runtime.capabilityDeclaration, value),
		PerformanceRevision:    performanceRevision,
		Performance:            overlayPerformancePolicy(policy, sourceHz),
	}, overlayv2.DefaultPreferencesV2(), 0)
	runtime.metricStore.observeOverlayV2BuildDuration(time.Since(started))
	if err != nil {
		return fmt.Errorf("%w: project Overlay v2: %v", telemetrytransport.ErrInvalidPayload, err)
	}

	// Projection is intentionally outside runtime.mu. Revision assignment,
	// source refresh and publication stay together so a concurrent lifecycle
	// status can never overtake a snapshot with an older delivery revision.
	runtime.mu.Lock()
	currentState := runtime.statusState
	currentAttempt := runtime.statusAttempt
	if !currentState.Known() {
		currentState = state
		currentAttempt = attempt
	}
	currentAge := int64(0)
	if !runtime.lastFrameAt.IsZero() {
		currentAge = runtime.now().Sub(runtime.lastFrameAt).Milliseconds()
		if currentAge < 0 {
			currentAge = 0
		}
	}
	runtime.overlayV2DeliveryRevision++
	revision := runtime.overlayV2DeliveryRevision
	update.DeliveryRevision = revision
	update.Source.State = overlayv2.SourceStateV2(currentState.String())
	update.Source.ReconnectAttempt = uint32(currentAttempt)
	update.Source.LastFrameAgeMS = currentAge
	encoded, err := json.Marshal(update)
	if err != nil {
		runtime.mu.Unlock()
		return fmt.Errorf("%w: encode Overlay v2: %v", telemetrytransport.ErrInvalidPayload, err)
	}
	if err := publisher.PublishSnapshot(revision, json.RawMessage(encoded)); err != nil {
		runtime.mu.Unlock()
		return fmt.Errorf("%w: publish Overlay v2: %v", telemetrytransport.ErrInvalidPayload, err)
	}
	runtime.mu.Unlock()
	runtime.metricStore.observeOverlayV2Payload(len(value.Observed.Vehicles), uint64(len(encoded)))
	return nil
}

func (runtime *TelemetryCoreRuntime) handleOverlayV2Failure(err error) {
	if err == nil {
		return
	}
	// Shadow failure is deliberately not reflected in the canonical source
	// status: doing so would invalidate a pending Strategy full and make an
	// observational path user-visible.
	product := string(telemetrytransport.ProductOverlayV2)
	runtime.metricStore.publishFailure(product)
	runtime.metricStore.dropFrame(product + "-publish")
	log.Printf("telemetry %s-publish failure is non-terminal: %v", product, err)
}

func (runtime *TelemetryCoreRuntime) handlePostCommitFailure(
	product telemetrytransport.ProductID,
	stage string,
	err error,
) error {
	if err == nil {
		return nil
	}
	if !runtime.telemetryFailurePolicyV2 {
		runtime.failStop(err)
		return err
	}
	if classifyTelemetryError(err) == failureProgramming {
		runtime.failStop(err)
		return err
	}
	productLabel := string(product)
	reason := stage
	if productLabel != "" {
		reason = productLabel + "-" + stage
		runtime.metricStore.publishFailure(productLabel)
	}
	runtime.metricStore.dropFrame(reason)
	log.Printf("telemetry %s failure is non-terminal: %v", reason, err)
	status := runtime.simulator.Status()
	if statusErr := runtime.setStatus(driver.StateDegraded, status.ReconnectAttempt); statusErr != nil {
		log.Printf("telemetry degraded status could not be published after %s failure: %v", reason, statusErr)
		if classifyTelemetryError(statusErr) == failureProgramming {
			runtime.failStop(statusErr)
			return statusErr
		}
	}
	return nil
}

func (runtime *TelemetryCoreRuntime) deliverEngineer(
	final envelope.Snapshot[derive.FinalState],
	facts []envelope.Fact[telemetrycore.SessionFact],
) {
	if runtime.engineer == nil {
		return
	}
	observation, err := engineerprojection.ProjectObservationV1(final, runtime.engineerManifest)
	if err == nil {
		if runtime.engineerAsyncPort && runtime.engineerPort.EnqueueObservation(observation) {
			err = nil
		} else {
			err = newTelemetryConsumerError("engineer.observation", runtime.guardConsumer("engineer.observation", func() error {
				return runtime.engineer.ConsumeObservation(observation)
			}))
			if err == nil {
				runtime.counters.engineerObservations.Add(1)
			}
		}
	}
	for _, fact := range facts {
		projected, projectErr := engineerprojection.ProjectFactV1(fact)
		if projectErr != nil {
			sequence := fact.Value().Sequence
			var previous telemetrycore.FactSequence
			if sequence > 0 {
				previous = sequence - 1
			}
			boundary := &engineerprojection.FactResyncRequiredError{Previous: previous, Next: sequence}
			runtime.engineerPort.DeclareFactBoundary(boundary)
			runtime.metricStore.incrementEngineerFactResync()
			_ = runtime.handlePostCommitFailure(
				telemetrytransport.ProductEngineer,
				"fact-projection",
				fmt.Errorf("project Engineer fact: %w", projectErr),
			)
			err = errors.Join(err, projectErr, boundary)
			break
		}
		var consumeErr error
		if enqueued, enqueueErr := runtime.engineerPort.EnqueueFact(projected); enqueued {
			consumeErr = enqueueErr
		} else {
			consumeErr = newTelemetryConsumerError("engineer.fact", runtime.guardConsumer("engineer.fact", func() error {
				return runtime.engineer.ConsumeFact(projected)
			}))
			if consumeErr == nil {
				runtime.counters.engineerFacts.Add(1)
			}
		}
		err = errors.Join(err, consumeErr)
	}
	if err != nil {
		runtime.counters.engineerFailures.Add(1)
	}
	runtime.mu.Lock()
	runtime.engineerErr = err
	runtime.mu.Unlock()
}

func (runtime *TelemetryCoreRuntime) deliverEngineerStatus(state driver.State, attempt int) {
	if runtime.engineer == nil {
		return
	}
	status, err := engineerprojection.NewSourceStatusV1(engineerSourceState(state), attempt)
	if err == nil {
		if runtime.engineerAsyncPort && runtime.engineerPort.EnqueueStatus(status) {
			err = nil
		} else {
			runtime.consumeEngineerStatus(status)
			return
		}
	}
	if err != nil {
		runtime.counters.engineerFailures.Add(1)
	}
	runtime.mu.Lock()
	runtime.engineerStatusErr = err
	runtime.mu.Unlock()
}

func (runtime *TelemetryCoreRuntime) consumeEngineerStatus(status engineerprojection.SourceStatusV1) {
	err := newTelemetryConsumerError("engineer.source-status", runtime.guardConsumer("engineer.source-status", func() error {
		return runtime.engineer.ConsumeSourceStatus(status)
	}))
	if err == nil {
		runtime.counters.engineerStatusesDelivered.Add(1)
	} else {
		runtime.counters.engineerFailures.Add(1)
	}
	runtime.mu.Lock()
	runtime.engineerStatusErr = err
	runtime.mu.Unlock()
}

func (runtime *TelemetryCoreRuntime) recordEngineerObservationResult(err error) {
	if err == nil {
		runtime.counters.engineerObservations.Add(1)
	} else {
		runtime.counters.engineerFailures.Add(1)
	}
	runtime.mu.Lock()
	runtime.engineerErr = err
	runtime.mu.Unlock()
}

func (runtime *TelemetryCoreRuntime) recordEngineerFactResult(err error) {
	if err == nil {
		runtime.counters.engineerFacts.Add(1)
	} else {
		runtime.counters.engineerFailures.Add(1)
	}
	runtime.mu.Lock()
	runtime.engineerErr = err
	runtime.mu.Unlock()
}

func (runtime *TelemetryCoreRuntime) recordEngineerFactBoundary(err error) {
	if err == nil {
		return
	}
	runtime.counters.engineerFailures.Add(1)
	runtime.mu.Lock()
	runtime.engineerErr = err
	runtime.mu.Unlock()
}

func (runtime *TelemetryCoreRuntime) guardConsumer(boundary string, fn func() error) (err error) {
	if !runtime.telemetryFailurePolicyV2 {
		return fn()
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			runtime.metricStore.consumerPanic(boundary)
			log.Printf("telemetry consumer panic recovered at %s: %v", boundary, recovered)
			err = newTelemetryConsumerError(boundary, fmt.Errorf("panic: %v", recovered))
		}
	}()
	if fn == nil {
		return newTelemetryConsumerError(boundary, errors.New("nil consumer callback"))
	}
	return fn()
}

func engineerSourceState(state driver.State) engineerprojection.SourceState {
	switch state {
	case driver.StateStopped:
		return engineerprojection.SourceStopped
	case driver.StateDetecting:
		return engineerprojection.SourceDetecting
	case driver.StateConnecting:
		return engineerprojection.SourceConnecting
	case driver.StateLive:
		return engineerprojection.SourceLive
	case driver.StateDegraded:
		return engineerprojection.SourceDegraded
	case driver.StateStale:
		return engineerprojection.SourceStale
	case driver.StateError:
		return engineerprojection.SourceError
	case driver.StateStopping:
		return engineerprojection.SourceStopping
	default:
		return ""
	}
}

type projectionPublication struct {
	strategyPublished bool
	statusErr         error
	strategyErr       error
}

func (runtime *TelemetryCoreRuntime) publishProjections(
	strategyProjected strategyprojection.SnapshotV1,
	strategyReady bool,
	state driver.State,
	attempt int,
) projectionPublication {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if err := runtime.setStatusLocked(state, attempt); err != nil {
		return projectionPublication{statusErr: err}
	}
	result := projectionPublication{}
	if strategyReady && runtime.strategyHub != nil {
		strategyFrame, err := telemetrytransport.NewStrategyFull(
			strategyProjected.Metadata,
			runtime.statusRev,
			strategyProjected.PayloadV1,
		)
		if err != nil {
			result.strategyErr = fmt.Errorf("build Strategy telemetry projection: %w", err)
		} else {
			runtime.metricStore.observePayload(productName(telemetrytransport.ProductStrategy), uint64(len(strategyFrame.Payload)))
			if err := runtime.guardConsumer("strategy.publish", func() error {
				return runtime.strategyHub.PublishSnapshot(strategyFrame, nil)
			}); err != nil {
				result.strategyErr = fmt.Errorf("publish Strategy telemetry projection: %w", err)
			} else {
				result.strategyPublished = true
				runtime.counters.strategyProjections.Add(1)
			}
		}
	}
	return result
}

func (runtime *TelemetryCoreRuntime) setStatus(state driver.State, attempt int) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.setStatusLocked(state, attempt)
}

func (runtime *TelemetryCoreRuntime) setStatusLocked(state driver.State, attempt int) error {
	if !state.Known() || attempt < 0 {
		return telemetrytransport.ErrInvalidEnvelope
	}
	if runtime.statusRev > 0 && runtime.statusState == state && runtime.statusAttempt == attempt {
		return nil
	}
	nextRevision := runtime.statusRev + 1
	capturedAt := runtime.now().UTC()
	payload := telemetrytransport.StatusPayload{State: state.String(), ReconnectAttempt: attempt}
	if runtime.strategyHub != nil {
		strategyStatus, err := telemetrytransport.NewStatus(
			telemetrytransport.ProductStrategy,
			nextRevision,
			capturedAt,
			payload,
		)
		if err != nil {
			return fmt.Errorf("build Strategy telemetry status: %w", err)
		}
		if err := runtime.strategyHub.PublishStatus(strategyStatus); err != nil {
			return fmt.Errorf("publish Strategy telemetry status: %w", err)
		}
	}
	if runtime.overlayFrameV2Shadow {
		runtime.overlayV2DeliveryRevision++
		deliveryRevision := runtime.overlayV2DeliveryRevision
		age := int64(0)
		if !runtime.lastFrameAt.IsZero() {
			age = runtime.now().Sub(runtime.lastFrameAt).Milliseconds()
			if age < 0 {
				age = 0
			}
		}
		update := overlayv2.UpdateV2{
			DeliveryRevision: deliveryRevision,
			Source: overlayv2.SourceStatusV2{
				State:            overlayv2.SourceStateV2(state.String()),
				ReconnectAttempt: uint32(attempt),
				LastFrameAgeMS:   age,
			},
			Frame: nil,
		}
		if err := runtime.overlayV2Publishers.PublishStatus(
			telemetrytransport.ProductOverlayV2,
			deliveryRevision,
			update,
		); err != nil {
			runtime.handleOverlayV2Failure(fmt.Errorf("publish Overlay v2 status: %w", err))
		}
	}
	runtime.statusRev = nextRevision
	runtime.statusState = state
	runtime.statusAttempt = attempt
	return nil
}

func (runtime *TelemetryCoreRuntime) recordFrameArrival() {
	runtime.mu.Lock()
	now := runtime.now()
	runtime.lastFrameAt = now
	runtime.watchdogStale = false
	if count := len(runtime.sourceFrameAt); count > 0 && now.Before(runtime.sourceFrameAt[count-1]) {
		runtime.sourceFrameAt = runtime.sourceFrameAt[:0]
	}
	cutoff := now.Add(-sourceRateWindow)
	first := 0
	for first < len(runtime.sourceFrameAt) && runtime.sourceFrameAt[first].Before(cutoff) {
		first++
	}
	if first > 0 {
		copy(runtime.sourceFrameAt, runtime.sourceFrameAt[first:])
		runtime.sourceFrameAt = runtime.sourceFrameAt[:len(runtime.sourceFrameAt)-first]
	}
	runtime.sourceFrameAt = append(runtime.sourceFrameAt, now)
	if len(runtime.sourceFrameAt) > sourceRateMaxSamples {
		copy(runtime.sourceFrameAt, runtime.sourceFrameAt[len(runtime.sourceFrameAt)-sourceRateMaxSamples:])
		runtime.sourceFrameAt = runtime.sourceFrameAt[:sourceRateMaxSamples]
	}
	runtime.sourceHz = 0
	if len(runtime.sourceFrameAt) >= 2 {
		span := now.Sub(runtime.sourceFrameAt[0])
		if span > 0 {
			runtime.sourceHz = float64(len(runtime.sourceFrameAt)-1) / span.Seconds()
		}
	}
	runtime.mu.Unlock()
}

func (runtime *TelemetryCoreRuntime) watchdogAdjustedState(state driver.State) driver.State {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if !runtime.watchdogEnabled {
		return state
	}
	if runtime.watchdogStale && (state == driver.StateLive || state == driver.StateDegraded) {
		return driver.StateStale
	}
	return state
}

func (runtime *TelemetryCoreRuntime) evaluateWatchdog() error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if !runtime.watchdogEnabled {
		return nil
	}
	if runtime.lastFrameAt.IsZero() ||
		(runtime.statusState != driver.StateLive && runtime.statusState != driver.StateDegraded) {
		return nil
	}
	if runtime.now().Sub(runtime.lastFrameAt) < runtime.watchdogDelay {
		return nil
	}
	if err := runtime.setStatusLocked(driver.StateStale, runtime.statusAttempt); err != nil {
		return fmt.Errorf("publish telemetry watchdog status: %w", err)
	}
	runtime.watchdogStale = true
	runtime.metricStore.watchdogDegradation()
	return nil
}

func (runtime *TelemetryCoreRuntime) lastFrameAgeMilliseconds() uint64 {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.lastFrameAt.IsZero() {
		return 0
	}
	age := runtime.now().Sub(runtime.lastFrameAt)
	if age <= 0 {
		return 0
	}
	return uint64(age / time.Millisecond)
}

func (runtime *TelemetryCoreRuntime) failStop(err error) {
	if err == nil {
		return
	}
	runtime.counters.failStops.Add(1)
	status := runtime.simulator.Status()
	statusErr := runtime.setStatus(driver.StateError, status.ReconnectAttempt)
	runtime.lifecycleMu.Lock()
	runtime.transitionLifecycleLocked(telemetryRuntimeTerminal)
	cancel := runtime.cancel
	if runtime.initialStatusDelivery == engineerInitialStatusPending {
		runtime.initialStatusDelivery = engineerInitialStatusSkipped
	}
	runtime.lifecycleMu.Unlock()
	if cancel != nil {
		cancel()
	}
	err = errors.Join(err, statusErr, runtime.closeProductHubs())
	runtime.mu.Lock()
	runtime.statusState = driver.StateError
	runtime.runErr = errors.Join(runtime.runErr, err)
	runtime.mu.Unlock()
}
