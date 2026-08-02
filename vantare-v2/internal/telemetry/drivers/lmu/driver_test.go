package lmu

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

type manualTicker struct {
	ticks chan time.Time
	stops int
}

func (ticker *manualTicker) C() <-chan time.Time { return ticker.ticks }
func (ticker *manualTicker) Stop()               { ticker.stops++ }

type collectingSink struct {
	values chan Observation
	err    error
}

func (sink *collectingSink) WriteObservation(_ context.Context, value Observation) error {
	sink.values <- value
	return sink.err
}

func TestDriverOwnsSingleOpenAndCloseUntilCancellation(t *testing.T) {
	reader := &testReader{data: make([]byte, ObjectOutSize)}
	ticks := &manualTicker{ticks: make(chan time.Time)}
	opens := 0
	now := time.Unix(100, 0)
	driver := newTestDriver(config{
		open:      func() (memoryReader, error) { opens++; return reader, nil },
		now:       func() time.Time { return now },
		newTicker: func(time.Duration) ticker { return ticks },
	})
	sink := &collectingSink{values: make(chan Observation, 2)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	<-sink.values
	if opens != 1 || reader.reads != 2 {
		t.Fatalf("opens=%d reads=%d", opens, reader.reads)
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run error = %v", err)
	}
	if reader.closes != 1 || ticks.stops != 1 {
		t.Fatalf("closes=%d ticker stops=%d", reader.closes, ticks.stops)
	}
}

func TestDriverRejectsIncoherentFrameWithoutPublishing(t *testing.T) {
	a := knownBuffer(t)
	b := append([]byte(nil), a...)
	b[100]++
	reader := &testReader{snapshots: [][]byte{a, b, a, b}}
	sink := &countingSink{}
	driver := newTestDriver(config{open: func() (memoryReader, error) { return reader, nil }, stableComparisons: 3})
	err := driver.Run(t.Context(), sink)
	if !errors.Is(err, ErrIncoherentSnapshot) || !IsRetryable(err) {
		t.Fatalf("error = %v", err)
	}
	if sink.calls.Load() != 0 {
		t.Fatal("incoherent frame was published")
	}
	if reader.closes != 1 {
		t.Fatalf("closes = %d", reader.closes)
	}
	if driver.RuntimeSnapshot().State != drivercontract.StateDegraded {
		t.Fatalf("runtime = %s", driver.RuntimeSnapshot().State)
	}
}

func TestDriverCancellationBoundariesDoNotOpenOrPublishLate(t *testing.T) {
	t.Run("already cancelled does not open", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		cancel()
		opens := 0
		driver := newTestDriver(config{open: func() (memoryReader, error) { opens++; return &testReader{data: knownBuffer(t)}, nil }})
		err := driver.Run(ctx, &countingSink{})
		if !errors.Is(err, context.Canceled) || opens != 0 {
			t.Fatalf("error=%v opens=%d", err, opens)
		}
	})
	t.Run("cancelled after open closes without publish", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		reader := &testReader{data: knownBuffer(t)}
		driver := newTestDriver(config{open: func() (memoryReader, error) { cancel(); return reader, nil }})
		sink := &countingSink{}
		err := driver.Run(ctx, sink)
		if !errors.Is(err, context.Canceled) || sink.calls.Load() != 0 || reader.closes != 1 {
			t.Fatalf("error=%v calls=%d closes=%d", err, sink.calls.Load(), reader.closes)
		}
	})
	t.Run("cancelled after stable read does not publish", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		reader := &testReader{data: knownBuffer(t)}
		driver := newTestDriver(config{
			open: func() (memoryReader, error) { return reader, nil },
			now:  func() time.Time { cancel(); return time.Unix(1, 0) },
		})
		sink := &countingSink{}
		err := driver.Run(ctx, sink)
		if !errors.Is(err, context.Canceled) || sink.calls.Load() != 0 || reader.reads != 2 || reader.closes != 1 {
			t.Fatalf("error=%v calls=%d reads=%d closes=%d", err, sink.calls.Load(), reader.reads, reader.closes)
		}
	})
}

func TestDriverReturnsTypedErrorsForManagerReconnect(t *testing.T) {
	driver := newTestDriver(config{open: func() (memoryReader, error) { return nil, ErrMappingUnavailable }})
	err := driver.Run(t.Context(), &collectingSink{values: make(chan Observation, 1)})
	if !IsRetryable(err) || !errors.Is(err, ErrDisconnected) {
		t.Fatalf("error = %v", err)
	}

	short := &testReader{data: make([]byte, ObjectOutSize-1)}
	driver = newTestDriver(config{open: func() (memoryReader, error) { return short, nil }})
	err = driver.Run(t.Context(), &collectingSink{values: make(chan Observation, 1)})
	if !errors.Is(err, ErrIncompatibleBuffer) || IsRetryable(err) {
		t.Fatalf("short error = %v", err)
	}
	if short.closes != 1 {
		t.Fatalf("short reader closes = %d", short.closes)
	}
}

func TestTeardownDominatesTransientFailureAndPreventsReconnect(t *testing.T) {
	for _, maxReconnects := range []int{0, 1} {
		t.Run(fmt.Sprintf("max reconnects %d", maxReconnects), func(t *testing.T) {
			closeFailure := errors.New("close failed after disconnect")
			reader := &testReader{readErr: ErrMappingRead, closeError: closeFailure, closed: make(chan struct{})}
			opens := atomic.Int32{}
			constructions := atomic.Int32{}
			waits := atomic.Int32{}
			manager, err := core.NewDriverManager([]core.DriverCandidate[Observation]{
				{
					Descriptor: drivercontract.Descriptor{ID: "lmu"},
					Detect:     func(context.Context) (bool, error) { return true, nil },
					New: func() (core.Driver[Observation], error) {
						constructions.Add(1)
						return newTestDriver(config{open: func() (memoryReader, error) { opens.Add(1); return reader, nil }}), nil
					},
					Retryable: IsRetryable,
				},
			}, core.ManagerConfig{Retry: core.RetryPolicy{
				MaxReconnects: maxReconnects,
				Wait:          func(context.Context, time.Duration) error { waits.Add(1); return nil },
			}})
			if err != nil {
				t.Fatal(err)
			}
			if err := manager.Start(t.Context(), &countingSink{}); err != nil {
				t.Fatal(err)
			}
			<-reader.closed
			results := make(chan error, 2)
			for range 2 {
				go func() { results <- manager.Stop(t.Context()) }()
			}
			for range 2 {
				err := <-results
				if !errors.Is(err, drivercontract.ErrTeardown) || !errors.Is(err, ErrDisconnected) || !errors.Is(err, closeFailure) {
					t.Fatalf("Stop error = %v", err)
				}
			}
			if opens.Load() != 1 || constructions.Load() != 1 || waits.Load() != 0 {
				t.Fatalf("opens=%d constructions=%d waits=%d", opens.Load(), constructions.Load(), waits.Load())
			}
		})
	}
	joined := errors.Join(drivercontract.ErrTeardown, ErrDisconnected, ErrIncoherentSnapshot)
	if IsRetryable(joined) {
		t.Fatal("teardown must dominate every transient marker")
	}
}

func TestDriverPropagatesCloseFailureWithoutRawDiagnostics(t *testing.T) {
	closeFailure := errors.New("close handle failed")
	reader := &testReader{data: make([]byte, ObjectOutSize), closeError: closeFailure}
	sinkFailure := errors.New("stop after first observation")
	driver := newTestDriver(config{open: func() (memoryReader, error) { return reader, nil }})
	err := driver.Run(t.Context(), &collectingSink{values: make(chan Observation, 1), err: sinkFailure})
	if !errors.Is(err, sinkFailure) || !errors.Is(err, closeFailure) {
		t.Fatalf("Run error = %v, want sink and close failures", err)
	}
	if reader.closes != 1 {
		t.Fatalf("closes = %d, want 1", reader.closes)
	}
	if containsAny(err.Error(), []string{"driver-", "player", "Circuit"}) {
		t.Fatalf("diagnostic leaked fixture identity: %v", err)
	}
}

func TestLMUTeardownFailureReachesDriverManagerStop(t *testing.T) {
	closeFailure := errors.New("close LMU mapping failed")
	reader := &testReader{data: knownBuffer(t), closeError: closeFailure}
	driver := newTestDriver(config{open: func() (memoryReader, error) { return reader, nil }})
	manager, err := core.NewDriverManager([]core.DriverCandidate[Observation]{
		{
			Descriptor: drivercontract.Descriptor{ID: "lmu"},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New:        func() (core.Driver[Observation], error) { return driver, nil },
		},
	}, core.ManagerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	sink := &collectingSink{values: make(chan Observation, 1)}
	if err := manager.Start(t.Context(), sink); err != nil {
		t.Fatal(err)
	}
	<-sink.values
	err = manager.Stop(t.Context())
	if !errors.Is(err, drivercontract.ErrTeardown) || !errors.Is(err, closeFailure) {
		t.Fatalf("Stop error = %v", err)
	}
	if reader.closes != 1 {
		t.Fatalf("closes = %d", reader.closes)
	}
}

func TestDriverLifecycleFreshnessUsesElapsedAcrossUTCJumpsAndRecovers(t *testing.T) {
	tests := []struct {
		name            string
		wallJump        time.Duration
		firstElapsed    time.Duration
		firstFreshness  schema.Freshness
		needsExpiryTick bool
	}{
		{name: "UTC rollback cannot prevent expiry", wallJump: -24 * time.Hour, firstElapsed: time.Second + time.Nanosecond, firstFreshness: schema.FreshnessStale},
		{name: "UTC forward cannot force expiry", wallJump: 365 * 24 * time.Hour, firstElapsed: 500 * time.Millisecond, firstFreshness: schema.FreshnessFresh, needsExpiryTick: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buffer := knownBuffer(t)
			reader := &testReader{data: buffer}
			ticks := &manualTicker{ticks: make(chan time.Time, 3)}
			initialWall := time.Unix(100, 0).UTC()
			var wallNanos atomic.Int64
			var elapsedNanos atomic.Int64
			wallNanos.Store(initialWall.UnixNano())
			driver := newTestDriver(config{
				open:           func() (memoryReader, error) { return reader, nil },
				now:            func() time.Time { return time.Unix(0, wallNanos.Load()).UTC() },
				elapsed:        func() time.Duration { return time.Duration(elapsedNanos.Load()) },
				newTicker:      func(time.Duration) ticker { return ticks },
				freshnessLimit: time.Second,
			})
			sink := &collectingSink{values: make(chan Observation, 4)}
			ctx, cancel := context.WithCancel(t.Context())
			done := make(chan error, 1)
			go func() { done <- driver.Run(ctx, sink) }()

			first := <-sink.values
			if first.SourceTime.Freshness() != schema.FreshnessFresh || driver.RuntimeSnapshot().State != drivercontract.StateLive {
				t.Fatalf("initial observation=%v runtime=%v", first.SourceTime.Freshness(), driver.RuntimeSnapshot().State)
			}

			jumpedWall := initialWall.Add(tt.wallJump)
			wallNanos.Store(jumpedWall.UnixNano())
			elapsedNanos.Store(int64(tt.firstElapsed))
			ticks.ticks <- jumpedWall
			afterJump := <-sink.values
			if afterJump.ReceivedUTC != jumpedWall || afterJump.SourceTime.Freshness() != tt.firstFreshness {
				t.Fatalf("after UTC jump metadata=%v freshness=%v want metadata=%v freshness=%v", afterJump.ReceivedUTC, afterJump.SourceTime.Freshness(), jumpedWall, tt.firstFreshness)
			}

			if tt.needsExpiryTick {
				elapsedNanos.Store(int64(time.Second + time.Nanosecond))
				ticks.ticks <- jumpedWall
				expired := <-sink.values
				if expired.SourceTime.Freshness() != schema.FreshnessStale || driver.RuntimeSnapshot().State != drivercontract.StateStale {
					t.Fatalf("elapsed expiry freshness=%v runtime=%v", expired.SourceTime.Freshness(), driver.RuntimeSnapshot().State)
				}
			}

			currentSeconds := math.Float64frombits(binary.LittleEndian.Uint64(buffer[1700:]))
			binary.LittleEndian.PutUint64(buffer[1700:], math.Float64bits(currentSeconds+1))
			recoveryWall := initialWall.Add(-365 * 24 * time.Hour)
			wallNanos.Store(recoveryWall.UnixNano())
			ticks.ticks <- recoveryWall
			recovered := <-sink.values
			if recovered.ReceivedUTC != recoveryWall || recovered.SourceTime.Freshness() != schema.FreshnessFresh || driver.RuntimeSnapshot().State != drivercontract.StateLive {
				t.Fatalf("recovery metadata=%v freshness=%v runtime=%v", recovered.ReceivedUTC, recovered.SourceTime.Freshness(), driver.RuntimeSnapshot().State)
			}

			cancel()
			if err := <-done; !errors.Is(err, context.Canceled) {
				t.Fatalf("Run error = %v", err)
			}
		})
	}
}

func TestDriverCachesBuildEvidenceOncePerRunAndFailsClosed(t *testing.T) {
	for _, tt := range []struct {
		name     string
		build    BuildEvidence
		buildErr error
	}{
		{name: "absent"},
		{name: "unsupported", build: BuildEvidence{FileVersion: "9.9.9.9"}},
		{name: "contradictory", build: BuildEvidence{FileVersion: "1.4.0.0", ProductVersion: supportedLMUVersion}},
		{name: "provider error", buildErr: errors.New("version unavailable")},
	} {
		t.Run(tt.name, func(t *testing.T) {
			reader := &testReader{data: knownBuffer(t)}
			ticks := &manualTicker{ticks: make(chan time.Time, 1)}
			calls := atomic.Int32{}
			driver := newDriver(config{
				open:      func() (memoryReader, error) { return reader, nil },
				build:     func() (BuildEvidence, error) { calls.Add(1); return tt.build, tt.buildErr },
				newTicker: func(time.Duration) ticker { return ticks },
			})
			sink := &collectingSink{values: make(chan Observation, 2)}
			ctx, cancel := context.WithCancel(t.Context())
			done := make(chan error, 1)
			go func() { done <- driver.Run(ctx, sink) }()
			first := <-sink.values
			if first.Compatibility != CompatibilityUnknown || runtimeState(first) != drivercontract.StateDegraded {
				t.Fatalf("observation=%#v", first)
			}
			assertNoPublishedFields(t, first)
			ticks.ticks <- time.Now()
			<-sink.values
			cancel()
			<-done
			if calls.Load() != 1 {
				t.Fatalf("build calls = %d", calls.Load())
			}
		})
	}
}

func TestRuntimeSnapshotIsConcurrentAndDefensive(t *testing.T) {
	driver := New()
	driver.setRuntime(drivercontract.StateLive)
	var wait sync.WaitGroup
	for range 20 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			snapshot := driver.RuntimeSnapshot()
			if len(snapshot.Capabilities) != 1 {
				t.Errorf("snapshot = %#v", snapshot)
			}
			snapshot.Capabilities[0] = "mutated"
		}()
	}
	wait.Wait()
	if got := driver.RuntimeSnapshot().Capabilities[0]; got != CapabilitySharedMemory {
		t.Fatalf("capability leaked: %q", got)
	}
}

func TestNewDriverStartsAtManagerCompatibleConnectingState(t *testing.T) {
	if got := New().RuntimeSnapshot().State; got != drivercontract.StateConnecting {
		t.Fatalf("initial state = %s, want connecting", got)
	}
}

func TestIncompatibilityTakesPriorityOverStale(t *testing.T) {
	observation := Observation{Compatibility: CompatibilityUnknown, SourceTime: observed(time.Second)}
	observation = withFreshness(observation, schema.FreshnessStale)
	if got := runtimeState(observation); got != drivercontract.StateDegraded {
		t.Fatalf("state = %s", got)
	}
}

func TestWithFreshnessExpiresEverySharedMemoryVehicleFieldWithoutMutatingInput(t *testing.T) {
	received := time.Date(2026, 7, 31, 18, 0, 0, 0, time.UTC)
	input, err := parseWithBuild(knownBuffer(t), received, BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		t.Fatal(err)
	}
	if len(input.Vehicles) == 0 {
		t.Fatal("fixture has no vehicles")
	}
	stale := withFreshness(input, schema.FreshnessStale)
	if input.Vehicles[0].InPit.Freshness() != schema.FreshnessFresh {
		t.Fatal("withFreshness mutated its input vehicle slice")
	}
	assertFreshnessTransition(t, "session", map[string][2]schema.Freshness{
		"source time":     {input.SourceTime.Freshness(), stale.SourceTime.Freshness()},
		"end time":        {input.EndTime.Freshness(), stale.EndTime.Freshness()},
		"maximum laps":    {input.MaximumLaps.Freshness(), stale.MaximumLaps.Freshness()},
		"track":           {input.TrackName.Freshness(), stale.TrackName.Freshness()},
		"session type":    {input.SessionType.Freshness(), stale.SessionType.Freshness()},
		"vehicle count":   {input.VehicleCount.Freshness(), stale.VehicleCount.Freshness()},
		"player present":  {input.PlayerPresent.Freshness(), stale.PlayerPresent.Freshness()},
		"vehicle name":    {input.VehicleName.Freshness(), stale.VehicleName.Freshness()},
		"lap number":      {input.LapNumber.Freshness(), stale.LapNumber.Freshness()},
		"gear":            {input.Gear.Freshness(), stale.Gear.Freshness()},
		"engine rpm":      {input.EngineRPM.Freshness(), stale.EngineRPM.Freshness()},
		"speed":           {input.SpeedMPS.Freshness(), stale.SpeedMPS.Freshness()},
		"throttle":        {input.Throttle.Freshness(), stale.Throttle.Freshness()},
		"brake":           {input.Brake.Freshness(), stale.Brake.Freshness()},
		"clutch":          {input.Clutch.Freshness(), stale.Clutch.Freshness()},
		"player position": {input.PlayerPosition.Freshness(), stale.PlayerPosition.Freshness()},
		"completed laps":  {input.CompletedLaps.Freshness(), stale.CompletedLaps.Freshness()},
		"pit stop count":  {input.PitStopCount.Freshness(), stale.PitStopCount.Freshness()},
		"player in pit":   {input.InPit.Freshness(), stale.InPit.Freshness()},
		"player fuel":     {input.Fuel.Freshness(), stale.Fuel.Freshness()},
	})
	for index := range input.Vehicles {
		before, after := input.Vehicles[index], stale.Vehicles[index]
		assertFreshnessTransition(t, fmt.Sprintf("vehicle %d", index), map[string][2]schema.Freshness{
			"driver":             {before.DriverName.Freshness(), after.DriverName.Freshness()},
			"vehicle":            {before.VehicleName.Freshness(), after.VehicleName.Freshness()},
			"class":              {before.VehicleClass.Freshness(), after.VehicleClass.Freshness()},
			"player":             {before.Player.Freshness(), after.Player.Freshness()},
			"position":           {before.Position.Freshness(), after.Position.Freshness()},
			"completed laps":     {before.CompletedLaps.Freshness(), after.CompletedLaps.Freshness()},
			"sector":             {before.Sector.Freshness(), after.Sector.Freshness()},
			"lap distance":       {before.LapDistance.Freshness(), after.LapDistance.Freshness()},
			"best lap":           {before.BestLapTime.Freshness(), after.BestLapTime.Freshness()},
			"last lap":           {before.LastLapTime.Freshness(), after.LastLapTime.Freshness()},
			"estimated lap":      {before.EstimatedLapTime.Freshness(), after.EstimatedLapTime.Freshness()},
			"in pit":             {before.InPit.Freshness(), after.InPit.Freshness()},
			"pit stop count":     {before.PitStopCount.Freshness(), after.PitStopCount.Freshness()},
			"penalty count":      {before.PenaltyCount.Freshness(), after.PenaltyCount.Freshness()},
			"time behind leader": {before.TimeBehindLeader.Freshness(), after.TimeBehindLeader.Freshness()},
			"laps behind leader": {before.LapsBehindLeader.Freshness(), after.LapsBehindLeader.Freshness()},
			"time behind next":   {before.TimeBehindNext.Freshness(), after.TimeBehindNext.Freshness()},
			"laps behind next":   {before.LapsBehindNext.Freshness(), after.LapsBehindNext.Freshness()},
			"lap number":         {before.LapNumber.Freshness(), after.LapNumber.Freshness()},
			"gear":               {before.Gear.Freshness(), after.Gear.Freshness()},
			"engine rpm":         {before.EngineRPM.Freshness(), after.EngineRPM.Freshness()},
			"speed":              {before.SpeedMPS.Freshness(), after.SpeedMPS.Freshness()},
			"throttle":           {before.Throttle.Freshness(), after.Throttle.Freshness()},
			"brake":              {before.Brake.Freshness(), after.Brake.Freshness()},
			"clutch":             {before.Clutch.Freshness(), after.Clutch.Freshness()},
			"fuel":               {before.Fuel.Freshness(), after.Fuel.Freshness()},
		})
	}
}

func assertFreshnessTransition(t testing.TB, scope string, fields map[string][2]schema.Freshness) {
	t.Helper()
	for name, transition := range fields {
		want := transition[0]
		if want != schema.FreshnessMissing && want != schema.FreshnessInvalid {
			want = schema.FreshnessStale
		}
		if transition[1] != want {
			t.Errorf("%s %s freshness = %v, want %v (before %v)", scope, name, transition[1], want, transition[0])
		}
	}
}

type countingSink struct{ calls atomic.Int32 }

func (sink *countingSink) WriteObservation(context.Context, Observation) error {
	sink.calls.Add(1)
	return nil
}

func newTestDriver(cfg config) *Driver {
	if cfg.build == nil {
		cfg.build = func() (BuildEvidence, error) { return BuildEvidence{FileVersion: supportedLMUVersion}, nil }
	}
	return newDriver(cfg)
}

func containsAny(value string, candidates []string) bool {
	for _, candidate := range candidates {
		if strings.Contains(value, candidate) {
			return true
		}
	}
	return false
}
