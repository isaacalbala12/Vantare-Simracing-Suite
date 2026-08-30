//go:build !production

package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/pkg/config"
)

type performanceLevelCapture struct {
	event string
	data  any
}

func (capture *performanceLevelCapture) Emit(event string, data any) {
	capture.event = event
	capture.data = data
}

func TestEffectivePerformancePolicyDefaultsAndDiagnosticOverride(t *testing.T) {
	svc := app.NewSettingsService("", nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
<<<<<<< HEAD
	if got := svc.EffectivePerformancePolicy(nil); got.Level != 1 {
		t.Fatalf("default level=%d want 1", got.Level)
	}
	t.Setenv("VANTARE_PERF_LEVEL", "4")
	profile := &config.ProfileDocumentV4{
		Performance: &config.ProfilePerformanceV4{Mode: config.ProfilePerformanceLevel, Level: 2},
	}
	if got := svc.EffectivePerformancePolicy(profile); got.Level != 4 || got.Mode != "level" {
		t.Fatalf("diagnostic policy=%+v want level 4", got)
	}
	t.Setenv("VANTARE_PERF_LEVEL", "9")
	if got := svc.EffectivePerformancePolicy(nil); got.Level != 1 {
		t.Fatalf("invalid diagnostic level=%d want settings fallback 1", got.Level)
	}
}

func TestDiagnosticOverrideReachesPublishedPerformanceCapability(t *testing.T) {
	t.Setenv("VANTARE_PERF_LEVEL", "3")
	profile := &config.ProfileDocumentV4{
		Performance: &config.ProfilePerformanceV4{Mode: config.ProfilePerformanceLevel, Level: 1},
	}
	policy := app.ResolveEffectivePerformancePolicy(
		app.PerformanceSettings{Mode: "level", Level: 1},
		profile,
	)
	capture := &performanceLevelCapture{}
	runtime, err := app.NewTelemetryCoreRuntime(app.TelemetryCoreRuntimeConfig{
		Emitter:           capture,
		PerformancePolicy: policy,
	})
	if err != nil {
		t.Fatal(err)
	}
	runtime.EmitPerformanceLevel()

	published, ok := capture.data.(overlayv2.PerformanceV2)
	if capture.event != "performance:level" || !ok {
		t.Fatalf("event=%q payload=%T", capture.event, capture.data)
	}
	if published.Level != 3 || published.RafCap == nil || *published.RafCap != 40 {
		t.Fatalf("performance=%+v want level=3 rafCap=40", published)
	}
}
