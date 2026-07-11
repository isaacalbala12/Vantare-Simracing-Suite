package launcher

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestMatchKnownApps(t *testing.T) {
	tests := []struct {
		name       string
		candidates []discoveredCandidate
		wantIDs    []string
	}{
		{"lmu by display name", []discoveredCandidate{{DisplayName: "Le Mans Ultimate"}}, []string{"lmu"}},
		{"obs by display name", []discoveredCandidate{{DisplayName: "OBS Studio"}}, []string{"obs"}}, // empty InstallLocation: only name match, no exe lookup
		{"case insensitive", []discoveredCandidate{{DisplayName: "LE MANS ULTIMATE"}}, []string{"lmu"}},
		{"no match", []discoveredCandidate{{DisplayName: "Notepad"}}, []string{}},
		{"multiple", []discoveredCandidate{{DisplayName: "OBS Studio"}, {DisplayName: "Spotify"}}, []string{"obs", "spotify"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchKnownApps(tt.candidates)
			for _, id := range tt.wantIDs {
				if _, ok := got[id]; !ok {
					t.Errorf("missing %s", id)
				}
			}
			if len(got) != len(tt.wantIDs) {
				t.Errorf("got %d entries, want %d", len(got), len(tt.wantIDs))
			}
		})
	}
}

func TestMatchKnownAppsResolvesExecutable(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "obs64.exe")
	if err := os.WriteFile(exe, []byte("MZ"), 0644); err != nil {
		t.Fatal(err)
	}
	got := matchKnownApps([]discoveredCandidate{{DisplayName: "OBS Studio", InstallLocation: dir}})
	obs, ok := got["obs"]
	if !ok {
		t.Fatal("obs not matched")
	}
	if obs.ExecutablePath != exe {
		t.Errorf("expected executable resolved to %q, got %q", exe, obs.ExecutablePath)
	}
	if !obs.Detected {
		t.Errorf("expected Detected true")
	}
}

func TestMatchKnownAppsRegistryWithoutExecutableIsFoundButNotInstalled(t *testing.T) {
	got := matchKnownApps([]discoveredCandidate{{DisplayName: "SimHub"}})

	simhub, ok := got["simhub"]
	if !ok {
		t.Fatal("simhub should be present when the registry identifies it")
	}
	if !simhub.Availability.Catalogued || !simhub.Availability.Found {
		t.Fatalf("expected catalogued and found, got %+v", simhub.Availability)
	}
	if simhub.PathSource != "registry" {
		t.Fatalf("expected registry evidence, got %q", simhub.PathSource)
	}
	if simhub.Availability.Installed || simhub.Availability.Launchable {
		t.Fatalf("registry match without executable must not be launchable, got %+v", simhub.Availability)
	}
}

func TestProbeKnownPathsRepairsAvailabilityPreservingPreferences(t *testing.T) {
	root := t.TempDir()
	installDir := filepath.Join(root, "SimHub")
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(installDir, "SimHub.exe")
	if err := os.WriteFile(exe, []byte("MZ"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PROGRAMFILES", root)

	input := map[string]app.LauncherAppEntry{
		"simhub": {
			ID:          "simhub",
			DisplayName: "SimHub (custom label)",
			Args:        "--profile=night",
			IsFavorite:  true,
			Detected:    true,
			Availability: Availability{
				Catalogued: true,
				Found:      true,
			},
		},
	}

	got := probeKnownPaths(input)
	simhub, ok := got["simhub"]
	if !ok {
		t.Fatal("simhub should remain in the repaired result")
	}
	if simhub.ExecutablePath != exe {
		t.Fatalf("expected repaired executable %q, got %q", exe, simhub.ExecutablePath)
	}
	if simhub.PathSource != "known-path" {
		t.Fatalf("expected known-path evidence, got %q", simhub.PathSource)
	}
	if simhub.Args != "--profile=night" || !simhub.IsFavorite {
		t.Fatalf("probe must preserve preferences, got args=%q favorite=%t", simhub.Args, simhub.IsFavorite)
	}
	if !simhub.Availability.Installed || !simhub.Availability.Launchable {
		t.Fatalf("repaired executable must be installed and launchable, got %+v", simhub.Availability)
	}
}

func TestProbeKnownPathsDoesNotMutateInput(t *testing.T) {
	in := map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate"},
	}
	out := probeKnownPaths(in)
	if len(in) != 1 {
		t.Errorf("input mutated: len=%d", len(in))
	}
	out["obs"] = app.LauncherAppEntry{ID: "obs"}
	if _, ok := in["obs"]; ok {
		t.Errorf("output shares the underlying map with input")
	}
}

func TestProbeKnownPathsSkipsNonExecutable(t *testing.T) {
	// LMU is steam-uri; probeKnownPaths must not invent an entry for it.
	got := probeKnownPaths(map[string]app.LauncherAppEntry{})
	if _, ok := got["lmu"]; ok {
		t.Errorf("probeKnownPaths should not add steam-uri apps; LMU is handled by Discover")
	}
}

func TestDiscoverAlwaysIncludesLMU(t *testing.T) {
	got := Discover()
	lmu, ok := got["lmu"]
	if !ok {
		t.Fatal("lmu must always be present")
	}
	if lmu.LaunchMethod != "steam-uri" {
		t.Errorf("expected lmu launchMethod steam-uri, got %q", lmu.LaunchMethod)
	}
	if lmu.SteamAppID != DefaultLMUSteamAppID {
		t.Errorf("expected SteamAppID %d, got %d", DefaultLMUSteamAppID, lmu.SteamAppID)
	}
}
