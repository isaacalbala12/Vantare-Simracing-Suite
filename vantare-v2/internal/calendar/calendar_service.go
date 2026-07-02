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
	if raw.FollowedEventIDs == nil {
		raw.FollowedEventIDs = []string{}
	}
	if raw.Series == nil {
		raw.Series = []RaceSeries{}
	}
	if raw.FollowedSeriesIDs == nil {
		raw.FollowedSeriesIDs = []string{}
	}
	if raw.SeriesPreviews == nil {
		raw.SeriesPreviews = []RaceSeriesPreview{}
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
	out.Events = cloneSlice(s.cal.Events)
	out.ReminderMinutes = cloneSlice(s.cal.ReminderMinutes)
	out.FollowedEventIDs = cloneSlice(s.cal.FollowedEventIDs)
	out.Series = cloneSlice(s.cal.Series)
	out.FollowedSeriesIDs = cloneSlice(s.cal.FollowedSeriesIDs)
	out.SeriesPreviews = cloneSeriesPreviews(s.cal.SeriesPreviews)
	return out
}

// cloneSeriesPreviews returns a deep copy of a RaceSeriesPreview slice. Each
// preview's NextStarts slice is independently allocated so that mutating an
// element in the copy never affects the original.
func cloneSeriesPreviews(src []RaceSeriesPreview) []RaceSeriesPreview {
	if src == nil {
		return []RaceSeriesPreview{}
	}
	out := make([]RaceSeriesPreview, len(src))
	for i, p := range src {
		out[i] = p
		out[i].NextStarts = cloneSlice(p.NextStarts)
	}
	return out
}

// cloneSlice returns a non-nil copy of a slice. If the input is nil, an empty
// slice is returned so that JSON serialisation produces [] instead of null.
func cloneSlice[T any](src []T) []T {
	if src == nil {
		return []T{}
	}
	out := make([]T, len(src))
	copy(out, src)
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
	// Prune followed IDs that no longer exist in the merged event set.
	s.cal.FollowedEventIDs = pruneFollowedLocked(s.cal.FollowedEventIDs, merged)
	s.cal.Updated = s.now().UTC()
	return append([]RaceEvent(nil), merged...), s.persistLocked()
}

// ApplyBundledSeed applies the bundled seed calendar to the service.
// It replaces all existing events with Source == BundledSource with the
// seed events, preserves non-bundled events, prunes followed event IDs
// that no longer exist, and persists atomically. The seed's timezone and
// reminderMinutes are applied.
func (s *Service) ApplyBundledSeed(seed Calendar) error {
	// Normalise and validate before touching state.
	normaliseSeed(&seed)
	if err := validateSeed(seed); err != nil {
		return err
	}
	if _, err := time.LoadLocation(seed.Timezone); err != nil {
		return fmt.Errorf("bundled seed: timezone %q: %w", seed.Timezone, err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Filter out existing bundled events.
	var kept []RaceEvent
	for _, ev := range s.cal.Events {
		if ev.Source != BundledSource {
			kept = append(kept, ev)
		}
	}

	// Build sets for non-bundled events to protect them from seed overwrite.
	// Non-bundled events with the same Key() or ID as a seed event must be
	// preserved as-is.
	protectedKeys := make(map[string]struct{}, len(kept))
	protectedIDs := make(map[string]struct{}, len(kept))
	for _, ev := range kept {
		protectedKeys[ev.Key()] = struct{}{}
		protectedIDs[ev.ID] = struct{}{}
	}

	// Tag seed events with the bundled source, skipping those that would
	// overwrite a non-bundled event with the same key or ID.
	var seedFiltered []RaceEvent
	for _, ev := range seed.Events {
		if _, protected := protectedKeys[ev.Key()]; protected {
			continue
		}
		if _, protected := protectedIDs[ev.ID]; protected {
			continue
		}
		ev.Source = BundledSource
		seedFiltered = append(seedFiltered, ev)
	}

	// Merge kept events with filtered seed events (dedupe by key).
	merged := dedupe(kept, seedFiltered)

	// Apply seed metadata.
	s.cal.Version = seed.Version
	s.cal.Timezone = seed.Timezone
	s.cal.ReminderMinutes = seed.ReminderMinutes
	s.cal.Events = merged
	s.cal.FollowedEventIDs = pruneFollowedLocked(s.cal.FollowedEventIDs, merged)
	s.cal.Updated = s.now().UTC()

	return s.persistLocked()
}

// ApplyOfficialSchedule loads the embedded weekly schedule, replaces old
// bundled events with a bounded window of generated events, stores the
// official series definitions, generates UI-safe series previews, prunes
// invalid followed series IDs, and persists atomically. Non-bundled events
// are preserved. A bad schedule logs a warning and does not mutate state.
func (s *Service) ApplyOfficialSchedule(now time.Time) error {
	sched, err := LoadWeeklySchedule()
	if err != nil {
		return fmt.Errorf("official schedule: %w", err)
	}

	// Generate a bounded window of events for compatibility.
	from, to := DefaultScheduleWindow(now)
	events, err := ExpandSchedule(sched, from, to)
	if err != nil {
		return fmt.Errorf("official schedule: expand: %w", err)
	}

	// Build previews for each series.
	previews := makeSeriesPreviews(sched, now)

	s.mu.Lock()
	defer s.mu.Unlock()

	// Filter out existing bundled events.
	var kept []RaceEvent
	for _, ev := range s.cal.Events {
		if ev.Source != BundledSource {
			kept = append(kept, ev)
		}
	}

	// Build protection sets for non-bundled events.
	protectedKeys := make(map[string]struct{}, len(kept))
	protectedIDs := make(map[string]struct{}, len(kept))
	for _, ev := range kept {
		protectedKeys[ev.Key()] = struct{}{}
		protectedIDs[ev.ID] = struct{}{}
	}

	// Tag generated events with BundledSource, skipping protected ones.
	var filtered []RaceEvent
	for _, ev := range events {
		if _, protected := protectedKeys[ev.Key()]; protected {
			continue
		}
		if _, protected := protectedIDs[ev.ID]; protected {
			continue
		}
		ev.Source = BundledSource
		filtered = append(filtered, ev)
	}

	// Merge kept events with filtered generated events.
	merged := dedupe(kept, filtered)

	// Apply schedule metadata.
	s.cal.Version = sched.Version
	s.cal.Timezone = sched.Timezone
	s.cal.Events = merged
	s.cal.Series = sched.Series
	s.cal.SeriesPreviews = previews
	s.cal.FollowedEventIDs = pruneFollowedLocked(s.cal.FollowedEventIDs, merged)
	// Prune followed series IDs that no longer exist in the schedule.
	s.cal.FollowedSeriesIDs = pruneFollowedSeriesLocked(s.cal.FollowedSeriesIDs, sched.Series)
	s.cal.Updated = s.now().UTC()

	return s.persistLocked()
}

// makeSeriesPreviews generates UI-safe previews for all series in the
// schedule. Each preview contains a human-readable schedule label and a
// capped list (max 5) of upcoming start times from now.
func makeSeriesPreviews(sched OfficialSchedule, now time.Time) []RaceSeriesPreview {
	previews := make([]RaceSeriesPreview, 0, len(sched.Series))
	const maxStarts = 5
	previewWindow := now.Add(7 * 24 * time.Hour) // look ahead 7 days

	for _, s := range sched.Series {
		label := scheduleLabel(s)
		var nextStarts []time.Time

		// Expand a small window to get upcoming starts.
		events, err := ExpandSeries(s, sched, now, previewWindow)
		if err == nil {
			for i, ev := range events {
				if i >= maxStarts {
					break
				}
				nextStarts = append(nextStarts, ev.StartTime)
			}
		}
		if nextStarts == nil {
			nextStarts = []time.Time{}
		}

		previews = append(previews, RaceSeriesPreview{
			SeriesID:      s.ID,
			ScheduleLabel: label,
			NextStarts:    nextStarts,
		})
	}
	return previews
}

// scheduleLabel returns a human-readable label for a series recurrence.
// Daily interval series produce "Cada 15 min", "Cada 20 min", "Cada 30 min".
// Weekly series produce "Wed Thu Fri Sat Sun Mon @ 02:00 06:00..."
func scheduleLabel(s RaceSeries) string {
	switch s.Recurrence.Kind {
	case "interval":
		return fmt.Sprintf("Cada %d min", s.Recurrence.IntervalMinutes)
	case "weekly-slots":
		days := strings.Join(s.Recurrence.Days, " ")
		times := strings.Join(s.Recurrence.TimesUTC, " ")
		return fmt.Sprintf("%s @ %s", days, times)
	}
	return ""
}

// pruneFollowedSeriesLocked removes followed series IDs that no longer exist
// in the given series list. Callers must hold s.mu.
func pruneFollowedSeriesLocked(followed []string, series []RaceSeries) []string {
	exists := make(map[string]struct{}, len(series))
	for _, s := range series {
		exists[s.ID] = struct{}{}
	}
	out := make([]string, 0, len(followed))
	for _, id := range followed {
		if _, ok := exists[id]; ok {
			out = append(out, id)
		}
	}
	if out == nil {
		return []string{}
	}
	return out
}

// Clear empties the calendar and persists the change.
func (s *Service) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cal = NewDefaultCalendar()
	s.cal.Updated = s.now().UTC()
	return s.persistLocked()
}

// Follow marks an event as followed. Returns an error if the eventID does not
// exist in the current calendar. The change is persisted atomically.
func (s *Service) Follow(eventID string) (Calendar, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !eventExistsLocked(s.cal.Events, eventID) {
		return Calendar{}, fmt.Errorf("event %q not found in calendar", eventID)
	}
	for _, id := range s.cal.FollowedEventIDs {
		if id == eventID {
			return s.cloneLocked(), nil // already followed, no-op
		}
	}
	s.cal.FollowedEventIDs = append(s.cal.FollowedEventIDs, eventID)
	s.cal.Updated = s.now().UTC()
	if err := s.persistLocked(); err != nil {
		return Calendar{}, err
	}
	return s.cloneLocked(), nil
}

// Unfollow removes an event from the followed list. It is a no-op if the
// event was not followed. The change is persisted atomically.
func (s *Service) Unfollow(eventID string) (Calendar, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	filtered := make([]string, 0, len(s.cal.FollowedEventIDs))
	for _, id := range s.cal.FollowedEventIDs {
		if id != eventID {
			filtered = append(filtered, id)
		}
	}
	if len(filtered) == len(s.cal.FollowedEventIDs) {
		return s.cloneLocked(), nil // not followed, no-op
	}
	s.cal.FollowedEventIDs = filtered
	s.cal.Updated = s.now().UTC()
	if err := s.persistLocked(); err != nil {
		return Calendar{}, err
	}
	return s.cloneLocked(), nil
}

// IsFollowed reports whether the given event ID is currently followed.
func (s *Service) IsFollowed(eventID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range s.cal.FollowedEventIDs {
		if id == eventID {
			return true
		}
	}
	return false
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

// DueReminders returns reminders for followed events whose start time falls
// within each configured reminder threshold. A reminder at threshold T is due
// when the event starts in (T-1, T] minutes. Past and active events are never
// included. Deduplication is intentionally not performed here (handled by
// CALENDAR-02-C2-B).
func (s *Service) DueReminders(now time.Time) []Reminder {
	s.mu.Lock()
	defer s.mu.Unlock()

	reminderMinutes := s.cal.ReminderMinutes
	if len(reminderMinutes) == 0 {
		reminderMinutes = DefaultReminderMinutes
	}

	if len(s.cal.FollowedEventIDs) == 0 {
		return []Reminder{}
	}

	followed := make(map[string]struct{}, len(s.cal.FollowedEventIDs))
	for _, id := range s.cal.FollowedEventIDs {
		followed[id] = struct{}{}
	}

	var out []Reminder
	for _, ev := range s.cal.Events {
		if _, ok := followed[ev.ID]; !ok {
			continue
		}
		if !now.Before(ev.StartTime) {
			continue
		}
		minutesUntil := int(ev.StartTime.Sub(now).Minutes())
		for _, t := range reminderMinutes {
			if minutesUntil <= t && minutesUntil > t-1 {
				out = append(out, Reminder{
					EventID:         ev.ID,
					Title:           ev.Title,
					Track:           ev.Track,
					MinutesLeft:     t,
					StartTime:       ev.StartTime,
					RegistrationURL: ev.RegistrationURL,
				})
			}
		}
	}
	if out == nil {
		return []Reminder{}
	}
	return out
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

// pruneFollowedLocked removes followed event IDs that no longer exist in the
// given event list. Callers must hold s.mu.
func pruneFollowedLocked(followed []string, events []RaceEvent) []string {
	exists := make(map[string]struct{}, len(events))
	for _, ev := range events {
		exists[ev.ID] = struct{}{}
	}
	out := make([]string, 0, len(followed))
	for _, id := range followed {
		if _, ok := exists[id]; ok {
			out = append(out, id)
		}
	}
	if out == nil {
		return []string{}
	}
	return out
}

// eventExistsLocked reports whether an event with the given ID exists in the
// event list. Callers must hold s.mu.
func eventExistsLocked(events []RaceEvent, id string) bool {
	for _, ev := range events {
		if ev.ID == id {
			return true
		}
	}
	return false
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
