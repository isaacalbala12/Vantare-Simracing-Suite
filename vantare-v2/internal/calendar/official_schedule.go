package calendar

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	_ "embed"
)

//go:embed seed/lmu-weekly-schedule.json
var weeklyScheduleData []byte

// OfficialSchedule is the root document for the bundled weekly LMU schedule.
// It contains recurrence definitions, not materialised race instances.
type OfficialSchedule struct {
	Version    int          `json:"version"`
	Timezone   string       `json:"timezone"`
	ValidFrom  time.Time    `json:"validFrom"`
	ValidUntil time.Time    `json:"validUntil"`
	Series     []RaceSeries `json:"series"`
	Updated    time.Time    `json:"updated"`
}

// RaceSeries models a single recurring race series in the official LMU
// schedule. Recurrence defines how often the series runs.
type RaceSeries struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Tier         string     `json:"tier"`
	LicenseLabel string     `json:"licenseLabel"`
	Track        string     `json:"track"`
	VehicleClass string     `json:"vehicleClass"`
	Setup        string     `json:"setup"`
	DurationMin  int        `json:"durationMin"`
	Splits       int        `json:"splits"`
	Assists      string     `json:"assists"`
	TyreWarmers  bool       `json:"tyreWarmers"`
	Tyres        int        `json:"tyres"`
	Recurrence   Recurrence `json:"recurrence"`
}

// Recurrence defines how a series repeats. Two kinds are supported:
//
//   - "interval": the series starts every IntervalMinutes, 24/7, within the
//     schedule's valid window.
//   - "weekly-slots": the series runs only on the given Days at the given
//     TimesUTC within the valid window.
type Recurrence struct {
	Kind            string   `json:"kind"`
	IntervalMinutes int      `json:"intervalMinutes,omitempty"`
	Days            []string `json:"days,omitempty"`
	TimesUTC        []string `json:"timesUTC,omitempty"`
}

// validTiers is the allowlist of recognised tier values.
var validTiers = map[string]bool{
	"beginner":     true,
	"intermediate": true,
	"advanced":     true,
	"weekly":       true,
}

// validRecurrenceKinds is the allowlist of recognised recurrence kinds.
var validRecurrenceKinds = map[string]bool{
	"interval":     true,
	"weekly-slots": true,
}

// validWeekdayNames maps the three-letter weekday abbreviations used in the
// JSON to Go's time.Weekday values.
var validWeekdayNames = map[string]time.Weekday{
	"Mon": time.Monday,
	"Tue": time.Tuesday,
	"Wed": time.Wednesday,
	"Thu": time.Thursday,
	"Fri": time.Friday,
	"Sat": time.Saturday,
	"Sun": time.Sunday,
}

// LoadWeeklySchedule reads, validates and returns the embedded weekly schedule.
func LoadWeeklySchedule() (OfficialSchedule, error) {
	var sched OfficialSchedule
	if err := json.Unmarshal(weeklyScheduleData, &sched); err != nil {
		return OfficialSchedule{}, fmt.Errorf("weekly schedule: unmarshal: %w", err)
	}
	if err := validateSchedule(sched); err != nil {
		return OfficialSchedule{}, err
	}
	return sched, nil
}

// validateSchedule checks every field of the schedule document. It returns the
// first problem encountered.
func validateSchedule(sched OfficialSchedule) error {
	if sched.Version <= 0 {
		return fmt.Errorf("weekly schedule: version must be >= 1, got %d", sched.Version)
	}
	if strings.TrimSpace(sched.Timezone) == "" {
		return fmt.Errorf("weekly schedule: timezone is required")
	}
	if _, err := time.LoadLocation(sched.Timezone); err != nil {
		return fmt.Errorf("weekly schedule: timezone %q: %w", sched.Timezone, err)
	}
	if sched.ValidFrom.IsZero() {
		return fmt.Errorf("weekly schedule: validFrom is required")
	}
	if sched.ValidUntil.IsZero() {
		return fmt.Errorf("weekly schedule: validUntil is required")
	}
	if !sched.ValidUntil.After(sched.ValidFrom) {
		return fmt.Errorf("weekly schedule: validUntil must be after validFrom")
	}
	if len(sched.Series) == 0 {
		return fmt.Errorf("weekly schedule: at least one series is required")
	}

	seen := make(map[string]struct{}, len(sched.Series))
	for i, s := range sched.Series {
		if err := validateSeries(s); err != nil {
			return fmt.Errorf("weekly schedule: series[%d] %q: %w", i, s.ID, err)
		}
		if _, dup := seen[s.ID]; dup {
			return fmt.Errorf("weekly schedule: duplicate series ID: %s", s.ID)
		}
		seen[s.ID] = struct{}{}
	}
	return nil
}

// validateSeries checks a single series entry.
func validateSeries(s RaceSeries) error {
	if strings.TrimSpace(s.ID) == "" {
		return fmt.Errorf("id is required")
	}
	if strings.TrimSpace(s.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if !validTiers[s.Tier] {
		return fmt.Errorf("invalid tier %q, must be one of: beginner, intermediate, advanced, weekly", s.Tier)
	}
	if s.DurationMin <= 0 {
		return fmt.Errorf("durationMin must be > 0, got %d", s.DurationMin)
	}
	if s.Splits <= 0 {
		return fmt.Errorf("splits must be > 0, got %d", s.Splits)
	}
	if !validRecurrenceKinds[s.Recurrence.Kind] {
		return fmt.Errorf("invalid recurrence kind %q, must be one of: interval, weekly-slots", s.Recurrence.Kind)
	}
	switch s.Recurrence.Kind {
	case "interval":
		if s.Recurrence.IntervalMinutes <= 0 {
			return fmt.Errorf("interval recurrence: intervalMinutes must be > 0, got %d", s.Recurrence.IntervalMinutes)
		}
	case "weekly-slots":
		if len(s.Recurrence.Days) == 0 {
			return fmt.Errorf("weekly-slots recurrence: at least one day is required")
		}
		for _, d := range s.Recurrence.Days {
			if _, ok := validWeekdayNames[d]; !ok {
				return fmt.Errorf("weekly-slots recurrence: invalid day %q", d)
			}
		}
		if len(s.Recurrence.TimesUTC) == 0 {
			return fmt.Errorf("weekly-slots recurrence: at least one time is required")
		}
		for _, t := range s.Recurrence.TimesUTC {
			if _, err := time.Parse("15:04", t); err != nil {
				return fmt.Errorf("weekly-slots recurrence: invalid time %q: %w", t, err)
			}
		}
	}
	return nil
}

// ExpandSeries expands a single RaceSeries into RaceEvent instances within the
// window [from, to). The window is automatically clipped to the schedule's
// ValidFrom/ValidUntil. Events are returned sorted by StartTime ascending.
// A sane cap of 10000 generated events is enforced to prevent runaway
// generation.
func ExpandSeries(s RaceSeries, sched OfficialSchedule, from, to time.Time) ([]RaceEvent, error) {
	loc, err := time.LoadLocation(sched.Timezone)
	if err != nil {
		return nil, fmt.Errorf("expand: timezone %q: %w", sched.Timezone, err)
	}

	// Clip window to schedule validity.
	if from.Before(sched.ValidFrom) {
		from = sched.ValidFrom
	}
	if to.After(sched.ValidUntil) {
		to = sched.ValidUntil
	}
	if !to.After(from) {
		return []RaceEvent{}, nil
	}

	var events []RaceEvent
	const maxEvents = 10000

	switch s.Recurrence.Kind {
	case "interval":
		// Round from up to the next interval boundary.
		interval := time.Duration(s.Recurrence.IntervalMinutes) * time.Minute
		start := from.Truncate(interval)
		if start.Before(from) {
			start = start.Add(interval)
		}
		for t := start; t.Before(to); t = t.Add(interval) {
			if len(events) >= maxEvents {
				return nil, fmt.Errorf("expand: exceeded max events (%d) for series %q", maxEvents, s.ID)
			}
			events = append(events, makeSeriesEvent(s, t.In(loc)))
		}

	case "weekly-slots":
		// For each day in the window, check if the weekday matches, then
		// generate events at each configured UTC time.
		dayDuration := 24 * time.Hour
		dayStart := from.Truncate(dayDuration)
		for d := dayStart; d.Before(to); d = d.Add(dayDuration) {
			wd := d.Weekday()
			dayMatches := false
			for _, dayName := range s.Recurrence.Days {
				if validWeekdayNames[dayName] == wd {
					dayMatches = true
					break
				}
			}
			if !dayMatches {
				continue
			}
			for _, timeStr := range s.Recurrence.TimesUTC {
				if len(events) >= maxEvents {
					return nil, fmt.Errorf("expand: exceeded max events (%d) for series %q", maxEvents, s.ID)
				}
				parsed, err := time.Parse("15:04", timeStr)
				if err != nil {
					return nil, fmt.Errorf("expand: series %q: invalid time %q: %w", s.ID, timeStr, err)
				}
				eventTime := time.Date(
					d.Year(), d.Month(), d.Day(),
					parsed.Hour(), parsed.Minute(), 0, 0,
					time.UTC,
				)
				if eventTime.Before(from) || !eventTime.Before(to) {
					continue
				}
				events = append(events, makeSeriesEvent(s, eventTime.In(loc)))
			}
		}
	}

	return events, nil
}

// ExpandSchedule expands all series in the schedule into a single sorted
// slice of RaceEvent instances within the window [from, to). The window is
// clipped to the schedule's validity. Returns an error if any series expansion
// fails or the cap is exceeded.
func ExpandSchedule(sched OfficialSchedule, from, to time.Time) ([]RaceEvent, error) {
	var all []RaceEvent
	for _, s := range sched.Series {
		evs, err := ExpandSeries(s, sched, from, to)
		if err != nil {
			return nil, fmt.Errorf("expand series %q: %w", s.ID, err)
		}
		all = append(all, evs...)
	}
	// Sort by StartTime ascending.
	sortRaceEventsByStart(all)
	return all, nil
}

// makeSeriesEvent creates a single RaceEvent from a series at the given start
// time. The event ID is deterministic: "{seriesID}-{startUTC}".
func makeSeriesEvent(s RaceSeries, start time.Time) RaceEvent {
	id := fmt.Sprintf("%s-%s", s.ID, start.UTC().Format("20060102T150405Z"))
	return RaceEvent{
		ID:          id,
		Title:       s.Name,
		Sim:         "lmu",
		Track:       s.Track,
		Series:      s.Name,
		StartTime:   start,
		DurationMin: s.DurationMin,
		Source:      BundledSource,
		Notes:       fmt.Sprintf("Tier: %s | License: %s | Setup: %s | Splits: %d | Assists: %s | Tyre warmers: %v | Tyres: %d", s.Tier, s.LicenseLabel, s.Setup, s.Splits, s.Assists, s.TyreWarmers, s.Tyres),
	}
}

// sortRaceEventsByStart sorts a slice of RaceEvent by StartTime ascending.
func sortRaceEventsByStart(events []RaceEvent) {
	// Simple insertion sort for small slices; the calendar package already
	// imports sort in calendar_service.go but we keep this self-contained.
	for i := 1; i < len(events); i++ {
		for j := i; j > 0 && events[j].StartTime.Before(events[j-1].StartTime); j-- {
			events[j], events[j-1] = events[j-1], events[j]
		}
	}
}

// DefaultScheduleWindow returns a sensible preview window: 24h in the past
// to 7 days in the future from now.
func DefaultScheduleWindow(now time.Time) (time.Time, time.Time) {
	return now.Add(-24 * time.Hour), now.Add(7 * 24 * time.Hour)
}

// EstimateSeriesCount returns an upper-bound estimate of how many events a
// series would generate in the given window. This is used for sanity checks
// without materialising the events.
func EstimateSeriesCount(s RaceSeries, from, to time.Time) int {
	duration := to.Sub(from)
	if duration <= 0 {
		return 0
	}
	switch s.Recurrence.Kind {
	case "interval":
		if s.Recurrence.IntervalMinutes <= 0 {
			return 0
		}
		return int(math.Ceil(float64(duration.Minutes()) / float64(s.Recurrence.IntervalMinutes)))
	case "weekly-slots":
		days := int(math.Ceil(duration.Hours() / 24))
		if days <= 0 {
			return 0
		}
		// Count matching days per week, then scale.
		matchingDays := 0
		for _, d := range s.Recurrence.Days {
			if _, ok := validWeekdayNames[d]; ok {
				matchingDays++
			}
		}
		weeks := (days + 6) / 7
		return weeks * matchingDays * len(s.Recurrence.TimesUTC)
	}
	return 0
}
