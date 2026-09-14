package calendar

import (
	"context"
	"testing"
	"time"
)

func TestReminderLoopDoesNotConsumeReminderBeforePermission(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newPinnedService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	ev := eventAt(t, "Race", now.Add(30*time.Minute), 60)
	ev.ID = "permission-event"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Follow(ev.ID); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tick := make(chan time.Time)
	permission := make(chan bool)
	emitted := make(chan Reminder, 2)
	done := make(chan struct{})
	go func() {
		StartReminderLoop(ctx, svc, tick, func() time.Time { return now }, func() bool {
			select {
			case allowed := <-permission:
				return allowed
			case <-ctx.Done():
				return false
			}
		}, func(r Reminder) { emitted <- r })
		close(done)
	}()
	// The callback used to gate only after dedupe had consumed the reminder.
	for _, allowed := range []bool{false, true} {
		select {
		case tick <- now:
		case <-time.After(time.Second):
			t.Fatal("loop did not accept tick")
		}
		select {
		case permission <- allowed:
		case <-time.After(time.Second):
			t.Fatal("permission not checked before reminder processing")
		}
	}
	select {
	case r := <-emitted:
		if r.EventID != ev.ID {
			t.Fatalf("unexpected reminder %v", r)
		}
	case <-time.After(time.Second):
		t.Fatal("reminder lost while permission was unavailable")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("loop did not stop")
	}
	if len(emitted) != 0 {
		t.Fatal("reminder emitted without permission or duplicated")
	}
}
