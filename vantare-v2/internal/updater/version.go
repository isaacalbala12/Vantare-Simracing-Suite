package updater

import (
	"regexp"
	"strconv"
	"strings"
)

var semverRE = regexp.MustCompile(`(?i)^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[-+.]?(.*))?`)

// Version represents a parsed semantic-ish version tag.
type Version struct {
	Major  int
	Minor  int
	Patch  int
	Build  int
	Suffix string
	Raw    string
}

// ParseVersion extracts a Version from a tag like "v0.1.4-prealpha" or "1.2.3".
func ParseVersion(tag string) Version {
	m := semverRE.FindStringSubmatch(tag)
	if m == nil {
		return Version{Raw: tag}
	}
	major, _ := strconv.Atoi(m[1])
	minor, _ := strconv.Atoi(m[2])
	patch, _ := strconv.Atoi(m[3])
	build, _ := strconv.Atoi(m[4])
	return Version{
		Major:  major,
		Minor:  minor,
		Patch:  patch,
		Build:  build,
		Suffix: m[5],
		Raw:    tag,
	}
}

// Compare returns -1 if v is older than other, 0 if equal, 1 if newer.
// It ignores suffixes because tags in this repo use pre-release suffixes
// but ordering is chronological from GitHub. Suffix comparison is used
// as a tie-breaker when numeric parts are equal.
func (v Version) Compare(other Version) int {
	if v.Major != other.Major {
		if v.Major < other.Major {
			return -1
		}
		return 1
	}
	if v.Minor != other.Minor {
		if v.Minor < other.Minor {
			return -1
		}
		return 1
	}
	if v.Patch != other.Patch {
		if v.Patch < other.Patch {
			return -1
		}
		return 1
	}
	if v.Build != other.Build {
		if v.Build < other.Build {
			return -1
		}
		return 1
	}
	// Same numeric version; treat empty suffix (stable) as newer than any suffix.
	if v.Suffix == other.Suffix {
		return 0
	}
	if v.Suffix == "" {
		return 1
	}
	if other.Suffix == "" {
		return -1
	}
	return strings.Compare(v.Suffix, other.Suffix)
}

// IsNewerThan returns true if v is strictly newer than other.
func (v Version) IsNewerThan(other Version) bool {
	return v.Compare(other) > 0
}
