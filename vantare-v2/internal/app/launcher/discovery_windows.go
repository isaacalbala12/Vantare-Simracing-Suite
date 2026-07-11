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
			if _, ok := found[known.ID]; ok {
				continue
			}
			if known.LaunchMethod != "executable" || len(known.ExecutableNames) == 0 {
				continue
			}
			exe := findExecutableRecursive(common, known.ExecutableNames, 3)
			if exe != "" {
				found[known.ID] = knownAppEntry(known, DetectionEvidence{Found: true}, exe, "steam")
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
	data, err := os.ReadFile(vdf)
	if err != nil {
		return libs
	}

	libs = append(libs, parseLibraryFoldersVDF(string(data))...)
	return libs
}
