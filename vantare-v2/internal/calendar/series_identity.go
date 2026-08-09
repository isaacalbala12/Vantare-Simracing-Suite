package calendar

import (
	"regexp"
	"strings"
)

// Series identity across weekly schedules.
//
// A series ID has to survive the schedule being republished, because the
// calendar stores followed-series IDs against it. The track cannot be part of
// that identity: it rotates every week by design. The name is the stable part,
// but LMU still renames series in place — "LMGT3 Sprint" became "LMGT3 Sprint
// Cup" and "ELMS Sprint" became "ELMS Sprint Trophy" between two consecutive
// schedules, which under a raw slug would silently orphan everyone following
// them.
//
// So names are resolved through a registry of canonical IDs and the aliases
// each has been published under. Anything unrecognised still gets a slug, which
// is the right answer for a genuinely new series; the beginner tier tends to
// repeat week to week while the intermediate and advanced tiers churn, so the
// registry earns its keep mostly at the stable end.

// canonicalSeries maps a canonical, tier-less ID to every name that series has
// been published under, normalised. Add an alias rather than renaming the
// canonical ID: the ID is what the calendar has stored on disk.
var canonicalSeries = map[string][]string{
	"lmgt3-fixed":        {"lmgt3 fixed"},
	"gte-fixed":          {"gte fixed", "lmgte fixed"},
	"lmp3-fixed":         {"lmp3 fixed"},
	"mclaren-challenge":  {"logitech mclaren g challenge", "mclaren g challenge", "mclaren challenge"},
	"lmgt3-sprint":       {"lmgt3 sprint", "lmgt3 sprint cup"},
	"prototype-fixed":    {"prototype fixed"},
	"elms-sprint":        {"elms sprint", "elms sprint trophy"},
	"one-stint-sprint":   {"one stint sprint"},
	"elms-super-60":      {"elms super 60"},
	"wec-xperience":      {"wec xperience"},
	"wec-weekly":         {"wec weekly"},
	"le-mans-24h-scaled": {"2.4h le mans", "24h le mans", "le mans 2.4h"},
}

// aliasIndex is the reverse of canonicalSeries, built once.
var aliasIndex = func() map[string]string {
	idx := make(map[string]string)
	for canonical, aliases := range canonicalSeries {
		for _, alias := range aliases {
			idx[normaliseSeriesName(alias)] = canonical
		}
	}
	return idx
}()

var seriesNameNoise = regexp.MustCompile(`[^a-z0-9]+`)

// normaliseSeriesName reduces a published name to a comparable key: lowercase,
// punctuation collapsed to single spaces. "WEC-Xperience" and "WEC Xperience"
// land on the same key; "2.4h Le Mans" keeps its digits.
func normaliseSeriesName(name string) string {
	return strings.TrimSpace(seriesNameNoise.ReplaceAllString(strings.ToLower(name), " "))
}

// CanonicalSeriesID resolves a published series name to a stable ID within its
// tier. Known names, including previous spellings, keep the ID the calendar has
// already stored. Unknown names fall back to a slug of the name, and the second
// return value reports whether the registry recognised it — the importer uses
// that to tell a rename apart from a genuinely new series.
func CanonicalSeriesID(tier, name string) (string, bool) {
	if canonical, ok := aliasIndex[normaliseSeriesName(name)]; ok {
		return tier + "-" + canonical, true
	}
	return tier + "-" + slugify(name), false
}
