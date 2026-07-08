//go:build windows

package launcher

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

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
// seam and returns them as a flat list. Entries that match system-component or
// blacklist heuristics (SDKs, drivers, runtimes, etc.) are filtered out.
func ListRegistryApps() []RegistryApp {
	candidates := readUninstallEntries()
	out := make([]RegistryApp, 0, len(candidates))
	for i, c := range candidates {
		if IsFilteredOut(&c) {
			continue
		}
		exePath := c.InstallLocation
		if exePath != "" && !strings.HasSuffix(strings.ToLower(exePath), ".exe") {
			if entries, err := os.ReadDir(exePath); err == nil {
				for _, e := range entries {
					if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".exe") {
						exePath = filepath.Join(exePath, e.Name())
						break
					}
				}
			}
		}
		out = append(out, RegistryApp{
			ID:             fmt.Sprintf("registry-%d", i),
			DisplayName:    c.DisplayName,
			ExecutablePath: exePath,
		})
	}
	return out
}
