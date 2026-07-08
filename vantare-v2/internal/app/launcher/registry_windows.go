//go:build windows

package launcher

import "fmt"

// RegistryApp represents a single application entry discovered from the Windows
// Registry uninstall keys. It is the source data for the "Add Non-Steam Game"
// modal.
type RegistryApp struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	ExecutablePath string `json:"executablePath"`
}

// ListRegistryApps reads all installed applications from the Windows Registry
// (HKLM + WOW6432Node + HKCU Uninstall keys) using the shared readUninstallEntries
// seam and returns them as a flat list. This is the unfiltered system-wide view.
func ListRegistryApps() []RegistryApp {
	candidates := readUninstallEntries()
	out := make([]RegistryApp, 0, len(candidates))
	for i, c := range candidates {
		out = append(out, RegistryApp{
			ID:             fmt.Sprintf("registry-%d", i),
			DisplayName:    c.DisplayName,
			ExecutablePath: c.InstallLocation,
		})
	}
	return out
}
