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

// telemetryTrackNames is the reviewed identity boundary between the literal
// venue names published in the LMU calendar and TrackName in imported LMU
// telemetry. Keys are deliberately the complete calendar value: text in
// parentheses is not parsed because it can mean either a layout or a ruleset.
var telemetryTrackNames = map[string]string{
	"Bahrain (Outer)":  "Bahrain International Circuit",
	"Barcelona (ELMS)": "Circuit de Barcelona",
	"COTA (WEC)":       "Circuit of the Americas",
	"Daytona (RC)":     "Daytona International Speedway",
	"Fuji (WEC)":       "Fuji Speedway",
	"Laguna Seca (RC)": "WeatherTech Raceway Laguna Seca",
	"Le Mans (WEC)":    "Circuit de la Sarthe",
	"Qatar (Short)":    "Lusail International Circuit",
	"Sebring (WEC)":    "Sebring International Raceway",
	"Spa (WEC)":        "Circuit de Spa-Francorchamps",
}

// telemetryClassNames is the equivalent reviewed boundary for the structured
// calendar class and CarClass in imported telemetry. No alias, case folding or
// substring matching is admitted here.
var telemetryClassNames = map[string]string{
	"Hypercar": "Hyper",
	"LMGT3":    "GT3",
	"LMGTE Am": "GTE",
	"LMP2":     "LMP2_ELMS",
	"LMP3":     "LMP3",
}

// TelemetryTrackName returns the exact telemetry TrackName declared for a
// complete calendar Track value. Unknown calendar names remain unresolved.
func TelemetryTrackName(calendarTrack string) (string, bool) {
	name, ok := telemetryTrackNames[calendarTrack]
	return name, ok
}

// TelemetryClassName returns the exact telemetry CarClass declared for a
// structured calendar class. Unknown classes remain unresolved.
func TelemetryClassName(calendarClass string) (string, bool) {
	name, ok := telemetryClassNames[calendarClass]
	return name, ok
}

// resolveTelemetryIdentities attaches only locally reviewed identities. It
// clears any values supplied by decoded JSON so a published schedule cannot
// silently redefine the join between Calendar and Telemetry Analysis.
func resolveTelemetryIdentities(schedule *OfficialSchedule) {
	for i := range schedule.Series {
		series := &schedule.Series[i]
		series.TelemetryTrackName = ""
		if name, ok := TelemetryTrackName(series.Track); ok {
			series.TelemetryTrackName = name
		}
		for j := range series.Classes {
			class := &series.Classes[j]
			class.TelemetryClassName = ""
			if name, ok := TelemetryClassName(class.Name); ok {
				class.TelemetryClassName = name
			}
		}
	}
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
