package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

func TestOverlayV2AppliesHotPerformancePolicyOnNextTick(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		PerformancePolicy: performancepolicy.Policy{Mode: performancepolicy.ModeLevel, Level: performancepolicy.LevelMaximum},
	})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
		t.Fatal(err)
	}
	firstEvent, ok := publisher.ReplaySnapshot()
	if !ok {
		t.Fatal("missing first snapshot")
	}
	var first overlayv2.UpdateV2
	if err := json.Unmarshal(firstEvent.Data, &first); err != nil {
		t.Fatal(err)
	}
	if first.Frame == nil || first.Frame.Capabilities.Performance.Level != 1 || first.Frame.Capabilities.Performance.RafCap != nil {
		t.Fatalf("first performance = %+v", first.Frame.Capabilities.Performance)
	}

	runtime.SetPerformancePolicy(performancepolicy.Policy{Mode: performancepolicy.ModeLevel, Level: performancepolicy.LevelMinimum})
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(2, 1)); err != nil {
		t.Fatal(err)
	}
	secondEvent, ok := publisher.ReplaySnapshot()
	if !ok {
		t.Fatal("missing second snapshot")
	}
	var second overlayv2.UpdateV2
	if err := json.Unmarshal(secondEvent.Data, &second); err != nil {
		t.Fatal(err)
	}
	performance := second.Frame.Capabilities.Performance
	if performance.Level != 5 || performance.RafCap == nil || *performance.RafCap != 20 || performance.Mode != overlayv2.PerformanceModeManual {
		t.Fatalf("next tick performance = %+v", performance)
	}
}

func TestRuntimePublishesV1AndV2InShadow(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	v1, err := runtime.Hub().Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer v1.Close()
	v2Publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	v2, err := v2Publisher.Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer v2.Close()

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
		t.Fatalf("WriteBatch() = %v", err)
	}
	assertNextV1Snapshot(t, v1)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	event := nextOverlayV2Snapshot(t, v2, ctx)
	if event.Product != telemetrytransport.ProductOverlayV2 || event.Kind != telemetrytransport.PublisherEventSnapshot {
		t.Fatalf("v2 event = product %q kind %q", event.Product, event.Kind)
	}
	var update overlayv2.UpdateV2
	if err := json.Unmarshal(event.Data, &update); err != nil {
		t.Fatal(err)
	}
	if update.DeliveryRevision != 2 || update.Frame == nil || update.Frame.ContractVersion != overlayv2.ContractVersionV2 {
		t.Fatalf("v2 update = %+v", update)
	}
	metrics := runtime.Metrics()
	if metrics.OverlayProjectionsPublished != 1 || metrics.OverlayV2PayloadBytes["1"].Count != 1 ||
		metrics.OverlayV2BuildDurationUs.Count != 1 || metrics.PublisherDroppedFrames["overlay-v2"] != 0 {
		t.Fatalf("shadow metrics = %+v", metrics)
	}
}

func TestRuntimePublishesAndRetainsOverlayV2LifecycleWithoutFrames(t *testing.T) {
	t.Parallel()

	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.setStatus(driver.StateConnecting, 2); err != nil {
		t.Fatal(err)
	}
	if _, active := runtime.OverlayV2Publishers().Lookup(telemetrytransport.ProductOverlayV2); active {
		t.Fatal("status-only transition activated Overlay v2 frame publisher")
	}

	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	event, ok := publisher.ReplayStatus()
	if !ok {
		t.Fatal("late consumer did not receive retained Overlay v2 status")
	}
	var update overlayv2.UpdateV2
	if err := json.Unmarshal(event.Data, &update); err != nil {
		t.Fatal(err)
	}
	if update.DeliveryRevision != 1 || update.Source.State != overlayv2.SourceStateConnecting ||
		update.Source.ReconnectAttempt != 2 || update.Frame != nil {
		t.Fatalf("retained status update = %+v", update)
	}

	if err := runtime.setStatus(driver.StateError, 3); err != nil {
		t.Fatal(err)
	}
	event, ok = publisher.ReplayStatus()
	if !ok {
		t.Fatal("active consumer lost status update")
	}
	if err := json.Unmarshal(event.Data, &update); err != nil {
		t.Fatal(err)
	}
	if update.DeliveryRevision != 2 || update.Source.State != overlayv2.SourceStateError ||
		update.Source.ReconnectAttempt != 3 || update.Frame != nil {
		t.Fatalf("active status update = %+v", update)
	}
}

func TestOverlayV2FailureDoesNotAffectV1(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	v1, err := runtime.Hub().Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer v1.Close()
	_, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	runtime.overlayV2Project = func(
		envelope.Snapshot[derive.FinalState], overlayv2.SourceContextV2, overlayv2.PreferencesV2, uint64,
	) (overlayv2.UpdateV2, error) {
		return overlayv2.UpdateV2{}, errors.New("injected v2 projection failure")
	}

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
		t.Fatalf("v2 shadow failure escaped driver loop: %v", err)
	}
	assertNextV1Snapshot(t, v1)
	metrics := runtime.Metrics()
	if metrics.OverlayProjectionsPublished != 1 || metrics.PublishFailures["overlay-v2"] != 1 ||
		metrics.FramesDropped["overlay-v2-publish"] != 1 || metrics.FailStops != 0 {
		t.Fatalf("v2 failure isolation metrics = %+v", metrics)
	}
}

func TestOverlayV2ShadowOffDoesNotBuildOrPublish(t *testing.T) {
	disabled := false
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{OverlayFrameV2Shadow: &disabled})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	runtime.overlayV2Project = func(
		envelope.Snapshot[derive.FinalState], overlayv2.SourceContextV2, overlayv2.PreferencesV2, uint64,
	) (overlayv2.UpdateV2, error) {
		t.Fatal("v2 projector called while flag is off")
		return overlayv2.UpdateV2{}, nil
	}
	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
		t.Fatal(err)
	}
	if _, ok := publisher.ReplaySnapshot(); ok {
		t.Fatal("v2 snapshot published while flag is off")
	}
}

func TestOverlayV2SnapshotRevisionCannotBeOvertakenByConcurrentStatus(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()

	projecting := make(chan struct{})
	continueProjection := make(chan struct{})
	originalProject := runtime.overlayV2Project
	runtime.overlayV2Project = func(
		final envelope.Snapshot[derive.FinalState],
		source overlayv2.SourceContextV2,
		preferences overlayv2.PreferencesV2,
		revision uint64,
	) (overlayv2.UpdateV2, error) {
		close(projecting)
		<-continueProjection
		return originalProject(final, source, preferences, revision)
	}

	writeDone := make(chan error, 1)
	go func() {
		writeDone <- (runtimeBatchSink{runtime: runtime}).WriteBatch(
			context.Background(),
			hardeningBatch(1, 1),
		)
	}()
	<-projecting
	if err := runtime.setStatus(driver.StateStale, 0); err != nil {
		t.Fatal(err)
	}
	close(continueProjection)
	if err := <-writeDone; err != nil {
		t.Fatal(err)
	}

	statusEvent, ok := publisher.ReplayStatus()
	if !ok {
		t.Fatal("missing concurrent Overlay v2 status")
	}
	snapshotEvent, ok := publisher.ReplaySnapshot()
	if !ok {
		t.Fatal("missing Overlay v2 snapshot")
	}
	var statusUpdate, snapshotUpdate overlayv2.UpdateV2
	if err := json.Unmarshal(statusEvent.Data, &statusUpdate); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(snapshotEvent.Data, &snapshotUpdate); err != nil {
		t.Fatal(err)
	}
	if snapshotUpdate.DeliveryRevision <= statusUpdate.DeliveryRevision {
		t.Fatalf("snapshot revision %d published after status revision %d", snapshotUpdate.DeliveryRevision, statusUpdate.DeliveryRevision)
	}
	if snapshotUpdate.Source.State != overlayv2.SourceStateStale {
		t.Fatalf("snapshot source = %q, want current stale state", snapshotUpdate.Source.State)
	}
}

func assertNextV1Snapshot(t *testing.T, subscription *telemetrytransport.Subscription) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if event.Kind == telemetrytransport.EventSnapshot {
			return
		}
	}
}

func nextOverlayV2Snapshot(
	t *testing.T,
	subscription *telemetrytransport.PublisherSubscription,
	ctx context.Context,
) telemetrytransport.PublisherEvent {
	t.Helper()
	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if event.Kind == telemetrytransport.PublisherEventSnapshot {
			return event
		}
	}
}
