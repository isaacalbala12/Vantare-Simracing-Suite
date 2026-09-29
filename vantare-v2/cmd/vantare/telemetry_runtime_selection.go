package main

import "github.com/vantare/overlays/v2/internal/app"

// Selection is made before Start, so the other simulator owner is never
// constructed or started. A requested Rust candidate cannot fall back to Go.
func selectTelemetryRuntime(candidateExecutable string, config app.TelemetryCoreRuntimeConfig) (liveTelemetryRuntime, error) {
	if candidateExecutable == "" {
		return app.NewTelemetryCoreRuntime(config)
	}
	return app.NewRustTelemetryCandidateRuntime(app.RustTelemetryCandidateConfig{
		Executable: candidateExecutable, Enabled: config.Enabled,
		OverlaySections:         config.OverlaySections,
		StrategyPublicTransport: config.StrategyPublicTransport,
		PerformancePolicy:       config.PerformancePolicy,
		Emitter:                 config.Emitter, Engineer: config.Engineer,
	})
}
