package launcher

import (
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
