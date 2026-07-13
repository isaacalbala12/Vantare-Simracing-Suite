//go:build windows

package launcher

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/vantare/overlays/v2/internal/app"

	"golang.org/x/sys/windows/registry"
)

// vdfPathRe matches a `"path"` key followed by its quoted value in VDF files.
// Steam's libraryfolders.vdf uses keys of the form:
//
//	"path" "C:\\Program Files (x86)\\Steam"
var vdfPathRe = regexp.MustCompile(`"path"\s+"([^"]+)"`)

// parseLibraryFoldersVDF parses a Steam libraryfolders.vdf string and returns
// the absolute paths of all configured Steam library roots.
func parseLibraryFoldersVDF(content string) []string {
	var paths []string
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		m := vdfPathRe.FindStringSubmatch(scanner.Text())
		if m != nil && m[1] != "" {
			// Steam VDF escapes backslashes as \\; normalise to single separator.
			paths = append(paths, strings.ReplaceAll(m[1], `\\`, `\`))
		}
	}
	return paths
}

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
			if existing, ok := found[known.ID]; ok && existing.ExecutablePath != "" {
				continue
			}
			if len(known.ExecutableNames) == 0 {
				continue
			}
			exe := findExecutableRecursive(common, known.ExecutableNames, 3)
			if exe != "" {
				evidence := DetectionEvidence{Found: true, ExecutableExists: true}
				if known.LaunchMethod == "steam-uri" {
					// The Steam library proves the install and supplies the icon
					// executable, while legacy Detected remains tied to registry
					// evidence for compatibility with older settings consumers.
					evidence.Found = false
					evidence.SteamInstalled = true
					evidence.SteamAppID = known.SteamAppID
				}
				found[known.ID] = knownAppEntry(known, evidence, exe, "steam")
			}
		}
	}

	// Match shortcuts as Windows Explorer does when an uninstall entry or
	// known install path is unavailable. The resolved target becomes the
	// launch/icon path, while the Shell path remains available to the icon
	// resolver for the exact shortcut artwork.
	for _, known := range KnownApps {
		if existing, ok := found[known.ID]; ok && existing.ExecutablePath != "" {
			continue
		}
		shortcut := findDesktopShortcut(known.ExecutableNames)
		if shortcut == "" {
			continue
		}
		target := resolveLnkTarget(shortcut)
		if target == "" || !fileExists(target) {
			continue
		}
		evidence := DetectionEvidence{Found: true, ExecutableExists: true}
		if known.LaunchMethod == "steam-uri" {
			evidence.SteamInstalled = true
			evidence.SteamAppID = known.SteamAppID
		}
		found[known.ID] = knownAppEntry(known, evidence, target, "shortcut")
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
	data, err := os.ReadFile(vdf)
	if err != nil {
		return libs
	}

	libs = append(libs, parseLibraryFoldersVDF(string(data))...)
	return libs
}
