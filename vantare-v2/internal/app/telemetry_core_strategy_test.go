package app

import (
	"bytes"
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
	"github.com/vantare/overlays/v2/internal/strategy/live"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestTelemetryCoreRuntimeStrategyHubIsNilSafeAndSharesOneCanonicalPipeline(t *testing.T) {
	var nilRuntime *TelemetryCoreRuntime
	if nilRuntime.StrategyHub() != nil {
		t.Fatal("nil StrategyHub() must be nil")
	}

	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if runtime.Hub() == nil || runtime.StrategyHub() == nil || runtime.Hub() == runtime.StrategyHub() {
		t.Fatalf("product hubs = Overlay %p Strategy %p", runtime.Hub(), runtime.StrategyHub())
	}

	// Guard the architectural contract without adding production seams: there
	// is one canonical acquisition/reduction chain and exactly two product hubs.
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.manager), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.mapper), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.reducer), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.coord), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.derive), 1)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.hub), 2)
	assertRuntimeFieldCount(t, runtime, reflect.TypeOf(runtime.strategyLive), 1)
}

func TestTelemetryCoreRuntimeStrategyLiveConsumerNilKeepsZeroSubscriptions(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := runtime.StrategyHub().Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("Strategy subscribers with nil consumer = %d, want 0", got)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := runtime.StrategyHub().Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("Strategy subscribers after Stop = %d, want 0", got)
	}
}

func TestTelemetryCoreRuntimeStrategyExecutionReceivesCanonicalStatusAndFull(t *testing.T) {
	engine := newStrategyLiveEngine(t)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		StrategyLiveConsumer: engine,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	waitForStrategySubscribers(t, runtime.StrategyHub(), 1)

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	waitForStrategyExecution(t, engine)

	model := engine.Snapshot()
	source, present := model.Source.Value()
	if !present || source.State != "stopped" || source.Revision != 1 {
		t.Fatalf("Strategy source = %#v present=%v", source, present)
	}
	if model.Cursor != (live.Cursor{Epoch: 1, Sequence: 1}) {
		t.Fatalf("Strategy cursor = %#v, want 1/1", model.Cursor)
	}
	if completed, present := model.CompletedLaps.Value(); !present || completed != 1 ||
		model.CompletedLaps.State() != live.ValueStale || model.CompletedLaps.Usable() {
		t.Fatalf("Strategy completed laps = %v present=%v state=%v", completed, present, model.CompletedLaps.State())
	}
	if fuel, present := model.FuelAmount.Value(); !present || fuel.Value() != 60 ||
		model.FuelAmount.State() != live.ValueStale || model.FuelAmount.Usable() {
		t.Fatalf("Strategy Fuel = %v present=%v state=%v", fuel, present, model.FuelAmount.State())
	}
	if model.Status != "stopped" {
		t.Fatalf("Strategy execution status = %q, want stopped", model.Status)
	}
	metrics := runtime.Metrics()
	if metrics.ProjectionsPublished != 1 || metrics.OverlayProjectionsPublished != 1 ||
		metrics.StrategyProjectionsPublished != 1 || metrics.Transport.SnapshotPublications != 1 ||
		metrics.StrategyTransport.SnapshotPublications != 1 || metrics.StrategyTransport.CurrentSubscribers != 1 {
		t.Fatalf("canonical Strategy pipeline metrics = %#v", metrics)
	}

	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := runtime.StrategyHub().Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("Strategy subscribers after Stop = %d, want 0", got)
	}
}

func TestTelemetryCoreRuntimeRejectsTypedNilStrategyLiveConsumer(t *testing.T) {
	var consumer *recordingStrategyLiveConsumer
	if _, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		StrategyLiveConsumer: consumer,
	}); !errors.Is(err, ErrInvalidStrategyLiveRuntime) {
		t.Fatalf("typed-nil Strategy consumer error = %v, want %v", err, ErrInvalidStrategyLiveRuntime)
	}
}

func TestTelemetryCoreRuntimeStrategyLiveConsumerFailureFailsStopAndClosesHubs(t *testing.T) {
	want := errors.New("Strategy consumer unavailable")
	consumer := &recordingStrategyLiveConsumer{statusErr: want}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		StrategyLiveConsumer: consumer,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	waitForRuntimeError(t, runtime, "run Strategy live consumer")

	assertRuntimeHubClosed(t, runtime.Hub())
	assertRuntimeHubClosed(t, runtime.StrategyHub())
	if got := runtime.StrategyHub().Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("Strategy subscribers after consumer failure = %d, want 0", got)
	}
	if err := runtime.Stop(context.Background()); !errors.Is(err, want) ||
		!strings.Contains(err.Error(), "run Strategy live consumer") {
		t.Fatalf("Stop() Strategy consumer error = %v", err)
	}
}

func TestTelemetryCoreRuntimePublishesOverlayAndStrategyFromSameFinalState(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	overlaySubscription := subscribeRuntimeHub(t, runtime.Hub())
	defer overlaySubscription.Close()
	strategySubscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer strategySubscription.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	overlayStatus := nextStatus(t, overlaySubscription)
	strategyStatus := nextStatus(t, strategySubscription)
	assertMatchingProductStatus(t, overlayStatus, strategyStatus)
	overlayFrame := nextSnapshot(t, overlaySubscription)
	strategyFrame := nextSnapshot(t, strategySubscription)

	if overlayFrame.Product != telemetrytransport.ProductOverlay || strategyFrame.Product != telemetrytransport.ProductStrategy {
		t.Fatalf("products = Overlay %q Strategy %q", overlayFrame.Product, strategyFrame.Product)
	}
	if overlayFrame.Epoch != strategyFrame.Epoch || overlayFrame.Sequence != strategyFrame.Sequence ||
		overlayFrame.CapturedAt != strategyFrame.CapturedAt || overlayFrame.StatusRevision != strategyFrame.StatusRevision {
		t.Fatalf("metadata differs: Overlay %#v Strategy %#v", overlayFrame, strategyFrame)
	}
	if overlayFrame.Kind != telemetrytransport.Full || strategyFrame.Kind != telemetrytransport.Full {
		t.Fatalf("snapshot kinds = Overlay %q Strategy %q", overlayFrame.Kind, strategyFrame.Kind)
	}

	var overlayPayload overlayprojection.PayloadV1
	if err := json.Unmarshal(overlayFrame.Payload, &overlayPayload); err != nil {
		t.Fatal(err)
	}
	var strategyPayload strategyprojection.PayloadV1
	if err := json.Unmarshal(strategyFrame.Payload, &strategyPayload); err != nil {
		t.Fatal(err)
	}
	if len(overlayPayload.Vehicles) == 0 || !overlayPayload.Vehicles[0].FuelLiters.Present ||
		overlayPayload.Vehicles[0].FuelLiters.Value != 60 {
		t.Fatalf("Overlay Fuel = %#v", overlayPayload.Vehicles)
	}
	if !strategyPayload.Player.FuelLiters.Present || strategyPayload.Player.FuelLiters.Value != 60 ||
		!strategyPayload.Player.FuelCapacity.Present || strategyPayload.Player.FuelCapacity.Value != 100 {
		t.Fatalf("Strategy Fuel = %#v", strategyPayload.Player)
	}

	metrics := runtime.Metrics()
	if metrics.ProjectionsPublished != 1 || metrics.OverlayProjectionsPublished != 1 ||
		metrics.StrategyProjectionsPublished != 1 || metrics.Transport.SnapshotPublications != 1 ||
		metrics.StrategyTransport.SnapshotPublications != 1 {
		t.Fatalf("dual product metrics = %#v", metrics)
	}
}

func TestTelemetryCoreRuntimePublishesIdenticalStatusTransitionsToBothProducts(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	overlaySubscription := subscribeRuntimeHub(t, runtime.Hub())
	defer overlaySubscription.Close()
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
		overlayStatus := nextStatus(t, overlaySubscription)
		strategyStatus := nextStatus(t, strategySubscription)
		assertMatchingProductStatus(t, overlayStatus, strategyStatus)
		if overlayStatus.StatusRevision != uint64(index+1) {
			t.Fatalf("revision = %d, want %d", overlayStatus.StatusRevision, index+1)
		}
		var payload telemetrytransport.StatusPayload
		if err := json.Unmarshal(overlayStatus.Payload, &payload); err != nil {
			t.Fatal(err)
		}
		if payload.State != transition.state.String() || payload.ReconnectAttempt != transition.attempt {
			t.Fatalf("status payload = %#v, want %#v", payload, transition)
		}
		if err := runtime.setStatus(transition.state, transition.attempt); err != nil {
			t.Fatal(err)
		}
		metrics := runtime.Metrics()
		if metrics.Transport.StatusPublications != uint64(index+1) ||
			metrics.StrategyTransport.StatusPublications != uint64(index+1) {
			t.Fatalf("duplicate status publications = %#v", metrics)
		}
	}
}

func TestTelemetryCoreStrategyHubLateAndSlowSubscribersAlwaysReceiveFull(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
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

func TestTelemetryCoreRuntimeStartEmitsNamespacedEventsAndStopsBothAdapters(t *testing.T) {
	emitter := &recordingTelemetryEmitter{
		seen:    make(map[string]int),
		notices: make(chan string, 8),
	}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Emitter: emitter})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t,
		telemetrytransport.EventName(telemetrytransport.ProductOverlay, telemetrytransport.EventStatus),
		telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventStatus),
	)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatal(err)
	}
	emitter.waitFor(t,
		telemetrytransport.EventName(telemetrytransport.ProductOverlay, telemetrytransport.EventSnapshot),
		telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventSnapshot),
	)

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

func TestTelemetryCoreRuntimeIsolatesEngineerFailureFromBothProductHubs(t *testing.T) {
	consumer := &recordingEngineerConsumer{observationErr: errors.New("engineer unavailable")}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Engineer: consumer})
	if err != nil {
		t.Fatal(err)
	}
	overlaySubscription := subscribeRuntimeHub(t, runtime.Hub())
	defer overlaySubscription.Close()
	strategySubscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer strategySubscription.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch()); err != nil {
		t.Fatalf("Engineer failure escaped product boundary: %v", err)
	}
	_ = nextStatus(t, overlaySubscription)
	_ = nextStatus(t, strategySubscription)
	if frame := nextSnapshot(t, overlaySubscription); frame.Product != telemetrytransport.ProductOverlay {
		t.Fatalf("Overlay frame product = %q", frame.Product)
	}
	if frame := nextSnapshot(t, strategySubscription); frame.Product != telemetrytransport.ProductStrategy {
		t.Fatalf("Strategy frame product = %q", frame.Product)
	}
	if runtime.EngineerError() == nil {
		t.Fatal("EngineerError() = nil, want isolated diagnostic")
	}
	metrics := runtime.Metrics()
	if metrics.ProjectionsPublished != 1 || metrics.OverlayProjectionsPublished != 1 ||
		metrics.StrategyProjectionsPublished != 1 || metrics.EngineerDeliveryFailures != 1 {
		t.Fatalf("isolated Engineer metrics = %#v", metrics)
	}
}

func TestTelemetryCoreRuntimeReportsStrategyTransportFailure(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	// Seed the same status in both hubs before closing Strategy. WriteBatch then
	// keeps that status and reaches the Strategy snapshot publication itself.
	if err := runtime.setStatus(driver.StateStopped, 0); err != nil {
		t.Fatal(err)
	}
	if err := runtime.StrategyHub().Close(); err != nil {
		t.Fatal(err)
	}

	err = (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), engineerRuntimeBatch())
	if err == nil || !strings.Contains(err.Error(), "publish Strategy telemetry projection") ||
		!errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("Strategy transport error = %v", err)
	}
	metrics := runtime.Metrics()
	if metrics.ProjectionsPublished != 0 || metrics.OverlayProjectionsPublished != 1 ||
		metrics.StrategyProjectionsPublished != 0 || metrics.Transport.SnapshotPublications != 1 ||
		metrics.StrategyTransport.SnapshotPublications != 0 {
		t.Fatalf("failed cycle metrics = %#v", metrics)
	}
	assertRuntimeHubClosed(t, runtime.Hub())
	assertRuntimeHubClosed(t, runtime.StrategyHub())
	if err := runtime.Start(context.Background()); !errors.Is(err, telemetrytransport.ErrClosed) {
		t.Fatalf("Start() after partial publication error = %v, want %v", err, telemetrytransport.ErrClosed)
	}
	if err := runtime.Stop(context.Background()); err == nil ||
		!strings.Contains(err.Error(), "publish Strategy telemetry projection") {
		t.Fatalf("Stop() audit error = %v", err)
	}
}

func TestTelemetryCoreRuntimeRejectsInvalidCursorsWithoutAdvancingEitherProduct(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	overlaySubscription := subscribeRuntimeHub(t, runtime.Hub())
	defer overlaySubscription.Close()
	strategySubscription := subscribeRuntimeHub(t, runtime.StrategyHub())
	defer strategySubscription.Close()

	first := strategyRuntimeBatch(1, 1, time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	_ = nextStatus(t, overlaySubscription)
	_ = nextStatus(t, strategySubscription)
	if frame := nextSnapshot(t, overlaySubscription); frame.Epoch != 1 || frame.Sequence != 1 {
		t.Fatalf("first Overlay frame = %#v", frame)
	}
	if frame := nextSnapshot(t, strategySubscription); frame.Epoch != 1 || frame.Sequence != 1 {
		t.Fatalf("first Strategy frame = %#v", frame)
	}
	assertDualRuntimePublicationMetrics(t, runtime.Metrics(), 1)

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), first); !errors.Is(err, telemetrycore.ErrStaleBatch) {
		t.Fatalf("duplicate 1/1 error = %v, want %v", err, telemetrycore.ErrStaleBatch)
	}
	assertDualRuntimePublicationMetrics(t, runtime.Metrics(), 1)

	gap := strategyRuntimeBatch(1, 3, 3*time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), gap); !errors.Is(err, telemetrycore.ErrSequenceGap) {
		t.Fatalf("gap 1/3 error = %v, want %v", err, telemetrycore.ErrSequenceGap)
	}
	assertDualRuntimePublicationMetrics(t, runtime.Metrics(), 1)

	second := strategyRuntimeBatch(1, 2, 2*time.Second)
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), second); err != nil {
		t.Fatalf("recovery 1/2: %v", err)
	}
	if frame := nextSnapshot(t, overlaySubscription); frame.Kind != telemetrytransport.Full ||
		frame.Epoch != 1 || frame.Sequence != 2 {
		t.Fatalf("recovered Overlay frame = %#v", frame)
	}
	if frame := nextSnapshot(t, strategySubscription); frame.Kind != telemetrytransport.Full ||
		frame.Epoch != 1 || frame.Sequence != 2 {
		t.Fatalf("recovered Strategy frame = %#v", frame)
	}
	assertDualRuntimePublicationMetrics(t, runtime.Metrics(), 2)
}

func TestTelemetryCoreRuntimeRejectsCanceledParentWithoutMutation(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
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

func TestTelemetryCoreRuntimeStrategyConsumerFailedStartClosesBothHubsAndBecomesTerminal(t *testing.T) {
	consumer := &recordingEngineerConsumer{}
	strategyConsumer := &recordingStrategyLiveConsumer{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Engineer:             consumer,
		StrategyLiveConsumer: strategyConsumer,
	})
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
	if metrics.Transport.StatusPublications != 1 || metrics.StrategyTransport.StatusPublications != 0 ||
		metrics.Transport.SnapshotPublications != 0 || metrics.StrategyTransport.SnapshotPublications != 0 {
		t.Fatalf("partial Start status metrics = %#v", metrics)
	}
	if len(consumer.calls) != 0 {
		t.Fatalf("Engineer calls before initial status = %v, want none", consumer.calls)
	}
	if len(strategyConsumer.statuses) != 0 || len(strategyConsumer.snapshots) != 0 ||
		runtime.StrategyHub().Metrics().CurrentSubscribers != 0 {
		t.Fatalf("Strategy consumer started during failed Start: statuses=%v snapshots=%v metrics=%#v",
			strategyConsumer.statuses, strategyConsumer.snapshots, runtime.StrategyHub().Metrics())
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

func TestTelemetryCoreRuntimeUnexpectedWailsCloseIsAuditedAndFailsBothHubs(t *testing.T) {
	tests := []struct {
		name        string
		close       func(*TelemetryCoreRuntime) error
		wantContext string
	}{
		{
			name:        "Overlay",
			close:       func(runtime *TelemetryCoreRuntime) error { return runtime.Hub().Close() },
			wantContext: "serve Overlay telemetry",
		},
		{
			name:        "Strategy",
			close:       func(runtime *TelemetryCoreRuntime) error { return runtime.StrategyHub().Close() },
			wantContext: "serve Strategy telemetry",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			emitter := &recordingTelemetryEmitter{
				seen:    make(map[string]int),
				notices: make(chan string, 8),
			}
			runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Emitter: emitter})
			if err != nil {
				t.Fatal(err)
			}
			if err := runtime.Start(context.Background()); err != nil {
				t.Fatal(err)
			}
			emitter.waitFor(t,
				telemetrytransport.EventName(telemetrytransport.ProductOverlay, telemetrytransport.EventStatus),
				telemetrytransport.EventName(telemetrytransport.ProductStrategy, telemetrytransport.EventStatus),
			)
			if err := test.close(runtime); err != nil {
				t.Fatal(err)
			}
			waitForRuntimeError(t, runtime, test.wantContext)
			assertRuntimeHubClosed(t, runtime.Hub())
			assertRuntimeHubClosed(t, runtime.StrategyHub())
			if err := runtime.Stop(context.Background()); err == nil ||
				!strings.Contains(err.Error(), test.wantContext) ||
				!errors.Is(err, telemetrytransport.ErrClosed) {
				t.Fatalf("Stop() Wails audit error = %v", err)
			}
		})
	}
}

func TestTelemetryCoreRuntimeConcurrentStopDoesNotWaitForEngineerCallback(t *testing.T) {
	consumer := &blockingInitialEngineerConsumer{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
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
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
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
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
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
	if status := runtime.manager.Status(); status.State != driver.StateStopped {
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
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
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
		telemetrytransport.EventName(telemetrytransport.ProductOverlay, telemetrytransport.EventStatus),
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
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
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
		telemetrytransport.EventName(telemetrytransport.ProductOverlay, telemetrytransport.EventStatus),
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

func assertDualRuntimePublicationMetrics(t *testing.T, metrics TelemetryCoreMetrics, want uint64) {
	t.Helper()
	var wantReplacements uint64
	if want > 0 {
		wantReplacements = want - 1
	}
	if metrics.BatchesApplied != want || metrics.ProjectionsPublished != want ||
		metrics.OverlayProjectionsPublished != want || metrics.StrategyProjectionsPublished != want ||
		metrics.Transport.StatusPublications != 1 || metrics.StrategyTransport.StatusPublications != 1 ||
		metrics.Transport.SnapshotPublications != want || metrics.StrategyTransport.SnapshotPublications != want ||
		metrics.Transport.SnapshotReplacements != wantReplacements ||
		metrics.StrategyTransport.SnapshotReplacements != wantReplacements {
		t.Fatalf("dual runtime publication metrics = %#v, want %d", metrics, want)
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

func assertMatchingProductStatus(
	t *testing.T,
	overlay telemetrytransport.StatusEnvelope,
	strategy telemetrytransport.StatusEnvelope,
) {
	t.Helper()
	if overlay.Product != telemetrytransport.ProductOverlay || strategy.Product != telemetrytransport.ProductStrategy ||
		overlay.StatusRevision != strategy.StatusRevision || overlay.CapturedAt != strategy.CapturedAt ||
		!bytes.Equal(overlay.Payload, strategy.Payload) {
		t.Fatalf("product statuses differ: Overlay %#v Strategy %#v", overlay, strategy)
	}
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

func waitForStrategyExecution(t testing.TB, engine interface{ Snapshot() live.ReadModel }) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		model := engine.Snapshot()
		if model.Cursor.Epoch == 1 && model.Cursor.Sequence == 1 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("Strategy execution cursor = %#v, want 1/1", model.Cursor)
		}
		goruntime.Gosched()
	}
}
