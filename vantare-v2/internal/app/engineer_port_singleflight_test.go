package app

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

// singleFlightEngineerConsumer retiene el callback hasta cerrar release.
// Mide llamadas simultaneas reales para demostrar single-flight.
type singleFlightEngineerConsumer struct {
	started chan struct{}
	release chan struct{}
	once    sync.Once
	current atomic.Int64
	max     atomic.Int64
	calls   atomic.Uint64
	mu      sync.Mutex
	seqs    []uint64
}

func newSingleFlightEngineerConsumer() *singleFlightEngineerConsumer {
	return &singleFlightEngineerConsumer{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
}

func (*singleFlightEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error {
	return nil
}

func (consumer *singleFlightEngineerConsumer) ConsumeObservation(value engineerprojection.ObservationSnapshotV1) error {
	consumer.calls.Add(1)
	current := consumer.current.Add(1)
	defer consumer.current.Add(-1)
	for {
		peak := consumer.max.Load()
		if current <= peak || consumer.max.CompareAndSwap(peak, current) {
			break
		}
	}
	consumer.mu.Lock()
	consumer.seqs = append(consumer.seqs, uint64(value.Sequence))
	consumer.mu.Unlock()
	consumer.once.Do(func() { close(consumer.started) })
	<-consumer.release
	return nil
}

func (*singleFlightEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error {
	return nil
}

func (*singleFlightEngineerConsumer) ConsumeFactBoundary(*engineerprojection.FactResyncRequiredError) error {
	return nil
}

func (consumer *singleFlightEngineerConsumer) sequences() []uint64 {
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	return append([]uint64(nil), consumer.seqs...)
}

// blockingStatusEngineerConsumer retiene ConsumeSourceStatus para probar el
// deadline explicito de Stop en la ruta de salida del puerto.
type blockingStatusEngineerConsumer struct {
	statusStarted chan struct{}
	statusRelease chan struct{}
	once          sync.Once
}

func (*blockingStatusEngineerConsumer) ConsumeObservation(engineerprojection.ObservationSnapshotV1) error {
	return nil
}

func (*blockingStatusEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error {
	return nil
}

func (*blockingStatusEngineerConsumer) ConsumeFactBoundary(*engineerprojection.FactResyncRequiredError) error {
	return nil
}

func (consumer *blockingStatusEngineerConsumer) ConsumeSourceStatus(engineerprojection.SourceStatusV1) error {
	consumer.once.Do(func() { close(consumer.statusStarted) })
	<-consumer.statusRelease
	return nil
}

// awaitSignal espera una señal de arranque con deadline: un Fatal nunca debe
// colgarse en un <- sin cota.
func awaitSignal(t *testing.T, channel <-chan struct{}, what string) {
	t.Helper()
	select {
	case <-channel:
	case <-time.After(2 * time.Second):
		t.Fatalf("%s did not start", what)
	}
}

func waitForEngineerTimeouts(t *testing.T, runtime *TelemetryCoreRuntime, want uint64) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if runtime.Metrics().EngineerTimeouts >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("EngineerTimeouts = %d, want at least %d", runtime.Metrics().EngineerTimeouts, want)
}

func waitForSingleFlightSequences(t *testing.T, consumer *singleFlightEngineerConsumer, want []uint64) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if got := consumer.sequences(); len(got) >= len(want) {
			match := len(got) == len(want)
			for index := range want {
				if !match || got[index] != want[index] {
					t.Fatalf("Engineer sequences = %v, want %v", got, want)
				}
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("Engineer sequences = %v, want %v", consumer.sequences(), want)
}

func TestEngineerSingleFlightBoundsRetainedConsumer(t *testing.T) {
	consumer := newSingleFlightEngineerConsumer()
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Engineer: consumer, EngineerConsumeTimeout: 20 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	// Cleanup antes de las aserciones e idempotente: un Fatal no debe dejar
	// el callback retenido ni el puerto sin cerrar.
	var releaseOnce sync.Once
	doRelease := func() { releaseOnce.Do(func() { close(consumer.release) }) }
	t.Cleanup(func() {
		doRelease()
		_ = runtime.engineerPort.Stop(context.Background())
	})
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(1)})
	awaitSignal(t, consumer.started, "initial Engineer observation")
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(2)})
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(3)})
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(4)})
	waitForEngineerTimeouts(t, runtime, 1)
	// Ventana justificada: ~4 timeouts de 20ms con el callback retenido.
	// Sin single-flight cada timeout permite una goroutine nueva.
	time.Sleep(80 * time.Millisecond)
	if got := consumer.calls.Load(); got != 1 {
		t.Fatalf("Engineer observation calls with retained callback = %d, want 1", got)
	}
	if got := consumer.max.Load(); got != 1 {
		t.Fatalf("Engineer concurrent observations = %d, want 1", got)
	}
	if got := runtime.Metrics().EngineerTimeouts; got != 1 {
		t.Fatalf("EngineerTimeouts with retained callback = %d, want 1", got)
	}
	if got := runtime.Metrics().EngineerStatesDropped; got < 1 {
		t.Fatalf("EngineerStatesDropped with retained callback = %d, want >= 1", got)
	}
	doRelease()
	// Solo sobrevive el ultimo pendiente: latest-wins tras el timeout, en orden.
	waitForSingleFlightSequences(t, consumer, []uint64{1, 4})
	if err := runtime.engineerPort.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := consumer.calls.Load(); got != 2 {
		t.Fatalf("Engineer observation calls after release = %d, want 2", got)
	}
}

func TestEngineerPortStopBoundedWithRetainedCallback(t *testing.T) {
	consumer := newSingleFlightEngineerConsumer()
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Engineer: consumer, EngineerConsumeTimeout: 20 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	// El worker queda retenido: el cierre del loop debe seguir acotado aunque
	// el callback no cooperativo no retorne (no se promete cancelarlo).
	// Cleanup idempotente antes de las aserciones.
	var releaseOnce sync.Once
	t.Cleanup(func() {
		releaseOnce.Do(func() { close(consumer.release) })
		_ = runtime.engineerPort.Stop(context.Background())
	})
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(1)})
	awaitSignal(t, consumer.started, "initial Engineer observation")
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(2)})
	runtime.engineerPort.EnqueueObservation(engineerprojection.ObservationSnapshotV1{Metadata: projectionMetadata(3)})
	waitForEngineerTimeouts(t, runtime, 1)
	// Ventana justificada: varios timeouts con el callback retenido.
	time.Sleep(60 * time.Millisecond)
	if got := consumer.calls.Load(); got != 1 {
		t.Fatalf("Engineer observation calls with retained callback = %d, want 1", got)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	started := time.Now()
	if err := runtime.engineerPort.Stop(ctx); err != nil {
		t.Fatalf("Stop with retained callback = %v, want nil", err)
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("Stop with retained callback took %v, want <= 1s", elapsed)
	}
	if got := consumer.calls.Load(); got != 1 {
		t.Fatalf("Engineer observation calls after Stop = %d, want 1", got)
	}
}

func TestEngineerPortStopDeadlineIsExplicit(t *testing.T) {
	consumer := &blockingStatusEngineerConsumer{
		statusStarted: make(chan struct{}),
		statusRelease: make(chan struct{}),
	}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	runtime.engineerPort.Start()
	// Cleanup idempotente antes de las aserciones: libera el status retenido
	// y cierra el puerto aunque un Fatal interrumpa el cuerpo.
	var releaseOnce sync.Once
	t.Cleanup(func() {
		releaseOnce.Do(func() { close(consumer.statusRelease) })
		_ = runtime.engineerPort.Stop(context.Background())
	})
	runtime.engineerPort.EnqueueStatus(engineerprojection.SourceStatusV1{})
	awaitSignal(t, consumer.statusStarted, "Engineer status callback")
	// La salida esta bloqueada en el callback: el deadline debe fallar cerrado
	// con error explicito, no colgarse ni declarar exito falso.
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
	defer cancel()
	err = runtime.engineerPort.Stop(ctx)
	if err == nil {
		t.Fatal("Stop with blocked status callback = nil, want explicit deadline error")
	}
	if !errors.Is(err, context.DeadlineExceeded) || !strings.Contains(err.Error(), "stop Engineer asynchronous port") {
		t.Fatalf("Stop deadline error = %v, want stop Engineer asynchronous port: context deadline exceeded", err)
	}
}
