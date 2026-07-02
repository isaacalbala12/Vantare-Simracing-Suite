package app

import (
	"github.com/vantare/overlays/v2/internal/calendar"
)

// CalendarGetter abstracts the Calendar() method of *calendar.Service.
type CalendarGetter interface {
	Calendar() calendar.Calendar
}

// CalendarReplacer abstracts the Replace() method of *calendar.Service.
type CalendarReplacer interface {
	Replace(events []calendar.RaceEvent, timezone, source string) ([]calendar.RaceEvent, error)
}

// CalendarClearer abstracts the Clear() method of *calendar.Service.
type CalendarClearer interface {
	Clear() error
}

// HandleCalendarGet emits the current calendar document.
func HandleCalendarGet(svc CalendarGetter, emitter EventEmitter) {
	cal := svc.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
}

// HandleCalendarImport parses the pasted text, replaces the calendar, and
// emits the updated document. On parse or replace failure it emits
// calendar:error and does NOT modify the stored calendar.
func HandleCalendarImport(text, timezone, source string, replacer CalendarReplacer, getter CalendarGetter, emitter EventEmitter, logf func(string, ...any)) {
	events, err := calendar.Parse(text, timezone)
	if err != nil {
		logf("calendar:import parse error: %v", err)
		emitter.Emit("calendar:error", map[string]any{"message": err.Error()})
		return
	}
	if _, err := replacer.Replace(events, timezone, source); err != nil {
		logf("calendar:import replace error: %v", err)
		emitter.Emit("calendar:error", map[string]any{"message": err.Error()})
		return
	}
	cal := getter.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
}

// HandleCalendarClear empties the calendar and emits the updated document.
func HandleCalendarClear(svc CalendarClearer, getter CalendarGetter, emitter EventEmitter, logf func(string, ...any)) {
	if err := svc.Clear(); err != nil {
		logf("calendar:clear error: %v", err)
		emitter.Emit("calendar:error", map[string]any{"message": err.Error()})
		return
	}
	cal := getter.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
}
