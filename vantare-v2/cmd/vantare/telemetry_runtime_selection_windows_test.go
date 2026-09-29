//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestExplicitRustSelectionDoesNotConstructGoSimulator(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	runtime, err := selectTelemetryRuntime(executable, app.TelemetryCoreRuntimeConfig{
		Enabled:   true,
		Simulator: &app.TelemetrySimulator{}, // Invalid if the Go constructor is reached.
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := runtime.(*app.RustTelemetryCandidateRuntime); !ok {
		t.Fatalf("selected runtime is %T", runtime)
	}
	if _, err := selectTelemetryRuntime(filepath.Join(t.TempDir(), "missing.exe"), app.TelemetryCoreRuntimeConfig{Enabled: true}); err == nil {
		t.Fatal("missing explicit Rust binary fell back to Go")
	}
}
