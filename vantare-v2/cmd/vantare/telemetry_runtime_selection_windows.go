//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/vantare/overlays/v2/internal/app"
)

func defaultRustTelemetryExecutable() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve Vantare executable: %w", err)
	}
	return filepath.Join(filepath.Dir(executable), "runtime", "telemetry", "rust-live-v1", "vantare-telemetry.exe"), nil
}

// Windows live LMU telemetry always selects Rust. A missing helper fails
// closed; the diagnostic flag may point at an isolated reviewed build.
func selectTelemetryRuntime(candidateExecutable string, config app.TelemetryCoreRuntimeConfig) (liveTelemetryRuntime, error) {
	if candidateExecutable == "" {
		var err error
		candidateExecutable, err = defaultRustTelemetryExecutable()
		if err != nil {
			return nil, err
		}
	}
	return app.NewRustTelemetryCandidateRuntime(app.RustTelemetryCandidateConfig{
		Executable: candidateExecutable, Enabled: config.Enabled,
		StrategyPublicTransport: config.StrategyPublicTransport,
		PerformancePolicy:       config.PerformancePolicy,
		Emitter:                 config.Emitter, Engineer: config.Engineer,
	})
}
