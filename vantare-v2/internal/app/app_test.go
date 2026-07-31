package app_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

func TestNewWithoutLiveStartsDisconnected(t *testing.T) {
	a := app.New(false)
	if a.Telemetry == nil {
		t.Fatal("expected telemetry service")
	}
	if a.LMUSource() != nil {
		t.Fatal("disabled live mode should not keep LMU source")
	}
	info := a.SourceInfo()
	if info.Kind == service.SimulatorMock || info.Live || info.Available {
		t.Fatalf("SourceInfo()=%+v, want unavailable non-mock source", info)
	}
	direct, ok := a.TelemetrySource().(service.TelemetrySource)
	if !ok {
		t.Fatalf("TelemetrySource()=%T, want explicit disconnected telemetry source", a.TelemetrySource())
	}
	telemetry := direct.ReadTelemetry()
	if telemetry == nil || telemetry.Connected || telemetry.Player != nil || len(telemetry.Vehicles) != 0 {
		t.Fatalf("ReadTelemetry()=%#v, want disconnected telemetry without synthetic data", telemetry)
	}
}

func TestNewLiveOpensLMUOnce(t *testing.T) {
	t.Cleanup(func() { app.SetOpenLMUSource(service.OpenLMUSource) })

	var calls int32
	app.SetOpenLMUSource(func() (*service.LMUSource, error) {
		atomic.AddInt32(&calls, 1)
		return nil, errors.New("lmu unavailable in unit test")
	})

	app.New(true)
	if atomic.LoadInt32(&calls) != 1 {
		t.Fatalf("OpenLMUSource calls = %d, want 1", calls)
	}
}

func TestFrontendDistFS(t *testing.T) {
	_, err := app.FrontendDistFS()
	if err != nil {
		t.Skip("frontend/dist not built — run pnpm --dir frontend build")
	}
}

func TestAppEnsureLiveTelemetryRetriesWithoutMockWhenOpenFails(t *testing.T) {
	t.Cleanup(func() { app.SetOpenLMUSource(service.OpenLMUSource) })

	var calls int32
	app.SetOpenLMUSource(func() (*service.LMUSource, error) {
		atomic.AddInt32(&calls, 1)
		return nil, errors.New("lmu unavailable")
	})

	a := app.New(true)
	if err := a.EnsureLiveTelemetry(); err == nil {
		t.Fatal("EnsureLiveTelemetry() error=nil, want unavailable live error")
	}
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Fatalf("OpenLMUSource calls=%d, want 2", got)
	}
	if info := a.SourceInfo(); info.Kind == service.SimulatorMock || info.Live || info.Available {
		t.Fatalf("SourceInfo()=%+v, want unavailable non-mock source", info)
	}
	direct, ok := a.TelemetrySource().(service.TelemetrySource)
	if !ok {
		t.Fatalf("TelemetrySource()=%T, want disconnected telemetry source", a.TelemetrySource())
	}
	if telemetry := direct.ReadTelemetry(); telemetry == nil || telemetry.Connected || len(telemetry.Vehicles) != 0 {
		t.Fatalf("ReadTelemetry()=%#v, want disconnected telemetry", telemetry)
	}
}

func TestAppTelemetryLifecycle(t *testing.T) {
	a := app.New(false)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	a.StartTelemetry(ctx)
	time.Sleep(50 * time.Millisecond)
	a.StopTelemetry()
}
