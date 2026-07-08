package launcher

import "testing"

func TestIsSystemApp(t *testing.T) {
	tests := []struct {
		name string
		c    discoveredCandidate
		want bool
	}{
		{
			name: "system component (SystemComponent=1)",
			c:    discoveredCandidate{DisplayName: "Windows SDK", SystemComponent: 1},
			want: true,
		},
		{
			name: "parent key name set (child product)",
			c:    discoveredCandidate{DisplayName: "VC++ Redist", ParentKeyName: "parent"},
			want: true,
		},
		{
			name: "no remove (system-protected)",
			c:    discoveredCandidate{DisplayName: "Protected App", NoRemove: 1},
			want: true,
		},
		{
			name: "release type Update",
			c:    discoveredCandidate{DisplayName: "KB123", ReleaseType: "Update"},
			want: true,
		},
		{
			name: "release type Hotfix",
			c:    discoveredCandidate{DisplayName: "KB123", ReleaseType: "Hotfix"},
			want: true,
		},
		{
			name: "release type SecurityUpdate",
			c:    discoveredCandidate{DisplayName: "KB123", ReleaseType: "SecurityUpdate"},
			want: true,
		},
		{
			name: "release type ServicePack",
			c:    discoveredCandidate{DisplayName: "SP1", ReleaseType: "ServicePack"},
			want: true,
		},
		{
			name: "empty display name",
			c:    discoveredCandidate{DisplayName: ""},
			want: true,
		},
		{
			name: "no uninstall string and no publisher",
			c:    discoveredCandidate{DisplayName: "Empty Stub"},
			want: true,
		},
		{
			name: "normal app with uninstall string",
			c:    discoveredCandidate{DisplayName: "Spotify", Publisher: "Spotify AB", UninstallString: "spotify.exe"},
			want: false,
		},
		{
			name: "normal app with publisher but no uninstall string",
			c:    discoveredCandidate{DisplayName: "App", Publisher: "Some Corp"},
			want: false,
		},
		{
			name: "normal app with uninstall string but no publisher",
			c:    discoveredCandidate{DisplayName: "App", UninstallString: "uninstall.exe"},
			want: false,
		},
		{
			name: "zero values: SystemComponent=0, NoRemove=0, no ReleaseType",
			c:    discoveredCandidate{DisplayName: "OBS Studio", Publisher: "OBS", UninstallString: "obs.exe"},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsSystemApp(&tt.c)
			if got != tt.want {
				t.Errorf("IsSystemApp(%+v) = %v, want %v", tt.c, got, tt.want)
			}
		})
	}
}

func TestIsFilteredOut(t *testing.T) {
	tests := []struct {
		name string
		c    discoveredCandidate
		want bool
	}{
		{
			name: "system component passes through IsFilteredOut",
			c:    discoveredCandidate{DisplayName: "Windows SDK", SystemComponent: 1},
			want: true,
		},
		{
			name: "Microsoft Corporation publisher",
			c:    discoveredCandidate{DisplayName: "Visual Studio Code", Publisher: "Microsoft Corporation", UninstallString: "x"},
			want: true,
		},
		{
			name: "NVIDIA Corporation publisher",
			c:    discoveredCandidate{DisplayName: "GeForce Experience", Publisher: "NVIDIA Corporation", UninstallString: "x"},
			want: true,
		},
		{
			name: "Intel Corporation publisher",
			c:    discoveredCandidate{DisplayName: "Intel Drivers", Publisher: "Intel Corporation", UninstallString: "x"},
			want: true,
		},
		{
			name: "AMD publisher (partial match)",
			c:    discoveredCandidate{DisplayName: "Radeon Software", Publisher: "AMD", UninstallString: "x"},
			want: true,
		},
		{
			name: "Realtek publisher",
			c:    discoveredCandidate{DisplayName: "Realtek Audio", Publisher: "Realtek Semiconductor Corp.", UninstallString: "x"},
			want: true,
		},
		{
			name: "Qualcomm publisher",
			c:    discoveredCandidate{DisplayName: "Qualcomm Drivers", Publisher: "Qualcomm Incorporated", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'sdk'",
			c:    discoveredCandidate{DisplayName: "Windows SDK", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'runtime'",
			c:    discoveredCandidate{DisplayName: "VC Runtime", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'redistributable'",
			c:    discoveredCandidate{DisplayName: "Visual C++ Redistributable", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'c++'",
			c:    discoveredCandidate{DisplayName: "Microsoft Visual C++", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'vc++'",
			c:    discoveredCandidate{DisplayName: "VC++ Redist", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'visual studio'",
			c:    discoveredCandidate{DisplayName: "Visual Studio Build Tools", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'vs_'",
			c:    discoveredCandidate{DisplayName: "vs_CoreEditorFonts", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'windows sdk'",
			c:    discoveredCandidate{DisplayName: "Windows SDK Build Tools", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'debugger'",
			c:    discoveredCandidate{DisplayName: "Test Debugger", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'test suite'",
			c:    discoveredCandidate{DisplayName: "Test Suite Runner", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'toolset'",
			c:    discoveredCandidate{DisplayName: "Build Toolset", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "name contains 'add-on'",
			c:    discoveredCandidate{DisplayName: "Some Add-on", Publisher: "Corp", UninstallString: "x"},
			want: true,
		},
		{
			name: "Spotify passes through (no match)",
			c:    discoveredCandidate{DisplayName: "Spotify", Publisher: "Spotify AB", UninstallString: "spotify.exe"},
			want: false,
		},
		{
			name: "OBS Studio passes through",
			c:    discoveredCandidate{DisplayName: "OBS Studio", Publisher: "OBS Project", UninstallString: "obs.exe"},
			want: false,
		},
		{
			name: "Discord passes through",
			c:    discoveredCandidate{DisplayName: "Discord", Publisher: "Discord Inc.", UninstallString: "discord.exe"},
			want: false,
		},
		{
			name: "CrewChief passes through",
			c:    discoveredCandidate{DisplayName: "CrewChief", Publisher: "CrewChief", UninstallString: "cc.exe"},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsFilteredOut(&tt.c)
			if got != tt.want {
				t.Errorf("IsFilteredOut(%+v) = %v, want %v", tt.c, got, tt.want)
			}
		})
	}
}
