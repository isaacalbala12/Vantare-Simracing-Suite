package messagepolicy

import (
	"fmt"
	"math/rand"
	"reflect"
	"strconv"
	"strings"
	"testing"

	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

type testClock struct{ now int64 }

func (clock *testClock) NowMS() int64 { return clock.now }

func TestSchedulerRejectsCandidatesWithoutProvenEvidence(t *testing.T) {
	t.Parallel()
	unsupportedSession := manifest(t, engineerprojection.CapabilitySession)

	tests := []struct {
		name   string
		mutate func(*Candidate, *Evidence)
		reason Reason
	}{
		{name: "unknown contract version", mutate: func(candidate *Candidate, _ *Evidence) { candidate.Version++ }, reason: ReasonUnknownContractVersion},
		{name: "unknown canonical version", mutate: func(candidate *Candidate, _ *Evidence) { candidate.CanonicalVersion++ }, reason: ReasonUnknownCanonicalVersion},
		{name: "unknown projection version", mutate: func(candidate *Candidate, _ *Evidence) { candidate.ProjectionVersion++ }, reason: ReasonUnknownProjectionVersion},
		{name: "identity mismatch", mutate: func(candidate *Candidate, _ *Evidence) { candidate.Context.Identity.Vehicle = "other" }, reason: ReasonIdentityChanged},
		{name: "unsupported capability", mutate: func(_ *Candidate, evidence *Evidence) {
			evidence.Manifest = unsupportedSession
		}, reason: ReasonCapabilityUnavailable},
		{name: "required fields not ready", mutate: func(_ *Candidate, evidence *Evidence) {
			evidence.ReadyFamilies = []Family{FamilySpotter}
		}, reason: ReasonEvidenceNotReady},
		{name: "stale evidence", mutate: func(_ *Candidate, evidence *Evidence) { evidence.FreshUntilMS = 1_000 }, reason: ReasonEvidenceStale},
		{name: "specific penalty claim", mutate: func(candidate *Candidate, _ *Evidence) {
			candidate.Family = FamilyPenalties
			candidate.Intent = "penalties.new_drivethrough"
			candidate.Priority = PriorityPenalty
		}, reason: ReasonDecisionNotApproved},
		{name: "pit box now", mutate: func(candidate *Candidate, _ *Evidence) {
			candidate.Family = FamilyPitStops
			candidate.Intent = "pitstops.box_now"
			candidate.Priority = PriorityInformation
		}, reason: ReasonDecisionNotApproved},
		{name: "priority escalation", mutate: func(candidate *Candidate, _ *Evidence) { candidate.Priority = PrioritySpotter }, reason: ReasonPriorityMismatch},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, 8)
			evidence := validEvidence(t, 2_000)
			candidate := validCandidate()
			tt.mutate(&candidate, &evidence)
			scheduler.Observe(evidence)
			accepted, outcomes := scheduler.Submit(candidate)
			if accepted {
				t.Fatal("invalid candidate was accepted")
			}
			if len(outcomes) != 1 || outcomes[0].State != OutcomeUnavailable || outcomes[0].Reason != tt.reason {
				t.Fatalf("outcomes = %+v, want unavailable/%s", outcomes, tt.reason)
			}
		})
	}
}

func TestSchedulerUsesStableTotalOrder(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_500}
	scheduler := newTestScheduler(t, clock, 8)
	scheduler.Observe(validEvidence(t, 5_000))

	candidates := []Candidate{
		candidateFor("later-info", FamilyLaps, "laps.lap_completed", "player-a", PriorityInformation, 1_001),
		candidateFor("first-info", FamilyLaps, "laps.lap_completed", "player-b", PriorityInformation, 1_000),
		candidateFor("resource", FamilyFuel, "fuel.low_half_tank", "player", PriorityFailureResource, 1_002),
	}
	for _, candidate := range candidates {
		if accepted, outcomes := scheduler.Submit(candidate); !accepted || len(outcomes) != 0 {
			t.Fatalf("submit %q = %t, %+v", candidate.ID, accepted, outcomes)
		}
	}

	var got []string
	for {
		decision, _, ok := scheduler.Next()
		if !ok {
			break
		}
		got = append(got, decision.CandidateID)
	}
	want := []string{"resource", "first-info", "later-info"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
}

func TestSpotterPreemptsEveryLowerPendingCandidate(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_500}
	scheduler := newTestScheduler(t, clock, 8)
	scheduler.Observe(validEvidence(t, 5_000))
	for _, candidate := range []Candidate{
		candidateFor("lap", FamilyLaps, "laps.lap_completed", "player", PriorityInformation, 1_000),
		candidateFor("fuel", FamilyFuel, "fuel.low_half_tank", "player", PriorityFailureResource, 1_000),
	} {
		if accepted, _ := scheduler.Submit(candidate); !accepted {
			t.Fatalf("candidate %q was rejected", candidate.ID)
		}
	}

	spotter := candidateFor("left", FamilySpotter, "spotter.car_left", "left", PrioritySpotter, 1_001)
	accepted, outcomes := scheduler.Submit(spotter)
	if !accepted {
		t.Fatal("spotter candidate was rejected")
	}
	if len(outcomes) != 2 {
		t.Fatalf("preemption outcomes = %+v", outcomes)
	}
	for _, outcome := range outcomes {
		if outcome.State != OutcomeCancelled || outcome.Reason != ReasonPreemptedBySpotter {
			t.Fatalf("preemption outcome = %+v", outcome)
		}
	}
	decision, _, ok := scheduler.Next()
	if !ok || decision.CandidateID != "left" {
		t.Fatalf("next = %+v, %t", decision, ok)
	}
}

func TestSpotterCurrentStateSurvivesEqualPriorityQueuePressure(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 1)
	left := validEvidence(t, 5_000)
	left.Semantic.SpotterKnown, left.Semantic.SpotterLeft = true, true
	scheduler.Observe(left)
	carLeft := candidateFor("left", FamilySpotter, IntentSpotterCarLeft, "player", PrioritySpotter, 1_000)
	if accepted, outcomes := scheduler.Submit(carLeft); !accepted || len(outcomes) != 0 {
		t.Fatalf("car-left submit = %t, %+v", accepted, outcomes)
	}

	clear := left
	clear.Semantic.SpotterLeft = false
	scheduler.Observe(clear)
	allClear := candidateFor("clear", FamilySpotter, IntentSpotterAllClear, "player", PrioritySpotter, 1_000)
	accepted, outcomes := scheduler.Submit(allClear)
	if !accepted {
		t.Fatalf("current all-clear lost under equal-priority pressure: %+v", outcomes)
	}
	if !containsOutcome(outcomes, OutcomeCancelled, ReasonSemanticInvalidated) {
		t.Fatalf("obsolete car-left was not pruned: %+v", outcomes)
	}
	decision, _, ok := scheduler.Next()
	if !ok || decision.CandidateID != allClear.ID {
		t.Fatalf("decision = %+v, ok=%t", decision, ok)
	}
}

func TestSpotterThreeWideSupersedesCompatibleSideAtCapacityOne(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		sideIntent string
		left       bool
		right      bool
	}{
		{name: "left to three-wide", sideIntent: IntentSpotterCarLeft, left: true},
		{name: "right to three-wide", sideIntent: IntentSpotterCarRight, right: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, 1)
			evidence := validEvidence(t, 5_000)
			evidence.Semantic.SpotterKnown = true
			evidence.Semantic.SpotterLeft = tt.left
			evidence.Semantic.SpotterRight = tt.right
			scheduler.Observe(evidence)
			side := candidateFor("side", FamilySpotter, tt.sideIntent, "player", PrioritySpotter, 1_000)
			if accepted, outcomes := scheduler.Submit(side); !accepted || len(outcomes) != 0 {
				t.Fatalf("side submit = %t, %+v", accepted, outcomes)
			}

			evidence.Semantic.SpotterLeft = true
			evidence.Semantic.SpotterRight = true
			scheduler.Observe(evidence)
			threeWide := candidateFor("three-wide", FamilySpotter, IntentSpotterThreeWide, "player", PrioritySpotter, 1_000)
			accepted, outcomes := scheduler.Submit(threeWide)
			if !accepted {
				t.Fatalf("three-wide lost behind compatible side: %+v", outcomes)
			}
			decision, _, ok := scheduler.Next()
			if !ok || decision.CandidateID != threeWide.ID {
				t.Fatalf("decision = %+v, ok=%t", decision, ok)
			}
		})
	}
}

func TestSpotterEqualPriorityTransitionsReplaceObsoleteState(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		beforeIntent string
		afterIntent  string
		before       SemanticEvidence
		after        SemanticEvidence
	}{
		{
			name: "left to clear-left", beforeIntent: IntentSpotterCarLeft, afterIntent: IntentSpotterClearLeft,
			before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true}, after: SemanticEvidence{SpotterKnown: true},
		},
		{
			name: "right to clear-right", beforeIntent: IntentSpotterCarRight, afterIntent: IntentSpotterClearRight,
			before: SemanticEvidence{SpotterKnown: true, SpotterRight: true}, after: SemanticEvidence{SpotterKnown: true},
		},
		{
			name: "three-wide to clear-left", beforeIntent: IntentSpotterThreeWide, afterIntent: IntentSpotterClearLeft,
			before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true, SpotterRight: true}, after: SemanticEvidence{SpotterKnown: true, SpotterRight: true},
		},
		{
			name: "still-there to all-clear", beforeIntent: IntentSpotterStillThere, afterIntent: IntentSpotterAllClear,
			before: SemanticEvidence{SpotterKnown: true, SpotterLeft: true}, after: SemanticEvidence{SpotterKnown: true},
		},
		{
			name: "all-clear to left", beforeIntent: IntentSpotterAllClear, afterIntent: IntentSpotterCarLeft,
			before: SemanticEvidence{SpotterKnown: true}, after: SemanticEvidence{SpotterKnown: true, SpotterLeft: true},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, 1)
			evidence := validEvidence(t, 5_000)
			evidence.Semantic = tt.before
			scheduler.Observe(evidence)
			before := candidateFor("before", FamilySpotter, tt.beforeIntent, "player", PrioritySpotter, 1_000)
			if accepted, _ := scheduler.Submit(before); !accepted {
				t.Fatal("before candidate was rejected")
			}

			evidence.Semantic = tt.after
			scheduler.Observe(evidence)
			after := candidateFor("after", FamilySpotter, tt.afterIntent, "player", PrioritySpotter, 1_000)
			accepted, outcomes := scheduler.Submit(after)
			if !accepted || !containsOutcome(outcomes, OutcomeCancelled, ReasonSemanticInvalidated) {
				t.Fatalf("transition submit = %t, %+v", accepted, outcomes)
			}
			decision, _, ok := scheduler.Next()
			if !ok || decision.CandidateID != after.ID {
				t.Fatalf("decision = %+v, ok=%t", decision, ok)
			}
		})
	}
}

func TestNeutralPenaltyIncreaseCoalescesOneToTwo(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 1)
	evidence := validEvidence(t, 5_000)
	evidence.Semantic.PenaltyKnown, evidence.Semantic.PenaltyCount = true, 1
	scheduler.Observe(evidence)
	first := candidateFor("penalty-1", FamilyPenalties, IntentPenaltyCountIncreased, "player", PriorityPenalty, 1_000)
	first.Semantic.Integer = 1
	if accepted, _ := scheduler.Submit(first); !accepted {
		t.Fatal("first neutral penalty candidate was rejected")
	}

	evidence.Semantic.PenaltyCount = 2
	scheduler.Observe(evidence)
	second := candidateFor("penalty-2", FamilyPenalties, IntentPenaltyCountIncreased, "player", PriorityPenalty, 1_000)
	second.Semantic.Integer = 2
	accepted, outcomes := scheduler.Submit(second)
	if !accepted || !containsOutcome(outcomes, OutcomeSuppressed, ReasonCoalesced) ||
		containsOutcome(outcomes, OutcomeCancelled, ReasonSemanticInvalidated) {
		t.Fatalf("neutral 1->2 transition = %t, %+v", accepted, outcomes)
	}
	decision, _, ok := scheduler.Next()
	if !ok || decision.Intent != IntentPenaltyCountIncreased || decision.Semantic.Integer != 2 {
		t.Fatalf("decision = %+v, ok=%t", decision, ok)
	}
}

func TestEqualPriorityTransitionDiagnosticsRemainDeterministic(t *testing.T) {
	t.Parallel()

	run := func() ([]PolicyOutcome, SchedulerState) {
		clock := &testClock{now: 1_000}
		scheduler := newTestScheduler(t, clock, 1)
		evidence := validEvidence(t, 5_000)
		evidence.Semantic.SpotterKnown, evidence.Semantic.SpotterLeft = true, true
		scheduler.Observe(evidence)
		scheduler.Submit(candidateFor("left", FamilySpotter, IntentSpotterCarLeft, "player", PrioritySpotter, 1_000))
		evidence.Semantic.SpotterLeft = false
		scheduler.Observe(evidence)
		_, submitted := scheduler.Submit(candidateFor("clear", FamilySpotter, IntentSpotterAllClear, "player", PrioritySpotter, 1_000))
		_, emitted, _ := scheduler.Next()
		return append(submitted, emitted...), scheduler.State()
	}
	wantOutcomes, wantState := run()
	for iteration := 0; iteration < 50; iteration++ {
		gotOutcomes, gotState := run()
		if !reflect.DeepEqual(gotOutcomes, wantOutcomes) || !reflect.DeepEqual(gotState, wantState) {
			t.Fatalf("iteration %d drifted: outcomes=%+v state=%+v", iteration, gotOutcomes, gotState)
		}
	}
}

func TestSchedulerCoalescesAndAppliesCooldown(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_500}
	scheduler := newTestScheduler(t, clock, 8)
	scheduler.Observe(validEvidence(t, 10_000))
	first := candidateFor("gap-1", FamilyTimings, "timings.gap_report", "car-a", PriorityInformation, 1_000)
	second := candidateFor("gap-2", FamilyTimings, "timings.gap_report", "car-a", PriorityInformation, 1_001)
	if accepted, _ := scheduler.Submit(first); !accepted {
		t.Fatal("first candidate was rejected")
	}
	accepted, outcomes := scheduler.Submit(second)
	if !accepted || len(outcomes) != 1 || outcomes[0].Reason != ReasonCoalesced {
		t.Fatalf("coalesce = %t, %+v", accepted, outcomes)
	}
	decision, _, ok := scheduler.Next()
	if !ok || decision.CandidateID != "gap-2" {
		t.Fatalf("decision = %+v, %t", decision, ok)
	}
	if reason := scheduler.AcknowledgeStarted(decision); reason != "" {
		t.Fatalf("start acknowledgement = %q", reason)
	}

	clock.now = 2_000
	third := candidateFor("gap-3", FamilyTimings, "timings.gap_report", "car-a", PriorityInformation, 2_000)
	accepted, outcomes = scheduler.Submit(third)
	if accepted || len(outcomes) != 1 || outcomes[0].Reason != ReasonCooldownActive {
		t.Fatalf("cooldown = %t, %+v", accepted, outcomes)
	}
}

func TestSchedulerDoesNotStartCooldownBeforeDeliveryStarts(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_500}
	scheduler := newTestScheduler(t, clock, 8)
	scheduler.Observe(validEvidence(t, 10_000))
	first := candidateFor("gap-1", FamilyTimings, IntentTimingGapReport, "car-a", PriorityInformation, 1_000)
	if accepted, _ := scheduler.Submit(first); !accepted {
		t.Fatal("first candidate was rejected")
	}
	if _, _, ok := scheduler.Next(); !ok {
		t.Fatal("first candidate was not selected")
	}

	clock.now = 2_000
	second := candidateFor("gap-2", FamilyTimings, IntentTimingGapReport, "car-a", PriorityInformation, 2_000)
	if accepted, outcomes := scheduler.Submit(second); !accepted || len(outcomes) != 0 {
		t.Fatalf("unstarted decision activated cooldown = %t, %+v", accepted, outcomes)
	}
}

func TestSchedulerRevalidatesTTLAndEvidenceAtEmission(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		advance   int64
		observe   func(t *testing.T, scheduler *Scheduler)
		wantState OutcomeState
		want      Reason
	}{
		{name: "deadline", advance: 1_001, wantState: OutcomeExpired, want: ReasonDeadlineElapsed},
		{name: "freshness", advance: 501, wantState: OutcomeExpired, want: ReasonEvidenceStale},
		{name: "identity", advance: 10, observe: func(t *testing.T, scheduler *Scheduler) {
			evidence := validEvidence(t, 5_000)
			evidence.Context.Epoch = 2
			evidence.Context.Identity.Session = "session-b"
			scheduler.Observe(evidence)
		}, wantState: OutcomeCancelled, want: ReasonIdentityChanged},
		{name: "required field became unavailable", advance: 10, observe: func(t *testing.T, scheduler *Scheduler) {
			evidence := validEvidence(t, 5_000)
			evidence.ReadyFamilies = []Family{FamilySpotter, FamilyFuel, FamilyPenalties, FamilyTimings, FamilyPitStops}
			scheduler.Observe(evidence)
		}, wantState: OutcomeUnavailable, want: ReasonEvidenceNotReady},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, 8)
			evidence := validEvidence(t, 1_500)
			scheduler.Observe(evidence)
			candidate := validCandidate()
			if accepted, _ := scheduler.Submit(candidate); !accepted {
				t.Fatal("candidate was rejected")
			}
			clock.now += tt.advance
			if tt.observe != nil {
				tt.observe(t, scheduler)
			}
			_, outcomes, ok := scheduler.Next()
			if ok {
				t.Fatal("invalid candidate was emitted")
			}
			state := scheduler.State()
			all := append(outcomes, state.Recent...)
			if !containsOutcome(all, tt.wantState, tt.want) {
				t.Fatalf("outcomes = %+v, want %s/%s", all, tt.wantState, tt.want)
			}
		})
	}
}

func TestSchedulerNeverEmitsClaimsInvalidatedByLatestObservation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		intent string
		family Family
		before func(*SemanticEvidence)
		after  func(*SemanticEvidence)
	}{
		{name: "car left became clear", intent: IntentSpotterCarLeft, family: FamilySpotter,
			before: func(value *SemanticEvidence) { value.SpotterKnown, value.SpotterLeft = true, true },
			after:  func(value *SemanticEvidence) { value.SpotterKnown, value.SpotterLeft = true, false }},
		{name: "fuel was refilled", intent: IntentFuelLapsTwo, family: FamilyFuel,
			before: func(value *SemanticEvidence) { value.FuelKnown, value.FuelLitres = true, 1 },
			after:  func(value *SemanticEvidence) { value.FuelKnown, value.FuelLitres = true, 50 }},
		{name: "pit entry became exit", intent: IntentPitEntry, family: FamilyPitStops,
			before: func(value *SemanticEvidence) { value.PitKnown, value.InPit = true, true },
			after:  func(value *SemanticEvidence) { value.PitKnown, value.InPit = true, false }},
		{name: "timing changed", intent: IntentTimingGapReport, family: FamilyTimings,
			before: func(value *SemanticEvidence) { value.GapLeaderKnown, value.GapLeader = true, 3 },
			after:  func(value *SemanticEvidence) { value.GapLeaderKnown, value.GapLeader = true, 4 }},
		{name: "penalty was cleared", intent: IntentPenaltyCountIncreased, family: FamilyPenalties,
			before: func(value *SemanticEvidence) { value.PenaltyKnown, value.PenaltyCount = true, 1 },
			after:  func(value *SemanticEvidence) { value.PenaltyKnown, value.PenaltyCount = true, 0 }},
		{name: "lap advanced", intent: IntentLapCompleted, family: FamilyLaps,
			before: func(value *SemanticEvidence) { value.LapKnown, value.LapNumber = true, 5 },
			after:  func(value *SemanticEvidence) { value.LapKnown, value.LapNumber = true, 6 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, 8)
			evidence := validEvidence(t, 5_000)
			tt.before(&evidence.Semantic)
			scheduler.Observe(evidence)
			candidate := candidateFor("claim", tt.family, tt.intent, "player", mustPriority(t, tt.family, tt.intent), 1_000)
			candidate.Semantic = semanticClaimFromEvidence(candidate.Semantic, evidence.Semantic)
			if accepted, outcomes := scheduler.Submit(candidate); !accepted || len(outcomes) != 0 {
				t.Fatalf("initial claim rejected: %t, %+v", accepted, outcomes)
			}
			tt.after(&evidence.Semantic)
			scheduler.Observe(evidence)
			_, outcomes, ok := scheduler.Next()
			if ok || !containsOutcome(outcomes, OutcomeCancelled, ReasonSemanticInvalidated) {
				t.Fatalf("stale claim escaped: ok=%t outcomes=%+v", ok, outcomes)
			}
		})
	}
}

func mustPriority(t testing.TB, family Family, intent string) Priority {
	t.Helper()
	priority, ok := approvedPriority(family, intent)
	if !ok {
		t.Fatalf("intent %q is not approved", intent)
	}
	return priority
}

func semanticClaimFromEvidence(claim SemanticClaim, evidence SemanticEvidence) SemanticClaim {
	switch claim.Rule {
	case SemanticFuelNotRefuelled:
		claim.Primary, claim.HasPrimary = evidence.FuelLitres, true
	case SemanticPenaltyOutstanding:
		claim.Integer = evidence.PenaltyCount
	case SemanticLapCurrent:
		claim.Integer = evidence.LapNumber
	case SemanticTimingUnchanged:
		claim.Primary, claim.HasPrimary = evidence.GapLeader, evidence.GapLeaderKnown
		claim.Secondary, claim.HasSecondary = evidence.GapNext, evidence.GapNextKnown
	}
	return claim
}

func TestResetSpotterCancelsOnlySpotterAndResetsDeliveryState(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 8)
	scheduler.Observe(validEvidence(t, 5_000))

	// Spotter must be submitted first so its supersession/preemption does not
	// evict the lower-priority Fuel candidate from the bounded queue.
	left := candidateFor("left", FamilySpotter, IntentSpotterCarLeft, "player", PrioritySpotter, 1_000)
	fuel := candidateFor("fuel", FamilyFuel, IntentFuelHalfTank, "player", PriorityFailureResource, 1_000)
	for _, candidate := range []Candidate{left, fuel} {
		if accepted, outcomes := scheduler.Submit(candidate); !accepted || len(outcomes) != 0 {
			t.Fatalf("submit %q = %t, %+v", candidate.ID, accepted, outcomes)
		}
	}

	outcomes := scheduler.ResetSpotter(ReasonLifecycleBoundary)
	if len(outcomes) != 1 || outcomes[0].Family != FamilySpotter || outcomes[0].State != OutcomeCancelled {
		t.Fatalf("ResetSpotter outcomes = %+v, want one cancelled Spotter", outcomes)
	}
	if scheduler.spotter != (spotterDeliveryState{}) {
		t.Fatalf("spotter delivery state was not reset: %+v", scheduler.spotter)
	}

	decision, _, ok := scheduler.Next()
	if !ok || decision.CandidateID != fuel.ID {
		t.Fatalf("Fuel was not preserved by ResetSpotter: %+v, %t", decision, ok)
	}
}

func TestCancelFamilyPreservesEvidenceAndSpotterDeliveryState(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 8)
	scheduler.Observe(validEvidence(t, 5_000))

	left := candidateFor("left", FamilySpotter, IntentSpotterCarLeft, "player", PrioritySpotter, 1_000)
	fuel := candidateFor("fuel", FamilyFuel, IntentFuelHalfTank, "player", PriorityFailureResource, 1_000)
	for _, candidate := range []Candidate{left, fuel} {
		if accepted, _ := scheduler.Submit(candidate); !accepted {
			t.Fatalf("candidate %q was rejected", candidate.ID)
		}
	}

	outcomes := scheduler.CancelFamily(FamilyFuel, ReasonLifecycleBoundary)
	if len(outcomes) != 1 || outcomes[0].Family != FamilyFuel || outcomes[0].State != OutcomeCancelled {
		t.Fatalf("CancelFamily outcomes = %+v, want one cancelled Fuel", outcomes)
	}
	if !scheduler.hasEvidence || scheduler.evidenceErr != "" {
		t.Fatal("CancelFamily must not clear evidence")
	}
	if scheduler.spotter == (spotterDeliveryState{}) {
		t.Fatal("CancelFamily must not reset the Spotter delivery state")
	}

	decision, _, ok := scheduler.Next()
	if !ok || decision.CandidateID != left.ID {
		t.Fatalf("Spotter was not preserved by CancelFamily: %+v, %t", decision, ok)
	}
}

func TestQueuePressureNeverEvictsSafetyForLowerPriority(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 2)
	scheduler.Observe(validEvidence(t, 5_000))
	spotter := candidateFor("left", FamilySpotter, "spotter.car_left", "left", PrioritySpotter, 1_000)
	fuel := candidateFor("fuel", FamilyFuel, "fuel.low_half_tank", "player", PriorityFailureResource, 1_000)
	lap := candidateFor("lap", FamilyLaps, "laps.lap_completed", "player", PriorityInformation, 1_000)
	for _, candidate := range []Candidate{spotter, fuel} {
		if accepted, _ := scheduler.Submit(candidate); !accepted {
			t.Fatalf("candidate %q was rejected", candidate.ID)
		}
	}
	accepted, outcomes := scheduler.Submit(lap)
	if accepted || len(outcomes) != 1 || outcomes[0].Reason != ReasonQueuePressure {
		t.Fatalf("queue pressure = %t, %+v", accepted, outcomes)
	}
	decision, _, ok := scheduler.Next()
	if !ok || decision.CandidateID != "left" {
		t.Fatalf("safety candidate lost: %+v, %t", decision, ok)
	}
}

func TestSchedulerBoundsPayloadDedupAndOwnedCopies(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler, err := NewScheduler(clock, Limits{
		MaxPending: 4, MaxPayloadItems: 1, MaxPayloadBytes: 8,
		MaxDedupKeyBytes: 32, MaxDiagnostics: 4, MaxCooldownKeys: 4,
	})
	if err != nil {
		t.Fatal(err)
	}
	scheduler.Observe(validEvidence(t, 5_000))

	tests := []struct {
		name      string
		candidate Candidate
		reason    Reason
	}{
		{name: "payload entries", candidate: func() Candidate {
			candidate := validCandidate()
			candidate.Payload = map[string]string{"a": "1", "b": "2"}
			return candidate
		}(), reason: ReasonPayloadLimit},
		{name: "payload bytes", candidate: func() Candidate {
			candidate := validCandidate()
			candidate.Payload = map[string]string{"key": "123456"}
			return candidate
		}(), reason: ReasonPayloadLimit},
		{name: "dedup bytes", candidate: func() Candidate {
			candidate := validCandidate()
			candidate.Subject = "a-subject-that-is-longer-than-the-configured-dedup-budget"
			return candidate
		}(), reason: ReasonDedupKeyLimit},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			accepted, outcomes := scheduler.Submit(tt.candidate)
			if accepted || len(outcomes) != 1 || outcomes[0].Reason != tt.reason {
				t.Fatalf("submit = %t, %+v", accepted, outcomes)
			}
		})
	}

	candidate := validCandidate()
	candidate.Payload = map[string]string{"fuel": "5"}
	if accepted, outcomes := scheduler.Submit(candidate); !accepted || len(outcomes) != 0 {
		t.Fatalf("valid payload = %t, %+v", accepted, outcomes)
	}
	candidate.Payload["fuel"] = "0"
	decision, _, ok := scheduler.Next()
	if !ok || decision.Payload["fuel"] != "5" {
		t.Fatalf("scheduler retained caller-owned payload: %+v, %t", decision, ok)
	}
	decision.Payload["fuel"] = "9"
	if scheduler.State().Pending != 0 {
		t.Fatal("decision mutation changed scheduler state")
	}
}

func TestSchedulerDoesNotRetainUnboundedInvalidEvidence(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 4)
	ready := make([]Family, hardMaxReadyFamilies+1)
	for index := range ready {
		ready[index] = FamilyLaps
	}
	evidence := validEvidence(t, 5_000)
	evidence.ReadyFamilies = ready
	scheduler.Observe(evidence)
	if len(scheduler.evidence.ReadyFamilies) != 0 || len(scheduler.evidence.Manifest.Entries()) != 0 {
		t.Fatalf("invalid evidence was retained: %+v", scheduler.evidence)
	}
	accepted, outcomes := scheduler.Submit(validCandidate())
	if accepted || len(outcomes) != 1 || outcomes[0].Reason != ReasonEvidenceNotReady {
		t.Fatalf("submit = %t, %+v", accepted, outcomes)
	}

	entries := make([]engineerprojection.Capability, hardMaxManifestItems+1)
	for index := range entries {
		entries[index] = engineerprojection.Capability{
			ID: engineerprojection.CapabilityID(fmt.Sprintf("future-%d", index)), State: engineerprojection.CapabilitySupported,
		}
	}
	manifest, err := engineerprojection.NewManifest(entries)
	if err != nil {
		t.Fatal(err)
	}
	evidence = validEvidence(t, 5_000)
	evidence.Manifest = manifest
	scheduler.Observe(evidence)
	if len(scheduler.evidence.Manifest.Entries()) != 0 {
		t.Fatal("oversized manifest was retained")
	}
}

func TestSchedulerBoundsAllRetainedStringsAndCancelReason(t *testing.T) {
	t.Parallel()

	large := strings.Repeat("x", hardMaxSubjectBytes+hardMaxIdentityBytes+1)
	tests := []struct {
		name   string
		mutate func(*Candidate)
	}{
		{name: "id", mutate: func(candidate *Candidate) { candidate.ID = large }},
		{name: "family", mutate: func(candidate *Candidate) { candidate.Family = Family(large) }},
		{name: "intent", mutate: func(candidate *Candidate) { candidate.Intent = large }},
		{name: "subject", mutate: func(candidate *Candidate) { candidate.Subject = large }},
		{name: "event identity", mutate: func(candidate *Candidate) { candidate.Context.Identity.Event = engineerprojection.EventID(large) }},
		{name: "session identity", mutate: func(candidate *Candidate) { candidate.Context.Identity.Session = engineerprojection.SessionID(large) }},
		{name: "vehicle identity", mutate: func(candidate *Candidate) { candidate.Context.Identity.Vehicle = engineerprojection.VehicleID(large) }},
		{name: "team identity", mutate: func(candidate *Candidate) { candidate.Context.Identity.Team = engineerprojection.TeamID(large) }},
		{name: "driver identity", mutate: func(candidate *Candidate) { candidate.Context.Identity.Driver = engineerprojection.DriverID(large) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clock := &testClock{now: 1_000}
			scheduler := newTestScheduler(t, clock, 4)
			scheduler.Observe(validEvidence(t, 5_000))
			candidate := validCandidate()
			tt.mutate(&candidate)
			if accepted, _ := scheduler.Submit(candidate); accepted {
				t.Fatal("unbounded candidate was accepted")
			}
			for _, outcome := range scheduler.State().Recent {
				if len(outcome.CandidateID) > hardMaxIDBytes || len(outcome.Family) > hardMaxFamilyBytes || len(outcome.Intent) > hardMaxIntentBytes {
					t.Fatalf("unbounded diagnostic retained: %+v", outcome)
				}
			}
		})
	}

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 4)
	scheduler.Observe(validEvidence(t, 5_000))
	if accepted, _ := scheduler.Submit(validCandidate()); !accepted {
		t.Fatal("candidate was rejected")
	}
	outcomes := scheduler.Cancel(Reason(large))
	if len(outcomes) != 1 || outcomes[0].Reason != ReasonLifecycleBoundary || scheduler.hasEvidence {
		t.Fatalf("untrusted cancel reason or evidence retained: %+v hasEvidence=%t", outcomes, scheduler.hasEvidence)
	}

	evidence := validEvidence(t, 5_000)
	evidence.Context.Identity.Driver = engineerprojection.DriverID(large)
	scheduler.Observe(evidence)
	if scheduler.evidence.Context.Identity.Driver != "" {
		t.Fatal("invalid evidence context was retained")
	}
}

func TestLifecycleCancellationClearsPendingAndCooldown(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler := newTestScheduler(t, clock, 8)
	scheduler.Observe(validEvidence(t, 10_000))
	first := candidateFor("gap-1", FamilyTimings, IntentTimingGapReport, "player", PriorityInformation, 1_000)
	if accepted, _ := scheduler.Submit(first); !accepted {
		t.Fatal("first timing candidate was rejected")
	}
	decision, _, ok := scheduler.Next()
	if !ok {
		t.Fatal("first timing candidate was not emitted")
	}
	if reason := scheduler.AcknowledgeStarted(decision); reason != "" {
		t.Fatalf("first timing candidate did not start: %q", reason)
	}

	clock.now = 2_000
	blocked := candidateFor("gap-2", FamilyTimings, IntentTimingGapReport, "player", PriorityInformation, 2_000)
	if accepted, _ := scheduler.Submit(blocked); accepted {
		t.Fatal("cooldown did not suppress candidate")
	}
	scheduler.Cancel(ReasonLifecycleBoundary)
	if accepted, outcomes := scheduler.Submit(blocked); accepted || len(outcomes) != 1 || outcomes[0].Reason != ReasonSourceUnavailable {
		t.Fatalf("lifecycle retained stale evidence: %t, %+v", accepted, outcomes)
	}
	scheduler.Observe(validEvidence(t, 10_000))
	if accepted, outcomes := scheduler.Submit(blocked); !accepted || len(outcomes) != 0 {
		t.Fatalf("fresh evidence did not reopen admission: %t, %+v", accepted, outcomes)
	}
	pending := candidateFor("gap-3", FamilyTimings, IntentTimingGapReport, "other", PriorityInformation, 2_000)
	if accepted, _ := scheduler.Submit(pending); !accepted {
		t.Fatal("pending candidate was rejected")
	}
	evidence := validEvidence(t, 10_000)
	evidence.Context.Epoch = 2
	evidence.Context.Identity.Session = "session-b"
	outcomes := scheduler.Observe(evidence)
	if len(outcomes) != 2 {
		t.Fatalf("boundary outcomes = %+v", outcomes)
	}
	for _, outcome := range outcomes {
		if outcome.State != OutcomeCancelled || outcome.Reason != ReasonIdentityChanged {
			t.Fatalf("boundary outcome = %+v", outcome)
		}
	}
}

func TestSchedulerVirtualSoakRemainsBoundedAndDeterministic(t *testing.T) {
	t.Parallel()

	run := func(seed int64) ([]string, SchedulerState) {
		clock := &testClock{now: 1_000}
		scheduler := newTestScheduler(t, clock, 16)
		scheduler.Observe(validEvidence(t, 1_000_000))
		random := rand.New(rand.NewSource(seed))
		var emitted []string
		for index := 0; index < 10_000; index++ {
			clock.now++
			candidate := candidateFor(
				fmt.Sprintf("lap-%d", index%64),
				FamilyLaps,
				"laps.lap_completed",
				fmt.Sprintf("car-%d", random.Intn(32)),
				PriorityInformation,
				clock.now,
			)
			candidate.ExpiresAtMS = clock.now + 1_000
			scheduler.Submit(candidate)
			if random.Intn(3) == 0 {
				if decision, _, ok := scheduler.Next(); ok {
					emitted = append(emitted, decision.CandidateID)
				}
			}
			if state := scheduler.State(); state.Pending > state.Capacity || len(state.Recent) > 8 {
				t.Fatalf("unbounded state: %+v", state)
			}
		}
		return emitted, scheduler.State()
	}
	first, firstState := run(42)
	second, secondState := run(42)
	if !reflect.DeepEqual(first, second) || !reflect.DeepEqual(firstState, secondState) {
		t.Fatal("same seed produced different scheduler results")
	}
}

func TestSchedulerBoundsNonCriticalStarvation(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_000}
	scheduler, err := NewScheduler(clock, Limits{MaxPending: 32, MaxDiagnostics: 32, MaxCooldownKeys: 32, MaxPriorityBurst: 4})
	if err != nil {
		t.Fatal(err)
	}
	scheduler.Observe(validEvidence(t, 10_000))
	low := candidateFor("waiting-lap", FamilyLaps, IntentLapCompleted, "waiting", PriorityInformation, 1_000)
	if accepted, _ := scheduler.Submit(low); !accepted {
		t.Fatal("low priority candidate was rejected")
	}
	for index := 0; index < 8; index++ {
		high := candidateFor("fuel-"+strconv.Itoa(index), FamilyFuel, IntentFuelHalfTank, "car-"+strconv.Itoa(index), PriorityFailureResource, 1_000)
		if accepted, _ := scheduler.Submit(high); !accepted {
			t.Fatalf("high priority candidate %d was rejected", index)
		}
	}
	for emitted := 0; emitted <= scheduler.limits.MaxPriorityBurst; emitted++ {
		decision, _, ok := scheduler.Next()
		if !ok {
			t.Fatal("queue ended before waiting candidate")
		}
		if decision.CandidateID == low.ID {
			return
		}
	}
	t.Fatalf("low priority candidate starved beyond %d higher-priority emissions", scheduler.limits.MaxPriorityBurst)
}

func BenchmarkSchedulerSaturatedQueue(b *testing.B) {
	clock := &testClock{now: 1_000}
	scheduler, err := NewScheduler(clock, Limits{MaxPending: 64, MaxDiagnostics: 8, MaxCooldownKeys: 64})
	if err != nil {
		b.Fatal(err)
	}
	scheduler.Observe(validEvidenceForBenchmark(b, 1<<60))
	for index := 0; index < scheduler.limits.MaxPending; index++ {
		candidate := candidateFor("lap-"+strconv.Itoa(index), FamilyLaps, IntentLapCompleted, "car-"+strconv.Itoa(index), PriorityInformation, clock.now)
		candidate.ExpiresAtMS = 1 << 60
		if accepted, _ := scheduler.Submit(candidate); !accepted {
			b.Fatal("could not saturate scheduler")
		}
	}
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		clock.now++
		scheduler.Next()
		candidate := candidateFor("lap-new-"+strconv.Itoa(index), FamilyLaps, IntentLapCompleted, "new-"+strconv.Itoa(index), PriorityInformation, clock.now)
		candidate.ExpiresAtMS = 1 << 60
		scheduler.Submit(candidate)
	}
}

func FuzzSchedulerBoundsUntrustedStrings(f *testing.F) {
	f.Add("id", "laps", IntentLapCompleted, "player", "event", "reason", "value")
	f.Add(strings.Repeat("x", 1_025), "family", "intent", "subject", "event", "reason", "value")
	f.Add("id", "laps", "intent\x00other", "subject", "event", "reason", "value")
	f.Fuzz(func(t *testing.T, id, family, intent, subject, event, reason, payload string) {
		clock := &testClock{now: 1_000}
		scheduler, err := NewScheduler(clock, Limits{MaxPending: 4, MaxDedupKeyBytes: 32, MaxDiagnostics: 4, MaxCooldownKeys: 4})
		if err != nil {
			t.Fatal(err)
		}
		scheduler.Observe(validEvidence(t, 2_000))
		candidate := validCandidate()
		candidate.ID, candidate.Family, candidate.Intent, candidate.Subject = id, Family(family), intent, subject
		candidate.Context.Identity.Event = engineerprojection.EventID(event)
		candidate.Payload = map[string]string{"value": payload}
		scheduler.Submit(candidate)
		scheduler.Cancel(Reason(reason))
		if state := scheduler.State(); state.Pending > state.Capacity || len(state.Recent) > 4 {
			t.Fatalf("unbounded state: %+v", state)
		}
		for _, outcome := range scheduler.State().Recent {
			if len(outcome.CandidateID) > hardMaxIDBytes || len(outcome.Family) > hardMaxFamilyBytes || len(outcome.Intent) > hardMaxIntentBytes {
				t.Fatalf("unbounded diagnostic: %+v", outcome)
			}
		}
	})
}

func newTestScheduler(t *testing.T, clock Clock, capacity int) *Scheduler {
	t.Helper()
	scheduler, err := NewScheduler(clock, Limits{MaxPending: capacity, MaxDiagnostics: 8, MaxCooldownKeys: 8})
	if err != nil {
		t.Fatal(err)
	}
	return scheduler
}

func validCandidate() Candidate {
	return candidateFor("lap", FamilyLaps, "laps.lap_completed", "player", PriorityInformation, 1_000)
}

func candidateFor(id string, family Family, intent, subject string, priority Priority, createdAt int64) Candidate {
	semantic := testSemanticClaim(intent)
	return Candidate{
		Version:           ContractVersionV1,
		ID:                id,
		Family:            family,
		Intent:            intent,
		Subject:           subject,
		Priority:          priority,
		CreatedAtMS:       createdAt,
		ExpiresAtMS:       createdAt + 1_000,
		CanonicalVersion:  schema.CanonicalVersionV1,
		ProjectionVersion: engineerprojection.VersionV1,
		Context:           testContext(),
		Semantic:          semantic,
	}
}

func testSemanticClaim(intent string) SemanticClaim {
	rule, _ := semanticRuleForIntent(intent)
	claim := SemanticClaim{Rule: rule}
	switch rule {
	case SemanticFuelNotRefuelled:
		claim.Primary, claim.HasPrimary = 1, true
	case SemanticPenaltyOutstanding:
		claim.Integer = 1
	case SemanticLapCurrent:
		claim.Integer = 5
	case SemanticTimingUnchanged:
		claim.Primary, claim.Secondary = 3, 1
		claim.HasPrimary, claim.HasSecondary = true, true
	}
	return claim
}

func validEvidence(t testing.TB, freshUntil int64) Evidence {
	t.Helper()
	return Evidence{
		CanonicalVersion:  schema.CanonicalVersionV1,
		ProjectionVersion: engineerprojection.VersionV1,
		Context:           testContext(),
		Manifest:          manifest(t),
		Source:            engineerprojection.SourceLive,
		FreshUntilMS:      freshUntil,
		ReadyFamilies: []Family{
			FamilySpotter, FamilyFuel, FamilyPenalties, FamilyLaps, FamilyTimings, FamilyPitStops,
		},
		Semantic: SemanticEvidence{
			SpotterKnown: true, SpotterLeft: true,
			FuelKnown: true, FuelLitres: 1, FuelCapacityKnown: true, FuelCapacity: 100,
			PitKnown:     true,
			PenaltyKnown: true, PenaltyCount: 1,
			LapKnown: true, LapNumber: 5,
			GapLeaderKnown: true, GapLeader: 3, GapNextKnown: true, GapNext: 1,
		},
	}
}

func validEvidenceForBenchmark(b *testing.B, freshUntil int64) Evidence {
	b.Helper()
	return validEvidence(b, freshUntil)
}

func manifest(t testing.TB, unsupported ...engineerprojection.CapabilityID) engineerprojection.Manifest {
	t.Helper()
	blocked := make(map[engineerprojection.CapabilityID]bool, len(unsupported))
	for _, capability := range unsupported {
		blocked[capability] = true
	}
	entries := make([]engineerprojection.Capability, 0, 7)
	for _, capability := range []engineerprojection.CapabilityID{
		engineerprojection.CapabilitySession,
		engineerprojection.CapabilityStandings,
		engineerprojection.CapabilityControls,
		engineerprojection.CapabilityPit,
		engineerprojection.CapabilityFuel,
		engineerprojection.CapabilityGaps,
		engineerprojection.CapabilitySpatial,
	} {
		state := engineerprojection.CapabilitySupported
		if blocked[capability] {
			state = engineerprojection.CapabilityUnsupported
		}
		entries = append(entries, engineerprojection.Capability{ID: capability, State: state})
	}
	result, err := engineerprojection.NewManifest(entries)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func testContext() engineerprojection.Context {
	return engineerprojection.Context{
		Epoch: 1,
		Identity: engineerprojection.Identity{
			Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver",
		},
	}
}

func containsOutcome(outcomes []PolicyOutcome, state OutcomeState, reason Reason) bool {
	for _, outcome := range outcomes {
		if outcome.State == state && outcome.Reason == reason {
			return true
		}
	}
	return false
}
