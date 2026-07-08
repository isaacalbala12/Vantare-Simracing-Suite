package calendar

import (
	"crypto/rand"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Spanish month and weekday names accepted by the parser. The parser is
// case-insensitive: it lowercases the input first and then looks the value up
// in this table. Months are 1-based; weekdays are kept for the
// "Martes 2 Julio" form and are not semantically validated.
var (
	spanishMonths = map[string]time.Month{
		"enero":      time.January,
		"febrero":    time.February,
		"marzo":      time.March,
		"abril":      time.April,
		"mayo":       time.May,
		"junio":      time.June,
		"julio":      time.July,
		"agosto":     time.August,
		"septiembre": time.September,
		"setiembre":  time.September,
		"octubre":    time.October,
		"noviembre":  time.November,
		"diciembre":  time.December,
	}

	// weekdayNames is intentionally not used for date validation. It is
	// exported via Parse so a future variant can validate weekday consistency.
	weekdayNames = map[string]struct{}{
		"lunes": {}, "martes": {}, "miercoles": {}, "miércoles": {},
		"jueves": {}, "viernes": {}, "sabado": {}, "sábado": {},
		"domingo": {},
	}
)

// IsWeekdayToken reports whether token is a recognized Spanish weekday.
func IsWeekdayToken(token string) bool {
	_, ok := weekdayNames[strings.ToLower(strings.TrimSpace(token))]
	return ok
}

// Parse converts the pasted Discord-style block into a slice of RaceEvent.
// The expected line format is:
//
//	"<DiaSemana opcional> <Dia> <Mes> | <HH:MM> | <Titulo> | <Circuito> | <DuracionMin>"
//
// Empty fields between pipes are allowed and stored as empty. Blank lines and
// lines starting with '#' are ignored. A line that cannot be parsed produces
// an *ErrInvalidLine pointing at the offending line.
func Parse(text, timezone string) ([]RaceEvent, error) {
	loc, err := resolveLocation(timezone)
	if err != nil {
		return nil, err
	}
	return ParseWithReference(text, timezone, time.Now().In(loc))
}

// ParseWithReference behaves like Parse but uses the provided reference time
// instead of time.Now() to resolve rolling-forward of past dates. This makes
// parsing deterministic and testable.
func ParseWithReference(text, timezone string, reference time.Time) ([]RaceEvent, error) {
	loc, err := resolveLocation(timezone)
	if err != nil {
		return nil, err
	}

	refInLoc := reference.In(loc)
	var events []RaceEvent
	lines := strings.Split(text, "\n")
	for i, raw := range lines {
		lineNo := i + 1
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		ev, err := parseLine(trimmed, lineNo, loc, refInLoc)
		if err != nil {
			return nil, err
		}
		events = append(events, ev)
	}
	return events, nil
}

func parseLine(line string, lineNo int, loc *time.Location, reference time.Time) (RaceEvent, error) {
	parts := strings.Split(line, "|")
	if len(parts) < 3 {
		return RaceEvent{}, &ErrInvalidLine{
			Line:   lineNo,
			Reason: "expected at least 3 fields separated by '|' (date, time, title)",
		}
	}
	datePart := strings.TrimSpace(parts[0])
	timePart := strings.TrimSpace(parts[1])
	titlePart := strings.TrimSpace(parts[2])
	if datePart == "" {
		return RaceEvent{}, &ErrInvalidLine{Line: lineNo, Reason: "date is empty"}
	}
	if timePart == "" {
		return RaceEvent{}, &ErrInvalidLine{Line: lineNo, Reason: "time is empty"}
	}
	if titlePart == "" {
		return RaceEvent{}, &ErrInvalidLine{Line: lineNo, Reason: "title is empty"}
	}

	start, err := parseDate(datePart, timePart, loc, reference)
	if err != nil {
		return RaceEvent{}, &ErrInvalidLine{Line: lineNo, Reason: err.Error()}
	}

	ev := RaceEvent{
		Title:     titlePart,
		Sim:       "lmu",
		StartTime: start,
	}
	if len(parts) >= 4 {
		ev.Track = strings.TrimSpace(parts[3])
	}
	if len(parts) >= 5 {
		if raw := strings.TrimSpace(parts[4]); raw != "" {
			d, err := strconv.Atoi(raw)
			if err != nil || d < 0 {
				return RaceEvent{}, &ErrInvalidLine{
					Line:   lineNo,
					Reason: fmt.Sprintf("durationMin must be a non-negative integer, got %q", raw),
				}
			}
			ev.DurationMin = d
		}
	}
	if len(parts) >= 6 {
		ev.Series = strings.TrimSpace(parts[5])
	}
	if len(parts) >= 7 {
		ev.SessionLabel = strings.TrimSpace(parts[6])
	}
	if len(parts) >= 8 {
		ev.RegistrationURL = strings.TrimSpace(parts[7])
	}
	if len(parts) > 8 {
		// Be strict: silently dropping fields is a source of confusion. We
		// allow up to 8 fields and reject the rest.
		return RaceEvent{}, &ErrInvalidLine{
			Line:   lineNo,
			Reason: fmt.Sprintf("too many fields (got %d, max 8)", len(parts)),
		}
	}

	id, err := newParseID()
	if err != nil {
		return RaceEvent{}, &ErrInvalidLine{Line: lineNo, Reason: "generating id"}
	}
	ev.ID = id
	return ev, nil
}

// parseDate handles both "2 Julio" and "Martes 2 Julio" prefixes.
func parseDate(datePart, timePart string, loc *time.Location, reference time.Time) (time.Time, error) {
	hh, mm, err := parseClock(timePart)
	if err != nil {
		return time.Time{}, err
	}

	tokens := strings.Fields(datePart)
	if len(tokens) < 2 {
		return time.Time{}, fmt.Errorf("date %q must include day and month", datePart)
	}

	// Find the day/month pair, skipping an optional leading weekday token.
	day := -1
	month := time.Month(0)
	startIdx := 0
	if _, isWeekday := weekdayNames[strings.ToLower(tokens[0])]; isWeekday && len(tokens) >= 3 {
		startIdx = 1
	}
	if len(tokens)-startIdx < 2 {
		return time.Time{}, fmt.Errorf("date %q must include day and month", datePart)
	}

	dayStr := tokens[startIdx]
	monthStr := tokens[startIdx+1]
	d, err := strconv.Atoi(dayStr)
	if err != nil {
		return time.Time{}, fmt.Errorf("day %q is not a number", dayStr)
	}
	if d < 1 || d > 31 {
		return time.Time{}, fmt.Errorf("day %d is out of range", d)
	}
	day = d

	m, ok := spanishMonths[strings.ToLower(monthStr)]
	if !ok {
		return time.Time{}, fmt.Errorf("unknown month %q", monthStr)
	}
	month = m

	// Year handling: if the user provided extra tokens with a year, honour it.
	year := reference.Year()
	if len(tokens)-startIdx >= 3 {
		if y, err := strconv.Atoi(tokens[startIdx+2]); err == nil {
			if y < 100 {
				y += 2000
			}
			year = y
		}
	}
	// Roll forward when the parsed date is in the past relative to the
	// reference (e.g. December -> January transition).
	candidate := time.Date(year, month, day, hh, mm, 0, 0, loc)
	if candidate.Before(reference) {
		// If the user gave an explicit year, do not roll. Otherwise add a year
		// so the event sits in the future of the reference.
		if len(tokens)-startIdx < 3 {
			candidate = candidate.AddDate(1, 0, 0)
		}
	}
	return candidate, nil
}

func parseClock(value string) (int, int, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("time %q must be HH:MM", value)
	}
	hh, err := strconv.Atoi(parts[0])
	if err != nil || hh < 0 || hh > 23 {
		return 0, 0, fmt.Errorf("time hour %q is invalid", parts[0])
	}
	mm, err := strconv.Atoi(parts[1])
	if err != nil || mm < 0 || mm > 59 {
		return 0, 0, fmt.Errorf("time minute %q is invalid", parts[1])
	}
	return hh, mm, nil
}

func resolveLocation(name string) (*time.Location, error) {
	if strings.TrimSpace(name) == "" {
		name = DefaultTimezone
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("timezone %q: %w", name, err)
	}
	return loc, nil
}

// newParseID returns a small random hex token. The id is only used to anchor
// the event in the dedupe map; uniqueness across runs is not required.
func newParseID() (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return "cal-" + fmt.Sprintf("%x", b[:]), nil
}
