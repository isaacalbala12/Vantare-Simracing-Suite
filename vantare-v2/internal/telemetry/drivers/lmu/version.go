package lmu

import (
	"errors"
	"strings"
)

const supportedLMUVersion = "1.3.0.0"

var ErrBuildUnavailable = errors.New("LMU build evidence unavailable")

var supportedLMUVersions = map[string]struct{}{supportedLMUVersion: {}}

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

func (evidence BuildEvidence) supportedVersion() (string, bool) {
	for _, candidate := range []string{evidence.FileVersion, evidence.ProductVersion} {
		normalized, ok := normalizeVersion(candidate)
		if !ok {
			continue
		}
		if _, allowed := supportedLMUVersions[normalized]; allowed {
			return normalized, true
		}
	}
	return "", false
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
