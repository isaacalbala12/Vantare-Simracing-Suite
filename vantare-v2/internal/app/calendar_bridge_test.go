package app

import (
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/calendar"
)

// fakeCalendarService implements CalendarGetter, CalendarReplacer, CalendarClearer
// for testing the bridge handlers without touching disk.
type fakeCalendarService struct {
	cal          calendar.Calendar
	replaceErr   error
	clearErr     error
	replaceCalls int
	clearCalls   int
}

func (f *fakeCalendarService) Calendar() calendar.Calendar {
	return f.cal
}

func (f *fakeCalendarService) Replace(events []calendar.RaceEvent, timezone, source string) ([]calendar.RaceEvent, error) {
	f.replaceCalls++
	if f.replaceErr != nil {
		return nil, f.replaceErr
	}
	f.cal.Events = events
	f.cal.Timezone = timezone
	return events, nil
}

func (f *fakeCalendarService) Clear() error {
	f.clearCalls++
	if f.clearErr != nil {
		return f.clearErr
	}
	f.cal = calendar.NewDefaultCalendar()
	return nil
}

// spyCalendarEmitter records emitted events for assertions.
type spyCalendarEmitter struct {
	events []string
	data   []any
}

func (s *spyCalendarEmitter) Emit(name string, data any) {
	s.events = append(s.events, name)
	s.data = append(s.data, data)
}

func TestHandleCalendarGetEmitsDefaultWhenNoFile(t *testing.T) {
	svc := &fakeCalendarService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	HandleCalendarGet(svc, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
}

func TestHandleCalendarImportValidPersistsAndEmits(t *testing.T) {
	svc := &fakeCalendarService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	if svc.replaceCalls != 1 {
		t.Fatalf("replaceCalls=%d, want 1", svc.replaceCalls)
	}
	if len(svc.cal.Events) != 1 {
		t.Fatalf("events=%d, want 1", len(svc.cal.Events))
	}
}

func TestHandleCalendarImportInvalidEmitsErrorAndPreservesState(t *testing.T) {
	svc := &fakeCalendarService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	// Invalid text: missing time field
	text := "Martes 2 Julio |  | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	if svc.replaceCalls != 0 {
		t.Fatalf("replaceCalls=%d, want 0 (must not call Replace on parse error)", svc.replaceCalls)
	}
}

func TestHandleCalendarImportReplaceErrorEmitsErrorAndPreservesState(t *testing.T) {
	svc := &fakeCalendarService{
		cal:        calendar.NewDefaultCalendar(),
		replaceErr: errors.New("simulated replace failure"),
	}
	emitter := &spyCalendarEmitter{}

	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	if svc.replaceCalls != 1 {
		t.Fatalf("replaceCalls=%d, want 1", svc.replaceCalls)
	}
}

func TestHandleCalendarClearEmptiesAndEmits(t *testing.T) {
	svc := &fakeCalendarService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	HandleCalendarClear(svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	if svc.clearCalls != 1 {
		t.Fatalf("clearCalls=%d, want 1", svc.clearCalls)
	}
}

func TestHandleCalendarClearErrorEmitsError(t *testing.T) {
	svc := &fakeCalendarService{
		cal:      calendar.NewDefaultCalendar(),
		clearErr: errors.New("simulated clear failure"),
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarClear(svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
}

// TestHandleCalendarImportInvalidTimezoneEmitsError verifies that an invalid
// timezone in the import text produces a calendar:error without calling Replace.
func TestHandleCalendarImportInvalidTimezoneEmitsError(t *testing.T) {
	svc := &fakeCalendarService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Not/A/Timezone", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	if svc.replaceCalls != 0 {
		t.Fatalf("replaceCalls=%d, want 0 (must not call Replace on parse error)", svc.replaceCalls)
	}
}

// TestHandleCalendarGetWithRealService uses a real *calendar.Service to verify
// the handler emits the default calendar when no file exists.
func TestHandleCalendarGetWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarGet(svc, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
}

// TestHandleCalendarImportWithRealService uses a real *calendar.Service to
// verify the full round-trip: parse, replace, emit.
func TestHandleCalendarImportWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("events=%d, want 1", len(cal.Events))
	}
	if cal.Events[0].Title != "Race" {
		t.Fatalf("title=%q, want Race", cal.Events[0].Title)
	}
}

// TestHandleCalendarImportInvalidWithRealService verifies that an invalid import
// emits calendar:error and does NOT overwrite a valid stored calendar.
func TestHandleCalendarImportInvalidWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	// First import a valid calendar.
	validText := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(validText, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})
	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("first import events=%v, want [calendar:loaded]", emitter.events)
	}

	// Now import invalid text.
	emitter2 := &spyCalendarEmitter{}
	invalidText := "Martes 2 Julio |  | Race | Le Mans | 45"
	HandleCalendarImport(invalidText, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter2, func(string, ...any) {})

	if len(emitter2.events) != 1 || emitter2.events[0] != "calendar:error" {
		t.Fatalf("invalid import events=%v, want [calendar:error]", emitter2.events)
	}
	// The valid calendar must still be intact.
	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("events=%d after failed import, want 1 (previous state preserved)", len(cal.Events))
	}
	if cal.Events[0].Title != "Race" {
		t.Fatalf("title=%q after failed import, want Race", cal.Events[0].Title)
	}
}

// TestHandleCalendarClearWithRealService uses a real *calendar.Service to
// verify the full clear round-trip.
func TestHandleCalendarClearWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	// Import a valid calendar first.
	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})
	if len(svc.Calendar().Events) != 1 {
		t.Fatalf("expected 1 event after import")
	}

	// Now clear.
	emitter2 := &spyCalendarEmitter{}
	HandleCalendarClear(svc, svc, emitter2, func(string, ...any) {})

	if len(emitter2.events) != 1 || emitter2.events[0] != "calendar:loaded" {
		t.Fatalf("clear events=%v, want [calendar:loaded]", emitter2.events)
	}
	cal := svc.Calendar()
	if len(cal.Events) != 0 {
		t.Fatalf("events=%d after clear, want 0", len(cal.Events))
	}
}

// TestHandleCalendarImportInvalidTextWithRealService verifies that a text with
// an invalid line (empty title) emits calendar:error and preserves state.
func TestHandleCalendarImportInvalidTextWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	// First import a valid calendar.
	validText := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(validText, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})
	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("first import events=%v, want [calendar:loaded]", emitter.events)
	}

	// Now import text with an invalid line (empty title).
	emitter2 := &spyCalendarEmitter{}
	invalidText := "Martes 2 Julio | 20:00 |  | Le Mans | 45"
	HandleCalendarImport(invalidText, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter2, func(string, ...any) {})

	if len(emitter2.events) != 1 || emitter2.events[0] != "calendar:error" {
		t.Fatalf("invalid import events=%v, want [calendar:error]", emitter2.events)
	}
	// The valid calendar must still be intact.
	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("events=%d after failed import, want 1 (previous state preserved)", len(cal.Events))
	}
	if cal.Events[0].Title != "Race" {
		t.Fatalf("title=%q after failed import, want Race", cal.Events[0].Title)
	}
}

// TestHandleCalendarImportInvalidTextNoPreviousState verifies that when there
// is no previous state and an invalid import is attempted, the calendar remains
// empty (default) and an error is emitted.
func TestHandleCalendarImportInvalidTextNoPreviousState(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	invalidText := "Martes 2 Julio | 20:00 |  | Le Mans | 45"
	HandleCalendarImport(invalidText, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	cal := svc.Calendar()
	if len(cal.Events) != 0 {
		t.Fatalf("events=%d after failed import with no previous state, want 0", len(cal.Events))
	}
}

// TestHandleCalendarImportWithRealServicePersistsToDisk verifies that after a
// successful import, the data is persisted to disk and survives a reload.
func TestHandleCalendarImportWithRealServicePersistsToDisk(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	// Reload from disk.
	svc2 := calendar.NewService(dir, time.Now)
	if err := svc2.Load(); err != nil {
		t.Fatalf("svc2.Load: %v", err)
	}
	cal := svc2.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("events=%d after reload, want 1", len(cal.Events))
	}
	if cal.Events[0].Title != "Race" {
		t.Fatalf("title=%q after reload, want Race", cal.Events[0].Title)
	}
	if cal.Timezone != "Europe/Madrid" {
		t.Fatalf("timezone=%q after reload, want Europe/Madrid", cal.Timezone)
	}
}

// TestHandleCalendarClearWithRealServicePersistsToDisk verifies that after a
// clear, the empty calendar is persisted to disk.
func TestHandleCalendarClearWithRealServicePersistsToDisk(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	// Import a valid calendar first.
	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})

	// Clear.
	emitter2 := &spyCalendarEmitter{}
	HandleCalendarClear(svc, svc, emitter2, func(string, ...any) {})

	// Reload from disk.
	svc2 := calendar.NewService(dir, time.Now)
	if err := svc2.Load(); err != nil {
		t.Fatalf("svc2.Load: %v", err)
	}
	cal := svc2.Calendar()
	if len(cal.Events) != 0 {
		t.Fatalf("events=%d after clear+reload, want 0", len(cal.Events))
	}
}

// TestHandleCalendarGetWithRealServiceNoFile verifies that when no file exists,
// the handler emits a default empty calendar.
func TestHandleCalendarGetWithRealServiceNoFile(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarGet(svc, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	cal := svc.Calendar()
	if len(cal.Events) != 0 {
		t.Fatalf("events=%d, want 0", len(cal.Events))
	}
	if cal.Timezone != calendar.DefaultTimezone {
		t.Fatalf("timezone=%q, want %q", cal.Timezone, calendar.DefaultTimezone)
	}
}

// --- Calendar follow/unfollow bridge tests ---

// fakeCalendarFollowService implements CalendarFollower, CalendarUnfollower,
// CalendarGetter for testing follow/unfollow bridge handlers.
type fakeCalendarFollowService struct {
	cal           calendar.Calendar
	followErr     error
	unfollowErr   error
	followCalls   int
	unfollowCalls int
}

func (f *fakeCalendarFollowService) Calendar() calendar.Calendar {
	return f.cal
}

func (f *fakeCalendarFollowService) Follow(eventID string) (calendar.Calendar, error) {
	f.followCalls++
	if f.followErr != nil {
		return calendar.Calendar{}, f.followErr
	}
	f.cal.FollowedEventIDs = append(f.cal.FollowedEventIDs, eventID)
	return f.cal, nil
}

func (f *fakeCalendarFollowService) Unfollow(eventID string) (calendar.Calendar, error) {
	f.unfollowCalls++
	if f.unfollowErr != nil {
		return calendar.Calendar{}, f.unfollowErr
	}
	filtered := make([]string, 0, len(f.cal.FollowedEventIDs))
	for _, id := range f.cal.FollowedEventIDs {
		if id != eventID {
			filtered = append(filtered, id)
		}
	}
	f.cal.FollowedEventIDs = filtered
	return f.cal, nil
}

// --- Calendar series follow/unfollow bridge tests (CALENDAR-05-E1) ---

// fakeCalendarSeriesService implements CalendarSeriesFollower, CalendarSeriesUnfollower,
// CalendarGetter for testing series follow/unfollow bridge handlers.
type fakeCalendarSeriesService struct {
	cal           calendar.Calendar
	followErr     error
	unfollowErr   error
	followCalls   int
	unfollowCalls int
}

func (f *fakeCalendarSeriesService) Calendar() calendar.Calendar {
	return f.cal
}

func (f *fakeCalendarSeriesService) FollowSeries(seriesID string) (calendar.Calendar, error) {
	f.followCalls++
	if f.followErr != nil {
		return calendar.Calendar{}, f.followErr
	}
	for _, id := range f.cal.FollowedSeriesIDs {
		if id == seriesID {
			return f.cal, nil // already followed
		}
	}
	f.cal.FollowedSeriesIDs = append(f.cal.FollowedSeriesIDs, seriesID)
	return f.cal, nil
}

func (f *fakeCalendarSeriesService) UnfollowSeries(seriesID string) (calendar.Calendar, error) {
	f.unfollowCalls++
	if f.unfollowErr != nil {
		return calendar.Calendar{}, f.unfollowErr
	}
	filtered := make([]string, 0, len(f.cal.FollowedSeriesIDs))
	for _, id := range f.cal.FollowedSeriesIDs {
		if id != seriesID {
			filtered = append(filtered, id)
		}
	}
	f.cal.FollowedSeriesIDs = filtered
	return f.cal, nil
}

func TestHandleCalendarSeriesFollowEmitsLoaded(t *testing.T) {
	svc := &fakeCalendarSeriesService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	HandleCalendarSeriesFollow("beginner-lmgt3-fixed", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	if svc.followCalls != 1 {
		t.Fatalf("followCalls=%d, want 1", svc.followCalls)
	}
}

func TestHandleCalendarSeriesFollowErrorEmitsError(t *testing.T) {
	svc := &fakeCalendarSeriesService{
		cal:       calendar.NewDefaultCalendar(),
		followErr: errors.New("series not found"),
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarSeriesFollow("nonexistent", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	if svc.followCalls != 1 {
		t.Fatalf("followCalls=%d, want 1", svc.followCalls)
	}
}

func TestHandleCalendarSeriesUnfollowEmitsLoaded(t *testing.T) {
	svc := &fakeCalendarSeriesService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	HandleCalendarSeriesUnfollow("beginner-lmgt3-fixed", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	if svc.unfollowCalls != 1 {
		t.Fatalf("unfollowCalls=%d, want 1", svc.unfollowCalls)
	}
}

func TestHandleCalendarSeriesUnfollowErrorEmitsError(t *testing.T) {
	svc := &fakeCalendarSeriesService{
		cal:         calendar.NewDefaultCalendar(),
		unfollowErr: errors.New("persist error"),
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarSeriesUnfollow("beginner-lmgt3-fixed", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	if svc.unfollowCalls != 1 {
		t.Fatalf("unfollowCalls=%d, want 1", svc.unfollowCalls)
	}
}

// TestHandleCalendarSeriesFollowWithRealService verifies the full round-trip with a
// real *calendar.Service.
func TestHandleCalendarSeriesFollowWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	// Set up series via ApplyOfficialSchedule.
	now := time.Date(2026, time.July, 2, 12, 0, 0, 0, time.UTC)
	if err := svc.ApplyOfficialSchedule(now); err != nil {
		t.Fatalf("ApplyOfficialSchedule: %v", err)
	}

	// Follow a series.
	HandleCalendarSeriesFollow("beginner-lmgt3-fixed", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("follow events=%v, want [calendar:loaded]", emitter.events)
	}
	cal2 := svc.Calendar()
	if len(cal2.FollowedSeriesIDs) != 1 || cal2.FollowedSeriesIDs[0] != "beginner-lmgt3-fixed" {
		t.Fatalf("FollowedSeriesIDs=%v, want [beginner-lmgt3-fixed]", cal2.FollowedSeriesIDs)
	}
}

// TestHandleCalendarSeriesFollowInvalidWithRealService verifies that following a
// nonexistent series emits calendar:error and does not change the calendar.
func TestHandleCalendarSeriesFollowInvalidWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarSeriesFollow("nonexistent-series", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	cal := svc.Calendar()
	if len(cal.FollowedSeriesIDs) != 0 {
		t.Errorf("FollowedSeriesIDs=%v after failed follow, want empty", cal.FollowedSeriesIDs)
	}
}

// TestHandleCalendarSeriesUnfollowWithRealService verifies the full unfollow
// round-trip with a real *calendar.Service.
func TestHandleCalendarSeriesUnfollowWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Set up series and follow one.
	now := time.Date(2026, time.July, 2, 12, 0, 0, 0, time.UTC)
	if err := svc.ApplyOfficialSchedule(now); err != nil {
		t.Fatalf("ApplyOfficialSchedule: %v", err)
	}
	emitter := &spyCalendarEmitter{}
	HandleCalendarSeriesFollow("beginner-lmgt3-fixed", svc, svc, emitter, func(string, ...any) {})
	if len(svc.Calendar().FollowedSeriesIDs) != 1 {
		t.Fatalf("expected 1 followed series after follow")
	}

	// Unfollow.
	emitter2 := &spyCalendarEmitter{}
	HandleCalendarSeriesUnfollow("beginner-lmgt3-fixed", svc, svc, emitter2, func(string, ...any) {})

	if len(emitter2.events) != 1 || emitter2.events[0] != "calendar:loaded" {
		t.Fatalf("unfollow events=%v, want [calendar:loaded]", emitter2.events)
	}
	cal2 := svc.Calendar()
	if len(cal2.FollowedSeriesIDs) != 0 {
		t.Errorf("FollowedSeriesIDs=%v after unfollow, want empty", cal2.FollowedSeriesIDs)
	}
}

// TestHandleCalendarSeriesFollowPersistsToDisk verifies that after a successful
// series follow, the data is persisted to disk and survives a reload.
func TestHandleCalendarSeriesFollowPersistsToDisk(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Set up series.
	now := time.Date(2026, time.July, 2, 12, 0, 0, 0, time.UTC)
	if err := svc.ApplyOfficialSchedule(now); err != nil {
		t.Fatalf("ApplyOfficialSchedule: %v", err)
	}

	// Follow a series.
	emitter := &spyCalendarEmitter{}
	HandleCalendarSeriesFollow("beginner-lmgt3-fixed", svc, svc, emitter, func(string, ...any) {})

	// Reload from disk.
	svc2 := calendar.NewService(dir, time.Now)
	if err := svc2.Load(); err != nil {
		t.Fatalf("svc2.Load: %v", err)
	}
	cal := svc2.Calendar()
	if len(cal.FollowedSeriesIDs) != 1 || cal.FollowedSeriesIDs[0] != "beginner-lmgt3-fixed" {
		t.Fatalf("FollowedSeriesIDs=%v after reload, want [beginner-lmgt3-fixed]", cal.FollowedSeriesIDs)
	}
}

func TestHandleCalendarFollowEmitsLoaded(t *testing.T) {
	svc := &fakeCalendarFollowService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	HandleCalendarFollow("ev-1", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	if svc.followCalls != 1 {
		t.Fatalf("followCalls=%d, want 1", svc.followCalls)
	}
}

func TestHandleCalendarFollowErrorEmitsError(t *testing.T) {
	svc := &fakeCalendarFollowService{
		cal:       calendar.NewDefaultCalendar(),
		followErr: errors.New("event not found"),
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarFollow("nonexistent", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	if svc.followCalls != 1 {
		t.Fatalf("followCalls=%d, want 1", svc.followCalls)
	}
}

func TestHandleCalendarUnfollowEmitsLoaded(t *testing.T) {
	svc := &fakeCalendarFollowService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}

	HandleCalendarUnfollow("ev-1", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:loaded" {
		t.Fatalf("events=%v, want [calendar:loaded]", emitter.events)
	}
	if svc.unfollowCalls != 1 {
		t.Fatalf("unfollowCalls=%d, want 1", svc.unfollowCalls)
	}
}

func TestHandleCalendarUnfollowErrorEmitsError(t *testing.T) {
	svc := &fakeCalendarFollowService{
		cal:         calendar.NewDefaultCalendar(),
		unfollowErr: errors.New("persist error"),
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarUnfollow("ev-1", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	if svc.unfollowCalls != 1 {
		t.Fatalf("unfollowCalls=%d, want 1", svc.unfollowCalls)
	}
}

// TestHandleCalendarFollowWithRealService verifies the full round-trip with a
// real *calendar.Service.
func TestHandleCalendarFollowWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	// Import an event first.
	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})
	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("expected 1 event after import, got %d", len(cal.Events))
	}
	eventID := cal.Events[0].ID

	// Follow the event.
	emitter2 := &spyCalendarEmitter{}
	HandleCalendarFollow(eventID, svc, svc, emitter2, func(string, ...any) {})

	if len(emitter2.events) != 1 || emitter2.events[0] != "calendar:loaded" {
		t.Fatalf("follow events=%v, want [calendar:loaded]", emitter2.events)
	}
	cal2 := svc.Calendar()
	if len(cal2.FollowedEventIDs) != 1 || cal2.FollowedEventIDs[0] != eventID {
		t.Fatalf("FollowedEventIDs=%v, want [%s]", cal2.FollowedEventIDs, eventID)
	}
}

// TestHandleCalendarFollowInvalidWithRealService verifies that following a
// nonexistent event emits calendar:error and does not change the calendar.
func TestHandleCalendarFollowInvalidWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	HandleCalendarFollow("nonexistent", svc, svc, emitter, func(string, ...any) {})

	if len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("events=%v, want [calendar:error]", emitter.events)
	}
	cal := svc.Calendar()
	if len(cal.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs=%v after failed follow, want empty", cal.FollowedEventIDs)
	}
}

// TestHandleCalendarUnfollowWithRealService verifies the full unfollow
// round-trip with a real *calendar.Service.
func TestHandleCalendarUnfollowWithRealService(t *testing.T) {
	dir := t.TempDir()
	svc := calendar.NewService(dir, time.Now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	emitter := &spyCalendarEmitter{}

	// Import an event and follow it.
	text := "Martes 2 Julio | 20:00 | Race | Le Mans | 45"
	HandleCalendarImport(text, "Europe/Madrid", "discord-lmu-week", svc, svc, emitter, func(string, ...any) {})
	cal := svc.Calendar()
	eventID := cal.Events[0].ID
	HandleCalendarFollow(eventID, svc, svc, emitter, func(string, ...any) {})
	if len(svc.Calendar().FollowedEventIDs) != 1 {
		t.Fatalf("expected 1 followed event after follow")
	}

	// Unfollow.
	emitter2 := &spyCalendarEmitter{}
	HandleCalendarUnfollow(eventID, svc, svc, emitter2, func(string, ...any) {})

	if len(emitter2.events) != 1 || emitter2.events[0] != "calendar:loaded" {
		t.Fatalf("unfollow events=%v, want [calendar:loaded]", emitter2.events)
	}
	cal2 := svc.Calendar()
	if len(cal2.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs=%v after unfollow, want empty", cal2.FollowedEventIDs)
	}
}
