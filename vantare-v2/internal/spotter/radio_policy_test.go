package spotter

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/radio"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func newSpotterHarness(t testing.TB, capacity int) (*benchmarkClock, *Producer, *radio.Bus) {
	t.Helper()
	clock := &benchmarkClock{now: 1_000}
	producer, err := NewProducer(clock, radio.LocaleES)
	if err != nil {
		t.Fatal(err)
	}
	limits := radio.DefaultLimits()
	limits.MaxPending = capacity
	bus, err := radio.NewBus(limits, clock)
	if err != nil {
		t.Fatal(err)
	}
	return clock, producer, bus
}

func submitSpotter(t testing.TB, bus *radio.Bus, message radio.RadioMessage) radio.SubmitResult {
	t.Helper()
	result, err := bus.Submit(message)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func startSpotter(t testing.TB, producer *Producer, bus *radio.Bus, want string, atMS int64) {
	t.Helper()
	item, ok := bus.Next(context.Background())
	if !ok || item.Message.Intent != want {
		t.Fatalf("next = %+v/%t, want %s", item, ok, want)
	}
	if err := producer.AcknowledgeStarted(item.Message, atMS); err != nil {
		t.Fatalf("started %s: %v", want, err)
	}
	item.Started()
	item.Done()
}

func TestSpotterMessageValueMatrixIsFiniteAndTyped(t *testing.T) {
	t.Parallel()
	want := map[Situation]map[string]radio.CoalesceValue{
		SituationAllClear: {
			IntentClearLeft: radio.CoalesceCompatible, IntentClearRight: radio.CoalesceCompatible,
			IntentAllClear: radio.CoalesceCurrent,
		},
		SituationLeft: {
			IntentCarLeft: radio.CoalesceCompatible, IntentStillThere: radio.CoalesceReminder,
			IntentClearRight: radio.CoalesceCurrent,
		},
		SituationRight: {
			IntentCarRight: radio.CoalesceCompatible, IntentStillThere: radio.CoalesceReminder,
			IntentClearLeft: radio.CoalesceCurrent,
		},
		SituationThreeWide: {
			IntentCarLeft: radio.CoalesceCompatible, IntentCarRight: radio.CoalesceCompatible,
			IntentStillThere: radio.CoalesceReminder, IntentThreeWide: radio.CoalesceCurrent,
		},
	}
	for situation := SituationAllClear; situation <= SituationThreeWide; situation++ {
		for _, intent := range allIntents() {
			got := messageValues[situation][kindForIntent(intent)]
			if got != want[situation][intent] {
				t.Errorf("situation=%d intent=%s value=%d, want %d", situation, intent, got, want[situation][intent])
			}
		}
	}
}

func TestSpotterRadioQueueSupersessionIsDeterministicAtAllCapacities(t *testing.T) {
	t.Parallel()
	for _, capacity := range []int{1, 4, 64} {
		t.Run(fmt.Sprintf("capacity=%d", capacity), func(t *testing.T) {
			t.Parallel()
			var baseline []string
			for iteration := 0; iteration < 50; iteration++ {
				clock := &benchmarkClock{now: 1_000}
				producer, err := NewProducer(clock, radio.LocaleES)
				if err != nil {
					t.Fatal(err)
				}
				limits := radio.DefaultLimits()
				limits.MaxPending = capacity
				bus, err := radio.NewBus(limits, clock)
				if err != nil {
					t.Fatal(err)
				}
				left, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
				if err != nil || !emit {
					t.Fatalf("left = %+v/%t/%v", left, emit, err)
				}
				if result, submitErr := bus.Submit(left); submitErr != nil || !result.Accepted {
					t.Fatalf("left submit = %+v/%v", result, submitErr)
				}
				both, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8, -2.8))
				if err != nil || !emit {
					t.Fatalf("both = %+v/%t/%v", both, emit, err)
				}
				if result, submitErr := bus.Submit(both); submitErr != nil || !result.Accepted || !result.Coalesced {
					t.Fatalf("both submit = %+v/%v", result, submitErr)
				}
				item, ok := bus.Next(context.Background())
				if !ok {
					t.Fatal("missing current Spotter state")
				}
				got := []string{item.Message.Intent}
				item.Done()
				if iteration == 0 {
					baseline = got
				} else if !reflect.DeepEqual(got, baseline) {
					t.Fatalf("iteration=%d got=%v baseline=%v", iteration, got, baseline)
				}
			}
			if !reflect.DeepEqual(baseline, []string{IntentThreeWide}) {
				t.Fatalf("baseline = %v", baseline)
			}
		})
	}
}

func TestSpotterRadioSupersessionMatrixIsExhaustiveAtAllCapacities(t *testing.T) {
	t.Parallel()
	for _, capacity := range []int{1, 4, 64} {
		for situation := SituationAllClear; situation <= SituationThreeWide; situation++ {
			for _, currentIntent := range allIntents() {
				currentValue := messageValues[situation][kindForIntent(currentIntent)]
				if currentValue == radio.CoalesceUnspecified {
					continue
				}
				for _, nextIntent := range allIntents() {
					nextValue := messageValues[situation][kindForIntent(nextIntent)]
					if nextValue == radio.CoalesceUnspecified {
						continue
					}
					name := fmt.Sprintf("capacity=%d/situation=%d/%s-to-%s", capacity, situation, currentIntent, nextIntent)
					t.Run(name, func(t *testing.T) {
						t.Parallel()
						clock := &benchmarkClock{now: 1_000}
						limits := radio.DefaultLimits()
						limits.MaxPending = capacity
						bus, err := radio.NewBus(limits, clock)
						if err != nil {
							t.Fatal(err)
						}
						current := radio.RadioMessage{
							Version: radio.VersionV1, ID: "current", Source: "telemetry-core", Intent: currentIntent,
							Subject: "player", Priority: radio.PriorityP0, CreatedAtMS: 1_000, ExpiresAtMS: 4_000,
							Locale: radio.LocaleES, Payload: map[string]string{}, CoalesceRevision: 7, CoalesceValue: currentValue,
						}
						next := current
						next.ID, next.Intent, next.CreatedAtMS, next.ExpiresAtMS, next.CoalesceValue = "next", nextIntent, 1_001, 4_001, nextValue
						submitSpotter(t, bus, current)
						result := submitSpotter(t, bus, next)
						wantID := "current"
						if nextValue > currentValue {
							wantID = "next"
							if !result.Accepted {
								t.Fatalf("upgrade rejected: %+v", result)
							}
						} else if result.Accepted {
							t.Fatalf("equal/degraded state displaced current: %+v", result)
						}
						item, ok := bus.Next(context.Background())
						if !ok || item.Message.ID != wantID {
							t.Fatalf("next = %+v/%t, want %s", item, ok, wantID)
						}
						item.Done()
					})
				}
			}
		}
	}
}

func TestExpiredSpecificPendingDoesNotSuppressCurrentReminder(t *testing.T) {
	clock := &benchmarkClock{now: 1_000}
	producer, err := NewProducer(clock, radio.LocaleES)
	if err != nil {
		t.Fatal(err)
	}
	bus, err := radio.NewBus(radio.DefaultLimits(), clock)
	if err != nil {
		t.Fatal(err)
	}
	both, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8, -2.8))
	if err != nil || !emit {
		t.Fatalf("both = %+v/%t/%v", both, emit, err)
	}
	if _, err := bus.Submit(both); err != nil {
		t.Fatal(err)
	}
	clock.now = both.ExpiresAtMS
	reminder, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8, -2.8))
	if err != nil || !emit || reminder.Intent != IntentStillThere {
		t.Fatalf("reminder = %+v/%t/%v", reminder, emit, err)
	}
	if result, submitErr := bus.Submit(reminder); submitErr != nil || !result.Accepted {
		t.Fatalf("reminder submit = %+v/%v", result, submitErr)
	}
	item, ok := bus.Next(context.Background())
	if !ok || item.Message.Intent != IntentStillThere {
		t.Fatalf("next = %+v/%t", item, ok)
	}
	item.Done()
}

func TestSpotterLateralClearsPreserveCurrentSideAtAllCapacities(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name                string
		before, after       []float64
		antecedent, current string
		clear               string
	}{
		{name: "right-to-left", before: []float64{-2.8}, after: []float64{2.8}, antecedent: IntentCarRight, current: IntentCarLeft, clear: IntentClearRight},
		{name: "left-to-right", before: []float64{2.8}, after: []float64{-2.8}, antecedent: IntentCarLeft, current: IntentCarRight, clear: IntentClearLeft},
	}
	for _, capacity := range []int{1, 4, 64} {
		for _, test := range tests {
			for _, mode := range []string{"absent", "pending", "started"} {
				t.Run(fmt.Sprintf("capacity=%d/%s/current=%s", capacity, test.name, mode), func(t *testing.T) {
					t.Parallel()
					clock, producer, bus := newSpotterHarness(t, capacity)
					antecedent, emit, err := producer.Evaluate(benchmarkObservation(t, test.before...))
					if err != nil || !emit || antecedent.Intent != test.antecedent {
						t.Fatalf("antecedent = %+v/%t/%v", antecedent, emit, err)
					}
					submitSpotter(t, bus, antecedent)
					startSpotter(t, producer, bus, test.antecedent, 1_001)

					clock.now = 1_400
					current, emit, err := producer.Evaluate(benchmarkObservation(t, test.after...))
					if err != nil || !emit || current.Intent != test.current {
						t.Fatalf("current = %+v/%t/%v", current, emit, err)
					}
					if mode != "absent" {
						submitSpotter(t, bus, current)
					}
					if mode == "started" {
						startSpotter(t, producer, bus, test.current, 1_401)
					}

					clock.now = 1_550
					next, emit, err := producer.Evaluate(benchmarkObservation(t, test.after...))
					if err != nil || !emit {
						t.Fatalf("post-clear = %+v/%t/%v", next, emit, err)
					}
					want := test.current
					if mode == "started" {
						want = test.clear
					}
					if next.Intent != want {
						t.Fatalf("post-clear intent = %s, want %s", next.Intent, want)
					}
					result := submitSpotter(t, bus, next)
					if mode == "pending" && result.Accepted {
						t.Fatalf("equal current warning displaced pending warning: %+v", result)
					}
					item, ok := bus.Next(context.Background())
					if !ok || item.Message.Intent != want {
						t.Fatalf("next = %+v/%t, want %s", item, ok, want)
					}
					item.Done()
				})
			}
		}
	}
}

func TestSpotterContextDoesNotCrossUnannouncedOccupations(t *testing.T) {
	t.Parallel()
	for _, capacity := range []int{1, 4, 64} {
		t.Run(fmt.Sprintf("capacity=%d", capacity), func(t *testing.T) {
			t.Parallel()
			clock, producer, bus := newSpotterHarness(t, capacity)
			both, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8, -2.8))
			if err != nil || !emit {
				t.Fatalf("both = %+v/%t/%v", both, emit, err)
			}
			submitSpotter(t, bus, both)
			startSpotter(t, producer, bus, IntentThreeWide, 1_001)

			clock.now = 1_400
			if message, emitted, err := producer.Evaluate(benchmarkObservation(t, 2.8)); err != nil || emitted {
				t.Fatalf("both-to-left = %+v/%t/%v, want delayed clear", message, emitted, err)
			}
			clock.now = 1_401
			current, emit, err := producer.Evaluate(benchmarkObservation(t, -2.8))
			if err != nil || !emit || current.Intent != IntentCarRight {
				t.Fatalf("unannounced left-to-right = %+v/%t/%v", current, emit, err)
			}
			clock.now = 1_551
			next, emit, err := producer.Evaluate(benchmarkObservation(t, -2.8))
			if err != nil || !emit || next.Intent != IntentCarRight {
				t.Fatalf("crossed context = %+v/%t/%v, want current car-right", next, emit, err)
			}
		})
	}
}

func TestSpotterDecisionsExpireAndCancelDeterministically(t *testing.T) {
	clock, producer, bus := newSpotterHarness(t, 4)
	message, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
	if err != nil || !emit {
		t.Fatalf("message = %+v/%t/%v", message, emit, err)
	}
	submitSpotter(t, bus, message)
	clock.now = message.ExpiresAtMS
	if item, ok := bus.Next(context.Background()); ok || item != nil {
		t.Fatalf("expired decision selected: %+v", item)
	}

	producer.Reset()
	clock.now++
	message, emit, err = producer.Evaluate(benchmarkObservation(t, -2.8))
	if err != nil || !emit {
		t.Fatalf("replacement = %+v/%t/%v", message, emit, err)
	}
	submitSpotter(t, bus, message)
	item, ok := bus.Next(context.Background())
	if !ok {
		t.Fatal("missing active decision")
	}
	bus.Reset(radio.ErrLifecycleBoundary)
	if !errors.Is(context.Cause(item.Context), radio.ErrLifecycleBoundary) {
		t.Fatalf("cancel cause = %v", context.Cause(item.Context))
	}
	item.Done()
}

func TestSpotterDispatchedContextExpiresAtAntecedentDeadline(t *testing.T) {
	clock, producer, bus := newSpotterHarness(t, 4)
	antecedent, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
	if err != nil || !emit {
		t.Fatalf("antecedent = %+v/%t/%v", antecedent, emit, err)
	}
	submitSpotter(t, bus, antecedent)
	startSpotter(t, producer, bus, IntentCarLeft, 1_001)

	clock.now = 1_400
	if message, emitted, err := producer.Evaluate(benchmarkObservation(t)); err != nil || emitted {
		t.Fatalf("clear scheduling = %+v/%t/%v", message, emitted, err)
	}
	clock.now = 1_550
	clear, emit, err := producer.Evaluate(benchmarkObservation(t))
	if err != nil || !emit || clear.Intent != IntentClearLeft {
		t.Fatalf("clear = %+v/%t/%v", clear, emit, err)
	}
	if clear.ExpiresAtMS != antecedent.ExpiresAtMS {
		t.Fatalf("clear deadline = %d, want antecedent %d", clear.ExpiresAtMS, antecedent.ExpiresAtMS)
	}
}

func TestSpotterClearContextExpiryIsRevalidatedBeforeDispatch(t *testing.T) {
	clock, producer, bus := newSpotterHarness(t, 4)
	antecedent, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
	if err != nil || !emit {
		t.Fatalf("antecedent = %+v/%t/%v", antecedent, emit, err)
	}
	submitSpotter(t, bus, antecedent)
	startSpotter(t, producer, bus, IntentCarLeft, 1_001)
	clock.now = 1_400
	_, _, _ = producer.Evaluate(benchmarkObservation(t))
	clock.now = 1_550
	clear, emit, err := producer.Evaluate(benchmarkObservation(t))
	if err != nil || !emit || clear.Intent != IntentClearLeft {
		t.Fatalf("clear = %+v/%t/%v", clear, emit, err)
	}
	submitSpotter(t, bus, clear)
	clock.now = antecedent.ExpiresAtMS
	if item, ok := bus.Next(context.Background()); ok || item != nil {
		t.Fatalf("clear survived antecedent deadline: %+v", item)
	}
}

func TestSpotterRejectsInvalidCanonicalIdentity(t *testing.T) {
	t.Parallel()
	tests := map[string]func(*engineer.Context){
		"epoch":   func(context *engineer.Context) { context.Epoch = 0 },
		"event":   func(context *engineer.Context) { context.Identity.Event = "" },
		"session": func(context *engineer.Context) { context.Identity.Session = "" },
		"vehicle": func(context *engineer.Context) { context.Identity.Vehicle = "" },
		"driver":  func(context *engineer.Context) { context.Identity.Driver = "" },
	}
	for name, invalidate := range tests {
		name, invalidate := name, invalidate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, producer, _ := newSpotterHarness(t, 4)
			observation := benchmarkObservation(t, 2.8)
			invalidate(&observation.Context)
			message, emit, err := producer.Evaluate(observation)
			if !errors.Is(err, ErrObservationNotReady) || emit || message.ID != "" {
				t.Fatalf("invalid %s identity = %+v/%t/%v", name, message, emit, err)
			}
		})
	}
}

func TestSpotterRadioBoundaryResetsDeliveryBeforeNewStateAtAllCapacities(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name      string
		boundary  func(*engineer.Context)
		after     []float64
		sameState bool
	}{
		{name: "epoch/same-state", boundary: func(context *engineer.Context) { context.Epoch++ }, after: []float64{2.8}, sameState: true},
		{name: "epoch/different-state", boundary: func(context *engineer.Context) { context.Epoch++ }},
		{name: "identity/same-state", boundary: func(context *engineer.Context) { context.Identity.Driver = "driver-b" }, after: []float64{2.8}, sameState: true},
		{name: "identity/different-state", boundary: func(context *engineer.Context) { context.Identity.Driver = "driver-b" }},
	}
	for _, capacity := range []int{1, 4, 64} {
		for _, test := range tests {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, test.name), func(t *testing.T) {
				t.Parallel()
				clock, producer, bus := newSpotterHarness(t, capacity)
				before := benchmarkObservation(t, 2.8)
				antecedent, emit, err := producer.Evaluate(before)
				if err != nil || !emit {
					t.Fatalf("antecedent = %+v/%t/%v", antecedent, emit, err)
				}
				submitSpotter(t, bus, antecedent)
				startSpotter(t, producer, bus, IntentCarLeft, 1_001)

				after := benchmarkObservation(t, test.after...)
				test.boundary(&after.Context)
				boundary, err := engineer.ClassifyBoundary(before.Context, after.Context)
				if err != nil || !boundary.CancelsPending() {
					t.Fatalf("boundary = %d/%v", boundary, err)
				}
				producer.Reset()
				bus.Reset(radio.ErrLifecycleBoundary)

				clock.now = 1_200
				current, emit, err := producer.Evaluate(after)
				if err != nil {
					t.Fatal(err)
				}
				if !test.sameState {
					if emit {
						t.Fatalf("different state emitted inherited message: %+v", current)
					}
					clock.now += clearDelayMS
					if message, emitted, evalErr := producer.Evaluate(after); evalErr != nil || emitted {
						t.Fatalf("different state inherited clear: %+v/%t/%v", message, emitted, evalErr)
					}
					return
				}
				if !emit || current.Intent != IntentCarLeft {
					t.Fatalf("fresh current state = %+v/%t", current, emit)
				}
				submitSpotter(t, bus, current) // A fresh but unstarted warning cannot authorize a clear.

				empty := benchmarkObservation(t)
				empty.Context = after.Context
				clock.now = 1_600
				if message, emitted, evalErr := producer.Evaluate(empty); evalErr != nil || emitted {
					t.Fatalf("clear scheduling = %+v/%t/%v", message, emitted, evalErr)
				}
				clock.now = 1_750
				replacement, emitted, evalErr := producer.Evaluate(empty)
				if evalErr != nil || !emitted || replacement.Intent != IntentAllClear {
					t.Fatalf("previous lifecycle authorized clear: %+v/%t/%v", replacement, emitted, evalErr)
				}
				submitSpotter(t, bus, replacement)
				item, ok := bus.Next(context.Background())
				if !ok || item.Message.Intent != IntentAllClear {
					t.Fatalf("boundary replacement = %+v/%t", item, ok)
				}
				item.Done()
			})
		}
	}
}

func TestSpotterRadioInheritedDeadlineBoundaryAtAllCapacities(t *testing.T) {
	t.Parallel()
	for _, capacity := range []int{1, 4, 64} {
		for _, timing := range []struct {
			name      string
			now       int64
			wantClear bool
		}{
			{name: "just-before", now: 1_999, wantClear: true},
			{name: "exact", now: 2_000},
			{name: "after", now: 2_001},
		} {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, timing.name), func(t *testing.T) {
				t.Parallel()
				clock, producer, bus := newSpotterHarness(t, capacity)
				antecedent, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
				if err != nil || !emit {
					t.Fatalf("antecedent = %+v/%t/%v", antecedent, emit, err)
				}
				antecedent.ExpiresAtMS = 2_000
				submitSpotter(t, bus, antecedent)
				startSpotter(t, producer, bus, IntentCarLeft, 1_001)

				clock.now = timing.now - clearDelayMS
				if message, emitted, evalErr := producer.Evaluate(benchmarkObservation(t)); evalErr != nil || emitted {
					t.Fatalf("clear scheduling = %+v/%t/%v", message, emitted, evalErr)
				}
				clock.now = timing.now
				message, emitted, evalErr := producer.Evaluate(benchmarkObservation(t))
				if evalErr != nil || !emitted {
					t.Fatalf("deadline decision = %+v/%t/%v", message, emitted, evalErr)
				}
				want := IntentAllClear
				if timing.wantClear {
					want = IntentClearLeft
					if message.ExpiresAtMS != antecedent.ExpiresAtMS {
						t.Fatalf("clear deadline = %d, want %d", message.ExpiresAtMS, antecedent.ExpiresAtMS)
					}
				}
				if message.Intent != want {
					t.Fatalf("deadline intent = %s, want %s", message.Intent, want)
				}
			})
		}
	}
}

func TestSpotterRadioUnstartedDecisionNeverAuthorizesClearAtAllCapacities(t *testing.T) {
	t.Parallel()
	for _, capacity := range []int{1, 4, 64} {
		for _, mode := range []string{"expired-before-selection", "invalidated-before-selection", "cancelled-before-selection"} {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, mode), func(t *testing.T) {
				t.Parallel()
				clock, producer, bus := newSpotterHarness(t, capacity)
				antecedent, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
				if err != nil || !emit {
					t.Fatalf("antecedent = %+v/%t/%v", antecedent, emit, err)
				}
				if mode == "expired-before-selection" {
					antecedent.ExpiresAtMS = 1_500
				}
				submitSpotter(t, bus, antecedent)

				switch mode {
				case "expired-before-selection":
					clock.now = antecedent.ExpiresAtMS
					if item, ok := bus.Next(context.Background()); ok || item != nil {
						t.Fatalf("expired antecedent selected: %+v", item)
					}
				case "invalidated-before-selection":
					clock.now = 1_400
					if message, emitted, evalErr := producer.Evaluate(benchmarkObservation(t)); evalErr != nil || emitted {
						t.Fatalf("semantic invalidation = %+v/%t/%v", message, emitted, evalErr)
					}
				case "cancelled-before-selection":
					producer.Reset()
					bus.Reset(radio.ErrLifecycleBoundary)
					clock.now = 1_200
					fresh, freshEmit, evalErr := producer.Evaluate(benchmarkObservation(t, 2.8))
					if evalErr != nil || !freshEmit {
						t.Fatalf("fresh unstarted state = %+v/%t/%v", fresh, freshEmit, evalErr)
					}
					submitSpotter(t, bus, fresh)
				}

				if mode != "invalidated-before-selection" {
					clock.now += 400

					if message, emitted, evalErr := producer.Evaluate(benchmarkObservation(t)); evalErr != nil || emitted {
						t.Fatalf("clear scheduling = %+v/%t/%v", message, emitted, evalErr)
					}
				}
				clock.now += clearDelayMS
				replacement, emitted, evalErr := producer.Evaluate(benchmarkObservation(t))
				if evalErr != nil || !emitted || replacement.Intent != IntentAllClear {
					t.Fatalf("unstarted antecedent authorized clear: %+v/%t/%v", replacement, emitted, evalErr)
				}
				submitSpotter(t, bus, replacement)
				item, ok := bus.Next(context.Background())
				if !ok || item.Message.Intent != IntentAllClear {
					t.Fatalf("replacement = %+v/%t", item, ok)
				}
				item.Done()
			})
		}
	}
}
