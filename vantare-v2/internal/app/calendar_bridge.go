package app

import (
	"github.com/vantare/overlays/v2/internal/calendar"
	"sync"
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

// CalendarFollower abstracts the Follow method of *calendar.Service.
type CalendarFollower interface {
	Follow(eventID string) (calendar.Calendar, error)
}

// CalendarUnfollower abstracts the Unfollow method of *calendar.Service.
type CalendarUnfollower interface {
	Unfollow(eventID string) (calendar.Calendar, error)
}

// CalendarSeriesFollower abstracts the FollowSeries method of *calendar.Service.
type CalendarSeriesFollower interface {
	FollowSeries(seriesID string) (calendar.Calendar, error)
}

// CalendarSeriesUnfollower abstracts the UnfollowSeries method of *calendar.Service.
type CalendarSeriesUnfollower interface {
	UnfollowSeries(seriesID string) (calendar.Calendar, error)
}

// HandleCalendarGet emits the current calendar document.
func HandleCalendarGet(svc CalendarGetter, emitter EventEmitter) {
	cal := svc.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
}

// HandleCalendarRefresh reports lifecycle separately from calendar:get. Failed
// refreshes keep the displayed document; private error details stay in the log.
func HandleCalendarRefresh(svc CalendarGetter, refresh func() error, emitter EventEmitter, status *CalendarRefreshStatus) {
	status.emitTransition("pending", "calendar:refresh:started", map[string]any{}, emitter)
	if err := refresh(); err != nil {
		status.emitTransition("error", "calendar:refresh:result", map[string]any{"ok": false}, emitter)
		return
	}
	HandleCalendarGet(svc, emitter)
	status.emitTransition("success", "calendar:refresh:result", map[string]any{"ok": true}, emitter)
}

// CalendarRefreshStatus retains lifecycle state for clients that mount after startup.
// Its zero value is ready to use. Snapshot emission is ordered with transitions.
type CalendarRefreshStatus struct {
	mu    sync.Mutex
	state string
}

func (s *CalendarRefreshStatus) emitTransition(state, event string, payload any, emitter EventEmitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state = state
	emitter.Emit(event, payload)
}

func (s *CalendarRefreshStatus) EmitCurrent(emitter EventEmitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state := s.state
	if state == "" {
		state = "idle"
	}
	emitter.Emit("calendar:refresh:status", map[string]any{"state": state})
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

// HandleCalendarFollow marks an event as followed and emits the updated
// calendar. Returns calendar:error if the eventID does not exist.
func HandleCalendarFollow(eventID string, svc CalendarFollower, getter CalendarGetter, emitter EventEmitter, logf func(string, ...any), allowed bool) {
	if !allowed {
		emitter.Emit("calendar:error", map[string]any{"message": "calendar reminders are not permitted"})
		return
	}
	if _, err := svc.Follow(eventID); err != nil {
		logf("calendar:follow error: %v", err)
		emitter.Emit("calendar:error", map[string]any{"message": err.Error()})
		return
	}
	cal := getter.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
}

// HandleCalendarUnfollow removes an event from the followed list and emits
// the updated calendar.
func HandleCalendarUnfollow(eventID string, svc CalendarUnfollower, getter CalendarGetter, emitter EventEmitter, logf func(string, ...any)) {
	if _, err := svc.Unfollow(eventID); err != nil {
		logf("calendar:unfollow error: %v", err)
		emitter.Emit("calendar:error", map[string]any{"message": err.Error()})
		return
	}
	cal := getter.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
}

// HandleCalendarSeriesFollow marks a series as followed and emits the updated
// calendar. Returns calendar:error if the seriesID does not exist.
func HandleCalendarSeriesFollow(seriesID string, svc CalendarSeriesFollower, getter CalendarGetter, emitter EventEmitter, logf func(string, ...any), requestID string, allowed bool) {
	result := map[string]any{"requestId": requestID, "seriesId": seriesID, "followed": true, "ok": false}
	defer func() { emitter.Emit("calendar:series:follow:result", result) }()
	if !allowed {
		emitter.Emit("calendar:error", map[string]any{"message": "calendar reminders are not permitted"})
		return
	}
	if _, err := svc.FollowSeries(seriesID); err != nil {
		logf("calendar:series:follow error: %v", err)
		emitter.Emit("calendar:error", map[string]any{"message": err.Error()})
		return
	}
	cal := getter.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
	result["ok"] = true
}

// HandleCalendarSeriesUnfollow removes a series from the followed list and emits
// the updated calendar.
func HandleCalendarSeriesUnfollow(seriesID string, svc CalendarSeriesUnfollower, getter CalendarGetter, emitter EventEmitter, logf func(string, ...any), requestID string) {
	result := map[string]any{"requestId": requestID, "seriesId": seriesID, "followed": false, "ok": false}
	defer func() { emitter.Emit("calendar:series:follow:result", result) }()
	if _, err := svc.UnfollowSeries(seriesID); err != nil {
		logf("calendar:series:unfollow error: %v", err)
		emitter.Emit("calendar:error", map[string]any{"message": err.Error()})
		return
	}
	cal := getter.Calendar()
	emitter.Emit("calendar:loaded", map[string]any{"calendar": cal})
	result["ok"] = true
}
