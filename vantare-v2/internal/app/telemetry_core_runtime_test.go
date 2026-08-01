package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
)

func TestTelemetryCoreRuntimeDisabledPublishesStoppedWithoutStartingLMU(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Enabled: false})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	subscription, err := runtime.Hub().Subscribe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	event, err := subscription.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if event.Kind != telemetrytransport.EventStatus {
		t.Fatalf("event kind = %q, want status", event.Kind)
	}
	var status struct {
		Payload struct {
			State string `json:"state"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(event.Data, &status); err != nil {
		t.Fatal(err)
	}
	if status.Payload.State != "stopped" {
		t.Fatalf("status state = %q, want stopped", status.Payload.State)
	}
	stopCtx, stopCancel := context.WithTimeout(context.Background(), time.Second)
	defer stopCancel()
	if err := runtime.Stop(stopCtx); err != nil {
		t.Fatal(err)
	}
}

func TestTelemetryCoreRuntimeLifecycleGuards(t *testing.T) {
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(nil); err == nil {
		t.Fatal("Start(nil) error = nil")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(ctx); !errors.Is(err, telemetrycore.ErrManagerAlreadyStarted) {
		t.Fatalf("second Start() error = %v, want %v", err, telemetrycore.ErrManagerAlreadyStarted)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatalf("second Stop() error = %v", err)
	}
}
