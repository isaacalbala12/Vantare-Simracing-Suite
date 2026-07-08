//go:build windows

package launcher

import "testing"

func TestListRegistryAppsFiltersOutSystemApps(t *testing.T) {
	original := readUninstallEntries
	defer func() { readUninstallEntries = original }()
	readUninstallEntries = func() []discoveredCandidate {
		return []discoveredCandidate{
			// Real app passes through
			{
				DisplayName:     "Spotify",
				InstallLocation: `C:\Users\Test\AppData\Roaming\Spotify`,
				Publisher:       "Spotify AB",
				UninstallString: "spotify.exe",
			},
			// Microsoft product filtered by publisher blacklist
			{
				DisplayName:     "Visual Studio Code",
				InstallLocation: `C:\Users\Test\AppData\Local\Programs\Microsoft VS Code`,
				Publisher:       "Microsoft Corporation",
				UninstallString: "unins.exe",
			},
			// SDK filtered by name pattern
			{
				DisplayName:     "Windows SDK",
				InstallLocation: `C:\Program Files (x86)\Windows Kits`,
				Publisher:       "Microsoft Corporation",
				UninstallString: "unins.exe",
			},
		}
	}
	apps := ListRegistryApps()
	if len(apps) != 1 {
		t.Fatalf("expected 1 app (Spotify), got %d: %+v", len(apps), apps)
	}
	if apps[0].DisplayName != "Spotify" {
		t.Fatalf("expected Spotify, got %s", apps[0].DisplayName)
	}
	if apps[0].ExecutablePath == "" {
		t.Error("Spotify should have a non-empty path")
	}
}

func TestListRegistryAppsReturnsEmptyWhenAllFiltered(t *testing.T) {
	original := readUninstallEntries
	defer func() { readUninstallEntries = original }()
	readUninstallEntries = func() []discoveredCandidate {
		return []discoveredCandidate{
			{DisplayName: "SDK App", Publisher: "Corp", UninstallString: "x", SystemComponent: 1},
			{DisplayName: "Driver", Publisher: "NVIDIA Corporation", UninstallString: "x"},
		}
	}
	apps := ListRegistryApps()
	if len(apps) != 0 {
		t.Fatalf("expected 0 apps, got %d", len(apps))
	}
}

func TestListRegistryAppsReturnsEmptyWhenNoEntries(t *testing.T) {
	original := readUninstallEntries
	defer func() { readUninstallEntries = original }()
	readUninstallEntries = func() []discoveredCandidate { return nil }
	apps := ListRegistryApps()
	if len(apps) != 0 {
		t.Fatalf("expected 0 apps, got %d", len(apps))
	}
}
