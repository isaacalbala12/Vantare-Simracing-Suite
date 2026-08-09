package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

func TestTelemetryCoreRuntimeSourceStatusIsCanonicalAndFailClosed(t *testing.T) {
	disabled, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Enabled: false})
	if err != nil {
		t.Fatal(err)
	}
	if got := disabled.SourceStatus(); got != driver.UnknownSourceStatus() {
		t.Fatalf("disabled status = %#v, want %#v", got, driver.UnknownSourceStatus())
	}

	live, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	if got := live.SourceStatus(); got.Kind != "lmu" || got.Name != "Le Mans Ultimate" ||
		!got.Live || got.Available || got.State != driver.StateStopped.String() {
		t.Fatalf("initial live status = %#v", got)
	}
	if err := live.setStatus(driver.StateLive, 2); err != nil {
		t.Fatal(err)
	}
	if got := live.SourceStatus(); !got.Available || got.State != "live" || got.ReconnectAttempt != 2 {
		t.Fatalf("connected status = %#v", got)
	}
	if err := live.setStatus(driver.StateStale, 3); err != nil {
		t.Fatal(err)
	}
	// Stale sigue siendo disponible: el simulador esta conectado, solo que no ha
	// movido su reloj de sesion -- una pausa o un menu. Excluirlo deshabilitaba
	// la fuente LIVE del Studio por un bache de medio segundo, y dejaba el campo
	// al reves que degraded, que si contaba. La frescura se lee en State.
	if got := live.SourceStatus(); !got.Available || got.State != "stale" || got.ReconnectAttempt != 3 {
		t.Fatalf("stale status = %#v", got)
	}
}

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
