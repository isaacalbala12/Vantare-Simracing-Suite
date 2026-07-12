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
	seen := make(map[string]struct{}, len(profile.Steps))
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
		if _, duplicate := seen[s.AppID]; duplicate && !profile.Advanced {
			return fmt.Errorf("%w: duplicate app %q requires advanced mode", ErrInvalidStep, s.AppID)
		}
		seen[s.AppID] = struct{}{}
	}
	profile.Policy = app.NormalizeLaunchPolicy(profile.Policy)
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

// DuplicateProfile copies an existing profile into a new one with newID and
// newName. The steps slice is duplicated so the new profile can be edited
// independently. Returns ErrProfileNotFound when the source is missing,
// ErrProfileDuplicate when newID is already taken, and ErrInvalidConfig when
// newID is empty.
func DuplicateProfile(backend ProfilesBackend, id, newID, newName string) error {
	if newID == "" {
		return fmt.Errorf("%w: new id is required", ErrInvalidConfig)
	}
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
	steps := make([]app.LaunchStep, len(src.Steps))
	copy(steps, src.Steps)
	dup := app.LaunchProfile{
		ID:          newID,
		Name:        newName,
		Description: src.Description,
		Steps:       steps,
	}
	profiles = append(profiles, dup)
	return backend.SetLauncherProfiles(profiles)
}
