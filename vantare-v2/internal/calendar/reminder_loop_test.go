package calendar

import (
	"context"
	"testing"
	"time"
)

func TestReminderDedupe_FiltersDuplicate(t *testing.T) {
	d := NewReminderDedupe()
	r := Reminder{EventID: "ev-1", MinutesLeft: 30}

	first := d.Filter([]Reminder{r})
	if len(first) != 1 {
		t.Fatalf("first Filter = %d, want 1", len(first))
	}

	second := d.Filter([]Reminder{r})
	if len(second) != 0 {
		t.Fatalf("second Filter = %d, want 0 (duplicate)", len(second))
	}
}

func TestReminderDedupe_DifferentThresholdsBothEmit(t *testing.T) {
	d := NewReminderDedupe()
	r1 := Reminder{EventID: "ev-1", MinutesLeft: 30}
	r2 := Reminder{EventID: "ev-1", MinutesLeft: 15}

	first := d.Filter([]Reminder{r1, r2})
	if len(first) != 2 {
		t.Fatalf("first Filter = %d, want 2", len(first))
	}

	second := d.Filter([]Reminder{r1, r2})
	if len(second) != 0 {
		t.Fatalf("second Filter = %d, want 0", len(second))
	}
}

func TestReminderDedupe_DifferentEventsBothEmit(t *testing.T) {
	d := NewReminderDedupe()
	r1 := Reminder{EventID: "ev-1", MinutesLeft: 30}
	r2 := Reminder{EventID: "ev-2", MinutesLeft: 30}

	first := d.Filter([]Reminder{r1, r2})
	if len(first) != 2 {
		t.Fatalf("first Filter = %d, want 2", len(first))
	}

	second := d.Filter([]Reminder{r1, r2})
	if len(second) != 0 {
		t.Fatalf("second Filter = %d, want 0", len(second))
	}
}

func TestReminderDedupe_ResetAllowsReEmit(t *testing.T) {
	d := NewReminderDedupe()
	r := Reminder{EventID: "ev-1", MinutesLeft: 30}

	first := d.Filter([]Reminder{r})
	if len(first) != 1 {
		t.Fatalf("first Filter = %d, want 1", len(first))
	}

	d.Reset()

	second := d.Filter([]Reminder{r})
	if len(second) != 1 {
		t.Fatalf("after Reset Filter = %d, want 1", len(second))
	}
}

func TestReminderDedupe_NilOrEmptyInput(t *testing.T) {
	d := NewReminderDedupe()
	if out := d.Filter(nil); len(out) != 0 {
		t.Fatalf("Filter(nil) = %d, want 0", len(out))
	}
	if out := d.Filter([]Reminder{}); len(out) != 0 {
		t.Fatalf("Filter(empty) = %d, want 0", len(out))
	}
}

// newPinnedService creates a Service whose now() always returns the same
// instant. This is needed for loop tests where DueReminders must see a stable
// time across multiple calls.
func newPinnedService(t *testing.T, now time.Time) *Service {
	t.Helper()
	dir := t.TempDir()
	svc := NewService(dir, func() time.Time { return now })
	return svc
}

// TestStartReminderLoop_EmitsOnceThenDeduplicates verifies that the same
// reminder is emitted only once across multiple ticks.
func TestStartReminderLoop_EmitsOnceThenDeduplicates(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newPinnedService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 30, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tick := make(chan time.Time, 10)
	emitted := make(chan Reminder, 10)

	go StartReminderLoop(ctx, svc, tick, func() time.Time { return now }, func(r Reminder) {
		emitted <- r
	})

	// Send two ticks with the same time.
	tick <- now
	tick <- now

	// Only one reminder should be emitted (dedupe suppresses the second).
	select {
	case r := <-emitted:
		if r.EventID != "ev-1" {
			t.Fatalf("emitted event %q, want ev-1", r.EventID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for first reminder")
	}

	// No second reminder should arrive.
	select {
	case <-emitted:
		t.Fatal("received unexpected second reminder (dedupe should suppress repeats)")
	case <-time.After(50 * time.Millisecond):
	}
}

// TestStartReminderLoop_ContextCancelStopsLoop verifies that cancelling the
// context causes the loop to exit without emitting after cancellation.
func TestStartReminderLoop_ContextCancelStopsLoop(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newPinnedService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 30, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	tick := make(chan time.Time)

	done := make(chan struct{})
	go func() {
		StartReminderLoop(ctx, svc, tick, func() time.Time { return now }, func(r Reminder) {})
		close(done)
	}()

	cancel()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("loop did not exit within 1s after context cancel")
	}
}

// TestStartReminderLoop_DifferentThresholdsBothEmit verifies that two
// different thresholds for the same event both fire. Uses a channel-backed
// clock so the test can control what time DueReminders sees.
func TestStartReminderLoop_DifferentThresholdsBothEmit(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newPinnedService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 30, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tick := make(chan time.Time, 10)
	// clockCh delivers the "current time" for each tickFn call.
	clockCh := make(chan time.Time, 10)
	clock := func() time.Time { return <-clockCh }
	emitted := make(chan Reminder, 10)

	go StartReminderLoop(ctx, svc, tick, clock, func(r Reminder) {
		emitted <- r
	})

	// Tick at 12:00 — 30 min before start, triggers 30.
	tick <- now
	clockCh <- now

	select {
	case r := <-emitted:
		if r.MinutesLeft != 30 {
			t.Fatalf("first reminder MinutesLeft = %d, want 30", r.MinutesLeft)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for first reminder (30 min)")
	}

	// Tick at 12:15 — 15 min before start, triggers 15.
	now2 := time.Date(2026, time.July, 1, 12, 15, 0, 0, time.UTC)
	tick <- now2
	clockCh <- now2

	select {
	case r := <-emitted:
		if r.MinutesLeft != 15 {
			t.Fatalf("second reminder MinutesLeft = %d, want 15", r.MinutesLeft)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for second reminder (15 min)")
	}
}
