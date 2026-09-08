package calendar

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDueRemindersFollowedRealSeries(t *testing.T) {
	schedule, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatal(err)
	}
	svc := newTempService(t, schedule.ValidFrom)
	if err := svc.ApplyOfficialSchedule(schedule.ValidFrom); err != nil {
		t.Fatal(err)
	}
	series := schedule.Series[0]
	var event RaceEvent
	for _, candidate := range svc.Calendar().Events {
		if candidate.Series == series.Name {
			event = candidate
			break
		}
	}
	if event.ID == "" {
		t.Fatal("real seed has no first-series event")
	}
	svc.cal.ReminderMinutes = []int{2}
	now := event.StartTime.Add(-2 * time.Minute)
	if _, err := svc.FollowSeries(series.ID); err != nil {
		t.Fatal(err)
	}
	restarted := NewService(filepath.Dir(svc.Path()), func() time.Time { return now })
	if err := restarted.Load(); err != nil {
		t.Fatal(err)
	}
	svc = restarted
	assertOne := func() []Reminder {
		t.Helper()
		got := svc.DueReminders(now)
		if len(got) != 1 || got[0].EventID != event.ID {
			t.Fatalf("reminders=%v, want event %s", got, event.ID)
		}
		return got
	}
	assertOne()
	if _, err := svc.Follow(event.ID); err != nil {
		t.Fatal(err)
	}
	dedupe := NewReminderDedupe()
	if len(dedupe.Filter(assertOne())) != 1 || len(dedupe.Filter(assertOne())) != 0 {
		t.Fatal("duplicate reminder")
	}
	if _, err := svc.Unfollow(event.ID); err != nil {
		t.Fatal(err)
	}
	assertOne()
	if _, err := svc.UnfollowSeries(series.ID); err != nil {
		t.Fatal(err)
	}
	if got := svc.DueReminders(now); len(got) != 0 {
		t.Fatalf("unfollowed: %v", got)
	}
	if _, err := svc.FollowSeries(series.ID); err != nil {
		t.Fatal(err)
	}
	if got := svc.DueReminders(schedule.ValidUntil.Add(time.Hour)); len(got) != 0 {
		t.Fatalf("exhausted publication: %v", got)
	}
}

func TestDueRemindersRealSeriesBeyondMaterializedWindow(t *testing.T) {
	schedule, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatal(err)
	}
	svc := newTempService(t, schedule.ValidFrom.Add(-24*time.Hour))
	if err := svc.ApplyOfficialSchedule(schedule.ValidFrom.Add(-24 * time.Hour)); err != nil {
		t.Fatal(err)
	}
	series := schedule.Series[0]
	if _, err := svc.FollowSeries(series.ID); err != nil {
		t.Fatal(err)
	}
	from := schedule.ValidUntil.Add(-12 * time.Hour)
	events, err := ExpandSeries(series, schedule, from, from.Add(time.Hour))
	if err != nil || len(events) == 0 {
		t.Fatalf("seed expansion: %v / %d", err, len(events))
	}
	target := events[0]
	for _, ev := range svc.Calendar().Events {
		if ev.ID == target.ID {
			t.Fatal("regression needs an occurrence beyond saved preview")
		}
	}
	got := svc.DueReminders(target.StartTime.Add(-2 * time.Minute))
	if len(got) != 1 || got[0].EventID != target.ID {
		t.Fatalf("got %v, want missing-preview occurrence %s", got, target.ID)
	}
}

func TestDueRemindersThresholdSeconds(t *testing.T) {
	now := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		seconds int
		want    int
	}{
		{121, 0}, {120, 1}, {119, 1}, {61, 1}, {60, 0}, {0, 0}, {-1, 0},
	} {
		t.Run((time.Duration(tc.seconds) * time.Second).String(), func(t *testing.T) {
			svc := newTempService(t, now)
			svc.cal = NewDefaultCalendar()
			svc.cal.ReminderMinutes = []int{2}
			svc.cal.Events = []RaceEvent{{ID: "followed", StartTime: now.Add(time.Duration(tc.seconds) * time.Second)}}
			svc.cal.FollowedEventIDs = []string{"followed"}
			if got := svc.DueReminders(now); len(got) != tc.want {
				t.Fatalf("%ds: count=%d, want %d", tc.seconds, len(got), tc.want)
			}
		})
	}
}

func TestDueRemindersSeriesIdentity(t *testing.T) {
	now := time.Date(2026, 7, 1, 11, 58, 0, 0, time.UTC)
	series := validSchedule().Series[0]
	for _, tc := range []struct {
		name   string
		mutate func(*RaceEvent)
	}{
		{"canonical", func(*RaceEvent) {}},
		{"same title different id", func(ev *RaceEvent) { ev.ID = "imported" }},
		{"same id different source", func(ev *RaceEvent) { ev.Source = "import" }},
		{"changed title keeps identity", func(ev *RaceEvent) { ev.Title = "changed"; ev.Series = "changed" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ev := makeSeriesEvent(series, now.Add(2*time.Minute))
			tc.mutate(&ev)
			svc := newTempService(t, now)
			svc.cal = NewDefaultCalendar()
			svc.cal.Timezone = "UTC"
			svc.cal.Schedule = &ScheduleMetadata{ValidFrom: validSchedule().ValidFrom, ValidUntil: validSchedule().ValidUntil}
			svc.cal.ReminderMinutes = []int{2}
			svc.cal.Events = []RaceEvent{ev}
			svc.cal.Series = []RaceSeries{series}
			svc.cal.FollowedSeriesIDs = []string{series.ID}
			got := svc.DueReminders(now)
			canonical := makeSeriesEvent(series, now.Add(2*time.Minute))
			if len(got) != 1 || got[0].EventID != canonical.ID || got[0].Title != series.Name {
				t.Fatalf("got %v, want one canonical series occurrence independent of saved event", got)
			}
			svc.cal.Schedule = nil
			if got := svc.DueReminders(now); len(got) != 0 {
				t.Fatal("unknown validity generated reminders")
			}
		})
	}
}
