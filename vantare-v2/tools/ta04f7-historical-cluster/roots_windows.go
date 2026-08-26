//go:build windows

package main

import (
	"bufio"
	"fmt"
	"golang.org/x/sys/windows/registry"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var steamVDFPath = regexp.MustCompile(`"path"\s+"([^"]+)"`)

func resolveLMUInstallPlatform() (string, error) {
	steam := ""
	if k, e := registry.OpenKey(registry.CURRENT_USER, `Software\Valve\Steam`, registry.READ); e == nil {
		v, _, x := k.GetStringValue("SteamPath")
		_ = k.Close()
		if x == nil {
			steam = v
		}
	}
	if steam == "" {
		steam = filepath.Join(os.Getenv("ProgramFiles(x86)"), "Steam")
	}
	if !filepath.IsAbs(steam) {
		return "", fmt.Errorf("steam")
	}
	libs := []string{filepath.Clean(steam)}
	if data, e := os.ReadFile(filepath.Join(steam, "steamapps", "libraryfolders.vdf")); e == nil {
		s := bufio.NewScanner(strings.NewReader(string(data)))
		for s.Scan() {
			m := steamVDFPath.FindStringSubmatch(s.Text())
			if len(m) == 2 {
				p := strings.ReplaceAll(m[1], `\\`, `\`)
				if filepath.IsAbs(p) {
					libs = append(libs, filepath.Clean(p))
				}
			}
		}
	}
	seen := map[string]bool{}
	for _, l := range libs {
		k := strings.ToLower(l)
		if seen[k] {
			continue
		}
		seen[k] = true
		install := filepath.Join(l, "steamapps", "common", "Le Mans Ultimate")
		if regularNoReparse(filepath.Join(l, "steamapps", "appmanifest_2399420.acf")) == nil && directoryNoReparse(install) == nil {
			return install, nil
		}
	}
	return "", fmt.Errorf("lmu")
}
