package calendar

import (
	"encoding/json"
	"fmt"
	"strings"

	_ "embed"
)

//go:embed seed/lmu-calendar.json
var bundledSeedData []byte

// LoadBundledSeed reads, normalises and validates the embedded LMU calendar
// seed. It returns a Calendar ready to use, or an error if the seed data is
// malformed or contains invalid events.
func LoadBundledSeed() (Calendar, error) {
	var cal Calendar
	if err := json.Unmarshal(bundledSeedData, &cal); err != nil {
		return Calendar{}, fmt.Errorf("bundled seed: unmarshal: %w", err)
	}

	normaliseSeed(&cal)

	if err := validateSeed(cal); err != nil {
		return Calendar{}, err
	}

	return cal, nil
}

// normaliseSeed applies the same defaulting rules as loadLocked in
// calendar_service.go so that the seed is always internally consistent.
func normaliseSeed(cal *Calendar) {
	if cal.Version == 0 {
		cal.Version = 1
	}
	if strings.TrimSpace(cal.Timezone) == "" {
		cal.Timezone = DefaultTimezone
	}
	if cal.ReminderMinutes == nil {
		cal.ReminderMinutes = append([]int(nil), DefaultReminderMinutes...)
	}
	if cal.Events == nil {
		cal.Events = []RaceEvent{}
	}
	if cal.FollowedEventIDs == nil {
		cal.FollowedEventIDs = []string{}
	}
	if cal.Series == nil {
		cal.Series = []RaceSeries{}
	}
	if cal.FollowedSeriesIDs == nil {
		cal.FollowedSeriesIDs = []string{}
	}
	if cal.SeriesPreviews == nil {
		cal.SeriesPreviews = []RaceSeriesPreview{}
	}
}

// validateSeed checks that every event passes RaceEvent.Validate and that no
// two events share the same ID. It returns the first problem encountered.
func validateSeed(cal Calendar) error {
	seen := make(map[string]struct{}, len(cal.Events))
	for i, ev := range cal.Events {
		if err := ev.Validate(); err != nil {
			return fmt.Errorf("bundled seed: event[%d]: %w", i, err)
		}
		if strings.TrimSpace(ev.ID) == "" {
			return fmt.Errorf("bundled seed: event[%d]: id is required", i)
		}
		if _, dup := seen[ev.ID]; dup {
			return fmt.Errorf("bundled seed: duplicate event ID: %s", ev.ID)
		}
		seen[ev.ID] = struct{}{}
	}
	return nil
}
