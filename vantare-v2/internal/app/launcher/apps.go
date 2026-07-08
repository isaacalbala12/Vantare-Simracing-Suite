package launcher

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/app"
)

// ErrAppNotFound and ErrInvalidConfig live in types.go (Phase 0). Do not
// redefine them here. KnownLaunchMethods also lives in types.go.

// AppsBackend is the slice of SettingsService that apps.go depends on. Defined
// in the consumer (this package) per the repo's "no premature interfaces" rule;
// only the methods used are exposed.
type AppsBackend interface {
	GetLauncherApps() map[string]app.LauncherAppEntry
	SetLauncherApps(map[string]app.LauncherAppEntry) error
	GetLauncherProfiles() []app.LaunchProfile
}

// MergeAppsWithDiscovered merges detected apps into the existing set without
// losing manually-added apps. Rules:
//   - A detected app overwrites an existing one only when the existing entry
//     was itself detected (Detected==true) or did not exist.
//   - Manually-added apps (Detected==false) are preserved.
//   - Detected apps that are no longer reported are dropped.
//
// It returns a NEW map and does not mutate either input.
func MergeAppsWithDiscovered(existing map[string]app.LauncherAppEntry, detected map[string]app.LauncherAppEntry) map[string]app.LauncherAppEntry {
	merged := make(map[string]app.LauncherAppEntry, len(existing)+len(detected))
	for k, v := range existing {
		merged[k] = v
	}
	for id, d := range detected {
		ex, ok := merged[id]
		if !ok || ex.Detected {
			merged[id] = d
		}
	}
	// Drop detected apps that are no longer present in the latest scan.
	for id, ex := range merged {
		if ex.Detected {
			if _, stillThere := detected[id]; !stillThere {
				delete(merged, id)
			}
		}
	}
	return merged
}

// AddManualApp validates and persists a manually-added app.
func AddManualApp(backend AppsBackend, entry app.LauncherAppEntry) error {
	if entry.ID == "" {
		return fmt.Errorf("%w: id is required", ErrInvalidConfig)
	}
	if entry.DisplayName == "" {
		return fmt.Errorf("%w: displayName is required", ErrInvalidConfig)
	}
	if _, ok := KnownLaunchMethods[entry.LaunchMethod]; !ok {
		return fmt.Errorf("%w: launchMethod %q", ErrInvalidConfig, entry.LaunchMethod)
	}
	if entry.LaunchMethod == "executable" && entry.ExecutablePath == "" {
		return fmt.Errorf("%w: executablePath is required for executable method", ErrInvalidConfig)
	}
	entry.Detected = false
	apps := backend.GetLauncherApps()
	if apps == nil {
		apps = map[string]app.LauncherAppEntry{}
	}
	apps[entry.ID] = entry
	return backend.SetLauncherApps(apps)
}

// RemoveApp deletes an app, refusing to remove one still referenced by a
// profile's steps. It reads the profiles from the backend so the caller does
// not have to pass them (no duplicated state).
func RemoveApp(backend AppsBackend, id string) error {
	profiles := backend.GetLauncherProfiles()
	for _, p := range profiles {
		for _, s := range p.Steps {
			if s.AppID == id {
				return fmt.Errorf("launcher: app %q is used by profile %q", id, p.Name)
			}
		}
	}
	apps := backend.GetLauncherApps()
	if _, ok := apps[id]; !ok {
		return ErrAppNotFound
	}
	delete(apps, id)
	return backend.SetLauncherApps(apps)
}
