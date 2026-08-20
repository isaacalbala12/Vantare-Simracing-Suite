package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

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
	event, err := v2.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if event.Product != telemetrytransport.ProductOverlayV2 || event.Kind != telemetrytransport.PublisherEventSnapshot {
		t.Fatalf("v2 event = product %q kind %q", event.Product, event.Kind)
	}
	var update overlayv2.UpdateV2
	if err := json.Unmarshal(event.Data, &update); err != nil {
		t.Fatal(err)
	}
	if update.DeliveryRevision != 1 || update.Frame == nil || update.Frame.ContractVersion != overlayv2.ContractVersionV2 {
		t.Fatalf("v2 update = %+v", update)
	}
	metrics := runtime.Metrics()
	if metrics.OverlayProjectionsPublished != 1 || metrics.OverlayV2PayloadBytes["1"].Count != 1 ||
		metrics.OverlayV2BuildDurationUs.Count != 1 || metrics.PublisherDroppedFrames["overlay-v2"] != 0 {
		t.Fatalf("shadow metrics = %+v", metrics)
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
