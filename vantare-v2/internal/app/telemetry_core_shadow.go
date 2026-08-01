package app

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

const telemetryCoreShadowStatusInterval = 100 * time.Millisecond

// TelemetryCoreShadowConfig keeps the canonical runtime opt-in while the
// legacy Overlay transport remains authoritative during TC-07B.
type TelemetryCoreShadowConfig struct {
	Enabled bool
	Emitter telemetrytransport.EventEmitter
}

// TelemetryCoreShadow owns the temporary canonical LMU shadow runtime. It
// publishes only the versioned Overlay projection; it never mutates the
// legacy service or any Overlay document.
type TelemetryCoreShadow struct {
	mu sync.Mutex

	enabled bool
	emitter telemetrytransport.EventEmitter
	hub     *telemetrytransport.Hub
	manager *telemetrycore.DriverManager[lmu.Observation]
	mapper  *lmu.BatchMapper
	reducer *telemetrycore.Reducer
	coord   *telemetrycore.SessionCoordinator
	derive  *derive.Pipeline

	statusState   driver.State
	statusAttempt int
	statusRev     uint64

	cancel context.CancelFunc
	wg     sync.WaitGroup
	runErr error
}

// NewTelemetryCoreShadow builds the isolated TC-07B runtime. Construction is
// side-effect free; Start owns all goroutines and the LMU mapping lifecycle.
func NewTelemetryCoreShadow(config TelemetryCoreShadowConfig) (*TelemetryCoreShadow, error) {
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
		return nil, fmt.Errorf("build telemetry core shadow manager: %w", err)
	}
	return &TelemetryCoreShadow{
		enabled: config.Enabled,
		emitter: config.Emitter,
		hub: telemetrytransport.NewHub(telemetrytransport.HubConfig{
			Product: telemetrytransport.ProductOverlay,
		}),
		manager: manager,
		mapper:  lmu.NewBatchMapper(),
		reducer: telemetrycore.NewReducer(),
		coord:   telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{}),
		derive:  derive.NewPipeline(derive.Config{}),
	}, nil
}

func (runtime *TelemetryCoreShadow) Hub() *telemetrytransport.Hub {
	if runtime == nil {
		return nil
	}
	return runtime.hub
}

func (runtime *TelemetryCoreShadow) Start(parent context.Context) error {
	if runtime == nil || parent == nil {
		return errors.New("telemetry core shadow requires a parent context")
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

	if err := runtime.manager.Start(ctx, shadowObservationSink{runtime: runtime}); err != nil {
		cancel()
		return fmt.Errorf("start telemetry core shadow manager: %w", err)
	}
	runtime.wg.Add(1)
	go runtime.monitor(ctx)
	return nil
}

func (runtime *TelemetryCoreShadow) Stop(ctx context.Context) error {
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
		stopErr = errors.Join(stopErr, fmt.Errorf("stop telemetry core shadow: %w", ctx.Err()))
	}
	runtime.mu.Lock()
	runErr := runtime.runErr
	runtime.mu.Unlock()
	return errors.Join(stopErr, runErr)
}

func (runtime *TelemetryCoreShadow) monitor(ctx context.Context) {
	defer runtime.wg.Done()
	ticker := time.NewTicker(telemetryCoreShadowStatusInterval)
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
		}
	}
}

type shadowObservationSink struct{ runtime *TelemetryCoreShadow }

func (sink shadowObservationSink) WriteObservation(ctx context.Context, observation lmu.Observation) error {
	err := sink.runtime.mapper.WriteObservation(ctx, observation, shadowBatchSink{runtime: sink.runtime})
	if errors.Is(err, lmu.ErrInvalidSessionIdentity) {
		// LMU menu has no session identity and therefore no product payload. It
		// is a valid no-snapshot state, not a reason to terminate the driver.
		return nil
	}
	return err
}

type shadowBatchSink struct{ runtime *TelemetryCoreShadow }

func (sink shadowBatchSink) WriteBatch(ctx context.Context, batch telemetrycore.Batch) error {
	observed, err := sink.runtime.reducer.Apply(batch)
	if err != nil {
		return err
	}
	if err := sink.runtime.coord.Apply(ctx, observed, discardTelemetryFacts{}); err != nil {
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
	return sink.runtime.publishProjection(projected, status.State, status.ReconnectAttempt)
}

type discardTelemetryFacts struct{}

func (discardTelemetryFacts) WriteFacts(context.Context, []envelope.Fact[telemetrycore.SessionFact]) error {
	return nil
}

func (runtime *TelemetryCoreShadow) publishProjection(
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
		return fmt.Errorf("build telemetry core shadow projection: %w", err)
	}
	if err := runtime.hub.PublishSnapshot(frame, nil); err != nil {
		return fmt.Errorf("publish telemetry core shadow projection: %w", err)
	}
	return nil
}

func (runtime *TelemetryCoreShadow) setStatus(state driver.State, attempt int) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.setStatusLocked(state, attempt)
}

func (runtime *TelemetryCoreShadow) setStatusLocked(state driver.State, attempt int) error {
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
		return fmt.Errorf("build telemetry core shadow status: %w", err)
	}
	if err := runtime.hub.PublishStatus(status); err != nil {
		return fmt.Errorf("publish telemetry core shadow status: %w", err)
	}
	runtime.statusState = state
	runtime.statusAttempt = attempt
	return nil
}

func (runtime *TelemetryCoreShadow) recordRunError(err error) {
	if err == nil || errors.Is(err, context.Canceled) || errors.Is(err, telemetrytransport.ErrClosed) {
		return
	}
	runtime.mu.Lock()
	runtime.runErr = errors.Join(runtime.runErr, err)
	runtime.mu.Unlock()
}
