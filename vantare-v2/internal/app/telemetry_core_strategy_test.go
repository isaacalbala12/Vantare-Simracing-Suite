package app

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	goruntime "runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestStrategyHubNotInstantiatedWithoutFlag(t *testing.T) {
	var nilRuntime *TelemetryCoreRuntime
	if nilRuntime.StrategyHub() != nil {
		t.Fatal("nil StrategyHub() must be nil")
	}

	defaultRuntime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if defaultRuntime.StrategyHub() != nil {
		t.Fatalf("default StrategyHub() = %p, want nil", defaultRuntime.StrategyHub())
	}

	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if runtime.Hub() == nil || runtime.StrategyHub() == nil || runtime.Hub() == runtime.StrategyHub() {
		t.Fatalf("product hubs = Overlay %p Strategy %p", runtime.Hub(), runtime.StrategyHub())
	}

	// Guard the architectural contract without adding production seams: there
	// is one canonical acquisition/reduction chain and exactly two product hubs.
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf((*telemetrycore.SimulatorRuntime)(nil)).Elem(), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.reducer), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.coord), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.derive), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.hub), 2)
}

func newStrategyTelemetryCoreRuntime(config TelemetryCoreRuntimeConfig) (*TelemetryCoreRuntime, error) {
	config.StrategyPublicTransport = true
	return NewTelemetryCoreRuntime(config)
}

func TestTelemetryCoreRuntimePublishesStrategyWithoutOverlayV1(t *testing.T) {
	// R6a: WriteBatch solo proyecta y publica Strategy. El Hub Overlay V1
	// permanece construido pero retirado: sin status, sin snapshot y con sus
	// contadores heredados en cero.
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if runtime.Hub() == nil {
		t.Fatal("retired Overlay V1 Hub must stay built until R6b")
	}
	strategySubscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer strategySubscription.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := runtime.Hub().ReplayStatus(); ok {
		t.Fatal("retired Overlay V1 Hub published status")
	}
	if _, ok, _ := runtime.Hub().ReplaySnapshot(); ok {
		t.Fatal("retired Overlay V1 Hub published snapshot")
	}
	strategyStatus := nextStatus(t, strategySubscription)
	strategyFrame := nextSnapshot(t, strategySubscription)

	if strategyFrame.Product != telemetrytransport.ProductStrategy {
		t.Fatalf("product = Strategy %q", strategyFrame.Product)
	}
	if strategyFrame.StatusRevision != strategyStatus.StatusRevision {
		t.Fatalf("status revision differs: frame %d status %d", strategyFrame.StatusRevision, strategyStatus.StatusRevision)
	}
	if strategyFrame.Kind != telemetrytransport.Full {
		t.Fatalf("snapshot kind = Strategy %q", strategyFrame.Kind)
	}

	var strategyPayload strategyprojection.PayloadV1
	if err := json.Unmarshal(strategyFrame.Payload, &strategyPayload); err != nil {
		t.Fatal(err)
	}
	if !strategyPayload.Player.FuelLiters.Present || strategyPayload.Player.FuelLiters.Value != 60 ||
		!strategyPayload.Player.FuelCapacity.Present || strategyPayload.Player.FuelCapacity.Value != 100 {
		t.Fatalf("Strategy Fuel = %#v", strategyPayload.Player)
	}

	metrics := runtime.Metrics()
	if metrics.ProjectionsPublished != 0 || metrics.OverlayProjectionsPublished != 0 ||
		metrics.StrategyProjectionsPublished != 1 || metrics.Transport.SnapshotPublications != 0 ||
		metrics.Transport.StatusPublications != 0 ||
		metrics.StrategyTransport.SnapshotPublications != 1 {
		t.Fatalf("strategy-only metrics = %#v", metrics)
	}
}

func TestTelemetryCoreRuntimePublishesStrategyStatusTransitionsWithoutOverlayV1(t *testing.T) {
	// R6a: las transiciones de estado solo llegan a Strategy. El Hub Overlay
	// V1 retirado no publica ni retiene status.
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	strategySubscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer strategySubscription.Close()

	transitions := []struct {
		state   driver.State
		attempt int
	}{
		{state: driver.StateStopped, attempt: 0},
		{state: driver.StateDetecting, attempt: 0},
		{state: driver.StateConnecting, attempt: 1},
		{state: driver.StateLive, attempt: 1},
		{state: driver.StateDegraded, attempt: 1},
		{state: driver.StateStale, attempt: 2},
		{state: driver.StateError, attempt: 2},
		{state: driver.StateStopping, attempt: 0},
	}
	for index, transition := range transitions {
		if err := runtime.setStatus(transition.state, transition.attempt); err != nil {
			t.Fatal(err)
		}
		strategyStatus := nextStatus(t, strategySubscription)
		if strategyStatus.StatusRevision != uint64(index+1) {
			t.Fatalf("revision = %d, want %d", strategyStatus.StatusRevision, index+1)
		}
		var payload telemetrytransport.StatusPayload
		if err := json.Unmarshal(strategyStatus.Payload, &payload); err != nil {
			t.Fatal(err)
		}
		if payload.State != transition.state.String() || payload.ReconnectAttempt != transition.attempt {
			t.Fatalf("status payload = %#v, want %#v", payload, transition)
		}
		if err := runtime.setStatus(transition.state, transition.attempt); err != nil {
			t.Fatal(err)
		}
		metrics := runtime.Metrics()
		if metrics.Transport.StatusPublications != 0 ||
			metrics.StrategyTransport.StatusPublications != uint64(index+1) {
			t.Fatalf("strategy-only status publications = %#v", metrics)
		}
	}
	if _, ok, _ := runtime.Hub().ReplayStatus(); ok {
		t.Fatal("retired Overlay V1 Hub retained status")
	}
}

func TestTelemetryCoreStrategyHubLateAndSlowSubscribersAlwaysReceiveFull(t *testing.T) {
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	slow := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer slow.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	second := strategyRuntimeBatch(1, 2, 2*time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), second); err != nil {
		t.Fatal(err)
	}
	_ = nextStatus(t, slow)
	if frame := nextSnapshot(t, slow); frame.Kind != telemetrytransport.Full || frame.Epoch != 1 || frame.Sequence != 2 {
		t.Fatalf("slow subscriber frame = %#v", frame)
	}

	late := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer late.Close()
	_ = nextStatus(t, late)
	if frame := nextSnapshot(t, late); frame.Kind != telemetrytransport.Full || frame.Sequence != 2 {
		t.Fatalf("late subscriber frame = %#v", frame)
	}

	newEpoch := strategyRuntimeBatch(2, 1, 3*time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), newEpoch); err != nil {
		t.Fatal(err)
	}
	if frame := nextSnapshot(t, late); frame.Kind != telemetrytransport.Full || frame.Epoch != 2 || frame.Sequence != 1 {
		t.Fatalf("new epoch frame = %#v", frame)
	}
}

func TestTelemetryCoreRuntimeStartsOnlyTheExplicitStrategyWailsAdapter(t *testing.T) {
	emitter := &recordingTelemetryEmitter{
		seen:    make(map[string]int),
		notices: make(chan string, 8),
	}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Emitter: emitter})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t,
		telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventStatus),
	)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t,
		telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventSnapshot),
	)
	if got := runtime.Hub().Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("global Overlay Wails subscribers = %d, want 0", got)
	}

	stopContext, stopCancel := context.WithTimeout(context.Background(), time.Second)
	defer stopCancel()
	if err := runtime.Stop(stopContext); err != nil {
		t.Fatal(err)
	}
	if runtime.Metrics().Transport.CurrentSubscribers != 0 || runtime.Metrics().StrategyTransport.CurrentSubscribers != 0 {
		t.Fatalf("adapter subscribers after Stop = %#v", runtime.Metrics())
	}
	if err := runtime.Stop(stopContext); err != nil {
		t.Fatalf("second Stop() error = %v", err)
	}
}

func TestTelemetryCoreRuntimeIsolatesEngineerFailureFromStrategyHub(t *testing.T) {
	// R6a: el fallo de Engineer no escapa al producto Strategy y el Hub
	// Overlay V1 retirado permanece en silencio.
	consumer := &recordingEngineerConsumer{observationErr: errors.New("engineer unavailable")}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	strategySubscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer strategySubscription.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatalf("Engineer failure escaped product boundary: %v", err)
	}
	_ = nextStatus(t, strategySubscription)
	if frame := nextSnapshot(t, strategySubscription); frame.Product != telemetrytransport.ProductStrategy {
		t.Fatalf("Strategy frame product = %q", frame.Product)
	}
	if _, ok, _ := runtime.Hub().ReplayStatus(); ok {
		t.Fatal("retired Overlay V1 Hub published status")
	}
	if _, ok, _ := runtime.Hub().ReplaySnapshot(); ok {
		t.Fatal("retired Overlay V1 Hub published snapshot")
	}
	if runtime.EngineerError() == nil {
		t.Fatal("EngineerError() = nil, want isolated diagnostic")
	}
	metrics := runtime.Metrics()
	if metrics.ProjectionsPublished != 0 || metrics.OverlayProjectionsPublished != 0 ||
		metrics.StrategyProjectionsPublished != 1 || metrics.EngineerDeliveryFailures != 1 {
		t.Fatalf("isolated Engineer metrics = %#v", metrics)
	}
}

func TestStrategyFailureLeavesRetiredOverlaySilent(t *testing.T) {
	// R6a.1: el fallo es un ErrPayloadTooLarge real de Strategy (ya no
	// ErrClosed): con el status ya publicado, WriteBatch conserva el estado y
	// el snapshot no cabe en el hub acotado de test. La policy V2 lo absorbe
	// sin tumbar el driver y el Hub Overlay V1 retirado sigue sin publicar.
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	subscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer subscription.Close()
	// Seed the same status in Strategy before bounding it. WriteBatch then
	// keeps that status and reaches the Strategy snapshot publication itself.
	if err := runtime.setStatus(driver.StateStopped, 0); err != nil {
		t.Fatal(err)
	}
	_ = nextStatus(t, subscription)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), strategyRuntimeBatch(1, 1, time.Second)); err != nil {
		t.Fatal(err)
	}
	frame := nextSnapshot(t, subscription)
	swapStrategyHubForPayloadCeiling(t, runtime, len(frame.Payload))
	assertStrategyHubRejectsSnapshotAsTooLarge(t, runtime.StrategyHub(), frame)

	err = (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), strategyRuntimeBatch(1, 2, 2*time.Second))
	if err != nil {
		t.Fatalf("Strategy transport failure escaped driver loop: %v", err)
	}
	metrics := runtime.Metrics()
	// batch#1 publico 1 snapshot en el hub normal; batch#2 fallo en el hub
	// acotado sin publicar snapshot en ningun hub. La transicion a degraded
	// si cabe en el limite y queda entregada (StatusPublications==1).
	if metrics.ProjectionsPublished != 0 || metrics.OverlayProjectionsPublished != 0 ||
		metrics.StrategyProjectionsPublished != 1 || metrics.Transport.SnapshotPublications != 0 ||
		metrics.StrategyTransport.SnapshotPublications != 0 ||
		metrics.StrategyTransport.StatusPublications != 1 ||
		metrics.PublishFailures["strategy"] != 1 || metrics.FramesDropped["strategy-publish"] != 1 ||
		metrics.FailStops != 0 {
		t.Fatalf("failed cycle metrics = %#v", metrics)
	}
	if _, ok, _ := runtime.Hub().ReplaySnapshot(); ok {
		t.Fatal("retired Overlay V1 Hub published snapshot after Strategy failure")
	}
	hubSubscription, err := runtime.Hub().Subscribe(context.Background())
	if err != nil {
		t.Fatalf("retired Overlay hub must stay subscribable until R6b: %v", err)
	}
	defer hubSubscription.Close()
}

func TestStrategyPayloadTooLargeLegacyFailStop(t *testing.T) {
	// R6a.1: con la policy legacy, el mismo ErrPayloadTooLarge real de
	// Strategy tumba el runtime (fail-stop) en lugar de absorberse.
	legacy := false
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{TelemetryFailurePolicyV2: &legacy})
	if err != nil {
		t.Fatal(err)
	}
	subscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer subscription.Close()
	if err := runtime.setStatus(driver.StateStopped, 0); err != nil {
		t.Fatal(err)
	}
	_ = nextStatus(t, subscription)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), strategyRuntimeBatch(1, 1, time.Second)); err != nil {
		t.Fatal(err)
	}
	frame := nextSnapshot(t, subscription)
	swapStrategyHubForPayloadCeiling(t, runtime, len(frame.Payload))
	assertStrategyHubRejectsSnapshotAsTooLarge(t, runtime.StrategyHub(), frame)

	err = (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), strategyRuntimeBatch(1, 2, 2*time.Second))
	if !errors.Is(err, telemetrytransport.ErrPayloadTooLarge) {
		t.Fatalf("legacy failure = %v, want %v", err, telemetrytransport.ErrPayloadTooLarge)
	}
	metrics := runtime.Metrics()
	if metrics.StrategyProjectionsPublished != 1 || metrics.FailStops != 1 {
		t.Fatalf("legacy fail-stop metrics = %#v", metrics)
	}
	if runtime.lifecycle != telemetryRuntimeTerminal {
		t.Fatalf("legacy lifecycle = %d, want terminal", runtime.lifecycle)
	}
	if _, ok, _ := runtime.Hub().ReplaySnapshot(); ok {
		t.Fatal("retired Overlay V1 Hub published snapshot after legacy fail-stop")
	}
	assertRuntimeHubClosed(t, runtime.StrategyHub())
}

// swapStrategyHubForPayloadCeiling sustituye el strategyHub del runtime por un
// Hub ProductStrategy con un limite derivado del snapshot real ya publicado:
// la mitad de su tamano. El status (decenas de bytes) si cabe y se publica
// una vez en el Hub nuevo, que parte sin estado; solo el snapshot falla con
// ErrPayloadTooLarge con un margen inmune a variaciones de pocos bytes entre
// batches. El limite nunca cae al fallback de NewHub: bounded() solo acepta
// valores >= 1, y el guard lo verifica.
func swapStrategyHubForPayloadCeiling(t *testing.T, runtime *TelemetryCoreRuntime, snapshotPayloadBytes int) {
	t.Helper()
	limit := snapshotPayloadBytes / 2
	if limit < 1 {
		t.Fatalf("strategy snapshot payload = %d bytes, cannot derive a test ceiling below it", snapshotPayloadBytes)
	}
	runtime.strategyHub = telemetrytransport.NewHub(telemetrytransport.HubConfig{
		Product:         telemetrytransport.ProductStrategy,
		MaxPayloadBytes: limit,
		Versions: projection.VersionPolicy{
			Current:          strategyprojection.CurrentVersion,
			MinimumSupported: strategyprojection.MinimumSupportedVersion,
		},
	})
}

// assertStrategyHubRejectsSnapshotAsTooLarge prueba causalmente que el payload
// observado, reenviado tal cual al hub acotado, falla con ErrPayloadTooLarge.
func assertStrategyHubRejectsSnapshotAsTooLarge(t *testing.T, hub *telemetrytransport.Hub, frame telemetrytransport.Envelope) {
	t.Helper()
	oversized := telemetrytransport.Envelope{
		Product:           telemetrytransport.ProductStrategy,
		ProjectionVersion: strategyprojection.VersionV1,
		Epoch:             frame.Epoch,
		Sequence:          frame.Sequence + 1,
		Kind:              telemetrytransport.Full,
		CapturedAt:        frame.CapturedAt,
		StatusRevision:    frame.StatusRevision,
		Payload:           frame.Payload,
	}
	if err := hub.PublishSnapshot(oversized, nil); !errors.Is(err, telemetrytransport.ErrPayloadTooLarge) {
		t.Fatalf("bounded hub publish = %v, want %v", err, telemetrytransport.ErrPayloadTooLarge)
	}
}

func TestTelemetryCoreRuntimeRejectsInvalidCursorsWithoutAdvancingStrategy(t *testing.T) {
	// R6a: cursores invalidos no avanzan Strategy y el Hub Overlay V1
	// retirado no registra publicaciones.
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	strategySubscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer strategySubscription.Close()

	first := strategyRuntimeBatch(1, 1, time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	_ = nextStatus(t, strategySubscription)
	if frame := nextSnapshot(t, strategySubscription); frame.Epoch != 1 || frame.Sequence != 1 {
		t.Fatalf("first Strategy frame = %#v", frame)
	}
	assertStrategyRuntimePublicationMetrics(t, runtime.Metrics(), 1)

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), first); !errors.Is(err, telemetrycore.ErrStaleBatch) {
		t.Fatalf("duplicate 1/1 error = %v, want %v", err, telemetrycore.ErrStaleBatch)
	}
	assertStrategyRuntimePublicationMetrics(t, runtime.Metrics(), 1)

	gap := strategyRuntimeBatch(1, 3, 3*time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), gap); !errors.Is(err, telemetrycore.ErrSequenceGap) {
		t.Fatalf("gap 1/3 error = %v, want %v", err, telemetrycore.ErrSequenceGap)
	}
	assertStrategyRuntimePublicationMetrics(t, runtime.Metrics(), 1)

	second := strategyRuntimeBatch(1, 2, 2*time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), second); err != nil {
		t.Fatalf("recovery 1/2: %v", err)
	}
	if frame := nextSnapshot(t, strategySubscription); frame.Kind != telemetrytransport.Full ||
		frame.Epoch != 1 || frame.Sequence != 2 {
		t.Fatalf("recovered Strategy frame = %#v", frame)
	}
	assertStrategyRuntimePublicationMetrics(t, runtime.Metrics(), 2)
}

func TestTelemetryCoreRuntimeRejectsCanceledParentWithoutMutation(t *testing.T) {
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	parent, cancel := context.WithCancel(context.Background())
	cancel()
	if err := runtime.Start(parent); !errors.Is(err, context.Canceled) {
		t.Fatalf("Start(canceled parent) error = %v, want %v", err, context.Canceled)
	}
	metrics := runtime.Metrics()
	if metrics.Transport.StatusPublications != 0 || metrics.StrategyTransport.StatusPublications != 0 ||
		metrics.Transport.CurrentSubscribers != 0 || metrics.StrategyTransport.CurrentSubscribers != 0 {
		t.Fatalf("canceled Start mutated runtime = %#v", metrics)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatalf("valid first Start after canceled parent = %v", err)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestTelemetryCoreRuntimeFailedStartClosesBothHubsAndBecomesTerminal(t *testing.T) {
	consumer := &recordingEngineerConsumer{}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.StrategyHub().Close(); err != nil {
		t.Fatal(err)
	}

	err = runtime.Start(context.Background())
	if err == nil || !strings.Contains(err.Error(), "publish Strategy telemetry status") ||
		!errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("Start() error = %v", err)
	}
	metrics := runtime.Metrics()
	// R6a: el Hub Overlay V1 retirado no publica status ni siquiera en el
	// arranque; solo Strategy intentaba publicar y fallo por cierre.
	if metrics.Transport.StatusPublications != 0 || metrics.StrategyTransport.StatusPublications != 0 ||
		metrics.Transport.SnapshotPublications != 0 || metrics.StrategyTransport.SnapshotPublications != 0 {
		t.Fatalf("partial Start status metrics = %#v", metrics)
	}
	if len(consumer.calls) != 0 {
		t.Fatalf("Engineer calls before initial status = %v, want none", consumer.calls)
	}
	assertRuntimeHubClosed(t, runtime.Hub())
	assertRuntimeHubClosed(t, runtime.StrategyHub())
	if err := runtime.Start(context.Background()); !errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("second Start() error = %v, want %v", err, telemetrytransport.ErrClosed)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatalf("Stop() after failed Start = %v", err)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatalf("second Stop() after failed Start = %v", err)
	}
}

func TestTelemetryCoreRuntimeOverlayHubCloseDoesNotAffectWailsAdapter(t *testing.T) {
	emitter := &recordingTelemetryEmitter{seen: make(map[string]int), notices: make(chan string, 8)}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Emitter: emitter})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t, telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventStatus))
	if err := runtime.Hub().Close(); err != nil {
		t.Fatal(err)
	}
	if err := runtime.currentRunError(); err != nil {
		t.Fatalf("Overlay Hub close escaped into Wails lifecycle: %v", err)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatalf("Stop() after isolated Overlay close = %v", err)
	}
}

func TestTelemetryCoreRuntimeUnexpectedStrategyWailsCloseIsAuditedAndFailsBothHubs(t *testing.T) {
	emitter := &recordingTelemetryEmitter{seen: make(map[string]int), notices: make(chan string, 8)}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Emitter: emitter})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t, telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventStatus))
	if err := runtime.StrategyHub().Close(); err != nil {
		t.Fatal(err)
	}
	wantContext := "serve Strategy telemetry"
	waitForRuntimeError(t, runtime, wantContext)
	assertRuntimeHubClosed(t, runtime.Hub())
	assertRuntimeHubClosed(t, runtime.StrategyHub())
	if err := runtime.Stop(context.Background()); err == nil ||
		!strings.Contains(err.Error(), wantContext) ||
		!errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("Stop() Wails audit error = %v", err)
	}
}

func TestTelemetryCoreRuntimeConcurrentStopDoesNotWaitForEngineerCallback(t *testing.T) {
	consumer := &blockingInitialEngineerConsumer{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled:  true,
		Engineer: consumer,
	})
	if err != nil {
		t.Fatal(err)
	}
	startResult := make(chan error, 1)
	go func() {
		startResult <- runtime.Start(context.Background())
	}()
	select {
	case <-consumer.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("initial Engineer callback did not start")
	}
	stopResult := make(chan error, 1)
	go func() {
		stopContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		stopResult <- runtime.Stop(stopContext)
	}()
	select {
	case err := <-stopResult:
		if err != nil {
			t.Fatalf("concurrent Stop() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Stop() waited for Engineer callback")
	}
	close(consumer.release)
	select {
	case err := <-startResult:
		if !errors.Is(err, telemetrytransport.ErrClosed) {
			t.Fatalf("Start() after concurrent Stop = %v, want %v", err, telemetrytransport.ErrClosed)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Start() did not finish after Engineer callback")
	}
	if got := consumer.snapshotStates(); !reflect.DeepEqual(got, []engineerprojection.SourceState{
		engineerprojection.SourceDetecting,
		engineerprojection.SourceStopped,
	}) {
		t.Fatalf("Engineer status order = %v", got)
	}
}

func TestTelemetryCoreRuntimeCanceledAfterInitialEngineerStatusDeliversStoppedOnce(t *testing.T) {
	consumer := &blockingInitialEngineerConsumer{
		entered:   make(chan struct{}),
		release:   make(chan struct{}),
		statusErr: errors.New("Engineer consumer unavailable"),
	}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled:  true,
		Engineer: consumer,
	})
	if err != nil {
		t.Fatal(err)
	}
	parent, cancel := context.WithCancel(context.Background())
	startResult := make(chan error, 1)
	go func() {
		startResult <- runtime.Start(parent)
	}()
	select {
	case <-consumer.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("initial Engineer callback did not start")
	}
	cancel()
	close(consumer.release)
	select {
	case err := <-startResult:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Start() after parent cancellation = %v, want %v", err, context.Canceled)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Start() did not finish after parent cancellation")
	}
	if got := consumer.snapshotStates(); !reflect.DeepEqual(got, []engineerprojection.SourceState{
		engineerprojection.SourceDetecting,
		engineerprojection.SourceStopped,
	}) {
		t.Fatalf("Engineer status order = %v", got)
	}
	assertRuntimeHubClosed(t, runtime.Hub())
	assertRuntimeHubClosed(t, runtime.StrategyHub())
	for attempt := 1; attempt <= 2; attempt++ {
		if err := runtime.Stop(context.Background()); err != nil {
			t.Fatalf("Stop() attempt %d after canceled Start = %v", attempt, err)
		}
	}
	if got := consumer.snapshotStates(); !reflect.DeepEqual(got, []engineerprojection.SourceState{
		engineerprojection.SourceDetecting,
		engineerprojection.SourceStopped,
	}) {
		t.Fatalf("Engineer statuses after idempotent Stop = %v", got)
	}
}

func TestTelemetryCoreRuntimeDeliversInitialEngineerStatusBeforeStartingManager(t *testing.T) {
	consumer := &blockingInitialEngineerConsumer{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled:  true,
		Engineer: consumer,
	})
	if err != nil {
		t.Fatal(err)
	}
	startResult := make(chan error, 1)
	go func() {
		startResult <- runtime.Start(context.Background())
	}()
	select {
	case <-consumer.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("initial Engineer callback did not start")
	}
	if status := runtime.simulator.Status(); status.State != driver.StateStopped {
		t.Fatalf("manager state during initial callback = %q, want stopped", status.State)
	}
	close(consumer.release)
	select {
	case err := <-startResult:
		if err != nil {
			t.Fatalf("Start() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Start() did not continue after initial callback")
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestTelemetryCoreRuntimeFailStopMarksEnabledSourceUnavailable(t *testing.T) {
	emitter := &recordingTelemetryEmitter{
		seen:    make(map[string]int),
		notices: make(chan string, 8),
	}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled: true,
		Emitter: emitter,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t,
		telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventStatus),
	)
	if err := runtime.setStatus(driver.StateLive, 7); err != nil {
		t.Fatal(err)
	}
	if before := runtime.SourceStatus(); !before.Live || !before.Available || before.State != "live" {
		t.Fatalf("source before fail-stop = %#v", before)
	}
	if err := runtime.StrategyHub().Close(); err != nil {
		t.Fatal(err)
	}
	waitForRuntimeError(t, runtime, "serve Strategy telemetry")
	status := runtime.SourceStatus()
	if !status.Live || status.Available || status.State != "error" || status.ReconnectAttempt != 7 {
		t.Fatalf("source after fail-stop = %#v", status)
	}
	if err := runtime.Stop(context.Background()); err == nil ||
		!strings.Contains(err.Error(), "serve Strategy telemetry") ||
		!errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("Stop() fail-stop audit error = %v", err)
	}
}

func TestTelemetryCoreRuntimeNormalStopCancelsWorkersBeforeClosingHubs(t *testing.T) {
	emitter := &recordingTelemetryEmitter{
		seen:    make(map[string]int),
		notices: make(chan string, 8),
	}
	runtime, err := newStrategyTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled: true,
		Emitter: emitter,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t,
		telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventStatus),
	)
	stopContext, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := runtime.Stop(stopContext); err != nil {
		t.Fatalf("normal Stop() error = %v", err)
	}
	if err := runtime.currentRunError(); err != nil {
		t.Fatalf("normal teardown run error = %v", err)
	}
	assertRuntimeHubClosed(t, runtime.Hub())
	assertRuntimeHubClosed(t, runtime.StrategyHub())
}

func assertRuntimeFieldCount(t *testing.T, runtime *TelemetryCoreRuntime, fieldType reflect.Type, want int) {
	t.Helper()
	runtimeType := reflect.TypeOf(runtime).Elem()
	count := 0
	for index := 0; index < runtimeType.NumField(); index++ {
		if runtimeType.Field(index).Type == fieldType {
			count++
		}
	}
	if count != want {
		t.Fatalf("runtime fields of type %v = %d, want %d", fieldType, count, want)
	}
}

func assertStrategyRuntimePublicationMetrics(t *testing.T, metrics TelemetryCoreMetrics, want uint64) {
	t.Helper()
	var wantReplacements uint64
	if want > 0 {
		wantReplacements = want - 1
	}
	// R6a: los contadores Overlay V1 heredados quedan en cero y el Hub
	// retirado no publica; Strategy conserva su semantica.
	if metrics.BatchesApplied != want || metrics.ProjectionsPublished != 0 ||
		metrics.OverlayProjectionsPublished != 0 || metrics.StrategyProjectionsPublished != want ||
		metrics.Transport.StatusPublications != 0 || metrics.StrategyTransport.StatusPublications != 1 ||
		metrics.Transport.SnapshotPublications != 0 || metrics.StrategyTransport.SnapshotPublications != want ||
		metrics.Transport.SnapshotReplacements != 0 ||
		metrics.StrategyTransport.SnapshotReplacements != wantReplacements {
		t.Fatalf("strategy-only runtime publication metrics = %#v, want %d", metrics, want)
	}
}

func subscribeRuntimeHub(t *testing.T, hub *telemetrytransport.Hub) *telemetrytransport.Subscription {
	t.Helper()
	subscription, err := hub.Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return subscription
}

func nextStatus(t *testing.T, subscription *telemetrytransport.Subscription) telemetrytransport.StatusEnvelope {
	t.Helper()
	event := nextRuntimeEvent(t, subscription)
	if event.Kind != telemetrytransport.EventStatus {
		t.Fatalf("event kind = %q, want status", event.Kind)
	}
	var status telemetrytransport.StatusEnvelope
	if err := json.Unmarshal(event.Data, &status); err != nil {
		t.Fatal(err)
	}
	return status
}

func nextSnapshot(t *testing.T, subscription *telemetrytransport.Subscription) telemetrytransport.Envelope {
	t.Helper()
	event := nextRuntimeEvent(t, subscription)
	if event.Kind != telemetrytransport.EventSnapshot {
		t.Fatalf("event kind = %q, want projection", event.Kind)
	}
	var frame telemetrytransport.Envelope
	if err := json.Unmarshal(event.Data, &frame); err != nil {
		t.Fatal(err)
	}
	return frame
}

func nextRuntimeEvent(t *testing.T, subscription *telemetrytransport.Subscription) telemetrytransport.Event {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	event, err := subscription.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return event
}

func strategyRuntimeBatch(epoch schema.Epoch, sequence schema.Sequence, elapsed time.Duration) telemetrycore.Batch {
	batch := engineerRuntimeBatch()
	batch.Header.Cursor = schema.Cursor{Epoch: epoch, Sequence: sequence}
	received := batch.Header.Clock.ReceivedUTC.Add(elapsed - time.Second)
	batch.Header.Clock = schema.NewClock(runtimePresent(elapsed), runtimePresent(elapsed), received)
	batch.State.SourceTime = runtimePresent(elapsed)
	return batch
}

type recordingTelemetryEmitter struct {
	mu      sync.Mutex
	seen    map[string]int
	notices chan string
}

type blockingInitialEngineerConsumer struct {
	once      sync.Once
	mu        sync.Mutex
	states    []engineerprojection.SourceState
	entered   chan struct{}
	release   chan struct{}
	statusErr error
}

func (consumer *blockingInitialEngineerConsumer) ConsumeSourceStatus(value engineerprojection.SourceStatusV1) error {
	consumer.mu.Lock()
	consumer.states = append(consumer.states, value.State)
	consumer.mu.Unlock()
	consumer.once.Do(func() {
		close(consumer.entered)
		<-consumer.release
	})
	return consumer.statusErr
}

func (*blockingInitialEngineerConsumer) ConsumeObservation(engineerprojection.ObservationSnapshotV1) error {
	return nil
}

func (*blockingInitialEngineerConsumer) ConsumeFact(engineerprojection.FactEnvelopeV1) error {
	return nil
}

func (consumer *blockingInitialEngineerConsumer) snapshotStates() []engineerprojection.SourceState {
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	return append([]engineerprojection.SourceState(nil), consumer.states...)
}

func (emitter *recordingTelemetryEmitter) Emit(name string, _ any) {
	emitter.mu.Lock()
	emitter.seen[name]++
	emitter.mu.Unlock()
	select {
	case emitter.notices <- name:
	default:
	}
}

func (emitter *recordingTelemetryEmitter) waitFor(t *testing.T, names ...string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	for {
		emitter.mu.Lock()
		complete := true
		for _, name := range names {
			complete = complete && emitter.seen[name] > 0
		}
		emitter.mu.Unlock()
		if complete {
			return
		}
		select {
		case <-ctx.Done():
			emitter.mu.Lock()
			defer emitter.mu.Unlock()
			t.Fatalf("emitted events = %v, want %v", emitter.seen, names)
		case <-emitter.notices:
		}
	}
}

func assertRuntimeHubClosed(t *testing.T, hub *telemetrytransport.Hub) {
	t.Helper()
	if _, err := hub.Subscribe(context.Background()); !errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("Subscribe() error = %v, want %v", err, telemetrytransport.ErrClosed)
	}
}

func waitForRuntimeError(t *testing.T, runtime *TelemetryCoreRuntime, contains string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		runtime.mu.Lock()
		err := runtime.runErr
		runtime.mu.Unlock()
		if err != nil && strings.Contains(err.Error(), contains) {
			return
		}
		goruntime.Gosched()
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	t.Fatalf("runtime error = %v, want context %q", runtime.runErr, contains)
}
