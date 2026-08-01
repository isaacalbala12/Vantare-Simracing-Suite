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

func TestSpotterSupersessionExhaustiveForCurrentSituation(t *testing.T) {
	t.Parallel()

	for _, capacity := range []int{1, 4} {
		for _, situation := range spotterTestSituations() {
			validIntents := validSpotterIntents(situation.evidence)
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

func validSpotterIntents(evidence SemanticEvidence) []string {
	intents := allSpotterIntents()
	valid := make([]string, 0, len(intents))
	for _, intent := range intents {
		if semanticClaimMatches(testSemanticClaim(intent), evidence) {
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
