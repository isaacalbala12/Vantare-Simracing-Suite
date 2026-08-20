package lmu

import (
	"encoding/hex"
	"errors"
	"strings"
)

const (
	supportedLMUVersion   = "1.3.0.0"
	diagnosticLMUVersion  = "1.4.0.0"
	diagnosticLMUVersion1 = "1.4.1.3"
)

// diagnosticLMUVersions is the closed set of builds admitted for capture-time
// structural validation. Every entry is an exact build observed locally; it is
// never a prefix or range match and never promotes a build into
// supportedLMUVersions.
var diagnosticLMUVersions = map[string]struct{}{
	diagnosticLMUVersion:  {},
	diagnosticLMUVersion1: {},
}

var ErrBuildUnavailable = errors.New("LMU build evidence unavailable")

type pinnedFixtureEvidence struct {
	menuSHA256      string
	trackSHA256     string
	restMenuSHA256  string
	restTrackSHA256 string
	requireREST     bool
}

var supportedLMUVersions = map[string]pinnedFixtureEvidence{
	supportedLMUVersion: {
		menuSHA256:  "8fc09829441e11a466bc9ff92e1a667b819eb6cf83cdf16891d7ed756d887f1a",
		trackSHA256: "959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff",
	},
	diagnosticLMUVersion: {
		menuSHA256:      "0567b69abf96ecf4c63594293e29151bd802d6e52f30b5d5ccfb68c36e8aa4e0",
		trackSHA256:     "c2e005362419f1db33df96aab70e9e0d56b627ce4aee02d11b8b9ea49707b0e5",
		restMenuSHA256:  "325d40882d718e7cb36837b0d3f77575eca72008ecef9bdb436325af1a285312",
		restTrackSHA256: "bb89380fb672387b97735b2d318c0c8d0a246eaf2f34adbe799f17daa6f0fa36",
		requireREST:     true,
	},
	// Captured live from LMU 1.4.1.3 with the opt-in harness and persisted in
	// testdata. The menu digest is byte-for-byte the one already pinned for
	// 1.4.0.0: the sanitized menu frame is identical across both builds, which
	// independently confirms the layout did not change.
	diagnosticLMUVersion1: {
		menuSHA256:      "0567b69abf96ecf4c63594293e29151bd802d6e52f30b5d5ccfb68c36e8aa4e0",
		trackSHA256:     "52ff620c80fb464ef7032431fac39e26d547cbde42480bd5238b1c60fcae06b1",
		restMenuSHA256:  "5db40a287ab52d5c85f4101b4ca275854869a59b4717fd7cca4452aeaac31ecb",
		restTrackSHA256: "79f7691e70d936546ec09c4555fda170b6d44e513aced2ae67aecd1c22e92e1e",
		requireREST:     true,
	},
}

type BuildEvidence struct {
	FileVersion    string
	ProductVersion string
}

type compatibilityProfile struct {
	version   string
	supported bool
}

func profileFromBuild(evidence BuildEvidence) compatibilityProfile {
	version, supported := evidence.supportedVersion()
	return compatibilityProfile{version: version, supported: supported}
}

// diagnosticCandidateProfile admits exactly the locally observed 1.4 build
// pair for capture-time structural validation. It is deliberately separate
// from supportedVersion: callers cannot promote a candidate into production.
func diagnosticCandidateProfile(evidence BuildEvidence) (compatibilityProfile, bool) {
	fileVersion, fileOK := normalizeVersion(evidence.FileVersion)
	productVersion, productOK := normalizeVersion(evidence.ProductVersion)
	if !fileOK || !productOK || fileVersion != productVersion {
		return compatibilityProfile{}, false
	}
	if _, candidate := diagnosticLMUVersions[fileVersion]; !candidate {
		return compatibilityProfile{}, false
	}
	return compatibilityProfile{version: fileVersion, supported: true}, true
}

func (evidence BuildEvidence) supportedVersion() (string, bool) {
	filePresent := strings.TrimSpace(evidence.FileVersion) != ""
	productPresent := strings.TrimSpace(evidence.ProductVersion) != ""
	if !filePresent && !productPresent {
		return "", false
	}

	var version string
	if filePresent && productPresent {
		fileVersion, fileOK := normalizeVersion(evidence.FileVersion)
		productVersion, productOK := normalizeVersion(evidence.ProductVersion)
		if !fileOK || !productOK || fileVersion != productVersion {
			return "", false
		}
		version = fileVersion
	} else if filePresent {
		var ok bool
		version, ok = normalizeVersion(evidence.FileVersion)
		if !ok {
			return "", false
		}
	} else {
		var ok bool
		version, ok = normalizeVersion(evidence.ProductVersion)
		if !ok {
			return "", false
		}
	}

	fixtures, allowed := supportedLMUVersions[version]
	if !allowed || !fixtures.pinned() {
		return "", false
	}
	if _, candidate := diagnosticLMUVersions[version]; candidate && (!filePresent || !productPresent) {
		return "", false
	}
	return version, true
}

func hasPinnedSanitizedFixtures(version string) bool {
	fixtures, present := supportedLMUVersions[version]
	return present && fixtures.pinned()
}

func (evidence pinnedFixtureEvidence) pinned() bool {
	if !validSHA256(evidence.menuSHA256) || !validSHA256(evidence.trackSHA256) {
		return false
	}
	return !evidence.requireREST ||
		(validSHA256(evidence.restMenuSHA256) && validSHA256(evidence.restTrackSHA256))
}

func validSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == 32
}

func normalizeVersion(value string) (string, bool) {
	value = strings.TrimSpace(strings.ReplaceAll(value, ",", "."))
	parts := strings.Split(value, ".")
	if len(parts) == 3 {
		parts = append(parts, "0")
	}
	if len(parts) != 4 {
		return "", false
	}
	for _, part := range parts {
		if part == "" {
			return "", false
		}
		for _, char := range part {
			if char < '0' || char > '9' {
				return "", false
			}
		}
	}
	return strings.Join(parts, "."), true
}

type buildProvider func() (BuildEvidence, error)
