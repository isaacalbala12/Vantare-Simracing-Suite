package radio

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeClock struct{ now atomic.Int64 }

func newFakeClock(now int64) *fakeClock { clock := &fakeClock{}; clock.now.Store(now); return clock }
func (clock *fakeClock) NowMS() int64   { return clock.now.Load() }
func (clock *fakeClock) set(now int64)  { clock.now.Store(now) }

func testMessage(id, intent, subject string, priority Priority, created int64) RadioMessage {
	return RadioMessage{Version: VersionV1, ID: id, Source: "engineer", Intent: intent, Subject: subject,
		Priority: priority, CreatedAtMS: created, ExpiresAtMS: created + 1_000, Locale: LocaleES,
		Payload: map[string]string{"value": id}}
}

func newTestBus(t testing.TB, limits Limits, clock Clock) *Bus {
	t.Helper()
	bus, err := NewBus(limits, clock)
	if err != nil {
		t.Fatalf("NewBus() error = %v", err)
	}
	return bus
}

func nextID(t testing.TB, bus *Bus) string {
	t.Helper()
	item, ok := bus.Next(context.Background())
	if !ok {
		t.Fatal("Next() returned no item")
	}
	defer item.Done()
	return item.Message.ID
}

func TestSubmitValidationAndOwnership(t *testing.T) {
	clock := newFakeClock(100)
	cases := []struct {
		name   string
		mutate func(*RadioMessage)
	}{
		{"version", func(message *RadioMessage) { message.Version = "radio.v2" }},
		{"priority", func(message *RadioMessage) { message.Priority = PriorityP0 + 1 }},
		{"expired", func(message *RadioMessage) { message.ExpiresAtMS = 100 }},
		{"locale", func(message *RadioMessage) { message.Locale = "fr" }},
		{"nul", func(message *RadioMessage) { message.Source = "bad\x00source" }},
		{"payload item", func(message *RadioMessage) { message.Payload = map[string]string{"": "bad"} }},
		{"payload count", func(message *RadioMessage) { message.Payload = map[string]string{"a": "1", "b": "2"} }},
		{"payload bytes", func(message *RadioMessage) { message.Payload = map[string]string{"a": "12345"} }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			limits := DefaultLimits()
			if test.name == "payload count" {
				limits.MaxPayloadItems = 1
			}
			if test.name == "payload bytes" {
				limits.MaxPayloadBytes = 4
			}
			bus := newTestBus(t, limits, clock)
			message := testMessage("id", "intent", "subject", PriorityP2, 100)
			test.mutate(&message)
			if _, err := bus.Submit(message); !errors.Is(err, ErrInvalidMessage) {
				t.Fatalf("Submit() error = %v, want ErrInvalidMessage", err)
			}
		})
	}
	bus := newTestBus(t, DefaultLimits(), clock)
	message := testMessage("owned", "intent", "subject", PriorityP2, 100)
	if result, err := bus.Submit(message); err != nil || !result.Accepted {
		t.Fatalf("Submit() = %+v, %v", result, err)
	}
	message.Payload["value"] = "mutated"
	item, _ := bus.Next(context.Background())
	defer item.Done()
	if got := item.Message.Payload["value"]; got != "owned" {
		t.Fatalf("owned payload = %q", got)
	}
	ttlMessage := testMessage("ttl", "ttl", "subject", PriorityP2, 100)
	ttlMessage.ExpiresAtMS = 0
	ttlMessage.TTL = 250 * time.Millisecond
	if _, err := bus.Submit(ttlMessage); err != nil {
		t.Fatalf("TTL Submit() error = %v", err)
	}
	item.Done()
	ttlItem, ok := bus.Next(context.Background())
	if !ok || ttlItem.Message.ExpiresAtMS != 350 {
		t.Fatalf("TTL Next = %+v, %v", ttlItem, ok)
	}
	ttlItem.Done()
}

func TestSubmitPolicies(t *testing.T) {
	t.Run("dedup coalesces by intent and subject", func(t *testing.T) {
		clock := newFakeClock(100)
		bus := newTestBus(t, DefaultLimits(), clock)
		_, _ = bus.Submit(testMessage("old", "same", "car", PriorityP2, 100))
		newer := testMessage("new", "same", "car", PriorityP1, 101)
		result, err := bus.Submit(newer)
		if err != nil || !result.Accepted || !result.Coalesced || len(result.Dropped) != 1 {
			t.Fatalf("Submit() = %+v, %v", result, err)
		}
		if got := nextID(t, bus); got != "new" {
			t.Fatalf("Next ID = %q", got)
		}
		_, _ = bus.Submit(testMessage("other-subject", "same", "other", PriorityP2, 102))
		if got := nextID(t, bus); got != "other-subject" {
			t.Fatalf("subject-scoped dedup Next = %q", got)
		}
	})
	t.Run("cooldown is per intent and starts on the started ACK", func(t *testing.T) {
		limits := DefaultLimits()
		limits.Cooldowns = map[string]time.Duration{"gap": time.Second}
		clock := newFakeClock(100)
		bus := newTestBus(t, limits, clock)
		_, _ = bus.Submit(testMessage("first", "gap", "a", PriorityP2, 100))
		item, ok := bus.Next(context.Background())
		if !ok || item.Message.ID != "first" {
			t.Fatalf("Next = %+v, %v", item, ok)
		}
		item.Started()
		item.Started()
		item.Done()
		result, err := bus.Submit(testMessage("blocked", "gap", "b", PriorityP2, 101))
		if err != nil || result.Accepted {
			t.Fatalf("cooldown Submit = %+v, %v", result, err)
		}
		clock.set(1_100)
		allowed := testMessage("allowed", "gap", "b", PriorityP2, 1_100)
		allowed.ExpiresAtMS = 2_100
		result, err = bus.Submit(allowed)
		if err != nil || !result.Accepted {
			t.Fatalf("post-cooldown Submit = %+v, %v", result, err)
		}
	})
	t.Run("delivery cancelled before start leaves no cooldown", func(t *testing.T) {
		limits := DefaultLimits()
		limits.Cooldowns = map[string]time.Duration{"gap": time.Second}
		clock := newFakeClock(100)
		bus := newTestBus(t, limits, clock)
		_, _ = bus.Submit(testMessage("victim", "gap", "a", PriorityP2, 100))
		item, ok := bus.Next(context.Background())
		if !ok {
			t.Fatal("Next() returned no item")
		}
		if _, err := bus.Submit(testMessage("spotter", "spotter.car_left", "car", PriorityP0, 101)); err != nil {
			t.Fatalf("spotter Submit error = %v", err)
		}
		if !errors.Is(context.Cause(item.Context), ErrPreemptedBySpotter) {
			t.Fatal("expected active delivery preempted by spotter")
		}
		item.Done()
		result, err := bus.Submit(testMessage("retry", "gap", "a", PriorityP2, 102))
		if err != nil || !result.Accepted {
			t.Fatalf("resubmit after preemption = %+v, %v (no debe haber cooldown sin started)", result, err)
		}
	})
	t.Run("queue pressure evicts only worse", func(t *testing.T) {
		limits := DefaultLimits()
		limits.MaxPending = 2
		clock := newFakeClock(100)
		bus := newTestBus(t, limits, clock)
		_, _ = bus.Submit(testMessage("low-old", "a", "s", PriorityP3, 100))
		_, _ = bus.Submit(testMessage("low-new", "b", "s", PriorityP3, 100))
		result, _ := bus.Submit(testMessage("high", "c", "s", PriorityP1, 100))
		if !result.Accepted || len(result.Dropped) != 1 || result.Dropped[0].ID != "low-new" {
			t.Fatalf("eviction = %+v", result)
		}
		result, _ = bus.Submit(testMessage("rejected", "d", "s", PriorityP3, 100))
		if result.Accepted {
			t.Fatalf("equal pressure accepted: %+v", result)
		}
	})
	t.Run("spotter removes lower pending", func(t *testing.T) {
		clock := newFakeClock(100)
		bus := newTestBus(t, DefaultLimits(), clock)
		_, _ = bus.Submit(testMessage("low", "a", "s", PriorityP1, 100))
		result, _ := bus.Submit(testMessage("p0", "b", "s", PriorityP0, 100))
		if len(result.Dropped) != 1 || result.Dropped[0].ID != "low" {
			t.Fatalf("spotter drop = %+v", result)
		}
	})
}

func TestNextOrderTTLAndBurst(t *testing.T) {
	t.Run("total order", func(t *testing.T) {
		clock := newFakeClock(100)
		bus := newTestBus(t, DefaultLimits(), clock)
		for _, message := range []RadioMessage{testMessage("late", "a", "s", PriorityP2, 101), testMessage("first-seq", "b", "s", PriorityP2, 100), testMessage("second-seq", "c", "s", PriorityP2, 100), testMessage("top", "d", "s", PriorityP1, 102)} {
			_, _ = bus.Submit(message)
		}
		for _, want := range []string{"top", "first-seq", "second-seq", "late"} {
			if got := nextID(t, bus); got != want {
				t.Fatalf("Next = %q, want %q", got, want)
			}
		}
	})
	t.Run("expired never emits", func(t *testing.T) {
		clock := newFakeClock(100)
		bus := newTestBus(t, DefaultLimits(), clock)
		message := testMessage("expired", "a", "s", PriorityP1, 100)
		message.ExpiresAtMS = 101
		_, _ = bus.Submit(message)
		clock.set(101)
		if item, ok := bus.Next(context.Background()); ok || item != nil {
			t.Fatalf("expired Next = %+v, %v", item, ok)
		}
	})
	t.Run("non critical burst yields to oldest lower priority", func(t *testing.T) {
		limits := DefaultLimits()
		limits.MaxPriorityBurst = 2
		clock := newFakeClock(100)
		bus := newTestBus(t, limits, clock)
		_, _ = bus.Submit(testMessage("low", "low", "s", PriorityP3, 100))
		for index, id := range []string{"h1", "h2", "h3"} {
			message := testMessage(id, id, "s", PriorityP1, int64(101+index))
			_, _ = bus.Submit(message)
		}
		for _, want := range []string{"h1", "h2", "low", "h3"} {
			if got := nextID(t, bus); got != want {
				t.Fatalf("Next = %q, want %q", got, want)
			}
		}
	})
}

func TestSpotterCancelsActiveNonSpotter(t *testing.T) {
	clock := newFakeClock(100)
	bus := newTestBus(t, DefaultLimits(), clock)
	_, _ = bus.Submit(testMessage("active", "a", "s", PriorityP1, 100))
	item, _ := bus.Next(context.Background())
	defer item.Done()
	result, err := bus.Submit(testMessage("spotter", "spotter.car_left", "car", PriorityP0, 100))
	if err != nil || !result.ActivePreempted {
		t.Fatalf("Submit spotter = %+v, %v", result, err)
	}
	if !errors.Is(context.Cause(item.Context), ErrPreemptedBySpotter) {
		t.Fatalf("active cause = %v", context.Cause(item.Context))
	}
}

func TestSpotterDoesNotCancelActiveSpotter(t *testing.T) {
	clock := newFakeClock(100)
	bus := newTestBus(t, DefaultLimits(), clock)
	_, _ = bus.Submit(testMessage("active", "spotter.left", "car", PriorityP0, 100))
	item, _ := bus.Next(context.Background())
	defer item.Done()
	result, err := bus.Submit(testMessage("next", "spotter.right", "car", PriorityP0, 100))
	if err != nil || result.ActivePreempted {
		t.Fatalf("Submit P0 = %+v, %v", result, err)
	}
	if context.Cause(item.Context) != nil {
		t.Fatalf("active P0 cause = %v", context.Cause(item.Context))
	}
}

func TestConcurrentSubmissionsRemainBounded(t *testing.T) {
	limits := DefaultLimits()
	limits.MaxPending = 8
	bus := newTestBus(t, limits, newFakeClock(100))
	var wg sync.WaitGroup
	for index := 0; index < 8; index++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			message := testMessage(string(rune('a'+index)), string(rune('a'+index)), "s", PriorityP2, 100)
			if _, err := bus.Submit(message); err != nil {
				t.Errorf("Submit(%d) error = %v", index, err)
			}
		}(index)
	}
	wg.Wait()
	for index := 0; index < 8; index++ {
		item, ok := bus.Next(context.Background())
		if !ok {
			t.Fatalf("Next %d missing", index)
		}
		item.Done()
	}
}
