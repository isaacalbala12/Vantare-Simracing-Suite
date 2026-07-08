package launcher

import "strings"

// IsSystemApp applies the 6 Steam-like registry filters to determine if a
// candidate is a system component that should be hidden from the user.
//
//  1. SystemComponent == 1       → system component
//  2. ParentKeyName != ""         → child/update of another product
//  3. NoRemove == 1               → system-protected
//  4. ReleaseType ∈ {Update, Hotfix, SecurityUpdate, ServicePack}
//  5. DisplayName == ""           → no display name
//  6. UninstallString == "" && Publisher == "" → empty stub
func IsSystemApp(c *discoveredCandidate) bool {
	if c.SystemComponent == 1 {
		return true
	}
	if c.ParentKeyName != "" {
		return true
	}
	if c.NoRemove == 1 {
		return true
	}
	switch c.ReleaseType {
	case "Update", "Hotfix", "SecurityUpdate", "ServicePack":
		return true
	}
	if c.DisplayName == "" {
		return true
	}
	if c.UninstallString == "" && c.Publisher == "" {
		return true
	}
	return false
}

// publisherBlacklist contains publisher names whose products are unlikely to be
// games or user-facing applications. Matching is case-insensitive via substring.
var publisherBlacklist = map[string]bool{
	"microsoft corporation": true,
	"intel corporation":     true,
	"nvidia corporation":    true,
	"amd":                   true,
	"realtek":               true,
	"qualcomm":              true,
}

// nameBlacklistPatterns contains display-name substrings that indicate developer
// tooling, SDKs, or system-level packages. Matching is case-insensitive.
var nameBlacklistPatterns = []string{
	"sdk", "runtime", "redistributable", "c++", "vc++",
	"debugger", "test suite", "toolset", "add-on",
	"visual studio", "vs_", "windows sdk",
}

// IsFilteredOut returns true when a candidate should be excluded from the
// "Add Non-Steam Game" list. It applies Steam-like registry heuristics plus
// additional publisher and display-name blacklists for extra precision.
func IsFilteredOut(c *discoveredCandidate) bool {
	if IsSystemApp(c) {
		return true
	}

	pub := strings.ToLower(c.Publisher)
	for bp := range publisherBlacklist {
		if strings.Contains(pub, bp) {
			return true
		}
	}

	nameLower := strings.ToLower(c.DisplayName)
	for _, pattern := range nameBlacklistPatterns {
		if strings.Contains(nameLower, pattern) {
			return true
		}
	}

	return false
}
