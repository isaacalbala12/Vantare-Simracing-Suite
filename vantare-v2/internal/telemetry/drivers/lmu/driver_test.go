package lmu

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

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
	driver := newDriver(config{
		open:      func() (memoryReader, error) { opens++; return reader, nil },
		now:       func() time.Time { return now },
		newTicker: func(time.Duration) ticker { return ticks },
	})
	sink := &collectingSink{values: make(chan Observation, 2)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	<-sink.values
	if opens != 1 || reader.reads != 1 {
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

func TestDriverReturnsTypedErrorsForManagerReconnect(t *testing.T) {
	driver := newDriver(config{open: func() (memoryReader, error) { return nil, ErrMappingUnavailable }})
	err := driver.Run(t.Context(), &collectingSink{values: make(chan Observation, 1)})
	if !IsRetryable(err) || !errors.Is(err, ErrDisconnected) {
		t.Fatalf("error = %v", err)
	}

	short := &testReader{data: make([]byte, ObjectOutSize-1)}
	driver = newDriver(config{open: func() (memoryReader, error) { return short, nil }})
	err = driver.Run(t.Context(), &collectingSink{values: make(chan Observation, 1)})
	if !errors.Is(err, ErrIncompatibleBuffer) || IsRetryable(err) {
		t.Fatalf("short error = %v", err)
	}
	if short.closes != 1 {
		t.Fatalf("short reader closes = %d", short.closes)
	}
}

func TestDriverPropagatesCloseFailureWithoutRawDiagnostics(t *testing.T) {
	closeFailure := errors.New("close handle failed")
	reader := &testReader{data: make([]byte, ObjectOutSize), closeError: closeFailure}
	sinkFailure := errors.New("stop after first observation")
	driver := newDriver(config{open: func() (memoryReader, error) { return reader, nil }})
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

func TestDriverReportsDegradedUnknownAndStaleClock(t *testing.T) {
	buffer := make([]byte, ObjectOutSize)
	buffer[1740] = 255
	reader := &testReader{data: buffer}
	ticks := &manualTicker{ticks: make(chan time.Time, 2)}
	var nowUnix atomic.Int64
	nowUnix.Store(100)
	driver := newDriver(config{
		open:           func() (memoryReader, error) { return reader, nil },
		now:            func() time.Time { return time.Unix(nowUnix.Load(), 0) },
		newTicker:      func(time.Duration) ticker { return ticks },
		freshnessLimit: time.Second,
	})
	sink := &collectingSink{values: make(chan Observation, 3)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	first := <-sink.values
	if first.Compatibility != CompatibilityUnknown || driver.RuntimeSnapshot().State != drivercontract.StateDegraded {
		t.Fatal("unknown signature was not degraded")
	}
	nowUnix.Store(102)
	ticks.ticks <- time.Unix(102, 0)
	second := <-sink.values
	if second.SourceTime.Freshness() != schema.FreshnessStale || driver.RuntimeSnapshot().State != drivercontract.StateStale {
		t.Fatal("unchanged clock was not stale")
	}
	cancel()
	<-done
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

func containsAny(value string, candidates []string) bool {
	for _, candidate := range candidates {
		if strings.Contains(value, candidate) {
			return true
		}
	}
	return false
}
