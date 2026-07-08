//go:build windows

package launcher

import "testing"

func TestListRegistryAppsReturnsAllDetected(t *testing.T) {
	original := readUninstallEntries
	defer func() { readUninstallEntries = original }()
	readUninstallEntries = func() []discoveredCandidate {
		return []discoveredCandidate{
			{DisplayName: "Spotify", InstallLocation: `C:\Users\Test\AppData\Roaming\Spotify`},
			{DisplayName: "Notepad", InstallLocation: ""},
		}
	}
	apps := ListRegistryApps()
	if len(apps) != 2 {
		t.Fatalf("expected 2 apps, got %d", len(apps))
	}
	var spotify *RegistryApp
	for i := range apps {
		if apps[i].DisplayName == "Spotify" {
			spotify = &apps[i]
		}
	}
	if spotify == nil {
		t.Fatal("Spotify should be in the list")
	}
	if spotify.ExecutablePath == "" {
		t.Error("Spotify should have a path")
	}
}
