package calendar

import (
	"context"
	"fmt"
	"time"
)

// ReminderDedupe tracks which (eventId, minutesLeft) pairs have already been
// emitted so the loop does not fire the same reminder twice.
type ReminderDedupe struct {
	seen map[string]struct{}
}

// NewReminderDedupe creates an empty dedupe set.
func NewReminderDedupe() *ReminderDedupe {
	return &ReminderDedupe{seen: make(map[string]struct{})}
}

func dedupeKey(r Reminder) string {
	return fmt.Sprintf("%s|%d", r.EventID, r.MinutesLeft)
}

// Filter returns reminders that have not been seen before, and marks them as
// seen. A nil or empty input returns an empty slice.
func (d *ReminderDedupe) Filter(reminders []Reminder) []Reminder {
	if len(reminders) == 0 {
		return []Reminder{}
	}
	out := make([]Reminder, 0, len(reminders))
	for _, r := range reminders {
		k := dedupeKey(r)
		if _, ok := d.seen[k]; ok {
			continue
		}
		d.seen[k] = struct{}{}
		out = append(out, r)
	}
	if len(out) == 0 {
		return []Reminder{}
	}
	return out
}

// Reset clears the dedupe set. Useful when the calendar is re-imported so
// reminders can fire again for the new event set.
func (d *ReminderDedupe) Reset() {
	d.seen = make(map[string]struct{})
}

// ReminderEmitter is the callback signature for the reminder loop.
type ReminderEmitter func(Reminder)

// StartReminderLoop runs a ticker that calls DueReminders and emits new
// reminders via emit. It blocks until ctx is cancelled. The tick channel
// provides the pulse; in production use time.NewTicker(interval).C.
// now is injectable for deterministic tests; if nil, time.Now is used.
func StartReminderLoop(ctx context.Context, svc *Service, tick <-chan time.Time, now func() time.Time, emit ReminderEmitter) {
	if now == nil {
		now = time.Now
	}
	dedupe := NewReminderDedupe()

	for {
		select {
		case <-ctx.Done():
			return
		case <-tick:
			for _, r := range dedupe.Filter(svc.DueReminders(now())) {
				emit(r)
			}
		}
	}
}
