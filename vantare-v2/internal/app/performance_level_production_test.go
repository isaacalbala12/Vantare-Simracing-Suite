//go:build production

package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestProductionEffectivePerformancePolicyIgnoresDiagnosticEnvironment(t *testing.T) {
	t.Setenv("VANTARE_PERF_LEVEL", "5")
	svc := app.NewSettingsService("", nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	if got := svc.EffectivePerformancePolicy(nil); got.Level != 1 {
		t.Fatalf("production effective level = %d, want persisted level 1", got.Level)
	}
}
