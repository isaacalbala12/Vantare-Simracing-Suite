// Package calendar implements a local LMU race calendar model, parser and
// persistence service. The data is intentionally stored in a dedicated file
// (calendar-lmu.json in cfgDir) and never mixed with AppSettings.
package calendar

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// DefaultTimezone is used when the parsed or stored calendar does not specify
// one. Keep it stable; tests rely on this exact value.
const DefaultTimezone = "Europe/Madrid"

// BundledSource is the Source value assigned to events loaded from the
// bundled LMU seed. It is used by ApplyBundledSeed to identify which
// events should be replaced on subsequent seed updates.
const BundledSource = "vantare-bundled-lmu"

// DefaultReminderMinutes are the reminder thresholds emitted by the ticker.
// The list is intentionally small and only contains positive values.
var DefaultReminderMinutes = []int{30, 15, 10, 5, 2}

// EventKeySeparator joins identity fields in dedupe. Never use whitespace.
const EventKeySeparator = "|"

// RaceEvent models a single race (or race-adjacent) entry in the calendar.
// Fields are validated by Validate.
type RaceEvent struct {
	ID              string    `json:"id"`
	Title           string    `json:"title"`
	Sim             string    `json:"sim,omitempty"`
	Track           string    `json:"track,omitempty"`
	Series          string    `json:"series,omitempty"`
	SessionLabel    string    `json:"sessionLabel,omitempty"`
	StartTime       time.Time `json:"startTime"`
	DurationMin     int       `json:"durationMin,omitempty"`
	RegistrationURL string    `json:"registrationUrl,omitempty"`
	Source          string    `json:"source,omitempty"`
	Notes           string    `json:"notes,omitempty"`
}

// Reminder represents a single reminder that is due for a followed event at a
// specific threshold. MinutesLeft is the threshold value (e.g. 30 means "30
// minutes before start").
type Reminder struct {
	EventID         string    `json:"eventId"`
	Title           string    `json:"title"`
	Track           string    `json:"track,omitempty"`
	MinutesLeft     int       `json:"minutesLeft"`
	StartTime       time.Time `json:"startTime"`
	RegistrationURL string    `json:"registrationUrl,omitempty"`
}

// Calendar is the root document persisted to calendar-lmu.json.
type Calendar struct {
	Version          int         `json:"version"`
	Timezone         string      `json:"timezone"`
	ReminderMinutes  []int       `json:"reminderMinutes"`
	Events           []RaceEvent `json:"events"`
	FollowedEventIDs []string    `json:"followedEventIds,omitempty"`
	Updated          time.Time   `json:"updated"`
}

// ErrInvalidLine is returned by the parser when a single line cannot be
// interpreted. It carries the original 1-based line number for diagnostics.
type ErrInvalidLine struct {
	Line   int
	Reason string
}

// Error returns a deterministic message. Tests assert on substrings, not the
// exact wording, so the format is allowed to evolve.
func (e *ErrInvalidLine) Error() string {
	return fmt.Sprintf("line %d: %s", e.Line, e.Reason)
}

// IsErrInvalidLine reports whether err is or wraps an *ErrInvalidLine.
func IsErrInvalidLine(err error) bool {
	var target *ErrInvalidLine
	return errors.As(err, &target)
}

// Validate ensures the event has the minimum data required to be stored.
// Returns nil when the event is valid.
func (e *RaceEvent) Validate() error {
	if strings.TrimSpace(e.Title) == "" {
		return errors.New("event title is required")
	}
	if len(e.Title) > 200 {
		return errors.New("event title must be <= 200 chars")
	}
	if e.StartTime.IsZero() {
		return errors.New("event startTime is required")
	}
	if e.DurationMin < 0 {
		return errors.New("event durationMin must be >= 0")
	}
	if e.Sim != "" {
		if strings.ContainsAny(e.Sim, " \t\n") {
			return errors.New("event sim must not contain whitespace")
		}
		if e.Sim != strings.ToLower(e.Sim) {
			return errors.New("event sim must be lowercase")
		}
	}
	if e.RegistrationURL != "" {
		u, err := url.Parse(e.RegistrationURL)
		if err != nil {
			return fmt.Errorf("event registrationUrl invalid: %w", err)
		}
		if u.Scheme != "http" && u.Scheme != "https" {
			return errors.New("event registrationUrl must use http or https")
		}
		if u.Host == "" {
			return errors.New("event registrationUrl must include a host")
		}
	}
	return nil
}

// EndTime returns the moment the event finishes. It treats a zero or negative
// duration as an instantaneous event.
func (e *RaceEvent) EndTime() time.Time {
	if e.DurationMin <= 0 {
		return e.StartTime
	}
	return e.StartTime.Add(time.Duration(e.DurationMin) * time.Minute)
}

// IsActiveAt reports whether the event is running at the given instant.
// An event whose start time equals now is considered active (start <= now < end).
func (e *RaceEvent) IsActiveAt(now time.Time) bool {
	return !now.Before(e.StartTime) && now.Before(e.EndTime())
}

// Key returns the dedupe identity: title|track|startTime. Both title and
// track are lowercased and trimmed so that minor case differences do not
// produce duplicates.
func (e *RaceEvent) Key() string {
	return strings.ToLower(strings.TrimSpace(e.Title)) +
		EventKeySeparator + strings.ToLower(strings.TrimSpace(e.Track)) +
		EventKeySeparator + e.StartTime.UTC().Format(time.RFC3339)
}

// NewDefaultCalendar returns an empty calendar with safe defaults applied.
func NewDefaultCalendar() Calendar {
	rem := make([]int, len(DefaultReminderMinutes))
	copy(rem, DefaultReminderMinutes)
	return Calendar{
		Version:          1,
		Timezone:         DefaultTimezone,
		ReminderMinutes:  rem,
		Events:           []RaceEvent{},
		FollowedEventIDs: []string{},
		Updated:          time.Time{},
	}
}
