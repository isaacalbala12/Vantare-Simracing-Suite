package app

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
)

func TestFuelUsageWindowIsWiredExplicitly(t *testing.T) {
	t.Parallel()

	if derive.DefaultFuelUsageWindowProduct != 3 {
		t.Fatalf("DefaultFuelUsageWindowProduct = %d, want 3", derive.DefaultFuelUsageWindowProduct)
	}
	if derive.DefaultFuelUsageWindowProduct != derive.DefaultFuelUsageWindow {
		t.Fatalf("product window %d != canonical %d", derive.DefaultFuelUsageWindowProduct, derive.DefaultFuelUsageWindow)
	}

	// Los dos puntos de construcción deben usar ventana explícita.
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test file")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))

	checks := []string{
		"internal/app/telemetry_core_runtime.go",
		"internal/app/telemetry_shadow.go",
	}
	for _, rel := range checks {
		path := filepath.Join(repoRoot, rel)
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", rel, err)
		}
		content := string(data)
		if strings.Contains(content, "derive.NewPipeline(derive.Config{})") {
			t.Fatalf("%s still uses empty Config{} — debe usar FuelUsageWindow: derive.DefaultFuelUsageWindowProduct", rel)
		}
		if !strings.Contains(content, "FuelUsageWindow: derive.DefaultFuelUsageWindowProduct") {
			t.Fatalf("%s missing explicit FuelUsageWindow wiring", rel)
		}
	}

	// Verificación funcional: pipeline efectivo debe ser 3.
	pipeline := derive.NewPipeline(derive.Config{FuelUsageWindow: derive.DefaultFuelUsageWindowProduct})
	if pipeline.FuelUsageWindow() != 3 {
		t.Fatalf("pipeline window = %d, want 3", pipeline.FuelUsageWindow())
	}
	shadow := newTelemetryShadow(0, 0, nil)
	if shadow.derive.FuelUsageWindow() != 3 {
		t.Fatalf("shadow pipeline window = %d, want 3", shadow.derive.FuelUsageWindow())
	}
}
