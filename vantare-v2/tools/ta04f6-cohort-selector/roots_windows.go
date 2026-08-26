//go:build windows

package main

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"golang.org/x/sys/windows/registry"
)

var steamVDFPathV1 = regexp.MustCompile(`"path"\s+"([^"]+)"`)

func resolveLMUInstallPlatformV1() (string, error) {
	steam := ""
	if key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Valve\Steam`, registry.READ); err == nil {
		value, _, readErr := key.GetStringValue("SteamPath")
		_ = key.Close()
		if readErr == nil {
			steam = value
		}
	}
	if steam == "" {
		steam = filepath.Join(os.Getenv("ProgramFiles(x86)"), "Steam")
	}
	if !filepath.IsAbs(steam) {
		return "", invalid()
	}
	libraries := []string{filepath.Clean(steam)}
	if data, err := os.ReadFile(filepath.Join(steam, "steamapps", "libraryfolders.vdf")); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			match := steamVDFPathV1.FindStringSubmatch(scanner.Text())
			if len(match) == 2 {
				path := strings.ReplaceAll(match[1], `\\`, `\`)
				if filepath.IsAbs(path) {
					libraries = append(libraries, filepath.Clean(path))
				}
			}
		}
	}
	seen := map[string]bool{}
	for _, library := range libraries {
		key := strings.ToLower(library)
		if seen[key] {
			continue
		}
		seen[key] = true
		install := filepath.Join(library, "steamapps", "common", "Le Mans Ultimate")
		manifest := filepath.Join(library, "steamapps", "appmanifest_2399420.acf")
		if regularNoReparseV1(manifest) == nil && directoryNoReparseV1(install) == nil {
			return install, nil
		}
	}
	return "", invalid()
}
