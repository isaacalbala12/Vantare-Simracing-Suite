package app

import "github.com/vantare/overlays/v2/internal/telemetry/service"

// SetOpenLMUSource overrides LMU open for tests. Restore with service.OpenLMUSource.
func SetOpenLMUSource(fn func() (*service.LMUSource, error)) {
	openLMUSource = fn
}
