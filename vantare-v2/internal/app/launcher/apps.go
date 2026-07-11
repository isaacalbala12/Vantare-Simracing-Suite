package launcher

import (
	"fmt"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/vantare/overlays/v2/internal/app"
)

// LauncherAppError is an actionable, typed error for app configuration
// commands. Callers can expose Code without parsing human-facing text.
type LauncherAppError struct {
	Code    string
	Message string
	AppID   string
}

func (e *LauncherAppError) Error() string {
	if e.AppID == "" {
		return e.Message
	}
	return fmt.Sprintf("%s: %s", e.AppID, e.Message)
}

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

// OfficialAppEntry materializes an official catalog entry for commands that
// need to propose or confirm a merge before discovery has found the app.
func OfficialAppEntry(id string) (app.LauncherAppEntry, bool) {
	known, ok := KnownAppsByID[id]
	if !ok {
		return app.LauncherAppEntry{}, false
	}
	return knownAppEntry(known, DetectionEvidence{}, "", "catalog"), true
}

// ValidateExecutableOverride validates and applies a user-selected path.
// The file must exist before it can become the authoritative launch path.
func ValidateExecutableOverride(entry app.LauncherAppEntry, overridePath string) (app.LauncherAppEntry, error) {
	path := filepath.Clean(strings.TrimSpace(overridePath))
	if entry.LaunchMethod != "executable" {
		return entry, &LauncherAppError{
			Code:    "invalid_executable_override",
			Message: "only executable apps can have a path override",
			AppID:   entry.ID,
		}
	}
	if overridePath == "" || path == "." || !fileExists(path) {
		return entry, &LauncherAppError{
			Code:    "invalid_executable_override",
			Message: "executable path does not exist",
			AppID:   entry.ID,
		}
	}

	catalogued := entry.Availability.Catalogued
	if _, ok := KnownAppsByID[entry.ID]; ok {
		catalogued = true
	}
	entry.ExecutablePath = path
	entry.UserExecutablePath = path
	entry.PathSource = "override"
	entry.Availability = DeriveAvailability(DetectionEvidence{
		Catalogued:       catalogued,
		Found:            true,
		ExecutableExists: true,
	})
	return entry, nil
}

// FindMergeCandidate returns an official catalog ID that resembles a manual
// app. It only proposes a candidate; it never changes settings or profiles.
func FindMergeCandidate(manual app.LauncherAppEntry, catalog []CatalogApp) (string, bool) {
	manualName := normalizeAppName(manual.DisplayName)
	manualExecutable := strings.ToLower(filepath.Base(manual.ExecutablePath))
	for _, official := range catalog {
		if manual.ID == official.ID {
			continue
		}
		if manualName != "" && manualName == normalizeAppName(official.DisplayName) {
			return official.ID, true
		}
		for _, matcher := range official.DisplayNameMatchers {
			if manualName != "" && strings.Contains(manualName, normalizeAppName(matcher)) {
				return official.ID, true
			}
		}
		if manualExecutable != "" {
			for _, processName := range official.ProcessNames {
				if manualExecutable == strings.ToLower(processName) {
					return official.ID, true
				}
			}
			for _, processName := range official.ExecutableNames {
				if manualExecutable == strings.ToLower(processName) {
					return official.ID, true
				}
			}
		}
	}
	return "", false
}

func normalizeAppName(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, value)
}

// MergeManualIntoCatalog applies an explicitly confirmed merge and returns
// cloned profiles whose steps point to the official ID. Inputs are unchanged.
func MergeManualIntoCatalog(manual, catalog app.LauncherAppEntry, profiles []app.LaunchProfile) (app.LauncherAppEntry, []app.LaunchProfile, error) {
	if manual.ID == "" || catalog.ID == "" || manual.ID == catalog.ID {
		return app.LauncherAppEntry{}, nil, &LauncherAppError{
			Code:    "invalid_app_merge",
			Message: "manual and catalog app IDs must be distinct and non-empty",
		}
	}

	merged := catalog
	if manual.UserExecutablePath != "" {
		merged.ExecutablePath = manual.UserExecutablePath
		merged.UserExecutablePath = manual.UserExecutablePath
		merged.PathSource = "override"
	} else if manual.ExecutablePath != "" {
		merged.ExecutablePath = manual.ExecutablePath
		merged.UserExecutablePath = manual.ExecutablePath
		merged.PathSource = "override"
	}
	if manual.Args != "" {
		merged.Args = manual.Args
	}
	merged.IsFavorite = merged.IsFavorite || manual.IsFavorite
	if manual.IconOverridePath != "" {
		merged.IconOverridePath = manual.IconOverridePath
	}
	if manual.Availability.Launchable {
		merged.Availability = manual.Availability
	}

	updatedProfiles := make([]app.LaunchProfile, len(profiles))
	for i, profile := range profiles {
		updatedProfiles[i] = profile
		updatedProfiles[i].Steps = append([]app.LaunchStep(nil), profile.Steps...)
		for stepIndex, step := range updatedProfiles[i].Steps {
			if step.AppID == manual.ID {
				updatedProfiles[i].Steps[stepIndex].AppID = catalog.ID
			}
		}
	}
	return merged, updatedProfiles, nil
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
