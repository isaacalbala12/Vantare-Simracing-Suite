package app

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/updater"
)

// UpdaterService exposes auto-update operations to the Wails frontend.
type UpdaterService struct {
	updater        *updater.Updater
	emitter        EventEmitter
	mu             sync.Mutex
	channelAllowed func(updater.Channel) bool
	// installMu guards `installing` only. It is deliberately separate from
	// `mu`: a download takes minutes and must not block reading settings.
	installMu  sync.Mutex
	installing bool
}

// NewUpdaterService creates an updater service for the given current version.
func NewUpdaterService(currentVersion, settingsPath string, emitter EventEmitter) (*UpdaterService, error) {
	u, err := updater.New(currentVersion, settingsPath)
	if err != nil {
		return nil, err
	}
	return &UpdaterService{
		updater:        u,
		emitter:        emitter,
		channelAllowed: func(channel updater.Channel) bool { return channel == updater.ChannelStable },
	}, nil
}

func (s *UpdaterService) SetChannelAuthorizer(authorizer func(updater.Channel) bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if authorizer != nil {
		s.channelAllowed = authorizer
	}
}

// channelIsAllowed reads the authorizer under the lock. The license can swap it
// at any time, so callers outside the locked helpers must go through here.
func (s *UpdaterService) channelIsAllowed(channel updater.Channel) bool {
	s.mu.Lock()
	allowed := s.channelAllowed
	s.mu.Unlock()
	return allowed(channel)
}

// GetSettings loads updater settings from disk.
func (s *UpdaterService) GetSettings() (*updater.Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadSettings()
}

func (s *UpdaterService) loadSettings() (*updater.Settings, error) {
	settings, err := updater.LoadSettings(s.updater.SettingsPath())
	if err != nil {
		return nil, err
	}
	if !s.channelAllowed(settings.Channel) {
		settings.Channel = updater.ChannelStable
	}
	return settings, nil
}

// SaveSettings persists updater settings.
func (s *UpdaterService) SaveSettings(settings *updater.Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveSettings(settings)
}

func (s *UpdaterService) saveSettings(settings *updater.Settings) error {
	settings.Channel = updater.NormalizeChannel(settings.Channel)
	if !s.channelAllowed(settings.Channel) {
		return fmt.Errorf("update channel %q is not authorized", settings.Channel)
	}
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
func (s *UpdaterService) InstallVerifiedVersion(tag string) error {
	return s.InstallVerifiedVersionCtx(context.Background(), tag)
}

// InstallVerifiedVersionCtx downloads, verifies and launches the installer for
// the release published under the given tag.
//
// Takes a tag, not a release. The frontend used to hand over the whole object,
// download URL included, and the backend downloaded from that URL and ran the
// resulting .exe: the renderer got to say what this process executes, and the
// checksum came from the same place as the file, so it proved the download was
// not corrupt, never that it was ours. The release is now looked up in the list
// the backend itself fetched, and only its URLs are used.
func (s *UpdaterService) InstallVerifiedVersionCtx(ctx context.Context, tag string) error {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return fmt.Errorf("release tag is required")
	}

	// Una instalacion a la vez. El front deshabilita el boton, pero el evento
	// es publico: dos a la vez borran y reescriben el mismo instalador a medio
	// descargar, y una acabaria ejecutando lo que dejo la otra.
	s.installMu.Lock()
	if s.installing {
		s.installMu.Unlock()
		return fmt.Errorf("an installation is already in progress")
	}
	s.installing = true
	s.installMu.Unlock()
	defer func() {
		s.installMu.Lock()
		s.installing = false
		s.installMu.Unlock()
	}()

	release, err := s.resolveRelease(ctx, tag)
	if err != nil {
		return err
	}

	channel, known := updater.ReleaseChannel(*release)
	if !known || !s.channelIsAllowed(channel) {
		return fmt.Errorf("release channel is not authorized")
	}
	return s.updater.InstallVerifiedCtx(ctx, *release, func(percent int) {
		s.emitter.Emit("updater:progress", map[string]any{"percent": percent})
	})
}

// resolveRelease finds the published release for a tag, using the backend's own
// view of what exists rather than anything the caller supplied.
func (s *UpdaterService) resolveRelease(ctx context.Context, tag string) (*updater.Release, error) {
	s.mu.Lock()
	settings, err := s.loadSettings()
	s.mu.Unlock()
	if err != nil {
		return nil, err
	}

	releases, err := s.updater.ListAvailableCtx(ctx, settings)
	if err != nil {
		return nil, err
	}
	for i := range releases {
		if strings.EqualFold(releases[i].TagName, tag) {
			return &releases[i], nil
		}
	}
	return nil, fmt.Errorf("release %s is not available on the configured channel", tag)
}
