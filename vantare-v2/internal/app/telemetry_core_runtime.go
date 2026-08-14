package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

const telemetryCoreStatusInterval = 100 * time.Millisecond

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
// synchronous to preserve source order: they must return promptly and must not
// call TelemetryCoreRuntime.Start or Stop. The composition root owns lifecycle.
type EngineerProjectionConsumer interface {
	ConsumeSourceStatus(engineerprojection.SourceStatusV1) error
	ConsumeObservation(engineerprojection.ObservationSnapshotV1) error
	ConsumeFact(engineerprojection.FactEnvelopeV1) error
}

// TelemetryCoreRuntimeConfig configures the canonical product runtime.
type TelemetryCoreRuntimeConfig struct {
	Enabled bool
	// Emit runs on an adapter goroutine owned by Stop. Implementations must
	// return from Emit and must not call Stop synchronously from that callback.
	Emitter              telemetrytransport.EventEmitter
	Engineer             EngineerProjectionConsumer
	StrategyLiveConsumer StrategyLiveConsumer
}

// TelemetryCoreMetrics is a payload-free operational summary. It is safe to
// expose through local diagnostics because it contains only counters and
// bounded transport state. ProjectionsPublished remains one canonical batch
// whose product fulls both published, and Transport remains the Overlay hub
// for compatibility.
type TelemetryCoreMetrics struct {
	ObservationsReceived         uint64
	ObservationsRejected         uint64
	BatchesApplied               uint64
	ProjectionsPublished         uint64
	OverlayProjectionsPublished  uint64
	StrategyProjectionsPublished uint64
	EngineerStatusesDelivered    uint64
	EngineerObservations         uint64
	EngineerFacts                uint64
	EngineerDeliveryFailures     uint64
	Transport                    telemetrytransport.HubMetrics
	StrategyTransport            telemetrytransport.HubMetrics
}

type telemetryCoreCounters struct {
	observationsReceived      atomic.Uint64
	observationsRejected      atomic.Uint64
	batchesApplied            atomic.Uint64
	projectionsPublished      atomic.Uint64
	overlayProjections        atomic.Uint64
	strategyProjections       atomic.Uint64
	engineerStatusesDelivered atomic.Uint64
	engineerObservations      atomic.Uint64
	engineerFacts             atomic.Uint64
	engineerFailures          atomic.Uint64
}

// TelemetryCoreRuntime owns the canonical LMU pipeline and publishes only
// versioned product projections.
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

	enabled          bool
	emitter          telemetrytransport.EventEmitter
	hub              *telemetrytransport.Hub
	strategyHub      *telemetrytransport.Hub
	manager          *telemetrycore.DriverManager[lmu.Observation]
	mapper           *lmu.BatchMapper
	reducer          *telemetrycore.Reducer
	coord            *telemetrycore.SessionCoordinator
	derive           *derive.Pipeline
	engineer         EngineerProjectionConsumer
	engineerManifest engineerprojection.Manifest
	strategyLive     *StrategyLiveRuntime

	statusState   driver.State
	statusAttempt int
	// Solo lo toca la goroutine monitor; sirve para no repetir la misma linea
	// de error terminal en cada tick.
	lastTerminalErr error
	statusRev       uint64

	cancel            context.CancelFunc
	wg                sync.WaitGroup
	runErr            error
	engineerErr       error
	engineerStatusErr error
	counters          telemetryCoreCounters
}

// NewTelemetryCoreRuntime is side-effect free; Start owns all goroutines and
// the LMU mapping lifecycle.
func NewTelemetryCoreRuntime(config TelemetryCoreRuntimeConfig) (*TelemetryCoreRuntime, error) {
	manager, err := telemetrycore.NewDriverManager(
		[]telemetrycore.DriverCandidate[lmu.Observation]{
			{
				Descriptor: driver.Descriptor{
					ID:       "lmu",
					Priority: 100,
					Capabilities: []driver.Capability{
						lmu.CapabilitySharedMemory,
						lmu.CapabilityREST,
					},
				},
				Detect:    func(context.Context) (bool, error) { return true, nil },
				New:       func() (telemetrycore.Driver[lmu.Observation], error) { return lmu.New(), nil },
				Retryable: lmu.IsRetryable,
			},
		},
		// The budget is deliberately large: "the simulator is not running" is
		// indistinguishable from a transient disconnect here, and it is the
		// normal state whenever the Hub is open without a session. The budget
		// is also restored by RetryPolicy.StableRun after any run that lasted,
		// so an evening of sessions no longer spends it down towards a
		// permanent death.
		telemetrycore.ManagerConfig{Retry: telemetrycore.RetryPolicy{MaxReconnects: 1_000}},
	)
	if err != nil {
		return nil, fmt.Errorf("build telemetry core manager: %w", err)
	}
	engineerManifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilitySpatial, State: engineerprojection.CapabilitySupported},
	})
	if err != nil {
		return nil, fmt.Errorf("build Engineer capability manifest: %w", err)
	}
	runtime := &TelemetryCoreRuntime{
		enabled: config.Enabled,
		emitter: config.Emitter,
		hub: telemetrytransport.NewHub(telemetrytransport.HubConfig{
			Product: telemetrytransport.ProductOverlay,
			Versions: projection.VersionPolicy{
				Current:          overlayprojection.CurrentVersion,
				MinimumSupported: overlayprojection.MinimumSupportedVersion,
			},
		}),
		strategyHub: telemetrytransport.NewHub(telemetrytransport.HubConfig{
			Product: telemetrytransport.ProductStrategy,
			Versions: projection.VersionPolicy{
				Current:          strategyprojection.CurrentVersion,
				MinimumSupported: strategyprojection.MinimumSupportedVersion,
			},
		}),
		manager:          manager,
		mapper:           lmu.NewBatchMapper(),
		reducer:          telemetrycore.NewReducer(),
		coord:            telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{}),
		derive:           derive.NewPipeline(derive.Config{}),
		engineer:         config.Engineer,
		engineerManifest: engineerManifest,
	}
	if config.StrategyLiveConsumer != nil {
		strategyLive, err := NewStrategyLiveRuntime(runtime.strategyHub, config.StrategyLiveConsumer)
		if err != nil {
			return nil, fmt.Errorf("build Strategy live runtime: %w", err)
		}
		runtime.strategyLive = strategyLive
	}
	return runtime, nil
}

func (runtime *TelemetryCoreRuntime) Hub() *telemetrytransport.Hub {
	if runtime == nil {
		return nil
	}
	return runtime.hub
}

// StrategyHub exposes the Strategy product transport while Hub keeps its
// historical Overlay meaning for existing callers.
func (runtime *TelemetryCoreRuntime) StrategyHub() *telemetrytransport.Hub {
	if runtime == nil {
		return nil
	}
	return runtime.strategyHub
}

func (runtime *TelemetryCoreRuntime) Metrics() TelemetryCoreMetrics {
	if runtime == nil {
		return TelemetryCoreMetrics{}
	}
	return TelemetryCoreMetrics{
		ObservationsReceived:         runtime.counters.observationsReceived.Load(),
		ObservationsRejected:         runtime.counters.observationsRejected.Load(),
		BatchesApplied:               runtime.counters.batchesApplied.Load(),
		ProjectionsPublished:         runtime.counters.projectionsPublished.Load(),
		OverlayProjectionsPublished:  runtime.counters.overlayProjections.Load(),
		StrategyProjectionsPublished: runtime.counters.strategyProjections.Load(),
		EngineerStatusesDelivered:    runtime.counters.engineerStatusesDelivered.Load(),
		EngineerObservations:         runtime.counters.engineerObservations.Load(),
		EngineerFacts:                runtime.counters.engineerFacts.Load(),
		EngineerDeliveryFailures:     runtime.counters.engineerFailures.Load(),
		Transport:                    runtime.hub.Metrics(),
		StrategyTransport:            runtime.strategyHub.Metrics(),
	}
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
	runtime.lifecycle = telemetryRuntimeStarting
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
		runtime.lifecycle = telemetryRuntimeRunning
	}
	terminal := runtime.lifecycle == telemetryRuntimeTerminal
	runtime.finishStartLocked()
	runtime.lifecycleMu.Unlock()
	if terminal {
		return telemetrytransport.ErrClosed
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
	if runtime.strategyLive != nil {
		runtime.wg.Add(1)
		go runtime.runStrategyLive(ctx)
	}
	if runtime.enabled {
		if err := runtime.manager.Start(ctx, runtimeObservationSink{runtime: runtime}); err != nil {
			runtime.lifecycleMu.Unlock()
			return runtime.abortStart(fmt.Errorf("start telemetry core manager: %w", err))
		}
		runtime.managerStarted = true
		runtime.wg.Add(1)
		go runtime.monitor(ctx)
	}
	if runtime.emitter != nil {
		runtime.wg.Add(2)
		go runtime.serveWails(ctx, telemetrytransport.ProductOverlay, runtime.hub)
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
	runtime.lifecycle = telemetryRuntimeTerminal
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
		stopErr = runtime.manager.Stop(ctx)
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

func (runtime *TelemetryCoreRuntime) abortStart(startErr error) error {
	runtime.lifecycleMu.Lock()
	runtime.lifecycle = telemetryRuntimeTerminal
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
		runtime.requestStoppedEngineerStatus()
	}
	if cleanupOwner {
		cleanupErr := runtime.closeProductHubs()
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
	if err := runtime.hub.Close(); err != nil {
		result = errors.Join(result, fmt.Errorf("close Overlay telemetry hub: %w", err))
	}
	if err := runtime.strategyHub.Close(); err != nil {
		result = errors.Join(result, fmt.Errorf("close Strategy telemetry hub: %w", err))
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

	runtime.deliverEngineerStatus(state, attempt)

	runtime.lifecycleMu.Lock()
	runtime.initialStatusDelivery = engineerInitialStatusDelivered
	deliverStopped := runtime.stoppedStatusPending && !runtime.stoppedStatusDelivered
	if deliverStopped {
		runtime.stoppedStatusPending = false
		runtime.stoppedStatusDelivered = true
	}
	runtime.lifecycleMu.Unlock()
	if deliverStopped {
		runtime.deliverEngineerStatus(driver.StateStopped, 0)
	}
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

func (runtime *TelemetryCoreRuntime) runStrategyLive(ctx context.Context) {
	defer runtime.wg.Done()
	err := runtime.strategyLive.Run(ctx)
	if err == nil || ctx.Err() != nil || errors.Is(err, context.Canceled) {
		return
	}
	runtime.lifecycleMu.Lock()
	expectedClose := runtime.lifecycle == telemetryRuntimeTerminal
	runtime.lifecycleMu.Unlock()
	if errors.Is(err, telemetrytransport.ErrClosed) && expectedClose {
		return
	}
	runtime.failStop(fmt.Errorf("run Strategy live consumer: %w", err))
}

func productName(product telemetrytransport.ProductID) string {
	switch product {
	case telemetrytransport.ProductOverlay:
		return "Overlay"
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
			status := runtime.manager.Status()
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
			if err := runtime.setStatus(status.State, status.ReconnectAttempt); err != nil {
				runtime.failStop(err)
				return
			}
			runtime.deliverEngineerStatus(status.State, status.ReconnectAttempt)
		}
	}
}

type runtimeObservationSink struct{ runtime *TelemetryCoreRuntime }

func (sink runtimeObservationSink) WriteObservation(ctx context.Context, observation lmu.Observation) error {
	sink.runtime.counters.observationsReceived.Add(1)
	err := sink.runtime.mapper.WriteObservation(ctx, observation, runtimeBatchSink{runtime: sink.runtime})
	if err != nil {
		sink.runtime.counters.observationsRejected.Add(1)
	}
	// Antes solo se absorbia ErrInvalidSessionIdentity, el caso del menu. Los
	// otros cinco errores de validacion describen exactamente lo mismo -- un
	// frame que todavia no representa una sesion coherente: boxes, pantallas de
	// carga, cambios de sesion -- pero subian hasta DriverManager, que los
	// clasifica como no reintentables y llama a setTerminal. Un unico frame de
	// garaje dejaba la telemetria apagada hasta reiniciar la aplicacion.
	//
	// Se cuentan como rechazados igualmente: rechazado no es fatal, y perder el
	// contador dejaria estos descartes invisibles en las metricas.
	if lmu.IsUnmappableFrame(err) {
		return nil
	}
	return err
}

type runtimeBatchSink struct{ runtime *TelemetryCoreRuntime }

func (sink runtimeBatchSink) WriteBatch(ctx context.Context, batch telemetrycore.Batch) error {
	observed, err := sink.runtime.reducer.Apply(batch)
	if err != nil {
		return err
	}
	sink.runtime.counters.batchesApplied.Add(1)
	facts := &collectTelemetryFacts{}
	if err := sink.runtime.coord.Apply(ctx, observed, facts); err != nil {
		return err
	}
	final, err := sink.runtime.derive.Apply(ctx, observed)
	if err != nil {
		return err
	}
	overlayProjected, err := overlayprojection.ProjectV1(final)
	if err != nil {
		err = fmt.Errorf("project Overlay telemetry: %w", err)
		sink.runtime.failStop(err)
		return err
	}
	strategyProjected, err := strategyprojection.ProjectV1(final)
	if err != nil {
		err = fmt.Errorf("project Strategy telemetry: %w", err)
		sink.runtime.failStop(err)
		return err
	}
	status := sink.runtime.manager.Status()
	if err := sink.runtime.publishProjections(
		overlayProjected,
		strategyProjected,
		status.State,
		status.ReconnectAttempt,
	); err != nil {
		sink.runtime.failStop(err)
		return err
	}
	sink.runtime.counters.projectionsPublished.Add(1)
	sink.runtime.deliverEngineerStatus(status.State, status.ReconnectAttempt)
	sink.runtime.deliverEngineer(final, facts.values)
	return nil
}

type collectTelemetryFacts struct {
	values []envelope.Fact[telemetrycore.SessionFact]
}

func (sink *collectTelemetryFacts) WriteFacts(_ context.Context, values []envelope.Fact[telemetrycore.SessionFact]) error {
	sink.values = append(sink.values, values...)
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
		err = runtime.engineer.ConsumeObservation(observation)
		if err == nil {
			runtime.counters.engineerObservations.Add(1)
		}
	}
	for _, fact := range facts {
		projected, projectErr := engineerprojection.ProjectFactV1(fact)
		if projectErr != nil {
			err = errors.Join(err, projectErr)
			continue
		}
		consumeErr := runtime.engineer.ConsumeFact(projected)
		if consumeErr == nil {
			runtime.counters.engineerFacts.Add(1)
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
		err = runtime.engineer.ConsumeSourceStatus(status)
		if err == nil {
			runtime.counters.engineerStatusesDelivered.Add(1)
		}
	}
	if err != nil {
		runtime.counters.engineerFailures.Add(1)
	}
	runtime.mu.Lock()
	runtime.engineerStatusErr = err
	runtime.mu.Unlock()
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

func (runtime *TelemetryCoreRuntime) publishProjections(
	overlayProjected overlayprojection.SnapshotV1,
	strategyProjected strategyprojection.SnapshotV1,
	state driver.State,
	attempt int,
) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if err := runtime.setStatusLocked(state, attempt); err != nil {
		return err
	}
	overlayFrame, err := telemetrytransport.NewOverlayFull(
		overlayProjected.Metadata,
		runtime.statusRev,
		overlayProjected.PayloadV1,
	)
	if err != nil {
		return fmt.Errorf("build Overlay telemetry projection: %w", err)
	}
	strategyFrame, err := telemetrytransport.NewStrategyFull(
		strategyProjected.Metadata,
		runtime.statusRev,
		strategyProjected.PayloadV1,
	)
	if err != nil {
		return fmt.Errorf("build Strategy telemetry projection: %w", err)
	}
	if err := runtime.hub.PublishSnapshot(overlayFrame, nil); err != nil {
		return fmt.Errorf("publish Overlay telemetry projection: %w", err)
	}
	runtime.counters.overlayProjections.Add(1)
	if err := runtime.strategyHub.PublishSnapshot(strategyFrame, nil); err != nil {
		return fmt.Errorf("publish Strategy telemetry projection: %w", err)
	}
	runtime.counters.strategyProjections.Add(1)
	return nil
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
	capturedAt := time.Now().UTC()
	payload := telemetrytransport.StatusPayload{State: state.String(), ReconnectAttempt: attempt}
	overlayStatus, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductOverlay,
		nextRevision,
		capturedAt,
		payload,
	)
	if err != nil {
		return fmt.Errorf("build Overlay telemetry status: %w", err)
	}
	strategyStatus, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductStrategy,
		nextRevision,
		capturedAt,
		payload,
	)
	if err != nil {
		return fmt.Errorf("build Strategy telemetry status: %w", err)
	}
	if err := runtime.hub.PublishStatus(overlayStatus); err != nil {
		return fmt.Errorf("publish Overlay telemetry status: %w", err)
	}
	if err := runtime.strategyHub.PublishStatus(strategyStatus); err != nil {
		return fmt.Errorf("publish Strategy telemetry status: %w", err)
	}
	runtime.statusRev = nextRevision
	runtime.statusState = state
	runtime.statusAttempt = attempt
	return nil
}

func (runtime *TelemetryCoreRuntime) failStop(err error) {
	if err == nil {
		return
	}
	runtime.lifecycleMu.Lock()
	runtime.lifecycle = telemetryRuntimeTerminal
	cancel := runtime.cancel
	if runtime.initialStatusDelivery == engineerInitialStatusPending {
		runtime.initialStatusDelivery = engineerInitialStatusSkipped
	}
	runtime.lifecycleMu.Unlock()
	if cancel != nil {
		cancel()
	}
	err = errors.Join(err, runtime.closeProductHubs())
	runtime.mu.Lock()
	runtime.statusState = driver.StateError
	runtime.runErr = errors.Join(runtime.runErr, err)
	runtime.mu.Unlock()
}
