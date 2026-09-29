//go:build !windows

package main

import "github.com/vantare/overlays/v2/internal/app"

// LMU's supported shared-memory source exists only on Windows.
func selectTelemetryRuntime(_ string, config app.TelemetryCoreRuntimeConfig) (liveTelemetryRuntime, error) {
	return app.NewTelemetryCoreRuntime(config)
}
