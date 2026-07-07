package launcher

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/app"
)

// ErrProfileNotFound, ErrProfileDuplicate, ErrInvalidStep and ErrInvalidConfig
// live in types.go (Phase 0). Do not redefine them here.

// ProfilesBackend is the slice of SettingsService that profiles.go depends on.
// Defined in the consumer (this package) per the repo's "no premature
// interfaces" rule; only the methods used are exposed.
type ProfilesBackend interface {
	GetLauncherProfiles() []app.LaunchProfile
	SetLauncherProfiles([]app.LaunchProfile) error
	GetLauncherApps() map[string]app.LauncherAppEntry
}

// ListProfiles returns the persisted launch profiles.
func ListProfiles(backend ProfilesBackend) []app.LaunchProfile {
	return backend.GetLauncherProfiles()
}

// SaveProfile creates or updates a profile (same ID = update). It validates
// that every step's AppID is non-empty and exists among the known apps, and
// that no step has a negative Delay (the minimum is 0).
func SaveProfile(backend ProfilesBackend, profile app.LaunchProfile) error {
	if profile.ID == "" {
		return fmt.Errorf("%w: id is required", ErrInvalidConfig)
	}
	if profile.Name == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidConfig)
	}
	apps := backend.GetLauncherApps()
	for i, s := range profile.Steps {
		if s.AppID == "" {
			return fmt.Errorf("%w: step %d missing appId", ErrInvalidStep, i)
		}
		if _, ok := apps[s.AppID]; !ok {
			return fmt.Errorf("%w: step %d references unknown app %q", ErrInvalidStep, i, s.AppID)
		}
		if s.Delay < 0 {
			return fmt.Errorf("%w: step %d delay negative", ErrInvalidStep, i)
		}
	}
	profiles := backend.GetLauncherProfiles()
	idx := -1
	for i, p := range profiles {
		if p.ID == profile.ID {
			idx = i
			break
		}
	}
	if idx == -1 {
		profiles = append(profiles, profile)
	} else {
		profiles[idx] = profile
	}
	return backend.SetLauncherProfiles(profiles)
}

// DeleteProfile removes a profile by ID. Returns ErrProfileNotFound when the
// ID is unknown.
func DeleteProfile(backend ProfilesBackend, id string) error {
	profiles := backend.GetLauncherProfiles()
	idx := -1
	for i, p := range profiles {
		if p.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return ErrProfileNotFound
	}
	profiles = append(profiles[:idx], profiles[idx+1:]...)
	return backend.SetLauncherProfiles(profiles)
}

// DuplicateProfile copies an existing profile under a new ID and name. It
// validates that the source exists and that the new ID does not collide with
// an existing profile.
func DuplicateProfile(backend ProfilesBackend, id, newID, newName string) error {
	profiles := backend.GetLauncherProfiles()
	var src *app.LaunchProfile
	for i := range profiles {
		if profiles[i].ID == id {
			src = &profiles[i]
			break
		}
	}
	if src == nil {
		return ErrProfileNotFound
	}
	for _, p := range profiles {
		if p.ID == newID {
			return ErrProfileDuplicate
		}
	}
	dup := app.LaunchProfile{
		ID:          newID,
		Name:        newName,
		Description: src.Description,
		Steps:       append([]app.LaunchStep(nil), src.Steps...),
	}
	profiles = append(profiles, dup)
	return backend.SetLauncherProfiles(profiles)
}
