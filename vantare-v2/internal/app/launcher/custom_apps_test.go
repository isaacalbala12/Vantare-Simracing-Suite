package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestCustomAppIDIsNamespacedAndDiscriminated(t *testing.T) {
	// The prefix keeps a user app from ever shadowing a catalogued one.
	if got := CustomAppID("OBS Studio", filepath.Join("C:", "x", "obs64.exe")); !IsCustomAppID(got) {
		t.Fatalf("CustomAppID(%q) = %q, want a custom-namespaced id", "OBS Studio", got)
	}
	// Two different executables sharing a display name are two different apps.
	first := CustomAppID("obs", filepath.Join("C:", "x", "obs64.exe"))
	second := CustomAppID("obs", filepath.Join("C:", "x", "obs32.exe"))
	if first == second {
		t.Fatalf("two executables with the same name must not share id %q", first)
	}
	// Same name and same executable is the same app, so the id must be stable
	// no matter how the name is punctuated or where the file lives.
	if a, b := CustomAppID("Mi App", filepath.Join("C:", "x", "app.exe")), CustomAppID("mi app!", filepath.Join("D:", "y", "app.exe")); a != b {
		t.Fatalf("id is not stable: %q vs %q", a, b)
	}
	if got := CustomAppID("", ""); got != "" {
		t.Fatalf("CustomAppID with nothing to work from = %q, want empty", got)
	}
	if IsCustomAppID("lmu") {
		t.Fatal("an official catalog id must never read as custom")
	}
}

func TestCustomAppAbbreviation(t *testing.T) {
	cases := map[string]string{
		"Mi App":     "MA",
		"SimHub":     "SIM",
		"a":          "A",
		"Race Lab X": "RL",
		"...":        "··",
	}
	for name, want := range cases {
		if got := CustomAppAbbreviation(name); got != want {
			t.Fatalf("CustomAppAbbreviation(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestNewCustomAppEntryDerivesCatalogMetadata(t *testing.T) {
	exe := filepath.Join(t.TempDir(), "myapp.exe")
	if err := os.WriteFile(exe, []byte("stub"), 0o600); err != nil {
		t.Fatalf("write exe: %v", err)
	}
	entry, err := NewCustomAppEntry("  Mi App  ", exe)
	if err != nil {
		t.Fatalf("NewCustomAppEntry: %v", err)
	}
	if entry.DisplayName != "Mi App" {
		t.Fatalf("DisplayName = %q, want trimmed", entry.DisplayName)
	}
	if entry.LaunchMethod != "executable" || entry.ExecutablePath != exe || entry.UserExecutablePath != exe {
		t.Fatalf("launch fields not derived: %+v", entry)
	}
	if entry.Category != app.AppCategoryUtility {
		t.Fatalf("Category = %q, want utility", entry.Category)
	}
	// A custom app is not catalogued: that is exactly how the UI tells it apart
	// from an official entry and offers to delete it.
	if entry.Availability.Catalogued {
		t.Fatal("a custom app must never be reported as catalogued")
	}
	if !entry.Availability.Launchable || !entry.Availability.Installed {
		t.Fatalf("an existing executable must be launchable: %+v", entry.Availability)
	}
	if entry.GradientFrom == "" || entry.GradientTo == "" || entry.Abbreviation == "" {
		t.Fatalf("monogram fields missing: %+v", entry)
	}
	if entry.Detected {
		t.Fatal("a custom app is not detected")
	}
}

func TestNewCustomAppEntryRejectsIncompleteInput(t *testing.T) {
	exe := filepath.Join(t.TempDir(), "ok.exe")
	if err := os.WriteFile(exe, []byte("stub"), 0o600); err != nil {
		t.Fatalf("write exe: %v", err)
	}
	cases := []struct{ name, path string }{
		{"", exe},
		{"Mi App", ""},
		{"Mi App", filepath.Join(t.TempDir(), "missing.exe")},
		{"...", exe},
	}
	for _, c := range cases {
		_, err := NewCustomAppEntry(c.name, c.path)
		if err == nil {
			t.Fatalf("NewCustomAppEntry(%q, %q) accepted invalid input", c.name, c.path)
		}
		var appErr *LauncherAppError
		if !errors.As(err, &appErr) || appErr.Code != "invalid_custom_app" {
			t.Fatalf("error for (%q,%q) = %v, want a typed invalid_custom_app", c.name, c.path, err)
		}
	}
}

// A custom app must survive a rescan: MergeAppsWithDiscovered only drops
// entries it detected itself.
func TestAddCustomAppSurvivesDiscovery(t *testing.T) {
	exe := filepath.Join(t.TempDir(), "myapp.exe")
	if err := os.WriteFile(exe, []byte("stub"), 0o600); err != nil {
		t.Fatalf("write exe: %v", err)
	}
	backend := &fakeAppsBackend{apps: map[string]app.LauncherAppEntry{}}
	entry, err := AddCustomApp(backend, "Mi App", exe)
	if err != nil {
		t.Fatalf("AddCustomApp: %v", err)
	}
	if _, ok := backend.apps[entry.ID]; !ok {
		t.Fatalf("app %q was not persisted", entry.ID)
	}
	merged := MergeAppsWithDiscovered(backend.apps, map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", Detected: true, DisplayName: "OBS Studio"},
	})
	if _, ok := merged[entry.ID]; !ok {
		t.Fatalf("custom app %q was dropped by a rescan", entry.ID)
	}
}

// Removing a custom app is the counterpart of adding one; it must refuse while
// a profile still points at it, so a chain never loses a step behind the
// user's back.
func TestRemoveCustomAppRespectsProfiles(t *testing.T) {
	exe := filepath.Join(t.TempDir(), "myapp.exe")
	if err := os.WriteFile(exe, []byte("stub"), 0o600); err != nil {
		t.Fatalf("write exe: %v", err)
	}
	backend := &fakeAppsBackend{apps: map[string]app.LauncherAppEntry{}}
	entry, err := AddCustomApp(backend, "Mi App", exe)
	if err != nil {
		t.Fatalf("AddCustomApp: %v", err)
	}
	backend.profiles = []app.LaunchProfile{{
		ID: "creator", Name: "Creador",
		Steps: []app.LaunchStep{{AppID: entry.ID}},
	}}
	if err := RemoveApp(backend, entry.ID); err == nil {
		t.Fatal("removing an app used by a profile must fail")
	}
	backend.profiles = nil
	if err := RemoveApp(backend, entry.ID); err != nil {
		t.Fatalf("RemoveApp: %v", err)
	}
	if _, ok := backend.apps[entry.ID]; ok {
		t.Fatalf("app %q was not removed", entry.ID)
	}
}
