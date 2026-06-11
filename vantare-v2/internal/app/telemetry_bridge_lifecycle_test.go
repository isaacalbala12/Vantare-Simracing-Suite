package app_test

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

func TestTelemetryBridgeStopReturns(t *testing.T) {
	buf := lmu.BuildSyntheticBuffer()
	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: service.FuncSource(func() []byte { return buf }),
	})

	fe := &captureEmitter{}
	bridge := app.NewTelemetryBridge(svc, fe)

	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = svc.Run(ctx) }()
	bridge.Start()

	deadline := time.After(500 * time.Millisecond)
	for fe.last == nil {
		select {
		case <-deadline:
			t.Fatal("timeout waiting for emit before stop")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	done := make(chan struct{})
	go func() {
		bridge.Stop()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("bridge.Stop blocked")
	}

	cancel()
}
