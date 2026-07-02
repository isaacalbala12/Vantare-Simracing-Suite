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
