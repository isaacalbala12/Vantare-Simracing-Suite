//go:build windows

package main

import (
	"os"
	"path/filepath"
	"strings"
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

func TestWindowsDefaultRequiresPackagedRustHelper(t *testing.T) {
	path, err := defaultRustTelemetryExecutable()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join("runtime", "telemetry", "rust-live-v1", "vantare-telemetry.exe")
	if !strings.HasSuffix(path, want) {
		t.Fatalf("packaged Rust helper path = %q", path)
	}
	if _, err := selectTelemetryRuntime("", app.TelemetryCoreRuntimeConfig{Enabled: true}); err == nil {
		t.Fatal("missing packaged Rust helper silently selected Go")
	}
}
