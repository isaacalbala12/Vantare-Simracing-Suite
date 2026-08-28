//go:build !production

package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestEffectivePerformancePolicyDefaultsAndDiagnosticOverride(t *testing.T) {
	svc := app.NewSettingsService("", nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	if got := svc.EffectivePerformancePolicy().Level; got != 1 {
		t.Fatalf("default level=%d want 1", got)
	}
	t.Setenv("VANTARE_PERF_LEVEL", "4")
	if got := svc.EffectivePerformancePolicy().Level; got != 4 {
		t.Fatalf("diagnostic level=%d want 4", got)
	}
	t.Setenv("VANTARE_PERF_LEVEL", "9")
	if got := svc.EffectivePerformancePolicy().Level; got != 1 {
		t.Fatalf("invalid diagnostic level=%d want settings fallback 1", got)
	}
}
