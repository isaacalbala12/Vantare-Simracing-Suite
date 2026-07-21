package lmu

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const (
	CapabilitySharedMemory   drivercontract.Capability = "shared-memory"
	defaultInterval                                    = time.Second / 60
	defaultFreshnessLimit                              = 500 * time.Millisecond
	defaultStableComparisons                           = 3
)

var (
	ErrDisconnected  = errors.New("LMU shared memory disconnected")
	ErrDriverRunning = errors.New("LMU driver is already running")
)

type ticker interface {
	C() <-chan time.Time
	Stop()
}

type systemTicker struct{ ticker *time.Ticker }

func (value systemTicker) C() <-chan time.Time { return value.ticker.C }
func (value systemTicker) Stop()               { value.ticker.Stop() }

type config struct {
	open              openMemory
	now               func() time.Time
	newTicker         func(time.Duration) ticker
	interval          time.Duration
	freshnessLimit    time.Duration
	stableComparisons int
	build             buildProvider
	rest              *restConfig
	beforeRESTPublish func()
}

// Driver owns exactly one LMU_Data mapping for the duration of each Run.
// Reconnection belongs to core.DriverManager, which creates a fresh Run.
type Driver struct {
	mu          sync.RWMutex
	state       drivercontract.State
	sharedState drivercontract.State
	restStatus  RESTStatus
	running     bool
	config      config
}

var _ core.Driver[Observation] = (*Driver)(nil)

func New() *Driver { return newDriver(config{rest: defaultRESTConfig()}) }

func newDriver(cfg config) *Driver {
	if cfg.open == nil {
		cfg.open = openSharedMemory
	}
	if cfg.now == nil {
		cfg.now = time.Now
	}
	if cfg.newTicker == nil {
		cfg.newTicker = func(interval time.Duration) ticker { return systemTicker{time.NewTicker(interval)} }
	}
	if cfg.interval <= 0 {
		cfg.interval = defaultInterval
	}
	if cfg.freshnessLimit <= 0 {
		cfg.freshnessLimit = defaultFreshnessLimit
	}
	if cfg.stableComparisons <= 0 {
		cfg.stableComparisons = defaultStableComparisons
	}
	if cfg.build == nil {
		cfg.build = readLMUBuildEvidence
	}
	cfg.rest = normalizeRESTConfig(cfg.rest, cfg.now)
	// DriverManager exposes an instance only after selecting it as active, where
	// its own state is already connecting. Matching that state at construction
	// avoids a transient illegal connecting -> stopped snapshot before Run starts.
	return &Driver{state: drivercontract.StateConnecting, config: cfg}
}

func (driver *Driver) Run(ctx context.Context, sink drivercontract.ObservationSink[Observation]) (runErr error) {
	if sink == nil {
		return errors.New("LMU observation sink is nil")
	}
	driver.mu.Lock()
	if driver.running {
		driver.mu.Unlock()
		return ErrDriverRunning
	}
	driver.running = true
	driver.state = drivercontract.StateConnecting
	driver.mu.Unlock()
	defer func() {
		driver.mu.Lock()
		driver.running = false
		if ctx.Err() != nil {
			driver.state = drivercontract.StateStopping
		} else if errors.Is(runErr, ErrIncoherentSnapshot) {
			driver.state = drivercontract.StateDegraded
		} else {
			driver.state = drivercontract.StateError
		}
		driver.mu.Unlock()
	}()

	if err := ctx.Err(); err != nil {
		return err
	}
	build, buildErr := driver.config.build()
	if buildErr != nil {
		build = BuildEvidence{}
	}
	profile := profileFromBuild(build)
	reader, err := driver.config.open()
	if err != nil {
		return fmt.Errorf("%w: open %s: %w", ErrDisconnected, MemoryName, err)
	}
	defer func() {
		if err := reader.Close(); err != nil {
			runErr = errors.Join(runErr, fmt.Errorf("%w: close %s: %w", drivercontract.ErrTeardown, MemoryName, err))
		}
	}()
	if err := ctx.Err(); err != nil {
		return err
	}

	ticker := driver.config.newTicker(driver.config.interval)
	defer ticker.Stop()

	runContext, cancelRun := context.WithCancel(ctx)
	var restOutput <-chan Observation
	var restDone <-chan error
	if driver.config.rest != nil {
		output := make(chan Observation)
		done := make(chan error, 1)
		restOutput = output
		restDone = done
		go func() {
			done <- runREST(runContext, driver.config.rest, output)
		}()
	}
	defer func() {
		cancelRun()
		if restDone == nil {
			return
		}
		if err := <-restDone; err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			runErr = errors.Join(runErr, fmt.Errorf("stop LMU REST poller: %w", err))
		}
		if closer, ok := driver.config.rest.client.(interface{ CloseIdleConnections() }); ok {
			closer.CloseIdleConnections()
		}
	}()
	buffer := make([]byte, ObjectOutSize)
	scratch := make([]byte, ObjectOutSize)
	var previousSource time.Duration
	var unchangedSince time.Time

	acquire := func() error {
		if err := readStable(ctx, reader, buffer, scratch, driver.config.stableComparisons); err != nil {
			if errors.Is(err, ErrIncompatibleBuffer) {
				return err
			}
			if errors.Is(err, ErrIncoherentSnapshot) {
				driver.setRuntime(drivercontract.StateDegraded)
				return err
			}
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err
			}
			return fmt.Errorf("%w: snapshot %s: %w", ErrDisconnected, MemoryName, err)
		}
		now := driver.config.now()
		observation, err := parseWithProfile(buffer, now, profile)
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if current, present := observation.SourceTime.Value(); present && observation.SourceTime.Freshness() == schema.FreshnessFresh {
			observation.ClockChange = classifyClock(previousSource, current)
			if current != previousSource || unchangedSince.IsZero() {
				unchangedSince = now
			} else if now.Sub(unchangedSince) >= driver.config.freshnessLimit {
				observation = withFreshness(observation, schema.FreshnessStale)
			}
			previousSource = current
		}
		state := runtimeState(observation)
		if err := ctx.Err(); err != nil {
			return err
		}
		driver.setSharedRuntime(state)
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := sink.WriteObservation(ctx, observation); err != nil {
			return fmt.Errorf("write LMU observation: %w", err)
		}
		return nil
	}

	if err := acquire(); err != nil {
		return err
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case observation := <-restOutput:
			if driver.config.beforeRESTPublish != nil {
				driver.config.beforeRESTPublish()
			}
			if err := ctx.Err(); err != nil {
				return err
			}
			driver.setRESTRuntime(observation.REST.Status)
			if err := ctx.Err(); err != nil {
				return err
			}
			if err := sink.WriteObservation(ctx, observation); err != nil {
				return fmt.Errorf("write LMU REST observation: %w", err)
			}
		case <-ticker.C():
			if err := acquire(); err != nil {
				return err
			}
		}
	}
}

func (driver *Driver) RuntimeSnapshot() drivercontract.RuntimeSnapshot {
	driver.mu.RLock()
	defer driver.mu.RUnlock()
	result := drivercontract.RuntimeSnapshot{State: driver.state}
	if driver.sharedState == drivercontract.StateLive || driver.sharedState == drivercontract.StateDegraded || driver.sharedState == drivercontract.StateStale {
		result.Capabilities = []drivercontract.Capability{CapabilitySharedMemory}
	}
	if driver.restStatus == RESTStatusLive || driver.restStatus == RESTStatusPartial || driver.restStatus == RESTStatusStale {
		result.Capabilities = append(result.Capabilities, drivercontract.Capability(CapabilityREST))
	}
	return result
}

func (driver *Driver) setRuntime(state drivercontract.State) {
	driver.mu.Lock()
	driver.sharedState = state
	driver.state = state
	driver.mu.Unlock()
}

func (driver *Driver) setSharedRuntime(state drivercontract.State) {
	driver.mu.Lock()
	driver.sharedState = state
	driver.state = combinedRuntimeState(driver.sharedState, driver.restStatus)
	driver.mu.Unlock()
}

func (driver *Driver) setRESTRuntime(status RESTStatus) {
	driver.mu.Lock()
	driver.restStatus = status
	driver.state = combinedRuntimeState(driver.sharedState, driver.restStatus)
	driver.mu.Unlock()
}

func combinedRuntimeState(shared drivercontract.State, rest RESTStatus) drivercontract.State {
	if shared == drivercontract.StateDegraded || shared == drivercontract.StateError {
		return shared
	}
	if shared == drivercontract.StateStale {
		return drivercontract.StateStale
	}
	if shared != drivercontract.StateLive {
		return shared
	}
	switch rest {
	case RESTStatusUnknown, RESTStatusLive:
		return drivercontract.StateLive
	case RESTStatusStale:
		return drivercontract.StateDegraded
	default:
		return drivercontract.StateDegraded
	}
}

func IsRetryable(err error) bool {
	if errors.Is(err, drivercontract.ErrTeardown) {
		return false
	}
	return errors.Is(err, ErrDisconnected) || errors.Is(err, ErrMappingUnavailable) || errors.Is(err, ErrMappingRead) || errors.Is(err, ErrIncoherentSnapshot)
}

func runtimeState(observation Observation) drivercontract.State {
	if observation.Compatibility == CompatibilityUnknown {
		return drivercontract.StateDegraded
	}
	if observation.SourceTime.Freshness() == schema.FreshnessStale {
		return drivercontract.StateStale
	}
	return drivercontract.StateLive
}

func withFreshness(value Observation, freshness schema.Freshness) Observation {
	value.SourceTime = copyFreshness(value.SourceTime, freshness)
	value.TrackName = copyFreshness(value.TrackName, freshness)
	value.SessionType = copyFreshness(value.SessionType, freshness)
	value.VehicleCount = copyFreshness(value.VehicleCount, freshness)
	value.PlayerPresent = copyFreshness(value.PlayerPresent, freshness)
	value.VehicleName = copyFreshness(value.VehicleName, freshness)
	value.LapNumber = copyFreshness(value.LapNumber, freshness)
	value.Gear = copyFreshness(value.Gear, freshness)
	value.EngineRPM = copyFreshness(value.EngineRPM, freshness)
	value.SpeedMPS = copyFreshness(value.SpeedMPS, freshness)
	value.Controls = copyFreshness(value.Controls, freshness)
	return value
}

func copyFreshness[T comparable](field schema.Field[T], freshness schema.Freshness) schema.Field[T] {
	value, present := field.Value()
	if !present || field.Freshness() == schema.FreshnessInvalid {
		return field
	}
	copy, _ := schema.NewField(value, field.Provenance(), freshness)
	return copy
}
