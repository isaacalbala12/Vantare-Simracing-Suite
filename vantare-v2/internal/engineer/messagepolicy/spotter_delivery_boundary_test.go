package messagepolicy

import (
	"fmt"
	"testing"

	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func TestSpotterBoundaryResetsDeliveryBeforeObservingNewState(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		boundary   func(*engineerprojection.Context)
		after      SemanticEvidence
		clear      string
		wantIntent string
	}{
		{
			name: "epoch same state",
			boundary: func(context *engineerprojection.Context) {
				context.Epoch++
			},
			after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			clear: IntentSpotterClearLeft, wantIntent: IntentSpotterAllClear,
		},
		{
			name: "epoch different state",
			boundary: func(context *engineerprojection.Context) {
				context.Epoch++
			},
			after: SemanticEvidence{SpotterKnown: true},
			clear: IntentSpotterClearLeft, wantIntent: IntentSpotterAllClear,
		},
		{
			name: "identity same state",
			boundary: func(context *engineerprojection.Context) {
				context.Identity.Driver = "driver-b"
			},
			after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			clear: IntentSpotterClearLeft, wantIntent: IntentSpotterAllClear,
		},
		{
			name: "identity different state",
			boundary: func(context *engineerprojection.Context) {
				context.Identity.Driver = "driver-b"
			},
			after: SemanticEvidence{SpotterKnown: true},
			clear: IntentSpotterClearLeft, wantIntent: IntentSpotterAllClear,
		},
	}

	for _, capacity := range []int{1, 4, 64} {
		for _, tt := range tests {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, tt.name), func(t *testing.T) {
				t.Parallel()
				clock := &testClock{now: 1_000}
				scheduler := newTestScheduler(t, clock, capacity)
				observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
				dispatchSpotterUntil(t, scheduler, IntentSpotterCarLeft, clock.now, 5_000)

				evidence := validEvidence(t, 10_000)
				tt.boundary(&evidence.Context)
				evidence.Semantic = tt.after
				scheduler.Observe(evidence)
				if !scheduler.spotter.observed || scheduler.spotter.generation != 1 ||
					scheduler.spotter.dispatchedGeneration != 0 {
					t.Fatalf("new lifecycle was not observed from a reset state: %+v", scheduler.spotter)
				}

				if tt.after.SpotterLeft {
					evidence.Semantic = SemanticEvidence{SpotterKnown: true}
					scheduler.Observe(evidence)
				}
				clear := candidateForCurrentEvidence(scheduler, "clear", tt.clear, clock.now)
				accepted, outcomes := scheduler.Submit(clear)
				if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
					t.Fatalf("clear inherited previous lifecycle = %t, %+v", accepted, outcomes)
				}
				assertNextIntent(t, scheduler, tt.wantIntent)
			})
		}
	}
}

func TestSpotterRejectsInvalidIdentityBoundary(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 4)
	observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
	dispatchSpotterUntil(t, scheduler, IntentSpotterCarLeft, clock.now, 5_000)

	evidence := validEvidence(t, 10_000)
	evidence.Context.Identity.Session = "session-b"
	evidence.Semantic = SemanticEvidence{SpotterKnown: true}
	scheduler.Observe(evidence)
	if scheduler.spotter.observed || scheduler.evidenceErr != ReasonIdentityChanged {
		t.Fatalf("invalid same-epoch identity boundary was retained: spotter=%+v reason=%s", scheduler.spotter, scheduler.evidenceErr)
	}
}

func TestSpotterDispatchedContextExpiresAtAntecedentDeadline(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4, 64} {
		for _, timing := range []struct {
			name      string
			now       int64
			wantClear bool
		}{
			{name: "just before", now: 1_999, wantClear: true},
			{name: "at limit", now: 2_000, wantClear: false},
			{name: "after", now: 2_001, wantClear: false},
		} {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, timing.name), func(t *testing.T) {
				t.Parallel()
				clock := &testClock{now: 1_000}
				scheduler := newTestScheduler(t, clock, capacity)
				observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
				dispatchSpotterUntil(t, scheduler, IntentSpotterCarLeft, clock.now, 2_000)

				clock.now = timing.now
				observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true})
				clear := candidateForCurrentEvidence(scheduler, "clear", IntentSpotterClearLeft, clock.now)
				accepted, outcomes := scheduler.Submit(clear)
				if !accepted {
					t.Fatalf("clear submit = %t, %+v", accepted, outcomes)
				}
				if timing.wantClear {
					if containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
						t.Fatalf("live antecedent was replaced: %+v", outcomes)
					}
					assertNextIntent(t, scheduler, IntentSpotterClearLeft)
					return
				}
				if !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
					t.Fatalf("expired antecedent authorized clear: %+v", outcomes)
				}
				assertNextIntent(t, scheduler, IntentSpotterAllClear)
			})
		}
	}
}

func TestSpotterReminderDoesNotRenewFullDeliveryContext(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4, 64} {
		t.Run(fmt.Sprintf("capacity=%d", capacity), func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, capacity)
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
			dispatchSpotterUntil(t, scheduler, IntentSpotterCarLeft, clock.now, 1_500)

			clock.now = 1_400
			dispatchSpotterUntil(t, scheduler, IntentSpotterStillThere, clock.now, 5_000)
			clock.now = 1_500
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true})
			clear := candidateForCurrentEvidence(scheduler, "clear", IntentSpotterClearLeft, clock.now)
			accepted, outcomes := scheduler.Submit(clear)
			if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
				t.Fatalf("reminder renewed full context = %t, %+v", accepted, outcomes)
			}
			assertNextIntent(t, scheduler, IntentSpotterAllClear)
		})
	}
}

func TestSpotterClearContextExpiryIsRevalidatedBeforeDispatch(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4, 64} {
		t.Run(fmt.Sprintf("capacity=%d", capacity), func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, capacity)
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
			dispatchSpotterUntil(t, scheduler, IntentSpotterCarLeft, clock.now, 2_000)

			clock.now = 1_999
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true})
			clear := candidateForCurrentEvidence(scheduler, "clear", IntentSpotterClearLeft, clock.now)
			if accepted, outcomes := scheduler.Submit(clear); !accepted || len(outcomes) != 0 {
				t.Fatalf("clear before context expiry = %t, %+v", accepted, outcomes)
			}

			clock.now = 2_000
			decision, outcomes, ok := scheduler.Next()
			if !ok || decision.Intent != IntentSpotterAllClear {
				t.Fatalf("decision = %+v, ok=%t, want all-clear", decision, ok)
			}
			if !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
				t.Fatalf("expired pending clear context was not replaced: %+v", outcomes)
			}
		})
	}
}

func TestSpotterExpiredOrCancelledDecisionNeverEstablishesContext(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4, 64} {
		for _, mode := range []string{"expired-in-next", "semantic-cancel-in-next", "cancelled-before-next"} {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, mode), func(t *testing.T) {
				t.Parallel()
				clock := &testClock{now: 1_000}
				scheduler := newTestScheduler(t, clock, capacity)
				observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
				candidate := candidateForCurrentEvidence(scheduler, "antecedent", IntentSpotterCarLeft, clock.now)
				candidate.ExpiresAtMS = 1_500
				if accepted, outcomes := scheduler.Submit(candidate); !accepted || len(outcomes) != 0 {
					t.Fatalf("antecedent submit = %t, %+v", accepted, outcomes)
				}

				switch mode {
				case "expired-in-next":
					clock.now = 1_500
					if _, outcomes, ok := scheduler.Next(); ok || !containsOutcome(outcomes, OutcomeExpired, ReasonDeadlineElapsed) {
						t.Fatalf("expired decision = ok:%t outcomes:%+v", ok, outcomes)
					}
				case "semantic-cancel-in-next":
					observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true})
					if _, outcomes, ok := scheduler.Next(); ok || !containsOutcome(outcomes, OutcomeCancelled, ReasonSemanticInvalidated) {
						t.Fatalf("cancelled decision = ok:%t outcomes:%+v", ok, outcomes)
					}
				case "cancelled-before-next":
					outcomes := scheduler.Cancel(ReasonLifecycleBoundary)
					if !containsOutcome(outcomes, OutcomeCancelled, ReasonLifecycleBoundary) {
						t.Fatalf("cancel outcomes = %+v", outcomes)
					}
					observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
				}

				observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true})
				clear := candidateForCurrentEvidence(scheduler, "clear", IntentSpotterClearLeft, clock.now)
				accepted, outcomes := scheduler.Submit(clear)
				if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
					t.Fatalf("undispatched decision authorized clear = %t, %+v", accepted, outcomes)
				}
				assertNextIntent(t, scheduler, IntentSpotterAllClear)
			})
		}
	}
}

func dispatchSpotterUntil(t *testing.T, scheduler *Scheduler, intent string, now, expiresAt int64) {
	t.Helper()
	candidate := candidateForCurrentEvidence(scheduler, "dispatched-"+intent, intent, now)
	candidate.ExpiresAtMS = expiresAt
	if accepted, outcomes := scheduler.Submit(candidate); !accepted || len(outcomes) != 0 {
		t.Fatalf("dispatch submit = %t, %+v", accepted, outcomes)
	}
	assertNextIntent(t, scheduler, intent)
}

func candidateForCurrentEvidence(scheduler *Scheduler, id, intent string, now int64) Candidate {
	candidate := candidateFor(id, FamilySpotter, intent, "player", PrioritySpotter, now)
	candidate.Context = scheduler.evidence.Context
	return candidate
}
