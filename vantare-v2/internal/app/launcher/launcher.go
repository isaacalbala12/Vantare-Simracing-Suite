// Package launcher is the orchestration service that ties together app
// discovery, the apps registry (detected + manual), the launch-profile CRUD,
// and the chain runner that launches a profile as a cancelable sequence of
// steps. It is a thin delegator: the real logic lives in discovery.go,
// apps.go, profiles.go and chain.go (Fases 1-4). This file only wires them
// and exposes a stable, test-friendly Service surface plus the Wails-style
// event names the frontend depends on.
package launcher

import (
	"context"
	"fmt"

	"github.com/vantare/overlays/v2/internal/app"
)

// LauncherSettingsBackend is the slice of SettingsService the launcher needs.
// Only the methods actually used are exposed; the production
// *app.SettingsService satisfies it, so no extra glue is required.
type LauncherSettingsBackend interface {
	GetLauncherApps() map[string]app.LauncherAppEntry
	SetLauncherApps(map[string]app.LauncherAppEntry) error
	GetLauncherProfiles() []app.LaunchProfile
	SetLauncherProfiles([]app.LaunchProfile) error
}

// Service is the launcher orchestrator. It owns the ChainRunner and delegates
// every other operation to the package-level helpers in apps.go / profiles.go
// / discovery.go. It is safe to use from multiple goroutines because the only
// shared mutable state is wrapped by ChainRunner (its own mutex) and every
// LauncherSettingsBackend is the slice of SettingsService the launcher needs.
type Service struct {
	settings LauncherSettingsBackend
	emit     Emitter
	chain    *ChainRunner
}

// NewService builds the orchestrator. execFn defaults to defaultExecLauncher
// when nil. The ChainRunner it creates reads apps lazily from the settings
// backend so a discovery/add/remove performed after construction is reflected
// in the next launch.
func NewService(settings LauncherSettingsBackend, emit Emitter, execFn execLauncher) *Service {
	if execFn == nil {
		execFn = defaultExecLauncher
	}
	s := &Service{
		settings: settings,
		emit:     emit,
	}
	s.chain = NewChainRunner(s.settings, emit, execFn)
	return s
}

// Settings returns the backend the orchestrator was constructed with. Handlers
// use it to read the live app set when emitting launcher:apps:updated without
// coupling to the concrete *app.SettingsService type.
func (s *Service) Settings() LauncherSettingsBackend { return s.settings }

// DiscoverApps detects installed apps, merges them with the persisted set
// (preserving manual apps) and persists the result. It is named DiscoverApps
// rather than Discover to avoid a name collision with the package-level
// Discover() helper in discovery.go. Emits launcher:apps:detected.
func (s *Service) DiscoverApps() (map[string]app.LauncherAppEntry, error) {
	detected := Discover()
	merged := MergeAppsWithDiscovered(s.settings.GetLauncherApps(), detected)
	if err := s.settings.SetLauncherApps(merged); err != nil {
		return nil, err
	}
	s.emit.Emit("launcher:apps:detected", map[string]any{"apps": merged})
	return merged, nil
}

// AddManualApp delegates to apps.go.
func (s *Service) AddManualApp(entry app.LauncherAppEntry) error {
	return AddManualApp(s.settings, entry)
}

// RemoveApp delegates to apps.go.
func (s *Service) RemoveApp(id string) error {
	return RemoveApp(s.settings, id)
}

// ListProfiles delegates to profiles.go.
func (s *Service) ListProfiles() []app.LaunchProfile {
	return ListProfiles(s.settings)
}

// SaveProfile delegates to profiles.go.
func (s *Service) SaveProfile(profile app.LaunchProfile) error {
	return SaveProfile(s.settings, profile)
}

// DeleteProfile delegates to profiles.go.
func (s *Service) DeleteProfile(id string) error {
	return DeleteProfile(s.settings, id)
}

// DuplicateProfile delegates to profiles.go. Use this to copy an existing
// profile into a new one with a new ID and display name; the steps are cloned
// so the copy can be edited independently.
func (s *Service) DuplicateProfile(id, newID, newName string) error {
	return DuplicateProfile(s.settings, id, newID, newName)
}

// LaunchProfile starts the launch chain for the given profile. It looks up the
// profile, emits launcher:profiles:updated? No — per contract only chain
// progress events are emitted by the runner; the caller decides on success.
// Returns ErrProfileNotFound when there is no profile with the given ID. The
// chain runs on a goroutine (StartChain), so this call returns immediately.
func (s *Service) LaunchProfile(ctx context.Context, profileID string) error {
	profiles := s.settings.GetLauncherProfiles()
	var profile *app.LaunchProfile
	for i := range profiles {
		if profiles[i].ID == profileID {
			profile = &profiles[i]
			break
		}
	}
	if profile == nil {
		return fmt.Errorf("%w: %s", ErrProfileNotFound, profileID)
	}
	s.chain.StartChain(ctx, *profile)
	return nil
}

// CancelChain cancels the active launch chain for a profile, if any.
func (s *Service) CancelChain(profileID string) bool {
	return s.chain.CancelChain(profileID)
}
