package contract

import (
	"errors"
	"testing"
)

func TestFlowTransitionMatrix(t *testing.T) {
	t.Parallel()

	states := []FlowState{
		FlowReported, FlowNeedsInfo, FlowQueued, FlowCodexWorking, FlowOwnerReview,
		FlowNightlyCandidate, FlowNightlyAccepted, FlowNightlyRejected,
		FlowTestersCandidate, FlowTestersAccepted, FlowTestersRejected,
		FlowMasterReview, FlowReleased, FlowNeedsOwner, FlowStopped,
	}
	allowed := map[[2]FlowState]bool{}
	allow := func(from FlowState, targets ...FlowState) {
		for _, to := range targets {
			allowed[[2]FlowState{from, to}] = true
		}
	}
	allow(FlowReported, FlowNeedsInfo, FlowQueued, FlowNeedsOwner, FlowStopped)
	allow(FlowNeedsInfo, FlowReported, FlowStopped)
	allow(FlowQueued, FlowCodexWorking, FlowNeedsOwner, FlowStopped)
	allow(FlowCodexWorking, FlowOwnerReview, FlowNeedsOwner, FlowStopped)
	allow(FlowOwnerReview, FlowNightlyCandidate, FlowNeedsOwner, FlowStopped)
	allow(FlowNightlyCandidate, FlowNightlyAccepted, FlowNightlyRejected, FlowNeedsOwner, FlowStopped)
	allow(FlowNightlyAccepted, FlowTestersCandidate, FlowNeedsOwner, FlowStopped)
	allow(FlowNightlyRejected, FlowQueued, FlowNeedsOwner, FlowStopped)
	allow(FlowTestersCandidate, FlowTestersAccepted, FlowTestersRejected, FlowNeedsOwner, FlowStopped)
	allow(FlowTestersAccepted, FlowMasterReview, FlowNeedsOwner, FlowStopped)
	allow(FlowTestersRejected, FlowQueued, FlowNeedsOwner, FlowStopped)
	allow(FlowMasterReview, FlowReleased, FlowStopped)
	allow(FlowNeedsOwner, FlowQueued, FlowStopped)

	for _, from := range states {
		for _, to := range states {
			from, to := from, to
			t.Run(string(from)+"_to_"+string(to), func(t *testing.T) {
				t.Parallel()
				err := ValidateTransition(from, to, contextForTransition(from, to))
				if allowed[[2]FlowState{from, to}] && err != nil {
					t.Fatalf("allowed transition error = %v", err)
				}
				if !allowed[[2]FlowState{from, to}] && !errors.Is(err, ErrInvalidTransition) {
					t.Fatalf("denied transition error = %v, want %v", err, ErrInvalidTransition)
				}
			})
		}
	}
}

func TestTransitionRejectsUnknownStateAndMissingIdentity(t *testing.T) {
	t.Parallel()
	if err := ValidateTransition(FlowState("future"), FlowQueued, defaultContext()); !errors.Is(err, ErrUnknownState) {
		t.Fatalf("unknown from error = %v", err)
	}
	if err := ValidateTransition(FlowQueued, FlowState("future"), defaultContext()); !errors.Is(err, ErrUnknownState) {
		t.Fatalf("unknown to error = %v", err)
	}
	context := defaultContext()
	context.IdempotencyKey = ""
	if err := ValidateTransition(FlowQueued, FlowCodexWorking, context); !errors.Is(err, ErrInvalidIdempotency) {
		t.Fatalf("missing idempotency error = %v", err)
	}
}

func TestOwnerCanStopWithCorruptCandidateMetadata(t *testing.T) {
	t.Parallel()

	actor := mustHumanActor("owner-1", RoleOwner)
	context := TransitionContext{Actor: actor, ActorClaimID: actor.ID(), GlobalPaused: true}
	if err := ValidateTransition(FlowNightlyCandidate, FlowStopped, context); err != nil {
		t.Fatalf("emergency stop error = %v", err)
	}
	context.Actor = primaryTester()
	context.ActorClaimID = context.Actor.ID()
	if err := ValidateTransition(FlowNightlyCandidate, FlowStopped, context); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("non-owner emergency stop error = %v", err)
	}
}

func TestCandidateDecisionGuards(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		from    FlowState
		to      FlowState
		context TransitionContext
		want    error
	}{
		{name: "tester cannot accept nightly", from: FlowNightlyCandidate, to: FlowNightlyAccepted, context: candidateContext(RoleTester), want: ErrPermissionDenied},
		{name: "primary accepts nightly", from: FlowNightlyCandidate, to: FlowNightlyAccepted, context: candidateContext(RolePrimaryTester)},
		{name: "primary rejects nightly", from: FlowNightlyCandidate, to: FlowNightlyRejected, context: withRejection(candidateContext(RolePrimaryTester), RejectionStillFails)},
		{name: "tester accepts testers", from: FlowTestersCandidate, to: FlowTestersAccepted, context: candidateContext(RoleTester)},
		{name: "tester rejects testers", from: FlowTestersCandidate, to: FlowTestersRejected, context: withRejection(candidateContext(RoleTester), RejectionRegression)},
		{name: "rejection needs reason", from: FlowTestersCandidate, to: FlowTestersRejected, context: candidateContext(RoleTester), want: ErrInvalidDocument},
		{name: "stale SHA", from: FlowNightlyCandidate, to: FlowNightlyAccepted, context: withTestedSHA(candidateContext(RolePrimaryTester), "cccccccccccccccccccccccccccccccccccccccc"), want: ErrStaleSHA},
		{name: "self validation", from: FlowNightlyCandidate, to: FlowNightlyAccepted, context: withAuthor(candidateContext(RolePrimaryTester), "validator-1"), want: ErrSelfValidation},
		{name: "missing candidate author", from: FlowNightlyCandidate, to: FlowNightlyAccepted, context: withAuthor(candidateContext(RolePrimaryTester), ""), want: ErrInvalidDocument},
		{name: "automated validation", from: FlowNightlyCandidate, to: FlowNightlyAccepted, context: automatedCandidateContext(), want: ErrAutomatedValidation},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := ValidateTransition(test.from, test.to, test.context)
			if !errors.Is(err, test.want) {
				t.Fatalf("ValidateTransition() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestAcceptedSHAFollowsPromotionChain(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		from FlowState
		to   FlowState
		role Role
	}{
		{name: "nightly to testers", from: FlowNightlyAccepted, to: FlowTestersCandidate},
		{name: "testers to master review", from: FlowTestersAccepted, to: FlowMasterReview},
		{name: "master release", from: FlowMasterReview, to: FlowReleased, role: RoleOwner},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			context := contextForTransition(test.from, test.to)
			context.ValidatedSHA = "cccccccccccccccccccccccccccccccccccccccc"
			if err := ValidateTransition(test.from, test.to, context); !errors.Is(err, ErrStaleSHA) {
				t.Fatalf("stale promotion error = %v", err)
			}
		})
	}
}

func TestRetryIsBoundedToOne(t *testing.T) {
	t.Parallel()

	for _, from := range []FlowState{FlowNightlyRejected, FlowTestersRejected} {
		context := defaultContext()
		context.IdempotencySHA = testSHA
		context.RetryCount = 0
		if err := ValidateTransition(from, FlowQueued, context); err != nil {
			t.Fatalf("first retry from %s error = %v", from, err)
		}
		context.RetryCount = 1
		if err := ValidateTransition(from, FlowQueued, context); !errors.Is(err, ErrRetryExhausted) {
			t.Fatalf("second retry from %s error = %v", from, err)
		}
		if err := ValidateTransition(from, FlowNeedsOwner, context); err != nil {
			t.Fatalf("needs-owner after exhausted retry from %s error = %v", from, err)
		}
	}
}

func TestOwnerAndAutomationGates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		from FlowState
		to   FlowState
		role Role
		want error
	}{
		{name: "owner approves PR into nightly", from: FlowOwnerReview, to: FlowNightlyCandidate, role: RoleOwner},
		{name: "primary cannot approve PR", from: FlowOwnerReview, to: FlowNightlyCandidate, role: RolePrimaryTester, want: ErrPermissionDenied},
		{name: "owner authorizes master", from: FlowMasterReview, to: FlowReleased, role: RoleOwner},
		{name: "primary cannot authorize master", from: FlowMasterReview, to: FlowReleased, role: RolePrimaryTester, want: ErrPermissionDenied},
		{name: "owner resumes needs-owner", from: FlowNeedsOwner, to: FlowQueued, role: RoleOwner},
		{name: "tester cannot resume needs-owner", from: FlowNeedsOwner, to: FlowQueued, role: RoleTester, want: ErrPermissionDenied},
		{name: "owner stops flow", from: FlowCodexWorking, to: FlowStopped, role: RoleOwner},
		{name: "tester cannot stop flow", from: FlowCodexWorking, to: FlowStopped, role: RoleTester, want: ErrPermissionDenied},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			context := defaultContext()
			context.Actor = mustHumanActor("human-1", test.role)
			context.ActorClaimID = context.Actor.ID()
			if transitionRequiresSHA(test.from, test.to) {
				context.IdempotencySHA = testSHA
			}
			err := ValidateTransition(test.from, test.to, context)
			if !errors.Is(err, test.want) {
				t.Fatalf("ValidateTransition() error = %v, want %v", err, test.want)
			}
		})
	}

	human := defaultContext()
	human.Actor = primaryTester()
	human.ActorClaimID = human.Actor.ID()
	if err := ValidateTransition(FlowQueued, FlowCodexWorking, human); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("human technical transition error = %v", err)
	}
}

func TestOnlyOrchestratorCanMoveTechnicalStates(t *testing.T) {
	t.Parallel()

	for _, origin := range []Origin{OriginCodex, OriginGitHubActions} {
		actor, err := NewAutomatedActor("automation-1", origin)
		if err != nil {
			t.Fatal(err)
		}
		context := defaultContext()
		context.Actor = actor
		context.ActorClaimID = actor.ID()
		if err := ValidateTransition(FlowQueued, FlowCodexWorking, context); !errors.Is(err, ErrPermissionDenied) {
			t.Fatalf("origin %s technical transition error = %v", origin, err)
		}
	}
	context := defaultContext()
	context.ActorClaimID = "spoofed"
	if err := ValidateTransition(FlowQueued, FlowCodexWorking, context); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("spoofed actor claim error = %v", err)
	}
}

func TestPauseBlocksProgressButAllowsRejectAndStop(t *testing.T) {
	t.Parallel()

	for _, paused := range []struct {
		name   string
		global bool
		flow   bool
	}{
		{name: "global", global: true},
		{name: "flow", flow: true},
	} {
		paused := paused
		t.Run(paused.name, func(t *testing.T) {
			t.Parallel()
			automated := defaultContext()
			automated.GlobalPaused, automated.FlowPaused = paused.global, paused.flow
			if err := ValidateTransition(FlowQueued, FlowCodexWorking, automated); !errors.Is(err, ErrPaused) {
				t.Fatalf("automated transition error = %v", err)
			}
			ownerRelease := contextForTransition(FlowMasterReview, FlowReleased)
			ownerRelease.GlobalPaused, ownerRelease.FlowPaused = paused.global, paused.flow
			if err := ValidateTransition(FlowMasterReview, FlowReleased, ownerRelease); !errors.Is(err, ErrPaused) {
				t.Fatalf("owner release during pause error = %v", err)
			}
			reject := withRejection(candidateContext(RolePrimaryTester), RejectionStillFails)
			reject.GlobalPaused, reject.FlowPaused = paused.global, paused.flow
			if err := ValidateTransition(FlowNightlyCandidate, FlowNightlyRejected, reject); err != nil {
				t.Fatalf("human rejection error = %v", err)
			}
			stop := defaultContext()
			stop.Actor = mustHumanActor("owner-1", RoleOwner)
			stop.ActorClaimID = stop.Actor.ID()
			stop.GlobalPaused, stop.FlowPaused = paused.global, paused.flow
			if err := ValidateTransition(FlowQueued, FlowStopped, stop); err != nil {
				t.Fatalf("human stop error = %v", err)
			}
		})
	}
}

func TestIdempotencyIsBoundToTransitionAggregateAndSHA(t *testing.T) {
	t.Parallel()

	operation := IdempotencyOperation{
		Key: "flow-1:nightly-accepted", Digest: testDigest, AggregateID: "flow-1",
		From: FlowNightlyCandidate, To: FlowNightlyAccepted, ExactSHA: testSHA,
	}
	if decision, err := DecideIdempotency(operation, nil); decision != IdempotencyApply || err != nil {
		t.Fatalf("apply = %q, %v", decision, err)
	}
	if decision, err := DecideIdempotency(operation, &operation); decision != IdempotencyReplay || err != nil {
		t.Fatalf("replay = %q, %v", decision, err)
	}
	mutations := []struct {
		name string
		edit func(*IdempotencyOperation)
	}{
		{name: "digest", edit: func(value *IdempotencyOperation) {
			value.Digest = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
		}},
		{name: "aggregate", edit: func(value *IdempotencyOperation) { value.AggregateID = "flow-2" }},
		{name: "transition", edit: func(value *IdempotencyOperation) { value.To = FlowNightlyRejected }},
		{name: "sha", edit: func(value *IdempotencyOperation) { value.ExactSHA = "cccccccccccccccccccccccccccccccccccccccc" }},
	}
	for _, mutation := range mutations {
		mutation := mutation
		t.Run(mutation.name, func(t *testing.T) {
			t.Parallel()
			changed := operation
			mutation.edit(&changed)
			decision, err := DecideIdempotency(changed, &operation)
			if decision != IdempotencyConflict || !errors.Is(err, ErrIdempotencyConflict) {
				t.Fatalf("conflict = %q, %v", decision, err)
			}
		})
	}
	invalid := operation
	invalid.Key = ""
	if _, err := DecideIdempotency(invalid, nil); !errors.Is(err, ErrInvalidIdempotency) {
		t.Fatalf("invalid operation error = %v", err)
	}
	invalid = operation
	invalid.ExactSHA = ""
	if _, err := DecideIdempotency(invalid, nil); !errors.Is(err, ErrInvalidIdempotency) {
		t.Fatalf("missing sensitive SHA error = %v", err)
	}
}

func contextForTransition(from, to FlowState) TransitionContext {
	context := defaultContext()
	switch {
	case to == FlowStopped:
		context.Actor = mustHumanActor("owner-1", RoleOwner)
	case from == FlowOwnerReview && to == FlowNightlyCandidate,
		from == FlowMasterReview && to == FlowReleased,
		from == FlowNeedsOwner && to == FlowQueued:
		context.Actor = mustHumanActor("owner-1", RoleOwner)
	case from == FlowNeedsInfo && to == FlowReported:
		context.Actor = mustHumanActor("tester-1", RoleTester)
	case from == FlowNightlyCandidate && (to == FlowNightlyAccepted || to == FlowNightlyRejected):
		context = candidateContext(RolePrimaryTester)
		if to == FlowNightlyRejected {
			context.RejectionReason = RejectionStillFails
		}
	case from == FlowTestersCandidate && (to == FlowTestersAccepted || to == FlowTestersRejected):
		context = candidateContext(RoleTester)
		if to == FlowTestersRejected {
			context.RejectionReason = RejectionStillFails
		}
	}
	if transitionRequiresSHA(from, to) {
		context.IdempotencySHA = testSHA
	}
	context.ActorClaimID = context.Actor.ID()
	return context
}

func defaultContext() TransitionContext {
	return TransitionContext{
		Actor: automationActor(), ActorClaimID: "orchestrator-1", CandidateSHA: testSHA, TestedSHA: testSHA,
		ValidatedSHA: testSHA, CandidateAuthorID: "codex-1", AggregateID: "flow-1",
		IdempotencyKey: "flow-1:transition", OperationDigest: testDigest,
	}
}

func candidateContext(role Role) TransitionContext {
	context := defaultContext()
	context.Actor = mustHumanActor("validator-1", role)
	context.ActorClaimID = context.Actor.ID()
	context.IdempotencySHA = testSHA
	return context
}

func automatedCandidateContext() TransitionContext {
	context := candidateContext(RoleOwner)
	context.Actor = automationActor()
	context.ActorClaimID = context.Actor.ID()
	return context
}

func mustHumanActor(id string, role Role) Actor {
	actor, err := NewHumanActor(id, role)
	if err != nil {
		panic(err)
	}
	return actor
}

func withTestedSHA(context TransitionContext, sha string) TransitionContext {
	context.TestedSHA = sha
	return context
}

func withAuthor(context TransitionContext, authorID string) TransitionContext {
	context.CandidateAuthorID = authorID
	return context
}

func withRejection(context TransitionContext, reason RejectionReason) TransitionContext {
	context.RejectionReason = reason
	return context
}
