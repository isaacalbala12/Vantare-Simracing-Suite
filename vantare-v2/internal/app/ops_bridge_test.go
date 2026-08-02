package app

import (
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/ops"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

type fixedOpsSampler struct{}

func (fixedOpsSampler) Sample() ops.MetricsSnapshot {
	return ops.MetricsSnapshot{
		Timestamp: time.Now(),
		App: ops.ProcessMetrics{
			MemoryMB:   42,
			CPUPercent: nil,
			Goroutines: 7,
		},
		Source: driver.SourceStatus{
			Kind:      "lmu",
			Name:      "Le Mans Ultimate",
			Live:      true,
			Available: true,
			State:     "live",
		},
	}
}

type captureEmitter struct {
	mu     sync.Mutex
	events []string
	data   []any
}

func (e *captureEmitter) Emit(name string, data any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, name)
	e.data = append(e.data, data)
}

func TestOpsBridgeEmitsMetrics(t *testing.T) {
	emitter := &captureEmitter{}
	bridge := NewOpsBridge(fixedOpsSampler{}, emitter, 10*time.Millisecond)

	bridge.Start()
	time.Sleep(35 * time.Millisecond)
	bridge.Stop()

	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	if len(emitter.events) == 0 {
		t.Fatal("expected at least one emitted event")
	}
	for _, name := range emitter.events {
		if name != "ops:metrics" {
			t.Fatalf("expected ops:metrics, got %q", name)
		}
	}
}

func TestOpsBridgeStopBeforeStartReturns(t *testing.T) {
	bridge := NewOpsBridge(fixedOpsSampler{}, &captureEmitter{}, 10*time.Millisecond)
	done := make(chan struct{})

	go func() {
		bridge.Stop()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Stop blocked before Start")
	}
}

func TestOpsBridgeStartTwiceDoesNotDuplicateEmissions(t *testing.T) {
	emitter := &captureEmitter{}
	bridge := NewOpsBridge(fixedOpsSampler{}, emitter, 25*time.Millisecond)

	bridge.Start()
	bridge.Start()
	time.Sleep(10 * time.Millisecond)
	bridge.Stop()

	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	if len(emitter.events) != 1 {
		t.Fatalf("expected one immediate emission after duplicate Start, got %d", len(emitter.events))
	}
}

func TestOpsBridgeStartAfterStopDoesNothing(t *testing.T) {
	emitter := &captureEmitter{}
	bridge := NewOpsBridge(fixedOpsSampler{}, emitter, 10*time.Millisecond)

	bridge.Stop()
	bridge.Start()

	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	if len(emitter.events) != 0 {
		t.Fatalf("expected no emissions after Start called post-Stop, got %d", len(emitter.events))
	}
}
