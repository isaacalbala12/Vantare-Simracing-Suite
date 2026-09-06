package app

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestIsa998S1NoTelemetryShadowInProduction es el guard RED→GREEN del corte S1.
//
// Falla en la base 210340b8 porque telemetry_shadow.go y su cableado existen
// en producción; pasa cuando el verificador y sus métricas/config huérfanas
// salen del camino productivo. Solo mira ficheros no-test para no auto-fallar
// por este propio test ni por benchmarks de medición.
func TestIsa998S1NoTelemetryShadowInProduction(t *testing.T) {
	t.Parallel()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test file")
	}
	appDir := filepath.Dir(filename)
	entries, err := os.ReadDir(appDir)
	if err != nil {
		t.Fatal(err)
	}
	var hits []string
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(appDir, name))
		if err != nil {
			t.Fatal(err)
		}
		content := string(data)
		// telemetryShadow (minúscula) es el verificador de transición S1.
		// No toca OverlayFrameV2Shadow ni otros toggles/contratos v1 por nombre.
		if strings.Contains(content, "telemetryShadow") || strings.Contains(content, "TelemetryShadow") {
			hits = append(hits, name)
		}
	}
	if len(hits) != 0 {
		t.Fatalf("telemetryShadow sigue en producción: %s", strings.Join(hits, ", "))
	}
}
