package launcher

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/vantare/overlays/v2/internal/app"
)

// discoveredCandidate is a raw entry read from the system (registry, paths).
type discoveredCandidate struct {
	DisplayName     string
	InstallLocation string
	Publisher       string
}

// findFirstExisting returns the first name from the list whose path exists
// directly under basePath. Returns "" when none match.
func findFirstExisting(basePath string, names []string) string {
	for _, name := range names {
		candidate := filepath.Join(basePath, name)
		if fileExists(candidate) {
			return candidate
		}
	}
	return ""
}

// findExecutableRecursive searches root recursively (up to maxDepth) for a file
// whose name matches one of the targets (case-insensitive). Returns "" if none.
func findExecutableRecursive(root string, names []string, maxDepth int) string {
	if root == "" || maxDepth < 0 {
		return ""
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if e.IsDir() && maxDepth > 0 {
			if found := findExecutableRecursive(filepath.Join(root, e.Name()), names, maxDepth-1); found != "" {
				return found
			}
			continue
		}
		name := strings.ToLower(e.Name())
		for _, target := range names {
			if name == strings.ToLower(target) {
				return filepath.Join(root, e.Name())
			}
		}
	}
	return ""
}

// matchKnownApps turns raw candidates (from registry/paths) into detected
// app.LauncherAppEntry values. Matching is case-insensitive by DisplayNameMatchers.
// The first known app whose matchers all hit wins per candidate; each known app
// is recorded at most once.
func matchKnownApps(candidates []discoveredCandidate) map[string]app.LauncherAppEntry {
	found := map[string]app.LauncherAppEntry{}
	for _, c := range candidates {
		nameLower := strings.ToLower(c.DisplayName)
		for _, known := range KnownApps {
			if _, ok := found[known.ID]; ok {
				continue
			}
			matched := true
			for _, m := range known.DisplayNameMatchers {
				if !strings.Contains(nameLower, strings.ToLower(m)) {
					matched = false
					break
				}
			}
			if !matched {
				continue
			}
			entry := app.LauncherAppEntry{
				ID:           known.ID,
				DisplayName:  known.DisplayName,
				Abbreviation: known.Abbreviation,
				Category:     app.LauncherAppCategory(known.Category),
				LaunchMethod: known.LaunchMethod,
				SteamAppID:   known.SteamAppID,
				Detected:     true,
				GradientFrom: known.GradientFrom,
				GradientTo:   known.GradientTo,
			}
			if known.LaunchMethod == "executable" && c.InstallLocation != "" {
				entry.ExecutablePath = findFirstExisting(c.InstallLocation, known.ExecutableNames)
				if entry.ExecutablePath == "" {
					entry.ExecutablePath = findExecutableRecursive(c.InstallLocation, known.ExecutableNames, 3)
				}
			}
			found[known.ID] = entry
		}
	}
	return found
}

// probeKnownPaths supplements registry discovery with known install paths
// (expanding %env% templates) for apps not yet found. It returns a NEW map and
// does not mutate the input.
func probeKnownPaths(found map[string]app.LauncherAppEntry) map[string]app.LauncherAppEntry {
	out := make(map[string]app.LauncherAppEntry, len(found))
	for k, v := range found {
		out[k] = v
	}
	for _, known := range KnownApps {
		if _, ok := out[known.ID]; ok {
			continue
		}
		if known.LaunchMethod != "executable" {
			continue
		}
		for _, p := range known.KnownPaths {
			expanded := os.ExpandEnv(p)
			if expanded == "" {
				continue
			}
			exe := findFirstExisting(expanded, known.ExecutableNames)
			if exe == "" {
				exe = findExecutableRecursive(expanded, known.ExecutableNames, 2)
			}
			if exe != "" {
				out[known.ID] = app.LauncherAppEntry{
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
				break
			}
		}
	}
	return out
}

// Discover detects installed apps. On Windows it reads the registry and known
// paths; on other platforms it returns only the default (LMU) entry. LMU is
// always present because it launches via steam-uri and needs no executable.
func Discover() map[string]app.LauncherAppEntry {
	found := discoverPlatform() // provided by discovery_windows.go or discovery_stub.go
	found = probeKnownPaths(found)
	if _, ok := found["lmu"]; !ok {
		known := KnownAppsByID["lmu"]
		found["lmu"] = app.LauncherAppEntry{
			ID:           known.ID,
			DisplayName:  known.DisplayName,
			Abbreviation: known.Abbreviation,
			Category:     app.AppCategorySimulator,
			LaunchMethod: known.LaunchMethod,
			SteamAppID:   known.SteamAppID,
			Detected:     false,
			GradientFrom: known.GradientFrom,
			GradientTo:   known.GradientTo,
		}
	}
	return found
}
