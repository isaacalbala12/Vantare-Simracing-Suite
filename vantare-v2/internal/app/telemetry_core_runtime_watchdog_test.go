package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

func TestFrozenPipelineStopsReportingFresh(t *testing.T) {
	t.Skip("ISA-371 D-06: activar en F2; TelemetryCoreRuntimeConfig no expone reloj inyectable")
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	capturedAt := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	status, err := telemetrytransport.NewStatus(telemetrytransport.ProductOverlay, 1, capturedAt,
		telemetrytransport.StatusPayload{State: driver.StateLive.String()})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.hub.PublishStatus(status); err != nil {
		t.Fatal(err)
	}
	runtime.statusState = driver.StateLive
	// At capturedAt+1s no frame or watchdog has updated the runtime.
	if got := runtime.SourceStatus().State; got != driver.StateStale.String() {
		t.Fatalf("status one second after last frame = %q, want stale", got)
	}
}

func TestStatusErrorReachesSubscribersBeforeHubsClose(t *testing.T) {
	t.Skip("ISA-371 D-06: activar en F1")
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	subscription, err := runtime.Hub().Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	runtime.failStop(errors.New("injected terminal failure"))
	event, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatalf("subscriber missed terminal status: %v", err)
	}
	if event.Kind != telemetrytransport.EventStatus {
		t.Fatalf("terminal event kind = %q, want status", event.Kind)
	}
	var envelope struct {
		Payload struct {
			State string `json:"state"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(event.Data, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Payload.State != driver.StateError.String() {
		t.Fatalf("terminal status = %q, want error", envelope.Payload.State)
	}
}
