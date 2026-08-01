package messagepolicy

import (
	"fmt"
	"reflect"
	"testing"
)

type spotterSituationTestCase struct {
	name        string
	situation   spotterSituation
	evidence    SemanticEvidence
	exactIntent string
}

func TestSpotterMessageValueContract(t *testing.T) {
	t.Parallel()

	tests := []struct {
		situation spotterSituation
		intent    string
		want      spotterMessageValue
	}{
		{spotterSituationAllClear, IntentSpotterClearLeft, spotterMessageCompatible},
		{spotterSituationAllClear, IntentSpotterClearRight, spotterMessageCompatible},
		{spotterSituationAllClear, IntentSpotterAllClear, spotterMessageCurrent},
		{spotterSituationLeft, IntentSpotterCarLeft, spotterMessageCompatible},
		{spotterSituationLeft, IntentSpotterStillThere, spotterMessageReminder},
		{spotterSituationLeft, IntentSpotterClearRight, spotterMessageCurrent},
		{spotterSituationRight, IntentSpotterCarRight, spotterMessageCompatible},
		{spotterSituationRight, IntentSpotterStillThere, spotterMessageReminder},
		{spotterSituationRight, IntentSpotterClearLeft, spotterMessageCurrent},
		{spotterSituationThreeWide, IntentSpotterCarLeft, spotterMessageCompatible},
		{spotterSituationThreeWide, IntentSpotterCarRight, spotterMessageCompatible},
		{spotterSituationThreeWide, IntentSpotterStillThere, spotterMessageReminder},
		{spotterSituationThreeWide, IntentSpotterThreeWide, spotterMessageCurrent},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("%d/%s", tt.situation, tt.intent), func(t *testing.T) {
			t.Parallel()
			if got := spotterMessageValues[tt.situation][spotterMessageKindForIntent(tt.intent)]; got != tt.want {
				t.Fatalf("value = %d, want %d", got, tt.want)
			}
		})
	}

	for situation := spotterSituationAllClear; situation <= spotterSituationThreeWide; situation++ {
		for kind := spotterMessageCarLeft; kind < spotterMessageKindCount; kind++ {
			if spotterMessageValues[situation][kind] == spotterMessageNotApplicable {
				continue
			}
			found := false
			for _, tt := range tests {
				if tt.situation == situation && spotterMessageKindForIntent(tt.intent) == kind {
					found = true
					break
				}
			}
			if !found {
				t.Fatalf("undocumented value for situation=%d kind=%d", situation, kind)
			}
		}
	}

	for _, situation := range spotterTestSituations() {
		for _, intent := range allSpotterIntents() {
			applicable := semanticClaimMatches(testSemanticClaim(intent), situation.evidence)
			valued := currentSpotterMessageValue(intent, situation.evidence) != spotterMessageNotApplicable
			if applicable != valued {
				t.Fatalf("semantic/table mismatch for %s/%s: applicable=%t valued=%t", situation.name, intent, applicable, valued)
			}
		}
	}
}

func TestSpotterSupersessionExhaustiveForSelfContainedSituation(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4} {
		for _, situation := range spotterTestSituations() {
			validIntents := validAutonomousSpotterIntents(situation.evidence)
			for _, pendingIntent := range validIntents {
				for _, candidateIntent := range validIntents {
					name := fmt.Sprintf("capacity=%d/%s/%s->%s", capacity, situation.name, pendingIntent, candidateIntent)
					t.Run(name, func(t *testing.T) {
						t.Parallel()
						clock := &testClock{now: 1_000}
						scheduler := newTestScheduler(t, clock, capacity)
						evidence := validEvidence(t, 5_000)
						evidence.Semantic = situation.evidence
						scheduler.Observe(evidence)
						pending := candidateFor("pending", FamilySpotter, pendingIntent, "player", PrioritySpotter, 1_000)
						if accepted, outcomes := scheduler.Submit(pending); !accepted || len(outcomes) != 0 {
							t.Fatalf("pending submit = %t, %+v", accepted, outcomes)
						}

						candidate := candidateFor("candidate", FamilySpotter, candidateIntent, "player", PrioritySpotter, 1_000)
						accepted, outcomes := scheduler.Submit(candidate)
						pendingValue := currentSpotterMessageValue(pendingIntent, situation.evidence)
						candidateValue := currentSpotterMessageValue(candidateIntent, situation.evidence)
						switch {
						case candidateValue > pendingValue:
							if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterStateSuperseded) {
								t.Fatalf("more valuable submit = %t, %+v", accepted, outcomes)
							}
							assertNextCandidate(t, scheduler, candidate.ID)
						case candidateValue < pendingValue:
							if accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterStateSuperseded) {
								t.Fatalf("less valuable submit = %t, %+v", accepted, outcomes)
							}
							assertNextCandidate(t, scheduler, pending.ID)
						case pendingIntent == candidateIntent:
							if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonCoalesced) {
								t.Fatalf("same intent submit = %t, %+v", accepted, outcomes)
							}
							assertNextCandidate(t, scheduler, candidate.ID)
						case capacity == 1:
							if accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonQueuePressure) {
								t.Fatalf("equal value at capacity = %t, %+v", accepted, outcomes)
							}
							assertNextCandidate(t, scheduler, pending.ID)
						default:
							if !accepted || len(outcomes) != 0 {
								t.Fatalf("equal value submit = %t, %+v", accepted, outcomes)
							}
							assertNextCandidate(t, scheduler, pending.ID)
							assertNextCandidate(t, scheduler, candidate.ID)
						}
					})
				}
			}
		}
	}
}

func TestSpotterSituationTransitionMatrixPreservesCurrentMessage(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4} {
		for _, before := range spotterTestSituations() {
			for _, after := range spotterTestSituations() {
				name := fmt.Sprintf("capacity=%d/%s->%s", capacity, before.name, after.name)
				t.Run(name, func(t *testing.T) {
					t.Parallel()
					clock := &testClock{now: 1_000}
					scheduler := newTestScheduler(t, clock, capacity)
					evidence := validEvidence(t, 5_000)
					evidence.Semantic = before.evidence
					scheduler.Observe(evidence)
					previous := candidateFor("previous", FamilySpotter, before.exactIntent, "player", PrioritySpotter, 1_000)
					if accepted, outcomes := scheduler.Submit(previous); !accepted || len(outcomes) != 0 {
						t.Fatalf("previous submit = %t, %+v", accepted, outcomes)
					}

					evidence.Semantic = after.evidence
					scheduler.Observe(evidence)
					intent := transitionIntent(before.situation, after.situation, after.exactIntent)
					current := candidateFor("current", FamilySpotter, intent, "player", PrioritySpotter, 1_000)
					accepted, outcomes := scheduler.Submit(current)
					if !accepted {
						t.Fatalf("current transition lost: %+v", outcomes)
					}
					assertNextCandidate(t, scheduler, current.ID)
				})
			}
		}
	}
}

func TestSpotterClearRequiresDispatchedAntecedent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		before        SemanticEvidence
		beforeIntent  string
		after         SemanticEvidence
		clearIntent   string
		wantSelfState string
	}{
		{
			name: "both to left", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true},
			beforeIntent: IntentSpotterThreeWide, after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			clearIntent: IntentSpotterClearRight, wantSelfState: IntentSpotterCarLeft,
		},
		{
			name: "both to right", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true},
			beforeIntent: IntentSpotterThreeWide, after: SemanticEvidence{SpotterKnown: true, SpotterRight: true},
			clearIntent: IntentSpotterClearLeft, wantSelfState: IntentSpotterCarRight,
		},
		{
			name: "right to left", before: SemanticEvidence{SpotterKnown: true, SpotterRight: true},
			beforeIntent: IntentSpotterCarRight, after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			clearIntent: IntentSpotterClearRight, wantSelfState: IntentSpotterCarLeft,
		},
		{
			name: "left to right", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			beforeIntent: IntentSpotterCarLeft, after: SemanticEvidence{SpotterKnown: true, SpotterRight: true},
			clearIntent: IntentSpotterClearLeft, wantSelfState: IntentSpotterCarRight,
		},
	}
	for _, capacity := range []int{1, 4, 64} {
		for _, tt := range tests {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, tt.name), func(t *testing.T) {
				t.Parallel()
				clock := &testClock{now: 1_000}
				scheduler := newTestScheduler(t, clock, capacity)
				evidence := validEvidence(t, 5_000)
				evidence.Semantic = tt.before
				scheduler.Observe(evidence)
				antecedent := candidateFor("antecedent", FamilySpotter, tt.beforeIntent, "player", PrioritySpotter, 1_000)
				if accepted, _ := scheduler.Submit(antecedent); !accepted {
					t.Fatal("antecedent was rejected")
				}

				evidence.Semantic = tt.after
				scheduler.Observe(evidence)
				clear := candidateFor("clear", FamilySpotter, tt.clearIntent, "player", PrioritySpotter, 1_000)
				clear.Payload = map[string]string{"context": "clear-only"}
				accepted, outcomes := scheduler.Submit(clear)
				if !accepted {
					t.Fatalf("clear replacement was rejected: %+v", outcomes)
				}
				if !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
					t.Fatalf("missing typed replacement outcome: %+v", outcomes)
				}
				decision, _, ok := scheduler.Next()
				if !ok || decision.Intent != tt.wantSelfState {
					t.Fatalf("decision = %+v, ok=%t, want self-contained %s", decision, ok, tt.wantSelfState)
				}
				wantRule, _ := semanticRuleForIntent(tt.wantSelfState)
				if decision.Semantic.Rule != wantRule || len(decision.Payload) != 0 {
					t.Fatalf("replacement retained contextual data: %+v", decision)
				}
			})
		}
	}
}

func TestSpotterClearUsesDispatchedAntecedent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		before           SemanticEvidence
		antecedentIntent string
		after            SemanticEvidence
		clearIntent      string
	}{
		{
			name: "both to left", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true},
			antecedentIntent: IntentSpotterThreeWide, after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true}, clearIntent: IntentSpotterClearRight,
		},
		{
			name: "both to right", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true},
			antecedentIntent: IntentSpotterThreeWide, after: SemanticEvidence{SpotterKnown: true, SpotterRight: true}, clearIntent: IntentSpotterClearLeft,
		},
		{
			name: "left to all-clear", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			antecedentIntent: IntentSpotterCarLeft, after: SemanticEvidence{SpotterKnown: true}, clearIntent: IntentSpotterClearLeft,
		},
		{
			name: "right to all-clear", before: SemanticEvidence{SpotterKnown: true, SpotterRight: true},
			antecedentIntent: IntentSpotterCarRight, after: SemanticEvidence{SpotterKnown: true}, clearIntent: IntentSpotterClearRight,
		},
	}
	for _, capacity := range []int{1, 4, 64} {
		for _, tt := range tests {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, tt.name), func(t *testing.T) {
				t.Parallel()
				clock := &testClock{now: 1_000}
				scheduler := newTestScheduler(t, clock, capacity)
				observeSpotterSituation(t, scheduler, tt.before)
				submitAndDispatchSpotter(t, scheduler, tt.antecedentIntent, clock.now)
				observeSpotterSituation(t, scheduler, tt.after)

				clear := candidateFor("clear", FamilySpotter, tt.clearIntent, "player", PrioritySpotter, clock.now)
				accepted, outcomes := scheduler.Submit(clear)
				if !accepted || containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
					t.Fatalf("contextual clear submit = %t, %+v", accepted, outcomes)
				}
				decision, _, ok := scheduler.Next()
				if !ok || decision.Intent != tt.clearIntent {
					t.Fatalf("decision = %+v, ok=%t, want %s", decision, ok, tt.clearIntent)
				}
			})
		}
	}
}

func TestSpotterLateralClearNeverOmitsCurrentSide(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		before           SemanticEvidence
		antecedentIntent string
		after            SemanticEvidence
		currentIntent    string
		clearIntent      string
	}{
		{
			name: "right to left", before: SemanticEvidence{SpotterKnown: true, SpotterRight: true}, antecedentIntent: IntentSpotterCarRight,
			after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true}, currentIntent: IntentSpotterCarLeft, clearIntent: IntentSpotterClearRight,
		},
		{
			name: "left to right", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true}, antecedentIntent: IntentSpotterCarLeft,
			after: SemanticEvidence{SpotterKnown: true, SpotterRight: true}, currentIntent: IntentSpotterCarRight, clearIntent: IntentSpotterClearLeft,
		},
	}
	for _, capacity := range []int{1, 4, 64} {
		for _, tt := range tests {
			for _, currentMode := range []string{"absent", "pending", "dispatched"} {
				t.Run(fmt.Sprintf("capacity=%d/%s/current=%s", capacity, tt.name, currentMode), func(t *testing.T) {
					t.Parallel()
					clock := &testClock{now: 1_000}
					scheduler := newTestScheduler(t, clock, capacity)
					observeSpotterSituation(t, scheduler, tt.before)
					submitAndDispatchSpotter(t, scheduler, tt.antecedentIntent, clock.now)
					observeSpotterSituation(t, scheduler, tt.after)

					if currentMode != "absent" {
						current := candidateFor("current-side", FamilySpotter, tt.currentIntent, "player", PrioritySpotter, clock.now)
						if accepted, outcomes := scheduler.Submit(current); !accepted || len(outcomes) != 0 {
							t.Fatalf("current side submit = %t, %+v", accepted, outcomes)
						}
						if currentMode == "dispatched" {
							assertNextIntent(t, scheduler, tt.currentIntent)
						}
					}

					clear := candidateFor("clear", FamilySpotter, tt.clearIntent, "player", PrioritySpotter, clock.now)
					accepted, outcomes := scheduler.Submit(clear)
					if !accepted {
						t.Fatalf("clear submit = %t, %+v", accepted, outcomes)
					}
					if currentMode == "dispatched" {
						if containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
							t.Fatalf("delivered current side did not unlock clear: %+v", outcomes)
						}
						assertNextIntent(t, scheduler, tt.clearIntent)
						return
					}
					if !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
						t.Fatalf("unsafe clear was not replaced: %+v", outcomes)
					}
					assertNextIntent(t, scheduler, tt.currentIntent)
				})
			}
		}
	}
}

func TestSpotterClearContextResetsOnExpiryAndCancel(t *testing.T) {
	t.Parallel()

	for _, mode := range []string{"expired-pending", "cancelled-after-dispatch"} {
		t.Run(mode, func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, 4)
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true})
			antecedent := candidateFor("antecedent", FamilySpotter, IntentSpotterThreeWide, "player", PrioritySpotter, clock.now)
			if accepted, _ := scheduler.Submit(antecedent); !accepted {
				t.Fatal("antecedent was rejected")
			}
			if mode == "expired-pending" {
				clock.now = antecedent.ExpiresAtMS
			} else {
				assertNextIntent(t, scheduler, IntentSpotterThreeWide)
				scheduler.Cancel(ReasonLifecycleBoundary)
			}
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
			clear := candidateFor("clear", FamilySpotter, IntentSpotterClearRight, "player", PrioritySpotter, clock.now)
			accepted, outcomes := scheduler.Submit(clear)
			if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
				t.Fatalf("clear after %s = %t, %+v", mode, accepted, outcomes)
			}
			if mode == "expired-pending" && !containsOutcome(outcomes, OutcomeExpired, ReasonDeadlineElapsed) {
				t.Fatalf("expired antecedent was not reported: %+v", outcomes)
			}
			assertNextIntent(t, scheduler, IntentSpotterCarLeft)
		})
	}
}

func TestSpotterContextRequiresSelfContainedDispatchedAntecedent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		before            SemanticEvidence
		partialIntent     string
		after             SemanticEvidence
		clearIntent       string
		wantSelfContained string
	}{
		{
			name: "still-there does not communicate left", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			partialIntent: IntentSpotterStillThere, after: SemanticEvidence{SpotterKnown: true},
			clearIntent: IntentSpotterClearLeft, wantSelfContained: IntentSpotterAllClear,
		},
		{
			name: "car-left does not communicate three-wide", before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true},
			partialIntent: IntentSpotterCarLeft, after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
			clearIntent: IntentSpotterClearRight, wantSelfContained: IntentSpotterCarLeft,
		},
	}
	for _, capacity := range []int{1, 4, 64} {
		for _, tt := range tests {
			t.Run(fmt.Sprintf("capacity=%d/%s", capacity, tt.name), func(t *testing.T) {
				t.Parallel()
				clock := &testClock{now: 1_000}
				scheduler := newTestScheduler(t, clock, capacity)
				observeSpotterSituation(t, scheduler, tt.before)
				submitAndDispatchSpotter(t, scheduler, tt.partialIntent, clock.now)
				observeSpotterSituation(t, scheduler, tt.after)

				clear := candidateFor("clear", FamilySpotter, tt.clearIntent, "player", PrioritySpotter, clock.now)
				accepted, outcomes := scheduler.Submit(clear)
				if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
					t.Fatalf("clear after partial antecedent = %t, %+v", accepted, outcomes)
				}
				assertNextIntent(t, scheduler, tt.wantSelfContained)
			})
		}
	}
}

func TestSpotterContextDoesNotCrossUnannouncedOccupancy(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4, 64} {
		t.Run(fmt.Sprintf("capacity=%d", capacity), func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, capacity)
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true})
			submitAndDispatchSpotter(t, scheduler, IntentSpotterThreeWide, clock.now)
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterRight: true})

			clear := candidateFor("clear", FamilySpotter, IntentSpotterClearLeft, "player", PrioritySpotter, clock.now)
			accepted, outcomes := scheduler.Submit(clear)
			if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
				t.Fatalf("clear across unseen occupancy = %t, %+v", accepted, outcomes)
			}
			assertNextIntent(t, scheduler, IntentSpotterCarRight)
		})
	}
}

func TestSpotterClearContextIsRevalidatedBeforeDispatch(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4, 64} {
		t.Run(fmt.Sprintf("capacity=%d", capacity), func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, capacity)
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true})
			submitAndDispatchSpotter(t, scheduler, IntentSpotterThreeWide, clock.now)
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true, SpotterLeft: true})

			clear := candidateFor("clear", FamilySpotter, IntentSpotterClearRight, "player", PrioritySpotter, clock.now)
			if accepted, outcomes := scheduler.Submit(clear); !accepted || len(outcomes) != 0 {
				t.Fatalf("contextual clear submit = %t, %+v", accepted, outcomes)
			}

			// The clear remains literally true, but belongs to the previous
			// occupancy generation and can no longer communicate all-clear.
			observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true})
			decision, outcomes, ok := scheduler.Next()
			if !ok || decision.Intent != IntentSpotterAllClear {
				t.Fatalf("decision = %+v, ok=%t, want all-clear", decision, ok)
			}
			if !containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
				t.Fatalf("stale delivery context was not reported: %+v", outcomes)
			}
		})
	}
}

func TestSpotterAllClearIsSelfContainedWithoutDeliveryHistory(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 1)
	observeSpotterSituation(t, scheduler, SemanticEvidence{SpotterKnown: true})
	allClear := candidateFor("all-clear", FamilySpotter, IntentSpotterAllClear, "player", PrioritySpotter, clock.now)
	accepted, outcomes := scheduler.Submit(allClear)
	if !accepted || containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterContextReplaced) {
		t.Fatalf("all-clear submit = %t, %+v", accepted, outcomes)
	}
	assertNextIntent(t, scheduler, IntentSpotterAllClear)
}

func TestSpotterSupersessionDiagnosticsAndQueueRemainDeterministic(t *testing.T) {
	t.Parallel()

	run := func(capacity int) ([]PolicyOutcome, SchedulerState) {
		clock := &testClock{now: 1_000}
		scheduler := newTestScheduler(t, clock, capacity)
		evidence := validEvidence(t, 5_000)
		evidence.Semantic = SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true}
		scheduler.Observe(evidence)

		var outcomes []PolicyOutcome
		for index, intent := range []string{IntentSpotterStillThere, IntentSpotterCarLeft, IntentSpotterThreeWide, IntentSpotterCarRight} {
			candidate := candidateFor(fmt.Sprintf("candidate-%d", index), FamilySpotter, intent, "player", PrioritySpotter, 1_000)
			_, current := scheduler.Submit(candidate)
			outcomes = append(outcomes, current...)
			if state := scheduler.State(); state.Pending > state.Capacity {
				t.Fatalf("unbounded state: %+v", state)
			}
		}
		_, emitted, ok := scheduler.Next()
		if !ok {
			t.Fatal("current three-wide was not emitted")
		}
		outcomes = append(outcomes, emitted...)
		return outcomes, scheduler.State()
	}

	for _, capacity := range []int{1, 4} {
		wantOutcomes, wantState := run(capacity)
		for iteration := 0; iteration < 50; iteration++ {
			gotOutcomes, gotState := run(capacity)
			if !reflect.DeepEqual(gotOutcomes, wantOutcomes) || !reflect.DeepEqual(gotState, wantState) {
				t.Fatalf("capacity=%d iteration=%d drifted: outcomes=%+v state=%+v", capacity, iteration, gotOutcomes, gotState)
			}
		}
	}
}

func TestSpotterSupersessionDoesNotApplyToOtherFamilies(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 4)
	evidence := validEvidence(t, 5_000)
	evidence.Semantic.FuelLitres = 1
	scheduler.Observe(evidence)
	for index, intent := range []string{IntentFuelOneLitre, IntentFuelTwoLitres} {
		candidate := candidateFor(fmt.Sprintf("fuel-%d", index), FamilyFuel, intent, "player", PriorityFailureResource, 1_000)
		accepted, outcomes := scheduler.Submit(candidate)
		if !accepted || containsOutcome(outcomes, OutcomeSuppressed, ReasonSpotterStateSuperseded) {
			t.Fatalf("fuel submit = %t, %+v", accepted, outcomes)
		}
	}
	if state := scheduler.State(); state.Pending != 2 {
		t.Fatalf("non-Spotter pending = %d, want 2", state.Pending)
	}
}

func spotterTestSituations() []spotterSituationTestCase {
	return []spotterSituationTestCase{
		{name: "all-clear", situation: spotterSituationAllClear, evidence: SemanticEvidence{SpotterKnown: true}, exactIntent: IntentSpotterAllClear},
		{name: "left", situation: spotterSituationLeft, evidence: SemanticEvidence{SpotterKnown: true, SpotterLeft: true}, exactIntent: IntentSpotterCarLeft},
		{name: "right", situation: spotterSituationRight, evidence: SemanticEvidence{SpotterKnown: true, SpotterRight: true}, exactIntent: IntentSpotterCarRight},
		{name: "three-wide", situation: spotterSituationThreeWide, evidence: SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true}, exactIntent: IntentSpotterThreeWide},
	}
}

func validAutonomousSpotterIntents(evidence SemanticEvidence) []string {
	intents := allSpotterIntents()
	valid := make([]string, 0, len(intents))
	for _, intent := range intents {
		if !isContextualSpotterClear(intent) && semanticClaimMatches(testSemanticClaim(intent), evidence) {
			valid = append(valid, intent)
		}
	}
	return valid
}

func allSpotterIntents() []string {
	return []string{
		IntentSpotterCarLeft,
		IntentSpotterCarRight,
		IntentSpotterStillThere,
		IntentSpotterClearLeft,
		IntentSpotterClearRight,
		IntentSpotterAllClear,
		IntentSpotterThreeWide,
	}
}

func transitionIntent(before, after spotterSituation, fallback string) string {
	if before == spotterSituationThreeWide && after == spotterSituationLeft {
		return IntentSpotterClearRight
	}
	if before == spotterSituationThreeWide && after == spotterSituationRight {
		return IntentSpotterClearLeft
	}
	return fallback
}

func BenchmarkSpotterSupersessionAtCapacity(b *testing.B) {
	clock := &testClock{now: 1_000}
	evidence := validEvidenceForBenchmark(b, 5_000)
	evidence.Semantic = SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true}
	pending := make([]Candidate, 64)
	for index := range pending {
		intent := IntentSpotterCarLeft
		if index%2 != 0 {
			intent = IntentSpotterCarRight
		}
		pending[index] = candidateFor(fmt.Sprintf("pending-%d", index), FamilySpotter, intent, fmt.Sprintf("car-%d", index), PrioritySpotter, 1_000)
	}
	current := candidateFor("three-wide", FamilySpotter, IntentSpotterThreeWide, "player", PrioritySpotter, 1_000)

	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		scheduler, err := NewScheduler(clock, Limits{MaxPending: len(pending), MaxDiagnostics: 8, MaxCooldownKeys: 8})
		if err != nil {
			b.Fatal(err)
		}
		scheduler.Observe(evidence)
		for _, candidate := range pending {
			if accepted, _ := scheduler.Submit(candidate); !accepted {
				b.Fatal("could not fill Spotter queue")
			}
		}
		if accepted, _ := scheduler.Submit(current); !accepted {
			b.Fatal("current Spotter state was rejected")
		}
	}
}

func assertNextCandidate(t *testing.T, scheduler *Scheduler, want string) {
	t.Helper()
	decision, _, ok := scheduler.Next()
	if !ok || decision.CandidateID != want {
		t.Fatalf("decision = %+v, ok=%t, want=%s", decision, ok, want)
	}
}

func assertNextIntent(t *testing.T, scheduler *Scheduler, want string) {
	t.Helper()
	decision, _, ok := scheduler.Next()
	if !ok || decision.Intent != want {
		t.Fatalf("decision = %+v, ok=%t, want intent=%s", decision, ok, want)
	}
}

func observeSpotterSituation(t *testing.T, scheduler *Scheduler, semantic SemanticEvidence) {
	t.Helper()
	evidence := validEvidence(t, 10_000)
	evidence.Semantic = semantic
	if outcomes := scheduler.Observe(evidence); len(outcomes) != 0 {
		t.Fatalf("observe outcomes = %+v", outcomes)
	}
}

func submitAndDispatchSpotter(t *testing.T, scheduler *Scheduler, intent string, now int64) {
	t.Helper()
	candidate := candidateFor("dispatched-"+intent, FamilySpotter, intent, "player", PrioritySpotter, now)
	if accepted, outcomes := scheduler.Submit(candidate); !accepted || len(outcomes) != 0 {
		t.Fatalf("dispatch submit = %t, %+v", accepted, outcomes)
	}
	assertNextIntent(t, scheduler, intent)
}
