package app

import (
	"context"
	"encoding/json"
	"errors"
	"go/parser"
	"go/token"
	"io/fs"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/live"
	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestStrategyLiveRuntimeRejectsNilDependenciesAndContext(t *testing.T) {
	hub := newStrategyLiveHub()
	consumer := &recordingStrategyLiveConsumer{}
	if _, err := NewStrategyLiveRuntime(nil, consumer); !errors.Is(err, ErrInvalidStrategyLiveRuntime) {
		t.Fatalf("nil hub error = %v", err)
	}
	if _, err := NewStrategyLiveRuntime(hub, nil); !errors.Is(err, ErrInvalidStrategyLiveRuntime) {
		t.Fatalf("nil consumer error = %v", err)
	}
	var typedNil *live.Engine
	if _, err := NewStrategyLiveRuntime(hub, typedNil); !errors.Is(err, ErrInvalidStrategyLiveRuntime) {
		t.Fatalf("typed nil consumer error = %v", err)
	}
	runtime, err := NewStrategyLiveRuntime(hub, consumer)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Run(nil); !errors.Is(err, ErrInvalidStrategyLiveRuntime) {
		t.Fatalf("nil context error = %v", err)
	}
}

func TestStrategyLiveRuntimeAppliesRealStatusAndFullInOrder(t *testing.T) {
	hub := newStrategyLiveHub()
	publishStrategyStatus(t, hub, 1, "live", 0)
	want := strategyLiveProjection(4, 7, 2)
	publishStrategyFull(t, hub, want, 1)

	ctx, cancel := context.WithCancel(context.Background())
	consumer := &recordingStrategyLiveConsumer{cancelAfterSnapshot: cancel}
	runtime, err := NewStrategyLiveRuntime(hub, consumer)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Run(ctx); err != nil {
		t.Fatal(err)
	}

	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	if !reflect.DeepEqual(consumer.calls, []string{"status", "snapshot"}) {
		t.Fatalf("calls = %v", consumer.calls)
	}
	if len(consumer.statuses) != 1 || consumer.statuses[0].State != live.SourceLive ||
		consumer.statuses[0].Revision != 1 || consumer.statuses[0].ReconnectAttempt != 0 {
		t.Fatalf("statuses = %+v", consumer.statuses)
	}
	if len(consumer.snapshots) != 1 || !reflect.DeepEqual(consumer.snapshots[0], want) {
		t.Fatalf("snapshot = %+v, want %+v", consumer.snapshots, want)
	}
}

func TestStrategyLiveRuntimeRejectsInvalidEventWithoutMutatingConsumer(t *testing.T) {
	validStatus := strategyStatusEvent(t, 1, "live", 0)
	validSnapshot := strategySnapshotEvent(t, strategyLiveProjection(1, 1, 0), 1)

	tests := []struct {
		name  string
		event telemetrytransport.Event
	}{
		{name: "wrong channel product", event: telemetrytransport.Event{Product: telemetrytransport.ProductOverlay, Kind: telemetrytransport.EventStatus, Data: validStatus.Data}},
		{name: "wrong status envelope product", event: withEventData(validStatus, strings.Replace(string(validStatus.Data), `"product":"strategy"`, `"product":"overlay"`, 1))},
		{name: "wrong projection version", event: withEventData(validSnapshot, strings.Replace(string(validSnapshot.Data), `"projectionVersion":1`, `"projectionVersion":2`, 1))},
		{name: "delta snapshot", event: withEventData(validSnapshot, strings.Replace(string(validSnapshot.Data), `"kind":"full"`, `"kind":"delta"`, 1))},
		{name: "wrong event kind", event: telemetrytransport.Event{Product: telemetrytransport.ProductStrategy, Kind: telemetrytransport.EventFact, Data: validSnapshot.Data}},
		{name: "invalid status shape", event: withEventData(validStatus, `{"product":"strategy","statusRevision":1,"capturedAt":"2026-08-13T10:00:00Z","payload":[]}`)},
		{name: "missing status payload field", event: withEventData(validStatus, strings.Replace(string(validStatus.Data), `{"state":"live","reconnectAttempt":0}`, `{"state":"live"}`, 1))},
		{name: "unknown envelope field", event: withEventData(validStatus, strings.Replace(string(validStatus.Data), `"product":`, `"unknown":true,"product":`, 1))},
		{name: "unknown payload field", event: withEventData(validStatus, strings.Replace(string(validStatus.Data), `"state":"live"`, `"state":"live","unknown":true`, 1))},
		{name: "trailing data", event: withEventData(validStatus, string(validStatus.Data)+` {}`)},
		{name: "zero status revision", event: withEventData(validStatus, strings.Replace(string(validStatus.Data), `"statusRevision":1`, `"statusRevision":0`, 1))},
		{name: "unsafe status revision", event: withEventData(validStatus, strings.Replace(string(validStatus.Data), `"statusRevision":1`, `"statusRevision":9007199254740992`, 1))},
		{name: "non canonical timestamp", event: withEventData(validStatus, strings.Replace(string(validStatus.Data), `2026-08-13T10:00:00Z`, `2026-08-13T12:00:00+02:00`, 1))},
		{name: "unsafe snapshot epoch", event: withEventData(validSnapshot, strings.Replace(string(validSnapshot.Data), `"epoch":1`, `"epoch":9007199254740992`, 1))},
		{name: "missing snapshot payload field", event: withoutStrategyPayloadKey(t, validSnapshot, "player")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			consumer := &recordingStrategyLiveConsumer{}
			runtime, err := NewStrategyLiveRuntime(newStrategyLiveHub(), consumer)
			if err != nil {
				t.Fatal(err)
			}
			if err := runtime.consumeEvent(test.event); !errors.Is(err, ErrInvalidStrategyLiveEvent) {
				t.Fatalf("consumeEvent error = %v", err)
			}
			consumer.mu.Lock()
			defer consumer.mu.Unlock()
			if len(consumer.calls) != 0 {
				t.Fatalf("consumer mutated: %v", consumer.calls)
			}
		})
	}
}

func TestStrategyLiveRuntimeMapsStoppingFailClosedToStopped(t *testing.T) {
	consumer := &recordingStrategyLiveConsumer{}
	runtime, err := NewStrategyLiveRuntime(newStrategyLiveHub(), consumer)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.consumeEvent(strategyStatusEvent(t, 8, "stopping", 3)); err != nil {
		t.Fatal(err)
	}
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	if len(consumer.statuses) != 1 || consumer.statuses[0].State != live.SourceStopped ||
		consumer.statuses[0].Revision != 8 || consumer.statuses[0].ReconnectAttempt != 3 {
		t.Fatalf("statuses = %+v", consumer.statuses)
	}
}

func TestStrategyLiveRuntimeMapsCanonicalSourceStates(t *testing.T) {
	tests := []struct {
		wire string
		want live.SourceState
	}{
		{wire: "stopped", want: live.SourceStopped},
		{wire: "detecting", want: live.SourceDetecting},
		{wire: "connecting", want: live.SourceConnecting},
		{wire: "live", want: live.SourceLive},
		{wire: "degraded", want: live.SourceDegraded},
		{wire: "stale", want: live.SourceStale},
		{wire: "error", want: live.SourceError},
	}
	for index, test := range tests {
		t.Run(test.wire, func(t *testing.T) {
			consumer := &recordingStrategyLiveConsumer{}
			runtime, err := NewStrategyLiveRuntime(newStrategyLiveHub(), consumer)
			if err != nil {
				t.Fatal(err)
			}
			if err := runtime.consumeEvent(strategyStatusEvent(t, uint64(index+1), test.wire, index)); err != nil {
				t.Fatal(err)
			}
			consumer.mu.Lock()
			defer consumer.mu.Unlock()
			if len(consumer.statuses) != 1 || consumer.statuses[0].State != test.want {
				t.Fatalf("status = %+v, want %s", consumer.statuses, test.want)
			}
		})
	}
}

func TestStrategyLiveRuntimePropagatesConsumerErrorAndClosesSubscription(t *testing.T) {
	want := errors.New("engine unavailable")
	hub := newStrategyLiveHub()
	publishStrategyStatus(t, hub, 1, "live", 0)
	consumer := &recordingStrategyLiveConsumer{statusErr: want}
	runtime, err := NewStrategyLiveRuntime(hub, consumer)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Run(context.Background()); !errors.Is(err, want) {
		t.Fatalf("Run error = %v, want wrapped consumer error", err)
	}
	if got := hub.Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("subscribers after consumer error = %d", got)
	}
}

func TestStrategyLiveRuntimeCancellationReturnsNilAndClosesSubscription(t *testing.T) {
	hub := newStrategyLiveHub()
	runtime, err := NewStrategyLiveRuntime(hub, &recordingStrategyLiveConsumer{})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runtime.Run(ctx) }()
	waitForStrategySubscribers(t, hub, 1)
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run after cancellation = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return after cancellation")
	}
	if got := hub.Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("subscribers after cancellation = %d", got)
	}
}

func TestStrategyLiveRuntimeRejectsConcurrentRunAndAllowsSequentialReuse(t *testing.T) {
	hub := newStrategyLiveHub()
	runtime, err := NewStrategyLiveRuntime(hub, &recordingStrategyLiveConsumer{})
	if err != nil {
		t.Fatal(err)
	}
	firstCtx, cancelFirst := context.WithCancel(context.Background())
	firstDone := make(chan error, 1)
	go func() { firstDone <- runtime.Run(firstCtx) }()
	waitForStrategySubscribers(t, hub, 1)

	secondCtx, cancelSecond := context.WithCancel(context.Background())
	secondDone := make(chan error, 1)
	go func() { secondDone <- runtime.Run(secondCtx) }()
	select {
	case err := <-secondDone:
		cancelSecond()
		if !errors.Is(err, ErrStrategyLiveAlreadyRunning) {
			t.Fatalf("concurrent Run error = %v, want ErrStrategyLiveAlreadyRunning", err)
		}
	case <-time.After(time.Second):
		cancelSecond()
		<-secondDone
		t.Fatal("concurrent Run did not reject promptly")
	}
	if got := hub.Metrics().CurrentSubscribers; got != 1 {
		t.Fatalf("subscribers during rejected concurrent Run = %d, want 1", got)
	}
	cancelFirst()
	select {
	case err := <-firstDone:
		if err != nil {
			t.Fatalf("first Run after cancellation = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("first Run did not stop")
	}
	if got := hub.Metrics().CurrentSubscribers; got != 0 {
		t.Fatalf("subscribers after first Run = %d", got)
	}

	reuseCtx, cancelReuse := context.WithCancel(context.Background())
	reuseDone := make(chan error, 1)
	go func() { reuseDone <- runtime.Run(reuseCtx) }()
	waitForStrategySubscribers(t, hub, 1)
	cancelReuse()
	select {
	case err := <-reuseDone:
		if err != nil {
			t.Fatalf("sequential Run reuse = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("sequential Run reuse did not stop")
	}
}

func TestStrategyLiveRuntimePropagatesUnexpectedHubClose(t *testing.T) {
	hub := newStrategyLiveHub()
	runtime, err := NewStrategyLiveRuntime(hub, &recordingStrategyLiveConsumer{})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- runtime.Run(context.Background()) }()
	waitForStrategySubscribers(t, hub, 1)
	if err := hub.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, telemetrytransport.ErrClosed) {
			t.Fatalf("Run after hub close = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return after hub close")
	}
}

func TestStrategyLiveRuntimeUsesHubLatestWinsWithoutBacklog(t *testing.T) {
	hub := newStrategyLiveHub()
	publishStrategyStatus(t, hub, 1, "live", 0)
	ctx, cancel := context.WithCancel(context.Background())
	consumer := newBlockingStatusStrategyConsumer(cancel)
	runtime, err := NewStrategyLiveRuntime(hub, consumer)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- runtime.Run(ctx) }()
	select {
	case <-consumer.statusEntered:
	case <-time.After(time.Second):
		t.Fatal("consumer did not block on status")
	}
	for sequence := schema.Sequence(1); sequence <= 3; sequence++ {
		publishStrategyFull(t, hub, strategyLiveProjection(1, sequence, standings.CompletedLaps(sequence)), 1)
	}
	close(consumer.releaseStatus)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not finish")
	}
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	if len(consumer.snapshots) != 1 || consumer.snapshots[0].Sequence != 3 {
		t.Fatalf("snapshots = %+v, want only latest sequence 3", consumer.snapshots)
	}
}

func TestStrategyLiveRuntimeCoalescedReconnectDegradesRealEngine(t *testing.T) {
	hub := newStrategyLiveHub()
	publishStrategyStatus(t, hub, 1, "live", 0)
	publishStrategyFull(t, hub, strategyLiveProjection(1, 1, 1), 1)
	engine := newStrategyLiveEngine(t)
	ctx, cancel := context.WithCancel(context.Background())
	consumer := newBlockingEngineConsumer(engine, cancel)
	runtime, err := NewStrategyLiveRuntime(hub, consumer)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- runtime.Run(ctx) }()
	select {
	case <-consumer.snapshotApplied:
	case <-time.After(time.Second):
		t.Fatal("initial snapshot was not applied")
	}
	publishStrategyStatus(t, hub, 2, "connecting", 1)
	publishStrategyStatus(t, hub, 3, "live", 1)
	close(consumer.releaseSnapshot)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not finish after reconnect status")
	}
	consumer.mu.Lock()
	statuses := append([]live.SourceStatus(nil), consumer.statuses...)
	consumer.mu.Unlock()
	if len(statuses) != 2 || statuses[0].Revision != 1 || statuses[1].Revision != 3 {
		t.Fatalf("applied status revisions = %+v, want only 1 then coalesced 3", statuses)
	}

	model := engine.Snapshot()
	source, present := model.Source.Value()
	if !present || source.State != live.SourceLive || source.Revision != 3 || source.ReconnectAttempt != 1 {
		t.Fatalf("source = %+v,%t", source, present)
	}
	if model.CompletedLaps.State() != live.ValueStale || model.CompletedLaps.Usable() {
		t.Fatalf("completed laps state = %v usable=%t, want stale and unusable", model.CompletedLaps.State(), model.CompletedLaps.Usable())
	}
}

func TestStrategyLiveRuntimeReconstructsFullMetadataAndPayloadExactly(t *testing.T) {
	hub := newStrategyLiveHub()
	publishStrategyStatus(t, hub, 9, "live", 0)
	want := strategyLiveProjection(12, 34, 5)
	publishStrategyFull(t, hub, want, 9)
	ctx, cancel := context.WithCancel(context.Background())
	consumer := &recordingStrategyLiveConsumer{cancelAfterSnapshot: cancel}
	runtime, err := NewStrategyLiveRuntime(hub, consumer)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Run(ctx); err != nil {
		t.Fatal(err)
	}
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	if len(consumer.snapshots) != 1 || !reflect.DeepEqual(consumer.snapshots[0].Metadata, want.Metadata) ||
		!reflect.DeepEqual(consumer.snapshots[0].PayloadV1, want.PayloadV1) {
		t.Fatalf("reconstructed snapshot = %+v, want %+v", consumer.snapshots, want)
	}
}

func TestStrategyLiveRuntimeAcceptsAdditivePayloadExtensionsAndFiltersCapabilities(t *testing.T) {
	event := strategySnapshotEvent(t, strategyLiveProjection(1, 1, 1), 1)
	event = withStrategyPayloadExtensions(t, event)
	consumer := &recordingStrategyLiveConsumer{}
	runtime, err := NewStrategyLiveRuntime(newStrategyLiveHub(), consumer)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.consumeEvent(event); err != nil {
		t.Fatal(err)
	}
	consumer.mu.Lock()
	if len(consumer.snapshots) != 1 {
		consumer.mu.Unlock()
		t.Fatalf("snapshots = %d, want 1", len(consumer.snapshots))
	}
	received := consumer.snapshots[0]
	consumer.mu.Unlock()
	if want := []strategyprojection.Capability{strategyprojection.CapabilityProgress, strategyprojection.CapabilityFuel}; !reflect.DeepEqual(received.Capabilities, want) {
		t.Fatalf("capabilities = %v, want known subset %v", received.Capabilities, want)
	}
	engine := newStrategyLiveEngine(t)
	if err := engine.ApplySourceStatus(live.SourceStatus{
		State: live.SourceLive, Revision: 1, UpdatedAt: time.Date(2026, 8, 13, 10, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatal(err)
	}
	if err := engine.ApplySnapshot(received); err != nil {
		t.Fatalf("real engine rejected safe additive payload: %v", err)
	}
}

func TestStrategyLiveRuntimeNormalizesPreTC10BPayloadAdditionsToMissing(t *testing.T) {
	event := strategySnapshotEvent(t, strategyLiveProjection(1, 2, 0), 1)
	event = withStrategyPayload(t, event, legacyStrategyLivePayload())
	consumer := &recordingStrategyLiveConsumer{}
	runtime, err := NewStrategyLiveRuntime(newStrategyLiveHub(), consumer)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.consumeEvent(event); err != nil {
		t.Fatal(err)
	}
	consumer.mu.Lock()
	if len(consumer.snapshots) != 1 {
		consumer.mu.Unlock()
		t.Fatalf("snapshots = %d, want 1", len(consumer.snapshots))
	}
	received := consumer.snapshots[0]
	consumer.mu.Unlock()
	if received.SourceTime != telemetryprojection.MissingField[float64]() ||
		received.EndTime != telemetryprojection.MissingField[session.EndTime]() ||
		received.Remaining != telemetryprojection.MissingField[session.RemainingTime]() ||
		received.MaximumLaps != telemetryprojection.MissingField[session.MaximumLaps]() ||
		received.Player.Sector != telemetryprojection.MissingField[standings.Sector]() ||
		received.Player.LapDistance != telemetryprojection.MissingField[standings.LapDistance]() ||
		received.Player.FuelLiters != telemetryprojection.MissingField[energy.FuelAmount]() ||
		received.Player.FuelCapacity != telemetryprojection.MissingField[energy.FuelCapacity]() {
		t.Fatalf("legacy additions were not normalized to missing: %+v", received)
	}
	engine := newStrategyLiveEngine(t)
	if err := engine.ApplySourceStatus(live.SourceStatus{
		State: live.SourceLive, Revision: 1, UpdatedAt: time.Date(2026, 8, 13, 10, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatal(err)
	}
	if err := engine.ApplySnapshot(received); err != nil {
		t.Fatalf("real engine rejected normalized legacy payload: %v", err)
	}
}

func TestStrategyLiveRuntimeRejectsMissingLegacyAndInvalidKnownFields(t *testing.T) {
	valid := strategySnapshotEvent(t, strategyLiveProjection(1, 1, 0), 1)
	tests := []struct {
		name    string
		payload json.RawMessage
	}{
		{name: "missing legacy completed laps", payload: withoutStrategyPayloadPath(t, legacyStrategyLivePayload(), "player", "completedLaps")},
		{name: "invalid known completed laps type", payload: replaceStrategyPayloadPath(t, legacyStrategyLivePayload(), json.RawMessage(`"invalid"`), "player", "completedLaps")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			consumer := &recordingStrategyLiveConsumer{}
			runtime, err := NewStrategyLiveRuntime(newStrategyLiveHub(), consumer)
			if err != nil {
				t.Fatal(err)
			}
			if err := runtime.consumeEvent(withStrategyPayload(t, valid, test.payload)); !errors.Is(err, ErrInvalidStrategyLiveEvent) {
				t.Fatalf("consumeEvent error = %v, want ErrInvalidStrategyLiveEvent", err)
			}
			consumer.mu.Lock()
			defer consumer.mu.Unlock()
			if len(consumer.calls) != 0 {
				t.Fatalf("consumer mutated: %v", consumer.calls)
			}
		})
	}
}

func TestStrategyLiveRuntimeLeavesSemanticQualityRejectionAtomicToEngine(t *testing.T) {
	engine := newStrategyLiveEngine(t)
	runtime, err := NewStrategyLiveRuntime(newStrategyLiveHub(), engine)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.consumeEvent(strategyStatusEvent(t, 1, "live", 0)); err != nil {
		t.Fatal(err)
	}
	if err := runtime.consumeEvent(strategySnapshotEvent(t, strategyLiveProjection(1, 1, 1), 1)); err != nil {
		t.Fatal(err)
	}
	want := engine.Snapshot()
	invalid := strategySnapshotEvent(t, strategyLiveProjection(1, 2, 2), 1)
	invalid = withStrategyPayload(t, invalid, replaceStrategyPayloadPath(
		t, strategyPayloadFromEvent(t, invalid), json.RawMessage(`"future"`), "player", "completedLaps", "freshness",
	))
	if err := runtime.consumeEvent(invalid); !errors.Is(err, live.ErrInvalidProjection) {
		t.Fatalf("semantic quality error = %v, want live.ErrInvalidProjection", err)
	}
	if got := engine.Snapshot(); !reflect.DeepEqual(got, want) {
		t.Fatalf("engine mutated after semantic rejection\ngot:  %+v\nwant: %+v", got, want)
	}
}

func TestStrategyLiveRuntimeProductionImportsNoDriverReaderOrStorage(t *testing.T) {
	packages, err := parser.ParseDir(token.NewFileSet(), ".", func(info fs.FileInfo) bool {
		return info.Name() == "strategy_live_runtime.go"
	}, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	allowed := map[string]bool{
		"github.com/vantare/overlays/v2/internal/app/telemetrytransport":        true,
		"github.com/vantare/overlays/v2/internal/strategy/live":                 true,
		"github.com/vantare/overlays/v2/internal/telemetry/projection":          true,
		"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy": true,
	}
	for _, pkg := range packages {
		for _, file := range pkg.Files {
			for _, imported := range file.Imports {
				path, err := strconv.Unquote(imported.Path.Value)
				if err != nil {
					t.Fatal(err)
				}
				if strings.Contains(path, "/internal/") && !allowed[path] {
					t.Fatalf("production adapter imports forbidden internal dependency %q", path)
				}
			}
		}
	}
}

type recordingStrategyLiveConsumer struct {
	mu                  sync.Mutex
	calls               []string
	statuses            []live.SourceStatus
	snapshots           []strategyprojection.SnapshotV1
	statusErr           error
	snapshotErr         error
	cancelAfterSnapshot context.CancelFunc
}

func (consumer *recordingStrategyLiveConsumer) ApplySourceStatus(status live.SourceStatus) error {
	consumer.mu.Lock()
	defer consumer.mu.Unlock()
	consumer.calls = append(consumer.calls, "status")
	consumer.statuses = append(consumer.statuses, status)
	return consumer.statusErr
}

func (consumer *recordingStrategyLiveConsumer) ApplySnapshot(snapshot strategyprojection.SnapshotV1) error {
	consumer.mu.Lock()
	consumer.calls = append(consumer.calls, "snapshot")
	consumer.snapshots = append(consumer.snapshots, snapshot)
	err := consumer.snapshotErr
	cancel := consumer.cancelAfterSnapshot
	consumer.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	return err
}

type blockingStatusStrategyConsumer struct {
	*recordingStrategyLiveConsumer
	statusEntered chan struct{}
	releaseStatus chan struct{}
	once          sync.Once
}

func newBlockingStatusStrategyConsumer(cancel context.CancelFunc) *blockingStatusStrategyConsumer {
	return &blockingStatusStrategyConsumer{
		recordingStrategyLiveConsumer: &recordingStrategyLiveConsumer{cancelAfterSnapshot: cancel},
		statusEntered:                 make(chan struct{}),
		releaseStatus:                 make(chan struct{}),
	}
}

func (consumer *blockingStatusStrategyConsumer) ApplySourceStatus(status live.SourceStatus) error {
	consumer.once.Do(func() { close(consumer.statusEntered) })
	<-consumer.releaseStatus
	return consumer.recordingStrategyLiveConsumer.ApplySourceStatus(status)
}

type blockingEngineConsumer struct {
	mu              sync.Mutex
	engine          *live.Engine
	cancel          context.CancelFunc
	statuses        []live.SourceStatus
	snapshotApplied chan struct{}
	releaseSnapshot chan struct{}
	once            sync.Once
}

func newBlockingEngineConsumer(engine *live.Engine, cancel context.CancelFunc) *blockingEngineConsumer {
	return &blockingEngineConsumer{
		engine: engine, cancel: cancel, snapshotApplied: make(chan struct{}), releaseSnapshot: make(chan struct{}),
	}
}

func (consumer *blockingEngineConsumer) ApplySourceStatus(status live.SourceStatus) error {
	if err := consumer.engine.ApplySourceStatus(status); err != nil {
		return err
	}
	consumer.mu.Lock()
	consumer.statuses = append(consumer.statuses, status)
	consumer.mu.Unlock()
	if status.Revision == 3 {
		consumer.cancel()
	}
	return nil
}

func (consumer *blockingEngineConsumer) ApplySnapshot(snapshot strategyprojection.SnapshotV1) error {
	if err := consumer.engine.ApplySnapshot(snapshot); err != nil {
		return err
	}
	consumer.once.Do(func() { close(consumer.snapshotApplied) })
	<-consumer.releaseSnapshot
	return nil
}

func newStrategyLiveHub() *telemetrytransport.Hub {
	return telemetrytransport.NewHub(telemetrytransport.HubConfig{
		Product:  telemetrytransport.ProductStrategy,
		Versions: telemetryprojection.VersionPolicy{Current: 1, MinimumSupported: 1},
	})
}

func publishStrategyStatus(t testing.TB, hub *telemetrytransport.Hub, revision uint64, state string, reconnect int) {
	t.Helper()
	status, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductStrategy,
		revision,
		time.Date(2026, 8, 13, 10, 0, 0, 0, time.UTC),
		telemetrytransport.StatusPayload{State: state, ReconnectAttempt: reconnect},
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishStatus(status); err != nil {
		t.Fatal(err)
	}
}

func publishStrategyFull(t testing.TB, hub *telemetrytransport.Hub, snapshot strategyprojection.SnapshotV1, statusRevision uint64) {
	t.Helper()
	full, err := telemetrytransport.NewStrategyFull(snapshot.Metadata, statusRevision, snapshot.PayloadV1)
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(full, nil); err != nil {
		t.Fatal(err)
	}
}

func strategyStatusEvent(t testing.TB, revision uint64, state string, reconnect int) telemetrytransport.Event {
	t.Helper()
	status, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductStrategy,
		revision,
		time.Date(2026, 8, 13, 10, 0, 0, 0, time.UTC),
		telemetrytransport.StatusPayload{State: state, ReconnectAttempt: reconnect},
	)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(status)
	if err != nil {
		t.Fatal(err)
	}
	return telemetrytransport.Event{Product: telemetrytransport.ProductStrategy, Kind: telemetrytransport.EventStatus, Data: data}
}

func strategySnapshotEvent(t testing.TB, snapshot strategyprojection.SnapshotV1, statusRevision uint64) telemetrytransport.Event {
	t.Helper()
	full, err := telemetrytransport.NewStrategyFull(snapshot.Metadata, statusRevision, snapshot.PayloadV1)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(full)
	if err != nil {
		t.Fatal(err)
	}
	return telemetrytransport.Event{Product: telemetrytransport.ProductStrategy, Kind: telemetrytransport.EventSnapshot, Data: data}
}

func withEventData(event telemetrytransport.Event, data string) telemetrytransport.Event {
	event.Data = json.RawMessage(data)
	return event
}

func withoutStrategyPayloadKey(t testing.TB, event telemetrytransport.Event, key string) telemetrytransport.Event {
	t.Helper()
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(event.Data, &envelope); err != nil {
		t.Fatal(err)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(envelope["payload"], &payload); err != nil {
		t.Fatal(err)
	}
	delete(payload, key)
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	envelope["payload"] = encodedPayload
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	event.Data = encoded
	return event
}

func withStrategyPayloadExtensions(t testing.TB, event telemetrytransport.Event) telemetrytransport.Event {
	t.Helper()
	payload := strategyPayloadFromEvent(t, event)
	var object map[string]json.RawMessage
	if err := json.Unmarshal(payload, &object); err != nil {
		t.Fatal(err)
	}
	object["futureTopLevel"] = json.RawMessage(`{"safe":true}`)
	var capabilities []string
	if err := json.Unmarshal(object["capabilities"], &capabilities); err != nil {
		t.Fatal(err)
	}
	capabilities = append(capabilities, "future-capability")
	object["capabilities"] = mustStrategyJSON(t, capabilities)
	var player map[string]json.RawMessage
	if err := json.Unmarshal(object["player"], &player); err != nil {
		t.Fatal(err)
	}
	player["futurePlayer"] = json.RawMessage(`{"safe":true}`)
	var completed map[string]json.RawMessage
	if err := json.Unmarshal(player["completedLaps"], &completed); err != nil {
		t.Fatal(err)
	}
	completed["futureQualityDetail"] = json.RawMessage(`true`)
	player["completedLaps"] = mustStrategyJSON(t, completed)
	object["player"] = mustStrategyJSON(t, player)
	return withStrategyPayload(t, event, mustStrategyJSON(t, object))
}

func legacyStrategyLivePayload() json.RawMessage {
	return json.RawMessage(`{
		"capabilities":["session","progress","pit"],
		"trackName":{"present":false,"value":"","provenance":"unknown","freshness":"missing"},
		"sessionType":{"present":true,"value":"race","provenance":"observed","freshness":"fresh"},
		"player":{
			"id":"v",
			"lapNumber":{"present":true,"value":8,"provenance":"observed","freshness":"fresh"},
			"completedLaps":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},
			"inPit":{"present":true,"value":false,"provenance":"observed","freshness":"fresh"},
			"pitStopCount":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"}
		}
	}`)
}

func strategyPayloadFromEvent(t testing.TB, event telemetrytransport.Event) json.RawMessage {
	t.Helper()
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(event.Data, &envelope); err != nil {
		t.Fatal(err)
	}
	return append(json.RawMessage(nil), envelope["payload"]...)
}

func withStrategyPayload(t testing.TB, event telemetrytransport.Event, payload json.RawMessage) telemetrytransport.Event {
	t.Helper()
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(event.Data, &envelope); err != nil {
		t.Fatal(err)
	}
	envelope["payload"] = append(json.RawMessage(nil), payload...)
	event.Data = mustStrategyJSON(t, envelope)
	return event
}

func withoutStrategyPayloadPath(t testing.TB, payload json.RawMessage, path ...string) json.RawMessage {
	t.Helper()
	return mutateStrategyPayloadPath(t, payload, nil, true, path...)
}

func replaceStrategyPayloadPath(t testing.TB, payload, replacement json.RawMessage, path ...string) json.RawMessage {
	t.Helper()
	return mutateStrategyPayloadPath(t, payload, replacement, false, path...)
}

func mutateStrategyPayloadPath(t testing.TB, payload, replacement json.RawMessage, remove bool, path ...string) json.RawMessage {
	t.Helper()
	if len(path) == 0 {
		t.Fatal("payload path is empty")
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(payload, &object); err != nil {
		t.Fatal(err)
	}
	if len(path) == 1 {
		if remove {
			delete(object, path[0])
		} else {
			object[path[0]] = append(json.RawMessage(nil), replacement...)
		}
		return mustStrategyJSON(t, object)
	}
	child, present := object[path[0]]
	if !present {
		t.Fatalf("payload path %q is missing", strings.Join(path, "."))
	}
	object[path[0]] = mutateStrategyPayloadPath(t, child, replacement, remove, path[1:]...)
	return mustStrategyJSON(t, object)
}

func mustStrategyJSON(t testing.TB, value any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func strategyLiveProjection(epoch schema.Epoch, sequence schema.Sequence, completed standings.CompletedLaps) strategyprojection.SnapshotV1 {
	missingString := telemetryprojection.MissingField[string]()
	missingFloat := telemetryprojection.MissingField[float64]()
	return strategyprojection.SnapshotV1{
		Metadata: telemetryprojection.Metadata{
			CanonicalVersion: 1, ProjectionVersion: strategyprojection.VersionV1,
			Epoch: epoch, Sequence: sequence, CapturedAt: "2026-08-13T10:00:00Z",
		},
		PayloadV1: strategyprojection.PayloadV1{
			Capabilities: []strategyprojection.Capability{strategyprojection.CapabilityProgress, strategyprojection.CapabilityFuel},
			TrackName:    missingString, SessionType: missingString, SourceTime: missingFloat,
			EndTime: telemetryprojection.MissingField[session.EndTime](), Remaining: telemetryprojection.MissingField[session.RemainingTime](),
			MaximumLaps: telemetryprojection.MissingField[session.MaximumLaps](),
			Player: strategyprojection.PlayerV1{
				LapNumber:     telemetryprojection.MissingField[session.LapNumber](),
				CompletedLaps: observedStrategyField(completed), Sector: telemetryprojection.MissingField[standings.Sector](),
				LapDistance: telemetryprojection.MissingField[standings.LapDistance](), InPit: telemetryprojection.MissingField[pit.InPit](),
				PitStopCount: telemetryprojection.MissingField[pit.StopCount](), FuelLiters: observedStrategyField(energy.FuelAmount(20)),
				FuelCapacity: observedStrategyField(energy.FuelCapacity(100)),
			},
		},
	}
}

func observedStrategyField[T comparable](value T) telemetryprojection.Field[T] {
	return telemetryprojection.Field[T]{
		Present: true, Value: value, Provenance: telemetryprojection.ProvenanceObserved, Freshness: telemetryprojection.FreshnessFresh,
	}
}

func newStrategyLiveEngine(t testing.TB) *live.Engine {
	t.Helper()
	active, err := contract.NewActivePlan("activation-1", contract.RevisionRef{
		PlanID: "plan-1", VariantID: "variant-1", RevisionID: "revision-1", ContentHash: strings.Repeat("a", 64),
	}, time.Date(2026, 8, 13, 9, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	plan, err := live.NewPlan(live.PlanInput{ActivePlan: active, Stints: []live.Stint{{ID: "race", Laps: 10}}})
	if err != nil {
		t.Fatal(err)
	}
	engine, err := live.NewEngine(plan)
	if err != nil {
		t.Fatal(err)
	}
	return engine
}

func waitForStrategySubscribers(t testing.TB, hub *telemetrytransport.Hub, want int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for hub.Metrics().CurrentSubscribers != want {
		if time.Now().After(deadline) {
			t.Fatalf("subscribers = %d, want %d", hub.Metrics().CurrentSubscribers, want)
		}
		runtime.Gosched()
	}
}
