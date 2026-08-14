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
	elapsed           func() time.Duration
	newTicker         func(time.Duration) ticker
	interval          time.Duration
	freshnessLimit    time.Duration
	stableComparisons int
	build             buildProvider
	rest              *restConfig
	beforeRESTPublish func()
	captureTap        *CaptureTap
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
	if cfg.elapsed == nil {
		started := time.Now()
		cfg.elapsed = func() time.Duration { return time.Since(started) }
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
	cfg.rest = normalizeRESTConfig(cfg.rest, cfg.now, cfg.elapsed)
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
	if driver.config.captureTap != nil {
		defer driver.config.captureTap.Close()
	}

	if err := ctx.Err(); err != nil {
		return err
	}
	build, buildErr := driver.config.build()
	if buildErr != nil {
		build = BuildEvidence{}
	}
	profile := profileFromBuild(build)
	var captureSanitizer *FrameSanitizer
	if driver.config.captureTap != nil {
		captureSanitizer, _ = NewFrameSanitizer(build)
	}
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
	var fusion Fusion
	var previousSource time.Duration
	var unchangedSince monotonicStamp

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
		driver.captureDiagnosticFrame(now.Round(0).UTC(), buffer, captureSanitizer)
		elapsed := driver.config.elapsed()
		observation, err := parseWithProfile(buffer, now, profile)
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if current, present := observation.SourceTime.Value(); present && observation.SourceTime.Freshness() == schema.FreshnessFresh {
			observation.ClockChange = classifyClock(previousSource, current)
			if current != previousSource || !unchangedSince.set {
				unchangedSince = monotonicStamp{elapsed: elapsed, set: true}
			} else if elapsed < unchangedSince.elapsed || elapsed-unchangedSince.elapsed >= driver.config.freshnessLimit {
				// Medido en LMU 1.4: el simulador refresca su bloque de sesion a
				// 5 Hz constantes (200 ms), asi que este limite deja 2,5x de
				// margen y solo se alcanza en parones reales -- pausa, menu,
				// carga. No es un umbral ajustado: no lo subas para tapar un
				// parpadeo sin medir antes la cadencia.
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
		canonical := fusion.Merge(now, elapsed, observation)
		if err := sink.WriteObservation(ctx, canonical); err != nil {
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
			canonical := fusion.Merge(driver.config.now(), driver.config.elapsed(), observation)
			if err := sink.WriteObservation(ctx, canonical); err != nil {
				return fmt.Errorf("write LMU REST observation: %w", err)
			}
		case <-ticker.C():
			if err := acquire(); err != nil {
				return err
			}
		}
	}
}

func (driver *Driver) captureDiagnosticFrame(
	at time.Time,
	buffer []byte,
	sanitizer *FrameSanitizer,
) {
	tap := driver.config.captureTap
	if tap == nil {
		return
	}
	reservation, ok := tap.Reserve(at)
	if !ok {
		return
	}
	if sanitizer == nil {
		reservation.Drop()
		return
	}
	sanitized, err := sanitizer.Sanitize(buffer)
	if err != nil {
		reservation.Drop()
		return
	}
	reservation.commitOwned(sanitized)
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
	// El consumidor ya absorbe estos frames antes de que lleguen aqui, de modo
	// que en condiciones normales esta rama no se ejerce. Se mantiene como red
	// de seguridad: un fallo de mapeo describe un frame, nunca un driver
	// inservible, y clasificarlo como terminal apagaba la telemetria hasta el
	// siguiente reinicio.
	if IsUnmappableFrame(err) {
		return true
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
	value.EndTime = copyFreshness(value.EndTime, freshness)
	value.MaximumLaps = copyFreshness(value.MaximumLaps, freshness)
	value.TrackName = copyFreshness(value.TrackName, freshness)
	value.SessionType = copyFreshness(value.SessionType, freshness)
	value.VehicleCount = copyFreshness(value.VehicleCount, freshness)
	value.PlayerPresent = copyFreshness(value.PlayerPresent, freshness)
	value.VehicleName = copyFreshness(value.VehicleName, freshness)
	value.LapNumber = copyFreshness(value.LapNumber, freshness)
	value.Gear = copyFreshness(value.Gear, freshness)
	value.EngineRPM = copyFreshness(value.EngineRPM, freshness)
	value.SpeedMPS = copyFreshness(value.SpeedMPS, freshness)
	value.Throttle = copyFreshness(value.Throttle, freshness)
	value.Brake = copyFreshness(value.Brake, freshness)
	value.Clutch = copyFreshness(value.Clutch, freshness)
	value.PlayerPosition = copyFreshness(value.PlayerPosition, freshness)
	value.CompletedLaps = copyFreshness(value.CompletedLaps, freshness)
	value.PitStopCount = copyFreshness(value.PitStopCount, freshness)
	value.InPit = copyFreshness(value.InPit, freshness)
	value.Fuel = copyFreshness(value.Fuel, freshness)
	value.Vehicles = append([]VehicleObservation(nil), value.Vehicles...)
	for index := range value.Vehicles {
		vehicle := &value.Vehicles[index]
		vehicle.DriverName = copyFreshness(vehicle.DriverName, freshness)
		vehicle.VehicleName = copyFreshness(vehicle.VehicleName, freshness)
		vehicle.VehicleClass = copyFreshness(vehicle.VehicleClass, freshness)
		vehicle.Player = copyFreshness(vehicle.Player, freshness)
		vehicle.Position = copyFreshness(vehicle.Position, freshness)
		vehicle.CompletedLaps = copyFreshness(vehicle.CompletedLaps, freshness)
		vehicle.Sector = copyFreshness(vehicle.Sector, freshness)
		vehicle.LapDistance = copyFreshness(vehicle.LapDistance, freshness)
		vehicle.BestLapTime = copyFreshness(vehicle.BestLapTime, freshness)
		vehicle.LastLapTime = copyFreshness(vehicle.LastLapTime, freshness)
		vehicle.EstimatedLapTime = copyFreshness(vehicle.EstimatedLapTime, freshness)
		vehicle.InPit = copyFreshness(vehicle.InPit, freshness)
		vehicle.PitStopCount = copyFreshness(vehicle.PitStopCount, freshness)
		vehicle.PenaltyCount = copyFreshness(vehicle.PenaltyCount, freshness)
		vehicle.TimeBehindLeader = copyFreshness(vehicle.TimeBehindLeader, freshness)
		vehicle.LapsBehindLeader = copyFreshness(vehicle.LapsBehindLeader, freshness)
		vehicle.TimeBehindNext = copyFreshness(vehicle.TimeBehindNext, freshness)
		vehicle.LapsBehindNext = copyFreshness(vehicle.LapsBehindNext, freshness)
		vehicle.LapNumber = copyFreshness(vehicle.LapNumber, freshness)
		vehicle.Gear = copyFreshness(vehicle.Gear, freshness)
		vehicle.EngineRPM = copyFreshness(vehicle.EngineRPM, freshness)
		vehicle.SpeedMPS = copyFreshness(vehicle.SpeedMPS, freshness)
		vehicle.Throttle = copyFreshness(vehicle.Throttle, freshness)
		vehicle.Brake = copyFreshness(vehicle.Brake, freshness)
		vehicle.Clutch = copyFreshness(vehicle.Clutch, freshness)
		vehicle.Fuel = copyFreshness(vehicle.Fuel, freshness)
		vehicle.DeltaBest = copyFreshness(vehicle.DeltaBest, freshness)
	}
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
