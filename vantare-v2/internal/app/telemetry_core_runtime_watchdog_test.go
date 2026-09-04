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
	now := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled: true,
		Now:     func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.setStatus(driver.StateLive, 0); err != nil {
		t.Fatal(err)
	}
	runtime.recordFrameArrival()
	now = now.Add(time.Second)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateStale.String() {
		t.Fatalf("status one second after last frame = %q, want stale", got)
	}
}

func TestWatchdogDegradesWithinOneSecond(t *testing.T) {
	now := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled:         true,
		Now:             func() time.Time { return now },
		WatchdogTimeout: 900 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.setStatus(driver.StateLive, 0); err != nil {
		t.Fatal(err)
	}
	runtime.recordFrameArrival()

	now = now.Add(899 * time.Millisecond)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateLive.String() {
		t.Fatalf("status before watchdog threshold = %q, want live", got)
	}

	now = now.Add(time.Millisecond)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateStale.String() {
		t.Fatalf("status at watchdog threshold = %q, want stale", got)
	}
	metrics := runtime.Metrics()
	if metrics.LastFrameAgeMs != 900 || metrics.WatchdogDegradations != 1 {
		t.Fatalf("watchdog metrics = age %d ms, degradations %d", metrics.LastFrameAgeMs, metrics.WatchdogDegradations)
	}
	if err := runtime.setStatus(runtime.watchdogAdjustedState(driver.StateLive), 0); err != nil {
		t.Fatal(err)
	}
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	if got := runtime.Metrics().WatchdogDegradations; got != 1 {
		t.Fatalf("watchdog degradations after another monitor tick = %d, want 1", got)
	}
}

func TestWatchdogRecoversWhenFramesResume(t *testing.T) {
	now := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled: true,
		Now:     func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.setStatus(driver.StateLive, 2); err != nil {
		t.Fatal(err)
	}
	runtime.recordFrameArrival()
	now = now.Add(time.Second)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}

	now = now.Add(100 * time.Millisecond)
	runtime.recordFrameArrival()
	if err := runtime.setStatus(driver.StateLive, 2); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateLive.String() {
		t.Fatalf("status after frames resume = %q, want live", got)
	}
	if got := runtime.Metrics().LastFrameAgeMs; got != 0 {
		t.Fatalf("last frame age after recovery = %d ms, want 0", got)
	}
}

func TestReconnectRecoversWithoutRestart(t *testing.T) {
	now := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled:                 true,
		Now:                     func() time.Time { return now },
		StrategyPublicTransport: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Escenarios 1 y 2: Vantare arranca antes que el sim; detectar sin frames
	// no se presenta como live ni dispara el watchdog. El primer frame recupera.
	if err := runtime.setStatus(driver.StateDetecting, 0); err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Second)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateDetecting.String() {
		t.Fatalf("status while waiting for sim = %q, want detecting", got)
	}
	runtime.recordFrameArrival()
	if err := runtime.setStatus(driver.StateLive, 0); err != nil {
		t.Fatal(err)
	}

	// Escenario 13: una congelación degrada; conectar de nuevo y recibir otro
	// frame recupera el mismo runtime, sin Start/Stop ni reconstrucción.
	now = now.Add(time.Second)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	if err := runtime.setStatus(driver.StateConnecting, 1); err != nil {
		t.Fatal(err)
	}
	now = now.Add(100 * time.Millisecond)
	runtime.recordFrameArrival()
	if err := runtime.setStatus(driver.StateLive, 1); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateLive.String() {
		t.Fatalf("status after reconnect frame = %q, want live", got)
	}

	// Escenario 20: un consumidor tardío recibe el stale ya retenido; otro
	// frame vuelve a live en la misma instancia.
	now = now.Add(time.Second)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	subscription, err := runtime.StrategyHub().Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	event, err := subscription.Next(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var retained telemetrytransport.StatusEnvelope
	if err := json.Unmarshal(event.Data, &retained); err != nil {
		t.Fatal(err)
	}
	var payload telemetrytransport.StatusPayload
	if err := json.Unmarshal(retained.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.State != driver.StateStale.String() || payload.ReconnectAttempt != 1 {
		t.Fatalf("late status = %+v, want stale reconnect attempt 1", payload)
	}
	now = now.Add(100 * time.Millisecond)
	runtime.recordFrameArrival()
	if err := runtime.setStatus(driver.StateLive, 1); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateLive.String() {
		t.Fatalf("late recovery status = %q, want live", got)
	}
}

func TestTelemetryWatchdogDisabledPreservesPreviousBehavior(t *testing.T) {
	disabled := false
	now := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Enabled:                  true,
		Now:                      func() time.Time { return now },
		TelemetryWatchdogEnabled: &disabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.setStatus(driver.StateLive, 0); err != nil {
		t.Fatal(err)
	}
	runtime.recordFrameArrival()
	now = now.Add(10 * time.Second)
	if err := runtime.evaluateWatchdog(); err != nil {
		t.Fatal(err)
	}
	if got := runtime.SourceStatus().State; got != driver.StateLive.String() {
		t.Fatalf("status with watchdog disabled = %q, want live", got)
	}
	if got := runtime.Metrics().WatchdogDegradations; got != 0 {
		t.Fatalf("watchdog degradations while disabled = %d, want 0", got)
	}
}

func TestStatusErrorReachesSubscribersBeforeHubsClose(t *testing.T) {
	// R6a: el terminal error llega a Strategy; el Hub Overlay V1 retirado
	// permanece en silencio.
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{StrategyPublicTransport: true})
	if err != nil {
		t.Fatal(err)
	}
	subscription, err := runtime.StrategyHub().Subscribe(context.Background())
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
