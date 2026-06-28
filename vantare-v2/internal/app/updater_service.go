package app

import (
	"context"
	"sync"

	"github.com/vantare/overlays/v2/internal/updater"
)

// UpdaterService exposes auto-update operations to the Wails frontend.
type UpdaterService struct {
	updater *updater.Updater
	emitter EventEmitter
	mu      sync.Mutex
}

// NewUpdaterService creates an updater service for the given current version.
func NewUpdaterService(currentVersion, settingsPath string, emitter EventEmitter) (*UpdaterService, error) {
	u, err := updater.New(currentVersion, settingsPath)
	if err != nil {
		return nil, err
	}
	return &UpdaterService{
		updater: u,
		emitter: emitter,
	}, nil
}

// GetSettings loads updater settings from disk.
func (s *UpdaterService) GetSettings() (*updater.Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadSettings()
}

func (s *UpdaterService) loadSettings() (*updater.Settings, error) {
	return updater.LoadSettings(s.updater.SettingsPath())
}

// SaveSettings persists updater settings.
func (s *UpdaterService) SaveSettings(settings *updater.Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveSettings(settings)
}

func (s *UpdaterService) saveSettings(settings *updater.Settings) error {
	return updater.SaveSettings(s.updater.SettingsPath(), settings)
}

// CheckUpdates returns available releases for the configured channel.
// Automatic checks respect the configured cooldown.
func (s *UpdaterService) CheckUpdates() (*updater.UpdateInfo, error) {
	return s.CheckUpdatesCtx(context.Background())
}

// CheckUpdatesCtx is like CheckUpdates but accepts a context for cancellation.
func (s *UpdaterService) CheckUpdatesCtx(ctx context.Context) (*updater.UpdateInfo, error) {
	return s.checkUpdates(ctx, false)
}

// CheckUpdatesManual forces an update check, ignoring the cooldown.
func (s *UpdaterService) CheckUpdatesManual() (*updater.UpdateInfo, error) {
	return s.CheckUpdatesManualCtx(context.Background())
}

// CheckUpdatesManualCtx is like CheckUpdatesManual but accepts a context for cancellation.
func (s *UpdaterService) CheckUpdatesManualCtx(ctx context.Context) (*updater.UpdateInfo, error) {
	return s.checkUpdates(ctx, true)
}

func (s *UpdaterService) checkUpdates(ctx context.Context, manual bool) (*updater.UpdateInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	settings, err := s.loadSettings()
	if err != nil {
		return nil, err
	}
	var info *updater.UpdateInfo
	if manual {
		info, err = s.updater.CheckManualCtx(ctx, settings)
	} else {
		info, err = s.updater.CheckCtx(ctx, settings)
	}
	if err != nil {
		return nil, err
	}
	// Persist LastCheckAt when a real check happened (not throttled).
	if !info.Throttled {
		if err := s.saveSettings(settings); err != nil {
			return nil, err
		}
	}
	return info, nil
}

// IgnoreVersion sets the version to ignore in update notifications.
func (s *UpdaterService) IgnoreVersion(version string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	settings, err := s.loadSettings()
	if err != nil {
		return err
	}
	settings.IgnoreVersion = version
	return s.saveSettings(settings)
}

// InstallVerifiedVersion downloads and verifies the installer for the selected release.
func (s *UpdaterService) InstallVerifiedVersion(release updater.Release) error {
	return s.InstallVerifiedVersionCtx(context.Background(), release)
}

// InstallVerifiedVersionCtx is like InstallVerifiedVersion but accepts a context for cancellation.
func (s *UpdaterService) InstallVerifiedVersionCtx(ctx context.Context, release updater.Release) error {
	return s.updater.InstallVerifiedCtx(ctx, release, func(percent int) {
		s.emitter.Emit("updater:progress", map[string]any{"percent": percent})
	})
}
