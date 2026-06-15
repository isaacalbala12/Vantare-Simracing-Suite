package app

import (
	"github.com/vantare/overlays/v2/internal/updater"
)

// UpdaterService exposes auto-update operations to the Wails frontend.
type UpdaterService struct {
	updater *updater.Updater
	emitter EventEmitter
}

// NewUpdaterService creates an updater service for the given current version.
func NewUpdaterService(currentVersion, settingsPath string, emitter EventEmitter) *UpdaterService {
	return &UpdaterService{
		updater: updater.New(currentVersion, settingsPath),
		emitter: emitter,
	}
}

// GetSettings loads updater settings from disk.
func (s *UpdaterService) GetSettings() (*updater.Settings, error) {
	return updater.LoadSettings(s.updater.SettingsPath())
}

// SaveSettings persists updater settings.
func (s *UpdaterService) SaveSettings(settings *updater.Settings) error {
	return updater.SaveSettings(s.updater.SettingsPath(), settings)
}

// CheckUpdates returns available releases for the configured channel.
func (s *UpdaterService) CheckUpdates() (*updater.UpdateInfo, error) {
	settings, err := s.GetSettings()
	if err != nil {
		return nil, err
	}
	return s.updater.Check(settings)
}

// InstallVersion downloads and launches the installer for the selected release.
func (s *UpdaterService) InstallVersion(tag, downloadURL string) error {
	return s.updater.Install(tag, downloadURL, func(percent int) {
		s.emitter.Emit("updater:progress", map[string]any{"percent": percent})
	})
}
