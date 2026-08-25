package calendar

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ImportDailySchedule turns the plain-text weekly schedule LMU publishes into
// an OfficialSchedule. The text looks like this:
//
//	Daily Race Schedule from: 4th August 2026
//	Beginner [Bronze SR]
//	starts every 15min, 20m races, 20 car splits, high assists allowed, tyre warmers enabled, tyres: 8
//	LMGT3 Fixed: Bahrain (Outer), LMGT3 Class, fixed setup
//	...
//	Weekly Races (Solo)
//	WEC Weekly [SR S2]: Barcelona (ELMS), Hypercar & LMGT3 classes, 44 car splits, 100m races, open setup, no tyre warmers, tyres: 10
//	UTC Days & Times: Tue Wed Thu Mon @ 02:00 06:00 09:00
//
// A tier header states the defaults for every series under it; a series line
// may override any of them. Series inherit rather than repeat, which is how the
// source document reads and the only way the two stay in step.
func ImportDailySchedule(text string) (OfficialSchedule, error) {
	lines := splitScheduleLines(text)
	if len(lines) == 0 {
		return OfficialSchedule{}, fmt.Errorf("import schedule: empty document")
	}

	validFrom, err := parseScheduleHeader(lines[0])
	if err != nil {
		return OfficialSchedule{}, err
	}

	sched := OfficialSchedule{
		Version:    1,
		Timezone:   "UTC",
		ValidFrom:  validFrom,
		ValidUntil: validFrom.AddDate(0, 0, 7),
		Updated:    validFrom,
	}

	var (
		tier            string
		defaults        tierDefaults
		ids             = map[string]int{}
		lastSeriesIndex = -1
	)
	for _, line := range lines[1:] {
		switch {
		case isTierHeader(line):
			tier, defaults = parseTierHeader(line)

		case strings.HasPrefix(line, "starts every"), isTierDefaultsLine(line):
			if tier == "" {
				return OfficialSchedule{}, fmt.Errorf("import schedule: defaults line before any tier: %q", line)
			}
			applyTierDefaults(&defaults, line)

		case strings.HasPrefix(line, "UTC Days & Times:"):
			if len(sched.Series) == 0 {
				return OfficialSchedule{}, fmt.Errorf("import schedule: schedule line before any series: %q", line)
			}
			rec, err := parseWeeklySlots(strings.TrimPrefix(line, "UTC Days & Times:"))
			if err != nil {
				return OfficialSchedule{}, err
			}
			sched.Series[len(sched.Series)-1].Recurrence = rec

		case strings.HasPrefix(line, "IMPORTANT:"):
			// The advisory trails the series it belongs to.
			if lastSeriesIndex >= 0 {
				last := &sched.Series[lastSeriesIndex]
				last.Notes = append(last.Notes, strings.TrimSpace(strings.TrimPrefix(line, "IMPORTANT:")))
			}

		case strings.HasPrefix(line, "Race start:"):
			if lastSeriesIndex >= 0 {
				sched.Series[lastSeriesIndex].InGameStartTime = strings.TrimSpace(strings.TrimPrefix(line, "Race start:"))
			}

		case isSourceNote(line):
			sched.SourceNotes = append(sched.SourceNotes, line)

		case hasSeriesSeparator(line):
			if tier == "" {
				return OfficialSchedule{}, fmt.Errorf("import schedule: series before any tier: %q", line)
			}
			s, err := parseSeriesLine(line, tier, defaults)
			if err != nil {
				return OfficialSchedule{}, err
			}
			ids[s.ID]++
			if n := ids[s.ID]; n > 1 {
				s.ID = fmt.Sprintf("%s-%d", s.ID, n)
			}
			sched.Series = append(sched.Series, s)
			lastSeriesIndex = len(sched.Series) - 1
		}
	}

	if len(sched.Series) == 0 {
		return OfficialSchedule{}, fmt.Errorf("import schedule: no series found")
	}
	if err := validateSchedule(sched); err != nil {
		return OfficialSchedule{}, fmt.Errorf("import schedule: %w", err)
	}
	return sched, nil
}

// tierDefaults holds the values a tier header states once for all its series.
type tierDefaults struct {
	eventKind    string
	format       string
	license      string
	intervalMin  int
	raceMin      int
	splits       int
	assists      string
	tyreWarmers  bool
	tyres        int
	safetyRating string
}

func splitScheduleLines(text string) []string {
	var out []string
	for _, raw := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if line := strings.TrimSpace(raw); line != "" {
			out = append(out, line)
		}
	}
	return out
}

var headerDateRE = regexp.MustCompile(`(?i)from:\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})`)

func parseScheduleHeader(line string) (time.Time, error) {
	m := headerDateRE.FindStringSubmatch(line)
	if m == nil {
		return time.Time{}, fmt.Errorf("import schedule: first line must carry a start date, got %q", line)
	}
	day, _ := strconv.Atoi(m[1])
	month, err := time.Parse("January", strings.Title(strings.ToLower(m[2]))) //nolint:staticcheck // ASCII month names
	if err != nil {
		return time.Time{}, fmt.Errorf("import schedule: unknown month %q", m[2])
	}
	year, _ := strconv.Atoi(m[3])
	return time.Date(year, month.Month(), day, 0, 0, 0, 0, time.UTC), nil
}

var tierHeaderRE = regexp.MustCompile(`^(Beginner|Intermediate|Advanced)\s*\[([^\]]+)\]$`)

func isTierHeader(line string) bool {
	return tierHeaderRE.MatchString(line) ||
		strings.HasPrefix(line, "Weekly Races") ||
		strings.HasPrefix(line, "Special Events")
}

func parseTierHeader(line string) (string, tierDefaults) {
	if strings.HasPrefix(line, "Special Events") {
		return "weekly", tierDefaults{eventKind: "special", format: "team"}
	}
	if strings.HasPrefix(line, "Weekly Races") {
		// Weekly series carry their own splits, duration and SR on each line.
		return "weekly", tierDefaults{eventKind: "weekly", format: "solo"}
	}
	m := tierHeaderRE.FindStringSubmatch(line)
	return strings.ToLower(m[1]), tierDefaults{
		eventKind: "daily",
		format:    "solo",
		license:   strings.TrimSpace(m[2]),
	}
}

func isSourceNote(line string) bool {
	return strings.HasPrefix(line, "👀") || strings.HasPrefix(line, "Schedule testing continues")
}

// isTierDefaultsLine spots the settings line under a tier header. It has no
// series name, so it never contains the "Name: track" colon of a series line.
func isTierDefaultsLine(line string) bool {
	return !strings.Contains(line, ":") && strings.Contains(line, "car splits")
}

var (
	intervalRE  = regexp.MustCompile(`starts every (\d+)\s*min`)
	raceMinRE   = regexp.MustCompile(`(\d+)m races`)
	splitsRE    = regexp.MustCompile(`(\d+) car splits`)
	tyresRE     = regexp.MustCompile(`tyres:\s*(\d+)`)
	assistsRE   = regexp.MustCompile(`(?i)((?:no|low|high|medium)\s+assists\s+allowed)`)
	timeScaleRE = regexp.MustCompile(`(\d+)x time scale`)
	veLimitRE   = regexp.MustCompile(`(\d+)%\s*VE\s*Limit`)
	setupRE     = regexp.MustCompile(`(?i)\b(fixed|open) setup\b`)
	srRE        = regexp.MustCompile(`\[([^\]]+)\]`)
	badgeRE     = regexp.MustCompile(`:([^:]+):`)
)

func applyTierDefaults(d *tierDefaults, line string) {
	if m := intervalRE.FindStringSubmatch(line); m != nil {
		d.intervalMin, _ = strconv.Atoi(m[1])
	}
	if m := raceMinRE.FindStringSubmatch(line); m != nil {
		d.raceMin, _ = strconv.Atoi(m[1])
	}
	if m := splitsRE.FindStringSubmatch(line); m != nil {
		d.splits, _ = strconv.Atoi(m[1])
	}
	if m := tyresRE.FindStringSubmatch(line); m != nil {
		d.tyres, _ = strconv.Atoi(m[1])
	}
	if m := assistsRE.FindStringSubmatch(line); m != nil {
		d.assists = capitaliseFirst(strings.TrimSpace(m[1]))
	}
	if warmers, ok := parseTyreWarmers(line); ok {
		d.tyreWarmers = warmers
	}
}

// parseSeriesLine reads "Name: Track (Layout), Classes, 40m races, open setup".
// Everything after the track is an unordered list of attributes, so each one is
// matched by shape rather than by position.
func parseSeriesLine(line, tier string, d tierDefaults) (RaceSeries, error) {
	name, rest, ok := cutSeriesHeader(line)
	if !ok {
		return RaceSeries{}, fmt.Errorf("import schedule: series line has no name: %q", line)
	}
	name = strings.TrimSpace(name)

	safetyRating := d.safetyRating
	var forbiddenBadges []string
	if m := srRE.FindStringSubmatch(name); m != nil {
		bracket := strings.TrimSpace(m[1])
		parts := strings.SplitN(bracket, ",", 2)
		safetyRating = strings.TrimSpace(parts[0])
		if len(parts) == 2 && strings.Contains(strings.ToLower(parts[1]), "badge") {
			for _, badge := range badgeRE.FindAllStringSubmatch(parts[1], -1) {
				forbiddenBadges = append(forbiddenBadges, strings.TrimSpace(badge[1]))
			}
		}
		name = strings.TrimSpace(srRE.ReplaceAllString(name, ""))
	}

	fields := splitTopLevel(rest)
	if len(fields) < 2 {
		return RaceSeries{}, fmt.Errorf("import schedule: series %q needs at least a track and a class", name)
	}

	// Resolved through the identity registry so a renamed series keeps the ID
	// the calendar already stores against it. Tier-prefixed so two tiers can
	// run a series of the same name.
	id, _ := CanonicalSeriesID(tier, name)

	s := RaceSeries{
		ID:              id,
		Name:            name,
		Tier:            tier,
		EventKind:       d.eventKind,
		Format:          d.format,
		LicenseLabel:    d.license,
		Track:           fields[0],
		Splits:          d.splits,
		Assists:         d.assists,
		TyreWarmers:     d.tyreWarmers,
		Tyres:           d.tyres,
		SafetyRating:    safetyRating,
		ForbiddenBadges: forbiddenBadges,
		Recurrence:      Recurrence{Kind: "interval", IntervalMinutes: d.intervalMin},
	}
	raceMin := d.raceMin

	var classFields []string
	for _, f := range fields[1:] {
		switch {
		case setupRE.MatchString(f):
			s.Setup = strings.ToLower(setupRE.FindStringSubmatch(f)[1])
		case raceMinRE.MatchString(f):
			raceMin, _ = strconv.Atoi(raceMinRE.FindStringSubmatch(f)[1])
		case splitsRE.MatchString(f):
			s.Splits, _ = strconv.Atoi(splitsRE.FindStringSubmatch(f)[1])
		case tyresRE.MatchString(f):
			s.Tyres, _ = strconv.Atoi(tyresRE.FindStringSubmatch(f)[1])
		case timeScaleRE.MatchString(f):
			s.TimeScale, _ = strconv.Atoi(timeScaleRE.FindStringSubmatch(f)[1])
		case veLimitRE.MatchString(f):
			s.VELimit, _ = strconv.Atoi(veLimitRE.FindStringSubmatch(f)[1])
		case assistsRE.MatchString(f):
			s.Assists = capitaliseFirst(strings.TrimSpace(assistsRE.FindStringSubmatch(f)[1]))
		case strings.Contains(f, "tyre warmers"):
			if warmers, ok := parseTyreWarmers(f); ok {
				s.TyreWarmers = warmers
			}
		case strings.Contains(strings.ToLower(f), "fair share"):
			s.FairShare = true
		default:
			classFields = append(classFields, f)
		}
	}

	s.VehicleClass = strings.Join(classFields, ", ")
	s.Classes = parseVehicleClasses(classFields)
	for _, c := range s.Classes {
		// "LMGT3 Classes (75% VE)" states the cap on the class rather than on
		// its own field; lift it so the series carries one answer.
		if s.VELimit == 0 {
			if m := regexp.MustCompile(`(\d+)%\s*VE`).FindStringSubmatch(c.Qualifier); m != nil {
				s.VELimit, _ = strconv.Atoi(m[1])
			}
		}
	}

	if raceMin <= 0 {
		return RaceSeries{}, fmt.Errorf("import schedule: series %q has no race duration", name)
	}
	s.DurationMin = raceMin
	s.RaceDurationMin = raceMin
	s.Sessions, s.EventDurationMin = estimateSessions(raceMin)
	return s, nil
}

func hasSeriesSeparator(line string) bool {
	_, _, ok := cutSeriesHeader(line)
	return ok
}

// cutSeriesHeader finds the colon separating "Series name" from its track.
// Team badge restrictions also contain colons inside brackets, so a plain
// strings.Cut would turn that source into a malformed series name.
func cutSeriesHeader(line string) (string, string, bool) {
	var squareDepth, parenDepth int
	for i, r := range line {
		switch r {
		case '[':
			squareDepth++
		case ']':
			if squareDepth > 0 {
				squareDepth--
			}
		case '(':
			parenDepth++
		case ')':
			if parenDepth > 0 {
				parenDepth--
			}
		case ':':
			if squareDepth == 0 && parenDepth == 0 {
				return line[:i], line[i+1:], true
			}
		}
	}
	return "", "", false
}

func parseTyreWarmers(text string) (bool, bool) {
	lower := strings.ToLower(text)
	switch {
	case strings.Contains(lower, "tyre warmers enabled"):
		return true, true
	case strings.Contains(lower, "tyre warmers disabled"):
		return false, true
	case strings.Contains(lower, "no tyre warmers"):
		return false, true
	default:
		return false, false
	}
}

// splitTopLevel splits on commas that are not inside parentheses, so
// "LMP2 (ELMS, full fuel tank) LMP3 (70L fuel tank)" survives as one field.
func splitTopLevel(s string) []string {
	var (
		out   []string
		depth int
		cur   strings.Builder
	)
	for _, r := range s {
		switch r {
		case '(':
			depth++
		case ')':
			if depth > 0 {
				depth--
			}
		case ',':
			if depth == 0 {
				if f := strings.TrimSpace(cur.String()); f != "" {
					out = append(out, f)
				}
				cur.Reset()
				continue
			}
		}
		cur.WriteRune(r)
	}
	if f := strings.TrimSpace(cur.String()); f != "" {
		out = append(out, f)
	}
	return out
}

var classNameRE = regexp.MustCompile(`^([A-Za-z0-9][A-Za-z0-9 .\-]*?)\s*(?:\(([^)]*)\))?$`)

// parseVehicleClasses reads "Hypercar & LMGT3 Classes" or
// "LMP2 (ELMS, full fuel tank) LMP3 (70L fuel tank) & LMGT3 Classes (75% VE)".
// The separators are "&" and, inconsistently, plain spaces between a closing
// bracket and the next class, so the qualifier brackets drive the split.
func parseVehicleClasses(fields []string) []VehicleClass {
	var out []VehicleClass
	for _, field := range fields {
		for _, chunk := range splitClassChunks(field) {
			chunk = strings.TrimSpace(chunk)
			chunk = regexp.MustCompile(`(?i)\s+class(es)?$`).ReplaceAllString(chunk, "")
			if chunk == "" {
				continue
			}
			m := classNameRE.FindStringSubmatch(chunk)
			if m == nil {
				out = append(out, VehicleClass{Name: chunk})
				continue
			}
			name := strings.TrimSpace(m[1])
			name = regexp.MustCompile(`(?i)\s+class(es)?$`).ReplaceAllString(name, "")
			if name == "" {
				continue
			}
			qualifier := strings.TrimSpace(m[2])
			// "Hypercar LMP2 (WEC)" is two classes with nothing but a space
			// between them, and the bracket belongs to the last one. Only split
			// when every token is a class we recognise, so entries like
			// "McLaren 720S LMGT3" stay whole.
			names := splitKnownClassNames(name)
			for i, n := range names {
				vc := VehicleClass{Name: n}
				if i == len(names)-1 {
					vc.Qualifier = qualifier
				}
				out = append(out, vc)
			}
		}
	}
	return out
}

// splitClassChunks breaks a class list into one chunk per class. It splits on
// "&" and on the boundary between a closing bracket and the next name, which
// the schedule writes without any separator at all:
// "LMP2 (ELMS, full fuel tank) LMP3 (70L fuel tank) & LMGT3 Classes".
// RE2 has no lookahead, so the boundary is found by scanning.
func splitClassChunks(field string) []string {
	var b strings.Builder
	runes := []rune(field)
	for i, r := range runes {
		b.WriteRune(r)
		if r != ')' {
			continue
		}
		j := i + 1
		for j < len(runes) && runes[j] == ' ' {
			j++
		}
		if j < len(runes) && isASCIILetter(runes[j]) {
			b.WriteRune('&')
		}
	}
	out := strings.ReplaceAll(b.String(), " & ", "&")
	return strings.Split(out, "&")
}

// knownClassNames are the LMU classes the schedule runs together without a
// separator. Two-word names come first so they match before their prefixes.
var knownClassNames = []string{"LMGTE Am", "LMGTE Pro", "Hypercar", "LMGT3", "LMGTE", "LMP2", "LMP3", "GTE"}

// splitKnownClassNames breaks "Hypercar LMP2" into its two classes. It returns
// the name untouched unless the whole string is a run of known class names, so
// a one-make entry like "McLaren 720S LMGT3" is never chopped up.
func splitKnownClassNames(name string) []string {
	var (
		out  []string
		rest = strings.TrimSpace(name)
	)
	for rest != "" {
		matched := ""
		for _, known := range knownClassNames {
			if len(rest) >= len(known) && strings.EqualFold(rest[:len(known)], known) {
				// Must end at a word boundary: "LMP2" should not match "LMP22".
				if len(rest) == len(known) || rest[len(known)] == ' ' {
					matched = known
					break
				}
			}
		}
		if matched == "" {
			return []string{name}
		}
		out = append(out, matched)
		rest = strings.TrimSpace(rest[len(matched):])
	}
	if len(out) == 0 {
		return []string{name}
	}
	return out
}

func isASCIILetter(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

var (
	weekdayTokenRE = regexp.MustCompile(`^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$`)
	everyNHoursRE  = regexp.MustCompile(`(?i)every\s+(\d+)\s*(?:h|hrs?|hours?)\s+from\s+midnight`)
)

// parseWeeklySlots reads "Tue Wed Thu Mon @ 02:00 06:00" and the shorthand
// "Fri Sat Sun @ every 3h from midnight UTC", which is the same thing written
// as a cadence.
func parseWeeklySlots(spec string) (Recurrence, error) {
	spec = strings.TrimSpace(spec)
	daysPart, timesPart, ok := strings.Cut(spec, "@")
	if !ok {
		// The current Discord message writes the cadence as
		// "Tue Wed Thu Mon, starts every 2hrs from midnight".
		daysPart, timesPart, ok = strings.Cut(spec, ",")
	}
	if !ok {
		return Recurrence{}, fmt.Errorf("import schedule: schedule line has no time separator: %q", spec)
	}

	rec := Recurrence{Kind: "weekly-slots"}
	for _, tok := range strings.Fields(daysPart) {
		if !weekdayTokenRE.MatchString(tok) {
			return Recurrence{}, fmt.Errorf("import schedule: unknown weekday %q", tok)
		}
		rec.Days = append(rec.Days, tok)
	}
	if len(rec.Days) == 0 {
		return Recurrence{}, fmt.Errorf("import schedule: schedule line lists no days: %q", spec)
	}

	if m := everyNHoursRE.FindStringSubmatch(timesPart); m != nil {
		step, _ := strconv.Atoi(m[1])
		if step <= 0 || step > 24 {
			return Recurrence{}, fmt.Errorf("import schedule: invalid hour step %q", m[1])
		}
		for h := 0; h < 24; h += step {
			rec.TimesUTC = append(rec.TimesUTC, fmt.Sprintf("%02d:00", h))
		}
		return rec, nil
	}

	for _, tok := range strings.Fields(timesPart) {
		if strings.EqualFold(tok, "UTC") {
			continue
		}
		normalized, err := normalizeUTCSlot(tok)
		if err != nil {
			return Recurrence{}, err
		}
		rec.TimesUTC = append(rec.TimesUTC, normalized)
	}
	if len(rec.TimesUTC) == 0 {
		return Recurrence{}, fmt.Errorf("import schedule: schedule line lists no times: %q", spec)
	}
	return rec, nil
}

func normalizeUTCSlot(token string) (string, error) {
	if len(token) == 4 {
		if _, err := strconv.Atoi(token); err == nil {
			hour, _ := strconv.Atoi(token[:2])
			minute, _ := strconv.Atoi(token[2:])
			if hour < 24 && minute < 60 {
				return fmt.Sprintf("%02d:%02d", hour, minute), nil
			}
		}
	}
	parsed, err := time.Parse("15:04", token)
	if err != nil {
		return "", fmt.Errorf("import schedule: invalid time %q", token)
	}
	return parsed.Format("15:04"), nil
}

// estimateSessions derives the practice and qualifying blocks around a race.
// LMU does not publish them, so they are marked estimated and kept in step with
// the ratios the bundled seed already used.
func estimateSessions(raceMin int) ([]Session, int) {
	practice := 3
	qualifying := 8
	if raceMin >= 60 {
		practice = 5
		qualifying = 10
	}
	sessions := []Session{
		{Name: "practice", DurationMin: practice, Estimated: true},
		{Name: "qualifying", DurationMin: qualifying, Estimated: true},
		{Name: "race", DurationMin: raceMin, Estimated: false},
	}
	return sessions, practice + qualifying + raceMin
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	return strings.Trim(slugNonAlnum.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

func capitaliseFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
