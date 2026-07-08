//go:build windows

package launcher

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"

	"github.com/vantare/overlays/v2/internal/app"

	"golang.org/x/sys/windows/registry"
)

// discoverPlatform reads the Windows uninstall registry (machine-wide and
// per-user) and known Steam library folders, then matches them against the
// KnownApps catalog. It returns the detected apps keyed by KnownApp.ID.
func discoverPlatform() map[string]app.LauncherAppEntry {
	candidates := readUninstallEntries()
	found := matchKnownApps(candidates)

	// Steam library folders can host Steam-installed executables (e.g. future
	// non-steam-uri apps). LMU is steam-uri so it is covered without an exe.
	for _, lib := range readSteamLibraryFolders() {
		common := filepath.Join(lib, "steamapps", "common")
		for _, known := range KnownApps {
			if _, ok := found[known.ID]; ok {
				continue
			}
			if known.LaunchMethod != "executable" || len(known.ExecutableNames) == 0 {
				continue
			}
			exe := findExecutableRecursive(common, known.ExecutableNames, 3)
			if exe != "" {
				found[known.ID] = app.LauncherAppEntry{
					ID:             known.ID,
					DisplayName:    known.DisplayName,
					Abbreviation:   known.Abbreviation,
					Category:       app.LauncherAppCategory(known.Category),
					LaunchMethod:   known.LaunchMethod,
					ExecutablePath: exe,
					Detected:       true,
					GradientFrom:   known.GradientFrom,
					GradientTo:     known.GradientTo,
				}
			}
		}
	}
	return found
}

// readSteamLibraryFolders returns absolute paths to Steam library roots by
// parsing libraryfolders.vdf. The parser is intentionally minimal: it extracts
// the quoted "path" values. Steam's primary install is always included so at
// least the default library is considered.
func readSteamLibraryFolders() []string {
	// SteamPath del registro HKCU\Software\Valve\Steam; fallback a ProgramFiles(x86)\Steam si no existe.
	steamPath := ""
	if k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Valve\Steam`, registry.READ); err == nil {
		sp, _, err := k.GetStringValue("SteamPath")
		k.Close()
		if err == nil && sp != "" {
			steamPath = sp
		}
	}
	if steamPath == "" {
		steamPath = filepath.Join(os.Getenv("ProgramFiles(x86)"), "Steam")
	}
	libs := []string{steamPath}

	vdf := filepath.Join(steamPath, "steamapps", "libraryfolders.vdf")
	f, err := os.Open(vdf)
	if err != nil {
		return libs
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if !strings.Contains(line, `"path"`) {
			continue
		}
		idx := strings.Index(line, `"path"`)
		rest := line[idx+len(`"path"`):]
		start := strings.Index(rest, `"`)
		if start < 0 {
			continue
		}
		end := strings.Index(rest[start+1:], `"`)
		if end < 0 {
			continue
		}
		raw := rest[start+1 : start+1+end]
		// Steam VDF escapes backslashes as \\; normalise to a single separator.
		raw = strings.ReplaceAll(raw, `\\`, `\`)
		if raw != "" {
			libs = append(libs, raw)
		}
	}
	return libs
}
