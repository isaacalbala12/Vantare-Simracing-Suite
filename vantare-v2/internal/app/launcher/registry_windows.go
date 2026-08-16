//go:build windows

package launcher

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// RegistryApp represents a single application entry discovered from the Windows
// Registry uninstall keys. It is the source data for the "Add Non-Steam Game"
// modal.
type RegistryApp struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	ExecutablePath string `json:"executablePath"`
}

const registryListCacheTTL = 60 * time.Second

var registryListCache = struct {
	sync.Mutex
	items   []RegistryApp
	builtAt time.Time
}{}

// ListRegistryApps reads all installed applications from the Windows Registry
// (HKLM + WOW6432Node + HKCU Uninstall keys) using the shared readUninstallEntries
// seam and returns them as a flat list. Entries that match system-component or
// blacklist heuristics (SDKs, drivers, runtimes, etc.) are filtered out.
//
// The result is cached in memory for a short TTL: the modal re-opens often
// and the registry read plus per-entry InstallLocation scans cost tens of ms
// each time, while installs change rarely. A fresh cache entry survives at
// most registryListCacheTTL; there is no manual invalidation because the list
// is only ever displayed, never acted upon from this function.
func ListRegistryApps() []RegistryApp {
	registryListCache.Lock()
	defer registryListCache.Unlock()
	if registryListCache.items != nil && time.Since(registryListCache.builtAt) < registryListCacheTTL {
		return registryListCache.items
	}
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
	registryListCache.items = out
	registryListCache.builtAt = time.Now()
	return out
}

// resetRegistryListCache drops the cached registry listing. Tests use it so
// each case reads fresh state through the readUninstallEntries seam.
func resetRegistryListCache() {
	registryListCache.Lock()
	registryListCache.items = nil
	registryListCache.Unlock()
}
