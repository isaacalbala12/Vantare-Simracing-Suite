package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

// fakeAppsBackend is an in-memory AppsBackend for tests.
type fakeAppsBackend struct {
	apps     map[string]app.LauncherAppEntry
	profiles []app.LaunchProfile
}

func (f *fakeAppsBackend) GetLauncherApps() map[string]app.LauncherAppEntry {
	return f.apps
}

func (f *fakeAppsBackend) SetLauncherApps(apps map[string]app.LauncherAppEntry) error {
	f.apps = apps
	return nil
}

func (f *fakeAppsBackend) GetLauncherProfiles() []app.LaunchProfile {
	return f.profiles
}

func TestMergeAppsWithDiscovered(t *testing.T) {
	existing := map[string]app.LauncherAppEntry{
		"lmu":    {ID: "lmu", Detected: true, DisplayName: "Le Mans Ultimate"},
		"custom": {ID: "custom", Detected: false, DisplayName: "My App"},
		"old":    {ID: "old", Detected: true, DisplayName: "Stale Detected"},
	}
	detected := map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", Detected: true, DisplayName: "Le Mans Ultimate (updated)"},
		"obs": {ID: "obs", Detected: true, DisplayName: "OBS Studio"},
	}
	merged := MergeAppsWithDiscovered(existing, detected)

	if merged["lmu"].DisplayName != "Le Mans Ultimate (updated)" {
		t.Errorf("detected should overwrite existing detected; got %q", merged["lmu"].DisplayName)
	}
	if _, ok := merged["custom"]; !ok {
		t.Error("manual app (Detected=false) must be preserved")
	}
	if _, ok := merged["obs"]; !ok {
		t.Error("new detected app must be added")
	}
	if _, ok := merged["old"]; ok {
		t.Error("stale detected app no longer reported must be removed")
	}

	// Inputs must not be mutated.
	if len(existing) != 3 {
		t.Errorf("existing input mutated: len=%d", len(existing))
	}
	if len(detected) != 2 {
		t.Errorf("detected input mutated: len=%d", len(detected))
	}
}

func TestMergeAppsWithDiscoveredDoesNotOverwriteManual(t *testing.T) {
	existing := map[string]app.LauncherAppEntry{
		"custom": {ID: "custom", Detected: false, DisplayName: "My Manual App"},
	}
	// A "detected" entry with the same ID must NOT overwrite a manual one.
	detected := map[string]app.LauncherAppEntry{
		"custom": {ID: "custom", Detected: true, DisplayName: "Detected Imposter"},
	}
	merged := MergeAppsWithDiscovered(existing, detected)
	if merged["custom"].DisplayName != "My Manual App" {
		t.Errorf("manual app must win over detected with same ID; got %q", merged["custom"].DisplayName)
	}
	if merged["custom"].Detected {
		t.Error("manual app must stay Detected=false")
	}
}

func TestAddManualApp(t *testing.T) {
	tests := []struct {
		name    string
		entry   app.LauncherAppEntry
		wantErr bool
	}{
		{
			name: "valid executable",
			entry: app.LauncherAppEntry{
				ID: "tool", DisplayName: "My Tool", LaunchMethod: "executable",
				ExecutablePath: "C:\\tools\\tool.exe",
			},
			wantErr: false,
		},
		{
			name: "valid steam-uri",
			entry: app.LauncherAppEntry{
				ID: "lmu2", DisplayName: "LMU 2", LaunchMethod: "steam-uri", SteamAppID: 2399420,
			},
			wantErr: false,
		},
		{
			name:    "empty id",
			entry:   app.LauncherAppEntry{DisplayName: "X", LaunchMethod: "executable", ExecutablePath: "p"},
			wantErr: true,
		},
		{
			name:    "empty displayName",
			entry:   app.LauncherAppEntry{ID: "x", LaunchMethod: "executable", ExecutablePath: "p"},
			wantErr: true,
		},
		{
			name:    "invalid launchMethod",
			entry:   app.LauncherAppEntry{ID: "x", DisplayName: "X", LaunchMethod: "magic"},
			wantErr: true,
		},
		{
			name:    "executable without path",
			entry:   app.LauncherAppEntry{ID: "x", DisplayName: "X", LaunchMethod: "executable"},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			backend := &fakeAppsBackend{apps: map[string]app.LauncherAppEntry{}}
			err := AddManualApp(backend, tt.entry)
			if (err != nil) != tt.wantErr {
				t.Fatalf("wantErr=%v, got err=%v", tt.wantErr, err)
			}
			if tt.wantErr {
				return
			}
			got, ok := backend.apps[tt.entry.ID]
			if !ok {
				t.Fatal("app not persisted")
			}
			if got.Detected {
				t.Error("manual apps must be Detected=false")
			}
		})
	}
}

func TestRemoveApp(t *testing.T) {
	t.Run("used by profile is blocked", func(t *testing.T) {
		backend := &fakeAppsBackend{
			apps: map[string]app.LauncherAppEntry{
				"obs": {ID: "obs", DisplayName: "OBS Studio"},
			},
			profiles: []app.LaunchProfile{
				{ID: "creator", Name: "Creador de Contenido", Steps: []app.LaunchStep{{AppID: "obs", Delay: 2}}},
			},
		}
		err := RemoveApp(backend, "obs")
		if err == nil {
			t.Fatal("expected error removing app used by profile")
		}
		if _, ok := backend.apps["obs"]; !ok {
			t.Error("app must not be removed when referenced by a profile")
		}
	})

	t.Run("unused app removed", func(t *testing.T) {
		backend := &fakeAppsBackend{
			apps: map[string]app.LauncherAppEntry{
				"obs": {ID: "obs", DisplayName: "OBS Studio"},
			},
			profiles: []app.LaunchProfile{},
		}
		if err := RemoveApp(backend, "obs"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, ok := backend.apps["obs"]; ok {
			t.Error("app should have been removed")
		}
	})

	t.Run("nonexistent app returns ErrAppNotFound", func(t *testing.T) {
		backend := &fakeAppsBackend{apps: map[string]app.LauncherAppEntry{}}
		err := RemoveApp(backend, "ghost")
		if err != ErrAppNotFound {
			t.Errorf("expected ErrAppNotFound, got %v", err)
		}
	})
}

func TestValidateExecutableOverridePrioritizesOfficialPath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "obs64.exe")
	if err := os.WriteFile(path, []byte("MZ"), 0o644); err != nil {
		t.Fatal(err)
	}

	entry := app.LauncherAppEntry{
		ID:             "obs",
		DisplayName:    "OBS Studio",
		LaunchMethod:   "executable",
		ExecutablePath: "C:\\old\\obs64.exe",
		PathSource:     "registry",
		Availability:   Availability{Catalogued: true, Found: true},
	}
	updated, err := ValidateExecutableOverride(entry, path)
	if err != nil {
		t.Fatalf("unexpected override error: %v", err)
	}
	if updated.ExecutablePath != path || updated.UserExecutablePath != path {
		t.Fatalf("override path not applied consistently: %+v", updated)
	}
	if updated.PathSource != "override" {
		t.Fatalf("expected override path source, got %q", updated.PathSource)
	}
	if !updated.Availability.Installed || !updated.Availability.Launchable {
		t.Fatalf("valid override must be launchable, got %+v", updated.Availability)
	}
}

func TestValidateExecutableOverrideRejectsMissingPath(t *testing.T) {
	_, err := ValidateExecutableOverride(app.LauncherAppEntry{
		ID:           "obs",
		LaunchMethod: "executable",
	}, filepath.Join(t.TempDir(), "missing.exe"))
	if err == nil {
		t.Fatal("expected missing override path to be rejected")
	}
	var appErr *LauncherAppError
	if !errors.As(err, &appErr) || appErr.Code != "invalid_executable_override" {
		t.Fatalf("expected typed override error, got %T %v", err, err)
	}
}

func TestFindMergeCandidateDoesNotMergeAutomatically(t *testing.T) {
	manual := app.LauncherAppEntry{
		ID:           "manual-obs",
		DisplayName:  "OBS Studio",
		LaunchMethod: "executable",
	}

	candidateID, ok := FindMergeCandidate(manual, OfficialCatalog)
	if !ok || candidateID != "obs" {
		t.Fatalf("expected OBS merge candidate, got id=%q ok=%t", candidateID, ok)
	}
}

func TestMergeManualIntoCatalogPreservesProfiles(t *testing.T) {
	manual := app.LauncherAppEntry{
		ID:             "manual-obs",
		DisplayName:    "OBS Studio",
		LaunchMethod:   "executable",
		ExecutablePath: `C:\Users\Test\obs64.exe`,
		Args:           "--profile=night",
	}
	catalog := app.LauncherAppEntry{
		ID:           "obs",
		DisplayName:  "OBS Studio",
		LaunchMethod: "executable",
		Detected:     true,
	}
	profiles := []app.LaunchProfile{{
		ID:    "creator",
		Name:  "Creator",
		Steps: []app.LaunchStep{{AppID: "manual-obs", Delay: 2}},
	}}

	merged, updatedProfiles, err := MergeManualIntoCatalog(manual, catalog, profiles)
	if err != nil {
		t.Fatalf("unexpected merge error: %v", err)
	}
	if merged.ID != "obs" || merged.ExecutablePath != manual.ExecutablePath || merged.Args != manual.Args {
		t.Fatalf("manual executable preferences not preserved: %+v", merged)
	}
	if len(updatedProfiles) != 1 || updatedProfiles[0].Name != "Creator" || updatedProfiles[0].Steps[0].AppID != "obs" {
		t.Fatalf("profiles were not preserved and rewired: %+v", updatedProfiles)
	}
	if profiles[0].Steps[0].AppID != "manual-obs" {
		t.Fatal("merge must not mutate the input profiles")
	}
}
