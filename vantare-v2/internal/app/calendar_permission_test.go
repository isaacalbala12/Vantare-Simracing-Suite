package app

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/calendar"
)

func TestCalendarFollowDeniedBeforeServiceMutation(t *testing.T) {
	events := &fakeCalendarFollowService{cal: calendar.NewDefaultCalendar()}
	emitter := &spyCalendarEmitter{}
	HandleCalendarFollow("event", events, events, emitter, func(string, ...any) {}, false)
	if events.followCalls != 0 || len(emitter.events) != 1 || emitter.events[0] != "calendar:error" {
		t.Fatalf("calls=%d events=%v", events.followCalls, emitter.events)
	}
	series := &fakeCalendarSeriesService{cal: calendar.NewDefaultCalendar()}
	emitter = &spyCalendarEmitter{}
	HandleCalendarSeriesFollow("series", series, series, emitter, func(string, ...any) {}, "denied-request", false)
	if series.followCalls != 0 || len(emitter.events) != 2 || emitter.events[0] != "calendar:error" || emitter.events[1] != "calendar:series:follow:result" {
		t.Fatalf("calls=%d events=%v", series.followCalls, emitter.events)
	}
	result := emitter.data[1].(map[string]any)
	if result["ok"] != false || result["requestId"] != "denied-request" || result["seriesId"] != "series" {
		t.Fatalf("wrong denial result: %v", result)
	}
}
