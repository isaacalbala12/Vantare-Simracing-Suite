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

func TestStatusErrorReachesSubscribersBeforeHubsClose(t *testing.T) {
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
