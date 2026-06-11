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

func TestNewMockMode(t *testing.T) {
	a := app.New(false)
	if a.Telemetry == nil {
		t.Fatal("expected telemetry service")
	}
	if a.LMUSource() != nil {
		t.Fatal("mock mode should not keep LMU source")
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

func TestAppTelemetryLifecycle(t *testing.T) {
	a := app.New(false)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	a.StartTelemetry(ctx)
	time.Sleep(50 * time.Millisecond)
	a.StopTelemetry()
}
