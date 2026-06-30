package calendar

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// FileName is the default filename inside cfgDir where the calendar is
// persisted. Exported so tests and integration code can reference the same
// constant.
const FileName = "calendar-lmu.json"

// Service is the in-memory owner of the calendar. It is safe to call from
// multiple goroutines. The constructor wires the file path; everything else
// lives behind the mutex.
type Service struct {
	path string
	mu   sync.Mutex
	cal  Calendar
	now  func() time.Time
}

// NewService creates a service that reads and writes cfgDir/calendar-lmu.json.
// now is injectable so tests can pin the clock; if nil, time.Now is used.
func NewService(cfgDir string, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{
		path: filepath.Join(cfgDir, FileName),
		now:  now,
	}
}

// Path returns the absolute path the service persists to. Useful for tests
// that need to assert "no file was written yet".
func (s *Service) Path() string {
	return s.path
}

// Load reads the calendar from disk. A missing file is not an error: the
// service falls back to a default calendar.
func (s *Service) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

func (s *Service) loadLocked() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.cal = NewDefaultCalendar()
			return nil
		}
		return fmt.Errorf("reading calendar: %w", err)
	}
	var raw Calendar
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("parsing calendar: %w", err)
	}
	if raw.Version == 0 {
		raw.Version = 1
	}
	if strings.TrimSpace(raw.Timezone) == "" {
		raw.Timezone = DefaultTimezone
	}
	if raw.Events == nil {
		raw.Events = []RaceEvent{}
	}
	if raw.ReminderMinutes == nil {
		raw.ReminderMinutes = append([]int(nil), DefaultReminderMinutes...)
	}
	s.cal = raw
	return nil
}

// Calendar returns a defensive copy of the current calendar.
func (s *Service) Calendar() Calendar {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cloneLocked()
}

func (s *Service) cloneLocked() Calendar {
	out := s.cal
	out.Events = append([]RaceEvent(nil), s.cal.Events...)
	out.ReminderMinutes = append([]int(nil), s.cal.ReminderMinutes...)
	return out
}

// Replace validates the provided events, deduplicates them by
// (title|track|startTime) against the existing list, persists the calendar
// and returns the resulting event list. source is an optional free-form
// string the caller can attach to every event for traceability.
func (s *Service) Replace(events []RaceEvent, timezone, source string) ([]RaceEvent, error) {
	if timezone == "" {
		timezone = DefaultTimezone
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("timezone %q: %w", timezone, err)
	}
	for i := range events {
		if events[i].Sim == "" {
			events[i].Sim = "lmu"
		}
		// Reinterpret the start time in the requested timezone while keeping
		// the wall-clock time intact. This is what a user pasting "2 Julio |
		// 20:00" means: local 20:00 in the configured zone.
		events[i].StartTime = reinterpretInLocation(events[i].StartTime, loc)
		if source != "" && events[i].Source == "" {
			events[i].Source = source
		}
		if err := events[i].Validate(); err != nil {
			return nil, fmt.Errorf("event[%d]: %w", i, err)
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	merged := dedupe(s.cal.Events, events)
	s.cal.Version = 1
	s.cal.Timezone = timezone
	s.cal.Events = merged
	s.cal.Updated = s.now().UTC()
	return append([]RaceEvent(nil), merged...), s.persistLocked()
}

// Clear empties the calendar and persists the change.
func (s *Service) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cal = NewDefaultCalendar()
	s.cal.Updated = s.now().UTC()
	return s.persistLocked()
}

// Upcoming returns the event that is happening right now (start <= now < end),
// or the next future event. ok is false when the calendar has no future or
// active events.
func (s *Service) Upcoming(now time.Time) (RaceEvent, bool) {
	events := s.sortedByStartAsc()
	for _, ev := range events {
		if ev.IsActiveAt(now) {
			return ev, true
		}
		if ev.StartTime.After(now) {
			return ev, true
		}
	}
	return RaceEvent{}, false
}

// Past returns the most recent event that has already finished
// (start + duration <= now). ok is false when the calendar has no past events.
func (s *Service) Past(now time.Time) (RaceEvent, bool) {
	events := s.sortedByStartDesc()
	for _, ev := range events {
		if !ev.EndTime().After(now) {
			return ev, true
		}
	}
	return RaceEvent{}, false
}

// Events returns a copy of all events sorted by StartTime ascending.
func (s *Service) Events() []RaceEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]RaceEvent(nil), s.sortedByStartAsc()...)
}

func (s *Service) sortedByStartAsc() []RaceEvent {
	out := append([]RaceEvent(nil), s.cal.Events...)
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].StartTime.Before(out[j].StartTime)
	})
	return out
}

func (s *Service) sortedByStartDesc() []RaceEvent {
	out := append([]RaceEvent(nil), s.cal.Events...)
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].StartTime.After(out[j].StartTime)
	})
	return out
}

// dedupe merges existing and incoming events by the (title|track|startTime)
// key. Existing entries are kept; incoming entries override the existing
// fields on the matching key. New entries are appended in the order they
// appear in incoming.
func dedupe(existing, incoming []RaceEvent) []RaceEvent {
	byKey := make(map[string]int, len(existing)+len(incoming))
	out := make([]RaceEvent, 0, len(existing)+len(incoming))
	for _, ev := range existing {
		k := ev.Key()
		byKey[k] = len(out)
		out = append(out, ev)
	}
	for _, ev := range incoming {
		k := ev.Key()
		if idx, ok := byKey[k]; ok {
			out[idx] = mergeEvent(out[idx], ev)
			continue
		}
		byKey[k] = len(out)
		out = append(out, ev)
	}
	return out
}

// mergeEvent keeps the identity of base and overlays non-empty fields from
// update on top. The StartTime is taken from update because both events share
// the same Key (i.e. the same wall-clock start).
func mergeEvent(base, update RaceEvent) RaceEvent {
	if update.Title != "" {
		base.Title = update.Title
	}
	if update.Sim != "" {
		base.Sim = update.Sim
	}
	if update.Track != "" {
		base.Track = update.Track
	}
	if update.Series != "" {
		base.Series = update.Series
	}
	if update.SessionLabel != "" {
		base.SessionLabel = update.SessionLabel
	}
	if update.RegistrationURL != "" {
		base.RegistrationURL = update.RegistrationURL
	}
	if update.Source != "" {
		base.Source = update.Source
	}
	if update.Notes != "" {
		base.Notes = update.Notes
	}
	if update.DurationMin > 0 {
		base.DurationMin = update.DurationMin
	}
	base.StartTime = update.StartTime
	return base
}

// persistLocked writes the calendar to disk atomically: data is written to
// "path.tmp" and then renamed. Callers must hold s.mu.
func (s *Service) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("creating calendar dir: %w", err)
	}
	data, err := json.MarshalIndent(s.cal, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding calendar: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), FileName+".tmp-*")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpName := tmp.Name()
	cleanup := func() {
		_ = os.Remove(tmpName)
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("writing temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return fmt.Errorf("closing temp file: %w", err)
	}
	if err := os.Rename(tmpName, s.path); err != nil {
		cleanup()
		return fmt.Errorf("renaming temp file: %w", err)
	}
	return nil
}

// reinterpretInLocation returns t with the same wall-clock hour/minute but
// located in loc. The original zone information is dropped intentionally: the
// user's paste was local time.
func reinterpretInLocation(t time.Time, loc *time.Location) time.Time {
	return time.Date(
		t.Year(), t.Month(), t.Day(),
		t.Hour(), t.Minute(), t.Second(), t.Nanosecond(),
		loc,
	)
}
