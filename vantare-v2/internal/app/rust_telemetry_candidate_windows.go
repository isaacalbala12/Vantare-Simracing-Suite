//go:build windows

package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetryprocess"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

var ErrRustCandidateLifecycle = errors.New("rust telemetry candidate lifecycle is invalid")

// RustTelemetryCandidateConfig selects the isolated Windows candidate. No Go
// simulator is constructed or started on this path.
type RustTelemetryCandidateConfig struct {
	Executable               string
	Enabled                  bool
	OverlaySections          bool
	StrategyPublicTransport  bool
	PerformancePolicy        performancepolicy.Policy
	Emitter                  telemetrytransport.EventEmitter
	Engineer                 EngineerProjectionConsumer
	EngineerBinaryDiagnostic bool
}

type RustTelemetryCandidateRuntime struct {
	mu               sync.Mutex
	config           RustTelemetryCandidateConfig
	policy           performancepolicy.Policy
	policyChange     uint64
	registry         *telemetrytransport.PublisherRegistry
	strategy         *telemetrytransport.Hub
	manifest         engineerprojection.Manifest
	status           driver.State
	attempt          int
	statusRev        uint64
	deliveryRev      uint64
	lastAgeMS        int64
	started          bool
	stopped          bool
	cancel           context.CancelFunc
	done             chan struct{}
	wailsDone        chan struct{}
	runErr           error
	updates          chan telemetryprocess.ConfigurationV1
	overlayRequests  chan telemetryprocess.OverlayRPC
	overlaySessions  map[string]string
	overlayRequestID uint64
	overlayContext   context.Context
	lastEpoch        uint64
	newChild         bool
	lastFact         telemetrycore.FactSequence
	lastIPCStatus    telemetryprocess.StatusV1
}

func NewRustTelemetryCandidateRuntime(config RustTelemetryCandidateConfig) (*RustTelemetryCandidateRuntime, error) {
	if config.Enabled {
		if !filepath.IsAbs(config.Executable) {
			return nil, fmt.Errorf("%w: child path must be absolute", ErrRustCandidateLifecycle)
		}
		info, err := os.Stat(config.Executable)
		if err != nil || info.IsDir() {
			return nil, fmt.Errorf("%w: child binary unavailable: %v", ErrRustCandidateLifecycle, err)
		}
	}
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{
		Product: telemetrytransport.ProductOverlayV2, SectionEncoding: config.OverlaySections,
	})
	if err != nil {
		return nil, fmt.Errorf("rust Overlay publisher: %w", err)
	}
	set, err := capability.Resolve(lmu.Capabilities(), nil)
	if err != nil {
		return nil, err
	}
	manifest, err := engineerprojection.NewManifest(engineerCapabilities(set))
	if err != nil {
		return nil, fmt.Errorf("rust Engineer manifest: %w", err)
	}
	var strategy *telemetrytransport.Hub
	if config.StrategyPublicTransport {
		strategy = telemetrytransport.NewHub(telemetrytransport.HubConfig{
			Product:  telemetrytransport.ProductStrategy,
			Versions: projection.VersionPolicy{Current: strategyprojection.CurrentVersion, MinimumSupported: strategyprojection.MinimumSupportedVersion},
		})
	}
	return &RustTelemetryCandidateRuntime{
		config: config, policy: performancepolicy.Resolve(config.PerformancePolicy, nil),
		registry: registry, strategy: strategy, manifest: manifest, status: driver.StateStopped,
	}, nil
}

func (runtime *RustTelemetryCandidateRuntime) StrategyHub() *telemetrytransport.Hub {
	return runtime.strategy
}
func (runtime *RustTelemetryCandidateRuntime) OverlayV2Publishers() *telemetrytransport.PublisherRegistry {
	return runtime.registry
}

func (runtime *RustTelemetryCandidateRuntime) PerformancePolicy() performancepolicy.Policy {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return performancepolicy.Resolve(runtime.policy, nil)
}

func (runtime *RustTelemetryCandidateRuntime) SetPerformancePolicy(policy performancepolicy.Policy) {
	resolved := performancepolicy.Resolve(policy, nil)
	runtime.mu.Lock()
	runtime.policy = resolved
	runtime.policyChange++
	runtime.mu.Unlock()
	runtime.EmitPerformanceLevel()
}

func (runtime *RustTelemetryCandidateRuntime) EmitPerformanceLevel() {
	if runtime.config.Emitter != nil {
		runtime.mu.Lock()
		policy := runtime.policy
		runtime.mu.Unlock()
		runtime.config.Emitter.Emit("performance:level", overlayPerformancePolicy(policy, policy.SourceHz))
	}
}

func (runtime *RustTelemetryCandidateRuntime) SourceStatus() driver.SourceStatus {
	if runtime == nil || !runtime.config.Enabled {
		return driver.UnknownSourceStatus()
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	state := runtime.status
	return driver.SourceStatus{
		Kind: lmu.DriverID, Name: "Le Mans Ultimate", Live: true,
		Available: state == driver.StateLive || state == driver.StateDegraded || state == driver.StateStale,
		State:     state.String(), ReconnectAttempt: runtime.attempt,
	}
}

func (runtime *RustTelemetryCandidateRuntime) Start(parent context.Context) error {
	if runtime == nil || parent == nil {
		return ErrRustCandidateLifecycle
	}
	if err := parent.Err(); err != nil {
		return err
	}
	runtime.mu.Lock()
	if runtime.started || runtime.stopped {
		runtime.mu.Unlock()
		return ErrRustCandidateLifecycle
	}
	runtime.started = true
	if !runtime.config.Enabled {
		runtime.mu.Unlock()
		return runtime.setStatus(driver.StateStopped, 0, 0)
	}
	ctx, cancel := context.WithCancel(parent)
	runtime.cancel = cancel
	runtime.done = make(chan struct{})
	runtime.updates = make(chan telemetryprocess.ConfigurationV1, 1)
	runtime.overlayRequests = make(chan telemetryprocess.OverlayRPC)
	runtime.overlaySessions = make(map[string]string)
	runtime.overlayContext = ctx
	if runtime.strategy != nil && runtime.config.Emitter != nil {
		runtime.wailsDone = make(chan struct{})
	}
	wailsDone := runtime.wailsDone
	configuration, err := runtime.configurationLocked(1)
	policyChange := runtime.policyChange
	if err != nil {
		runtime.mu.Unlock()
		return runtime.abortStart(cancel, err)
	}
	runtime.mu.Unlock()
	if err := runtime.setStatus(driver.StateDetecting, 0, 0); err != nil {
		return runtime.abortStart(cancel, err)
	}
	go runtime.run(ctx, configuration, policyChange)
	if wailsDone != nil {
		go func() {
			defer close(wailsDone)
			if err := telemetrytransport.ServeWails(ctx, runtime.strategy, runtime.config.Emitter); err != nil && ctx.Err() == nil {
				log.Printf("Rust Strategy Wails transport: %v", err)
			}
		}()
	}
	return nil
}

func (runtime *RustTelemetryCandidateRuntime) abortStart(cancel context.CancelFunc, err error) error {
	cancel()
	runtime.mu.Lock()
	runtime.stopped = true
	close(runtime.done)
	if runtime.wailsDone != nil {
		close(runtime.wailsDone)
	}
	runtime.mu.Unlock()
	return err
}

func (runtime *RustTelemetryCandidateRuntime) run(ctx context.Context, initial telemetryprocess.ConfigurationV1, policyChange uint64) {
	defer close(runtime.done)
	refreshDone := make(chan struct{})
	go func() {
		defer close(refreshDone)
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		lastDemand, lastPolicy := initial.Consumers, policyChange
		revision := initial.Revision
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				runtime.mu.Lock()
				demand := runtime.consumersLocked()
				if demand == lastDemand && runtime.policyChange == lastPolicy {
					runtime.mu.Unlock()
					continue
				}
				lastDemand, lastPolicy = demand, runtime.policyChange
				next, err := runtime.configurationLocked(revision + 1)
				if err == nil {
					revision = next.Revision
				}
				runtime.mu.Unlock()
				if err != nil {
					log.Printf("Rust telemetry policy update rejected: %v", err)
					continue
				}
				select {
				case runtime.updates <- next:
				default:
					<-runtime.updates
					runtime.updates <- next
				}
			}
		}
	}()
	seed := func() uint64 {
		runtime.mu.Lock()
		defer runtime.mu.Unlock()
		return runtime.lastEpoch
	}
	var err error
	if runtime.config.EngineerBinaryDiagnostic {
		err = telemetryprocess.RunCandidateWithOverlayBinaryEngineerEpoch(ctx, runtime.config.Executable, initial, runtime.updates, runtime.overlayRequests, seed, runtime.deliver, runtime.handleDisconnected)
	} else {
		err = telemetryprocess.RunCandidateWithOverlayEpoch(ctx, runtime.config.Executable, initial, runtime.updates, runtime.overlayRequests, seed, runtime.deliver, runtime.handleDisconnected)
	}
	terminal := ctx.Err() == nil && err != nil
	runtime.cancel()
	<-refreshDone
	runtime.mu.Lock()
	runtime.runErr = err
	runtime.mu.Unlock()
	if terminal {
		if statusErr := runtime.setStatus(driver.StateError, runtime.SourceStatus().ReconnectAttempt, 0); statusErr != nil {
			log.Printf("Rust telemetry terminal status delivery: %v", statusErr)
		}
	}
}

func (runtime *RustTelemetryCandidateRuntime) handleDisconnected(cause error) {
	runtime.mu.Lock()
	attempt := runtime.attempt + 1
	runtime.newChild = true
	runtime.lastIPCStatus = telemetryprocess.StatusV1{}
	clear(runtime.overlaySessions)
	lastFact := runtime.lastFact
	runtime.mu.Unlock()
	if lastFact != 0 && runtime.config.Engineer != nil {
		if boundaryErr := runtime.config.Engineer.ConsumeFactBoundary(&engineerprojection.FactResyncRequiredError{Previous: lastFact}); boundaryErr != nil {
			log.Printf("Rust telemetry fact boundary after disconnect: %v", boundaryErr)
		}
	}
	log.Printf("Rust telemetry child disconnected: %v", cause)
	if statusErr := runtime.setStatus(driver.StateError, attempt, 0); statusErr != nil {
		log.Printf("Rust telemetry disconnect status delivery: %v", statusErr)
	}
}

func (runtime *RustTelemetryCandidateRuntime) Stop(ctx context.Context) error {
	if runtime == nil || ctx == nil {
		return ErrRustCandidateLifecycle
	}
	runtime.mu.Lock()
	if !runtime.stopped {
		runtime.stopped = true
		if runtime.cancel != nil {
			runtime.cancel()
		}
	}
	done := runtime.done
	wailsDone := runtime.wailsDone
	runtime.mu.Unlock()
	if done != nil {
		select {
		case <-done:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	if wailsDone != nil {
		select {
		case <-wailsDone:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	statusErr := runtime.setStatus(driver.StateStopped, 0, 0)
	var closeErr error
	if runtime.strategy != nil {
		closeErr = runtime.strategy.Close()
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return errors.Join(runtime.runErr, statusErr, closeErr)
}

func (runtime *RustTelemetryCandidateRuntime) consumersLocked() telemetryprocess.ConsumersV1 {
	_, legacyOverlay := runtime.registry.Lookup(telemetrytransport.ProductOverlayV2)
	overlay := legacyOverlay || len(runtime.overlaySessions) > 0
	return telemetryprocess.ConsumersV1{OverlayV2: overlay, Engineer: runtime.config.Engineer != nil, Strategy: runtime.strategy != nil}
}

func (runtime *RustTelemetryCandidateRuntime) configurationLocked(revision uint64) (telemetryprocess.ConfigurationV1, error) {
	return rustCandidatePolicy(revision, runtime.consumersLocked(), runtime.policy)
}

func (runtime *RustTelemetryCandidateRuntime) deliver(event telemetryprocess.ReceivedV1) error {
	if err := runtime.observeEpoch(&event); err != nil {
		return err
	}
	if event.Status != nil {
		state, err := rustCandidateDriverState(event.Status.State)
		if err != nil {
			return err
		}
		age := int64(0)
		if event.Status.SourceAgeNS != nil {
			age = int64(*event.Status.SourceAgeNS / 1_000_000)
		}
		if err := runtime.setStatus(state, runtime.SourceStatus().ReconnectAttempt, age); err != nil {
			return err
		}
		runtime.mu.Lock()
		runtime.lastIPCStatus = *event.Status
		runtime.mu.Unlock()
	}
	if event.Overlay != nil {
		// The first product frame can precede the next process heartbeat. Its
		// source state is already validated by the IPC decoder and must reach
		// shell/status consumers before the grid becomes visible.
		state, err := rustCandidateDriverState(string(event.Overlay.Source.State))
		if err != nil {
			return err
		}
		if err := runtime.setStatus(state, int(event.Overlay.Source.ReconnectAttempt), event.Overlay.Source.LastFrameAgeMS); err != nil {
			return err
		}
		if publisher, active := runtime.registry.Lookup(telemetrytransport.ProductOverlayV2); active {
			runtime.mu.Lock()
			runtime.deliveryRev++
			revision := runtime.deliveryRev
			runtime.mu.Unlock()
			update := *event.Overlay
			update.DeliveryRevision = revision
			if err := publisher.PublishSnapshot(revision, update); err != nil && !errors.Is(err, telemetrytransport.ErrClosed) {
				return err
			}
			// Studio/Desktop/OBS may release their publisher while a decoded
			// frame is in flight; ErrClosed must not restart LMU.
		}
	}
	if event.Engineer != nil || event.Strategy != nil {
		// The first accepted snapshot can arrive before the 250 ms heartbeat.
		// A committed product proves acquisition is connected; preserve an
		// already known stale/degraded state until Rust reports a transition.
		runtime.mu.Lock()
		state, attempt := runtime.status, runtime.attempt
		runtime.mu.Unlock()
		if state == driver.StateDetecting || state == driver.StateConnecting || state == driver.StateError {
			if err := runtime.setStatus(driver.StateLive, attempt, 0); err != nil {
				return err
			}
		}
	}
	if event.Engineer != nil && runtime.config.Engineer != nil {
		observation, err := event.EngineerObservation(runtime.manifest)
		if err != nil {
			return err
		}
		if err := runtime.config.Engineer.ConsumeObservation(observation); err != nil {
			log.Printf("Rust Engineer observation delivery: %v", err)
		}
	}
	if event.Strategy != nil && runtime.strategy != nil {
		runtime.mu.Lock()
		revision := runtime.statusRev
		runtime.mu.Unlock()
		full, err := telemetrytransport.NewStrategyFull(event.Strategy.Metadata, revision, event.Strategy.PayloadV1)
		if err != nil {
			return err
		}
		if err := runtime.strategy.PublishSnapshot(full, nil); err != nil {
			return err
		}
	}
	for _, fact := range event.Facts {
		if runtime.config.Engineer == nil {
			return ErrRustCandidateLifecycle
		}
		if err := runtime.config.Engineer.ConsumeFact(fact); err != nil {
			return err
		}
		runtime.mu.Lock()
		runtime.lastFact = fact.Fact.Sequence
		runtime.mu.Unlock()
	}
	if event.Resync != nil && runtime.config.Engineer != nil {
		return runtime.config.Engineer.ConsumeFactBoundary(&engineerprojection.FactResyncRequiredError{
			Previous: telemetrycore.FactSequence(event.Resync.First - 1), Next: telemetrycore.FactSequence(event.Resync.Next),
		})
	}
	return nil
}

// Rust emits the final product epoch. The host remembers only the last epoch
// to seed the next child after a process restart.
func (runtime *RustTelemetryCandidateRuntime) observeEpoch(event *telemetryprocess.ReceivedV1) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if event.Configuration != nil && runtime.newChild {
		if event.Configuration.Epoch == 0 || event.Configuration.Epoch <= runtime.lastEpoch {
			return ErrRustCandidateLifecycle
		}
		runtime.newChild = false
		runtime.lastFact = 0
	}
	observe := func(epoch uint64) error {
		if epoch == 0 || epoch < runtime.lastEpoch {
			return ErrRustCandidateLifecycle
		}
		if epoch > runtime.lastEpoch {
			runtime.lastEpoch = epoch
		}
		return nil
	}
	if event.Configuration != nil {
		if err := observe(event.Configuration.Epoch); err != nil {
			return err
		}
	}
	if event.Overlay != nil && event.Overlay.Frame != nil {
		if err := observe(event.Overlay.Frame.StreamEpoch); err != nil {
			return err
		}
	}
	if event.Engineer != nil {
		if err := observe(uint64(event.Engineer.Metadata.Epoch)); err != nil {
			return err
		}
	}
	if event.Strategy != nil {
		if err := observe(uint64(event.Strategy.Metadata.Epoch)); err != nil {
			return err
		}
	}
	for index := range event.Facts {
		if err := observe(uint64(event.Facts[index].Metadata.Epoch)); err != nil {
			return err
		}
	}
	return nil
}

func (runtime *RustTelemetryCandidateRuntime) setStatus(state driver.State, attempt int, ageMS int64) error {
	runtime.mu.Lock()
	if runtime.statusRev > 0 && runtime.status == state && runtime.attempt == attempt {
		runtime.lastAgeMS = ageMS
		runtime.mu.Unlock()
		return nil
	}
	runtime.status = state
	runtime.attempt = attempt
	runtime.lastAgeMS = ageMS
	runtime.statusRev++
	revision := runtime.statusRev
	runtime.deliveryRev++
	delivery := runtime.deliveryRev
	runtime.mu.Unlock()
	if runtime.strategy != nil {
		status, err := telemetrytransport.NewStatus(telemetrytransport.ProductStrategy, revision, time.Now().UTC(), telemetrytransport.StatusPayload{State: state.String(), ReconnectAttempt: attempt})
		if err != nil {
			return err
		}
		if err := runtime.strategy.PublishStatus(status); err != nil {
			return err
		}
	}
	if err := runtime.registry.PublishStatus(telemetrytransport.ProductOverlayV2, delivery, overlayv2.UpdateV2{
		DeliveryRevision: delivery,
		Source:           overlayv2.SourceStatusV2{State: overlayv2.SourceStateV2(state.String()), ReconnectAttempt: uint32(attempt), LastFrameAgeMS: ageMS},
	}); err != nil {
		return err
	}
	if runtime.config.Engineer != nil {
		if err := runtime.config.Engineer.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceState(state.String()), ReconnectAttempt: attempt}); err != nil {
			log.Printf("Rust Engineer status delivery: %v", err)
		}
	}
	return nil
}

func rustCandidateDriverState(value string) (driver.State, error) {
	for state := driver.StateStopped; state <= driver.StateStopping; state++ {
		if state.String() == value {
			return state, nil
		}
	}
	return driver.StateError, fmt.Errorf("unknown Rust source state %q", value)
}
