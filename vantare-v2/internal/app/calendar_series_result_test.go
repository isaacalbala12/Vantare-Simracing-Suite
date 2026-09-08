package app

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/calendar"
)

func TestCalendarSeriesFollowResultAfterPersistence(t *testing.T) {
	for _, following := range []bool{false, true} {
		for _, fails := range []bool{false, true} {
			svc := &fakeCalendarSeriesService{cal: calendar.NewDefaultCalendar()}
			if fails {
				svc.followErr = errors.New("save failed")
				svc.unfollowErr = svc.followErr
			}
			emitter := &spyCalendarEmitter{}
			if following {
				HandleCalendarSeriesFollow("series", svc, svc, emitter, func(string, ...any) {}, "ui-request", true)
			} else {
				HandleCalendarSeriesUnfollow("series", svc, svc, emitter, func(string, ...any) {}, "ui-request")
			}
			if len(emitter.events) != 2 || emitter.events[1] != "calendar:series:follow:result" {
				t.Fatalf("following=%v fails=%v events=%v, missing terminal result", following, fails, emitter.events)
			}
			result := emitter.data[1].(map[string]any)
			if result["requestId"] != "ui-request" || result["ok"] != !fails || result["followed"] != following || result["seriesId"] != "series" {
				t.Errorf("wrong result: %v", result)
			}
		}
	}
}
