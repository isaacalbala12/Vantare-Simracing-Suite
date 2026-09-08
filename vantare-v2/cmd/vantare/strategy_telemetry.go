package main

import (
	"context"
	"path/filepath"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/coldstart"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

// Always provide a status service, including when startup cannot open sources.
// Strategy can then distinguish unavailability from an honestly empty catalog.
func strategyTelemetrySources(root, executableDir string) (*telemetryanalysis.SessionCatalog, *coldstart.Service) {
	options := coldstart.ServiceOptions{StatePath: filepath.Join(root, "cold-start.json")}
	store, err := telemetryanalysis.OpenAuthorizedSessionStore(filepath.Join(root, "authorized-sessions.json"))
	if err != nil {
		options.CatalogUnavailable = true
		return telemetryanalysis.NewSessionCatalog(nil), coldstart.NewService(options)
	}
	options.Store = store
	options.CatalogRecovered = store.RecoveredFromBackup()
	if executableDir != "" {
		if importer, err := coldstart.NewLMUImporter(executableDir, filepath.Join(root, "telemetry-staging")); err == nil {
			options.Importer = importer
			options.Discover = func(ctx context.Context) ([]telemetryanalysis.Candidate, error) {
				return coldstart.DiscoverStandardLMU(ctx, coldstart.StandardLMUTelemetryRoot(), time.Second)
			}
		}
	}
	return telemetryanalysis.NewSessionCatalog(store), coldstart.NewService(options)
}
