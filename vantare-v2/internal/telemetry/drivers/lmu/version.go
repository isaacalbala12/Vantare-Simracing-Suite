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

	if _, allowed := supportedLMUVersions[version]; !allowed {
		return "", false
	}
	return version, true
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
