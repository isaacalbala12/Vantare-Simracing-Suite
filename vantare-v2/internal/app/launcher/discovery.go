package launcher

import (
	"log"
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
	SystemComponent int    // DWORD: 1 = system component
	ParentKeyName   string // non-empty means child of another product
	NoRemove        int    // DWORD: 1 = system-protected
	ReleaseType     string // "Update", "Hotfix", "SecurityUpdate", "ServicePack"
	UninstallString string
}

// expandWindowsEnv expands both Windows-style %VAR% and Go-style $VAR / ${VAR}
// environment variables in s. Unknown variables are left as-is.
func expandWindowsEnv(s string) string {
	result := os.ExpandEnv(s) // handles $VAR and ${VAR}
	// Now handle Windows %VAR% syntax
	var buf strings.Builder
	buf.Grow(len(result))
	for i := 0; i < len(result); i++ {
		if result[i] == '%' {
			end := strings.IndexByte(result[i+1:], '%')
			if end >= 0 {
				key := result[i+1 : i+1+end]
				if val, ok := os.LookupEnv(key); ok {
					buf.WriteString(val)
					i += 1 + end // skip %key%
					continue
				}
			}
		}
		buf.WriteByte(result[i])
	}
	return buf.String()
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

func knownAppEntry(known KnownApp, evidence DetectionEvidence, executablePath, pathSource string) app.LauncherAppEntry {
	evidence.Catalogued = true
	evidence.ExecutableExists = fileExists(executablePath)
	return app.LauncherAppEntry{
		ID:             known.ID,
		DisplayName:    known.DisplayName,
		Abbreviation:   known.Abbreviation,
		Category:       app.LauncherAppCategory(known.Category),
		LaunchMethod:   known.LaunchMethod,
		SteamAppID:     known.SteamAppID,
		ExecutablePath: executablePath,
		Availability:   DeriveAvailability(evidence),
		PathSource:     pathSource,
		Detected:       evidence.Found,
		GradientFrom:   known.GradientFrom,
		GradientTo:     known.GradientTo,
	}
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
			matched := false
			for _, m := range known.DisplayNameMatchers {
				if strings.Contains(nameLower, strings.ToLower(m)) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
			evidence := DetectionEvidence{Found: true}
			if known.LaunchMethod == "steam-uri" && c.InstallLocation != "" {
				evidence.SteamInstalled = true
				evidence.SteamAppID = known.SteamAppID
			}
			entry := knownAppEntry(known, evidence, "", "registry")
			if known.LaunchMethod == "executable" && c.InstallLocation != "" {
				executablePath := findFirstExisting(c.InstallLocation, known.ExecutableNames)
				if executablePath == "" {
					executablePath = findExecutableRecursive(c.InstallLocation, known.ExecutableNames, 3)
				}
				entry = knownAppEntry(known, evidence, executablePath, "registry")
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
		if known.LaunchMethod != "executable" {
			continue
		}
		if existing, ok := out[known.ID]; ok && existing.ExecutablePath != "" {
			continue
		}
		log.Printf("LAUNCHER-DBG: probing %s paths=%v", known.ID, known.KnownPaths)
		if known.ID == "obs" {
			log.Printf("LAUNCHER-DBG: PROGRAMFILES=%q LOCALAPPDATA=%q", os.Getenv("PROGRAMFILES"), os.Getenv("LOCALAPPDATA"))
		}
		for _, p := range known.KnownPaths {
			expanded := expandWindowsEnv(p)
			if expanded == "" {
				continue
			}
			log.Printf("LAUNCHER-DBG: checking dir=%s names=%v", expanded, known.ExecutableNames)
			exe := findFirstExisting(expanded, known.ExecutableNames)
			if exe == "" {
				exe = findExecutableRecursive(expanded, known.ExecutableNames, 2)
			}
			if exe != "" {
				log.Printf("LAUNCHER-DBG: FOUND %s at %s", known.ID, exe)
				if existing, ok := out[known.ID]; ok {
					existing.ExecutablePath = exe
					existing.PathSource = "known-path"
					existing.Availability = DeriveAvailability(DetectionEvidence{
						Catalogued:       true,
						Found:            true,
						ExecutableExists: true,
					})
					out[known.ID] = existing
				} else {
					out[known.ID] = knownAppEntry(known, DetectionEvidence{Found: true}, exe, "known-path")
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
			Availability: DeriveAvailability(DetectionEvidence{Catalogued: true}),
			PathSource:   "catalog",
			Detected:     false,
			GradientFrom: known.GradientFrom,
			GradientTo:   known.GradientTo,
		}
	}
	return found
}
