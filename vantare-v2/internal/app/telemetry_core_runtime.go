package app

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

const telemetryCoreStatusInterval = 100 * time.Millisecond

// EngineerProjectionConsumer is the in-process product boundary owned by the
// composition root. Implementations consume versioned product values and must
// never be given a driver, mapping or canonical mutable state.
type EngineerProjectionConsumer interface {
	ConsumeSourceStatus(engineerprojection.SourceStatusV1) error
	ConsumeObservation(engineerprojection.ObservationSnapshotV1) error
	ConsumeFact(engineerprojection.FactEnvelopeV1) error
}

// TelemetryCoreRuntimeConfig configures the canonical product runtime.
type TelemetryCoreRuntimeConfig struct {
	Enabled  bool
	Emitter  telemetrytransport.EventEmitter
	Engineer EngineerProjectionConsumer
}

// TelemetryCoreMetrics is a payload-free operational summary. It is safe to
// expose through local diagnostics because it contains only counters and
// bounded transport state.
type TelemetryCoreMetrics struct {
	ObservationsReceived      uint64
	ObservationsRejected      uint64
	BatchesApplied            uint64
	ProjectionsPublished      uint64
	EngineerStatusesDelivered uint64
	EngineerObservations      uint64
	EngineerFacts             uint64
	EngineerDeliveryFailures  uint64
	Transport                 telemetrytransport.HubMetrics
}

type telemetryCoreCounters struct {
	observationsReceived      atomic.Uint64
	observationsRejected      atomic.Uint64
	batchesApplied            atomic.Uint64
	projectionsPublished      atomic.Uint64
	engineerStatusesDelivered atomic.Uint64
	engineerObservations      atomic.Uint64
	engineerFacts             atomic.Uint64
	engineerFailures          atomic.Uint64
}

// TelemetryCoreRuntime owns the canonical LMU pipeline and publishes only
// versioned product projections.
type TelemetryCoreRuntime struct {
	mu sync.Mutex

	enabled          bool
	emitter          telemetrytransport.EventEmitter
	hub              *telemetrytransport.Hub
	manager          *telemetrycore.DriverManager[lmu.Observation]
	mapper           *lmu.BatchMapper
	reducer          *telemetrycore.Reducer
	coord            *telemetrycore.SessionCoordinator
	derive           *derive.Pipeline
	engineer         EngineerProjectionConsumer
	engineerManifest engineerprojection.Manifest

	statusState   driver.State
	statusAttempt int
	statusRev     uint64

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
	return &TelemetryCoreRuntime{
		enabled: config.Enabled,
		emitter: config.Emitter,
		hub: telemetrytransport.NewHub(telemetrytransport.HubConfig{
			Product: telemetrytransport.ProductOverlay,
		}),
		manager:          manager,
		mapper:           lmu.NewBatchMapper(),
		reducer:          telemetrycore.NewReducer(),
		coord:            telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{}),
		derive:           derive.NewPipeline(derive.Config{}),
		engineer:         config.Engineer,
		engineerManifest: engineerManifest,
	}, nil
}

func (runtime *TelemetryCoreRuntime) Hub() *telemetrytransport.Hub {
	if runtime == nil {
		return nil
	}
	return runtime.hub
}

func (runtime *TelemetryCoreRuntime) Metrics() TelemetryCoreMetrics {
	if runtime == nil {
		return TelemetryCoreMetrics{}
	}
	return TelemetryCoreMetrics{
		ObservationsReceived:      runtime.counters.observationsReceived.Load(),
		ObservationsRejected:      runtime.counters.observationsRejected.Load(),
		BatchesApplied:            runtime.counters.batchesApplied.Load(),
		ProjectionsPublished:      runtime.counters.projectionsPublished.Load(),
		EngineerStatusesDelivered: runtime.counters.engineerStatusesDelivered.Load(),
		EngineerObservations:      runtime.counters.engineerObservations.Load(),
		EngineerFacts:             runtime.counters.engineerFacts.Load(),
		EngineerDeliveryFailures:  runtime.counters.engineerFailures.Load(),
		Transport:                 runtime.hub.Metrics(),
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
		Kind:             "lmu",
		Name:             "Le Mans Ultimate",
		Live:             true,
		Available:        runtime.statusState == driver.StateLive || runtime.statusState == driver.StateDegraded,
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
	runtime.mu.Lock()
	if runtime.cancel != nil {
		runtime.mu.Unlock()
		return telemetrycore.ErrManagerAlreadyStarted
	}
	ctx, cancel := context.WithCancel(parent)
	runtime.cancel = cancel
	runtime.mu.Unlock()

	initial := driver.StateStopped
	if runtime.enabled {
		initial = driver.StateDetecting
	}
	if err := runtime.setStatus(initial, 0); err != nil {
		cancel()
		return err
	}
	runtime.deliverEngineerStatus(initial, 0)

	if runtime.emitter != nil {
		runtime.wg.Add(1)
		go func() {
			defer runtime.wg.Done()
			runtime.recordRunError(telemetrytransport.ServeWails(ctx, runtime.hub, runtime.emitter))
		}()
	}
	if !runtime.enabled {
		return nil
	}

	if err := runtime.manager.Start(ctx, runtimeObservationSink{runtime: runtime}); err != nil {
		cancel()
		return fmt.Errorf("start telemetry core manager: %w", err)
	}
	runtime.wg.Add(1)
	go runtime.monitor(ctx)
	return nil
}

func (runtime *TelemetryCoreRuntime) Stop(ctx context.Context) error {
	if runtime == nil || ctx == nil {
		return nil
	}
	runtime.mu.Lock()
	cancel := runtime.cancel
	runtime.cancel = nil
	runtime.mu.Unlock()
	if cancel == nil {
		return nil
	}
	cancel()
	var stopErr error
	if runtime.enabled {
		stopErr = runtime.manager.Stop(ctx)
	}
	runtime.deliverEngineerStatus(driver.StateStopped, 0)
	if err := runtime.hub.Close(); err != nil {
		stopErr = errors.Join(stopErr, err)
	}
	done := make(chan struct{})
	go func() {
		runtime.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		stopErr = errors.Join(stopErr, fmt.Errorf("stop telemetry core runtime: %w", ctx.Err()))
	}
	runtime.mu.Lock()
	runErr := runtime.runErr
	runtime.statusState = driver.StateStopped
	runtime.statusAttempt = 0
	runtime.mu.Unlock()
	return errors.Join(stopErr, runErr)
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
			if err := runtime.setStatus(status.State, status.ReconnectAttempt); err != nil {
				runtime.recordRunError(err)
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
	if errors.Is(err, lmu.ErrInvalidSessionIdentity) {
		// LMU menu has no session identity and therefore no product payload. It
		// is a valid no-snapshot state, not a reason to terminate the driver.
		return nil
	}
	if err != nil {
		sink.runtime.counters.observationsRejected.Add(1)
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
	projected, err := overlayprojection.ProjectV1(final)
	if err != nil {
		return err
	}
	status := sink.runtime.manager.Status()
	if err := sink.runtime.publishProjection(projected, status.State, status.ReconnectAttempt); err != nil {
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

func (runtime *TelemetryCoreRuntime) publishProjection(
	projected overlayprojection.SnapshotV1,
	state driver.State,
	attempt int,
) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if err := runtime.setStatusLocked(state, attempt); err != nil {
		return err
	}
	frame, err := telemetrytransport.NewOverlayFull(projected.Metadata, runtime.statusRev, projected.PayloadV1)
	if err != nil {
		return fmt.Errorf("build telemetry core projection: %w", err)
	}
	if err := runtime.hub.PublishSnapshot(frame, nil); err != nil {
		return fmt.Errorf("publish telemetry core projection: %w", err)
	}
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
	runtime.statusRev++
	status, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductOverlay,
		runtime.statusRev,
		time.Now().UTC(),
		telemetrytransport.StatusPayload{State: state.String(), ReconnectAttempt: attempt},
	)
	if err != nil {
		return fmt.Errorf("build telemetry core status: %w", err)
	}
	if err := runtime.hub.PublishStatus(status); err != nil {
		return fmt.Errorf("publish telemetry core status: %w", err)
	}
	runtime.statusState = state
	runtime.statusAttempt = attempt
	return nil
}

func (runtime *TelemetryCoreRuntime) recordRunError(err error) {
	if err == nil || errors.Is(err, context.Canceled) || errors.Is(err, telemetrytransport.ErrClosed) {
		return
	}
	runtime.mu.Lock()
	runtime.runErr = errors.Join(runtime.runErr, err)
	runtime.mu.Unlock()
}
