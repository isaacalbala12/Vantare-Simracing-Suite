package contract

import "fmt"

type FlowState string

const (
	FlowReported         FlowState = "reported"
	FlowNeedsInfo        FlowState = "needs_info"
	FlowQueued           FlowState = "queued"
	FlowCodexWorking     FlowState = "codex_working"
	FlowOwnerReview      FlowState = "owner_review"
	FlowNightlyCandidate FlowState = "nightly_candidate"
	FlowNightlyAccepted  FlowState = "nightly_accepted"
	FlowNightlyRejected  FlowState = "nightly_rejected"
	FlowTestersCandidate FlowState = "testers_candidate"
	FlowTestersAccepted  FlowState = "testers_accepted"
	FlowTestersRejected  FlowState = "testers_rejected"
	FlowMasterReview     FlowState = "master_review"
	FlowReleased         FlowState = "released"
	FlowNeedsOwner       FlowState = "needs_owner"
	FlowStopped          FlowState = "stopped"
)

type TransitionContext struct {
	Actor             Actor
	ActorClaimID      string
	GlobalPaused      bool
	FlowPaused        bool
	CandidateSHA      string
	TestedSHA         string
	ValidatedSHA      string
	CandidateAuthorID string
	RetryCount        uint8
	AggregateID       string
	IdempotencyKey    string
	OperationDigest   string
	IdempotencySHA    string
	RejectionReason   RejectionReason
}

func ValidateTransition(from, to FlowState, context TransitionContext) error {
	if !knownFlowState(from) || !knownFlowState(to) {
		return ErrUnknownState
	}
	if from == to || !allowedFlowTransition(from, to) {
		return ErrInvalidTransition
	}
	if err := validateActor(context.Actor); err != nil {
		return err
	}
	if to == FlowStopped {
		if context.ActorClaimID != context.Actor.id {
			return ErrPermissionDenied
		}
		return requireHumanRole(context.Actor, RoleOwner)
	}
	if err := validateTransitionIdentity(from, to, context); err != nil {
		return err
	}
	if (context.GlobalPaused || context.FlowPaused) && !allowedWhilePaused(to, context.Actor) {
		return ErrPaused
	}

	switch {
	case from == FlowNightlyCandidate && (to == FlowNightlyAccepted || to == FlowNightlyRejected):
		return validateCandidateDecision(ChannelNightly, to, context)
	case from == FlowTestersCandidate && (to == FlowTestersAccepted || to == FlowTestersRejected):
		return validateCandidateDecision(ChannelTesters, to, context)
	case (from == FlowNightlyRejected || from == FlowTestersRejected) && to == FlowQueued:
		if !context.Actor.automated || context.Actor.origin != OriginOrchestrator {
			return ErrPermissionDenied
		}
		if context.RetryCount >= 1 {
			return ErrRetryExhausted
		}
		return validateValidatedSHA(context)
	case requiresAutomation(from, to):
		if !context.Actor.automated || context.Actor.origin != OriginOrchestrator {
			return ErrPermissionDenied
		}
		if from == FlowNightlyAccepted && to == FlowTestersCandidate ||
			from == FlowTestersAccepted && to == FlowMasterReview {
			return validateValidatedSHA(context)
		}
		return nil
	case from == FlowNeedsInfo && to == FlowReported:
		if context.Actor.automated {
			return ErrPermissionDenied
		}
		return nil
	case from == FlowOwnerReview && to == FlowNightlyCandidate:
		return requireHumanRole(context.Actor, RoleOwner)
	case from == FlowMasterReview && to == FlowReleased:
		if err := requireHumanRole(context.Actor, RoleOwner); err != nil {
			return err
		}
		return validateValidatedSHA(context)
	case from == FlowNeedsOwner && to == FlowQueued:
		return requireHumanRole(context.Actor, RoleOwner)
	default:
		return nil
	}
}

func validateCandidateDecision(channel Channel, to FlowState, context TransitionContext) error {
	if context.Actor.automated {
		return ErrAutomatedValidation
	}
	if !canValidate(channel, context.Actor.role) {
		return ErrPermissionDenied
	}
	if err := validateID("candidateAuthorId", context.CandidateAuthorID); err != nil {
		return err
	}
	if context.Actor.id == context.CandidateAuthorID {
		return ErrSelfValidation
	}
	if err := validateSHA("candidateSha", context.CandidateSHA); err != nil {
		return err
	}
	if err := validateSHA("testedSha", context.TestedSHA); err != nil {
		return err
	}
	if context.CandidateSHA != context.TestedSHA {
		return ErrStaleSHA
	}
	if to == FlowNightlyRejected || to == FlowTestersRejected {
		return validateRejectionReason(context.RejectionReason)
	}
	if context.RejectionReason != "" {
		return fmt.Errorf("rejectionReason: %w", ErrInvalidDocument)
	}
	return nil
}

func validateValidatedSHA(context TransitionContext) error {
	if err := validateSHA("candidateSha", context.CandidateSHA); err != nil {
		return err
	}
	if err := validateSHA("validatedSha", context.ValidatedSHA); err != nil {
		return err
	}
	if context.CandidateSHA != context.ValidatedSHA {
		return ErrStaleSHA
	}
	return nil
}

func validateTransitionIdentity(from, to FlowState, context TransitionContext) error {
	if err := validateID("actorClaimId", context.ActorClaimID); err != nil || context.ActorClaimID != context.Actor.id {
		return ErrPermissionDenied
	}
	if err := validateID("aggregateId", context.AggregateID); err != nil {
		return ErrInvalidIdempotency
	}
	if err := validateID("idempotencyKey", context.IdempotencyKey); err != nil {
		return ErrInvalidIdempotency
	}
	if err := validateDigest("operationDigest", context.OperationDigest); err != nil {
		return ErrInvalidIdempotency
	}
	if transitionRequiresSHA(from, to) {
		if err := validateSHA("idempotencySha", context.IdempotencySHA); err != nil {
			return ErrInvalidIdempotency
		}
		if context.IdempotencySHA != context.CandidateSHA {
			return ErrIdempotencyConflict
		}
	}
	return nil
}

func transitionRequiresSHA(from, to FlowState) bool {
	if to == FlowStopped || to == FlowNeedsOwner {
		return false
	}
	switch from {
	case FlowOwnerReview, FlowNightlyCandidate, FlowNightlyAccepted, FlowNightlyRejected,
		FlowTestersCandidate, FlowTestersAccepted, FlowTestersRejected, FlowMasterReview:
		return true
	default:
		return to == FlowNightlyCandidate
	}
}

func allowedWhilePaused(to FlowState, actor Actor) bool {
	if actor.automated {
		return false
	}
	return to == FlowStopped || to == FlowNightlyRejected || to == FlowTestersRejected
}

func requiresAutomation(from, to FlowState) bool {
	switch from {
	case FlowReported:
		return to == FlowNeedsInfo || to == FlowQueued || to == FlowNeedsOwner
	case FlowQueued:
		return to == FlowCodexWorking || to == FlowNeedsOwner
	case FlowCodexWorking:
		return to == FlowOwnerReview || to == FlowNeedsOwner
	case FlowOwnerReview:
		return to == FlowNeedsOwner
	case FlowNightlyCandidate:
		return to == FlowNeedsOwner
	case FlowNightlyAccepted:
		return to == FlowTestersCandidate || to == FlowNeedsOwner
	case FlowNightlyRejected:
		return to == FlowQueued || to == FlowNeedsOwner
	case FlowTestersCandidate:
		return to == FlowNeedsOwner
	case FlowTestersAccepted:
		return to == FlowMasterReview || to == FlowNeedsOwner
	case FlowTestersRejected:
		return to == FlowQueued || to == FlowNeedsOwner
	default:
		return false
	}
}

func requireHumanRole(actor Actor, role Role) error {
	if actor.automated || actor.role != role {
		return ErrPermissionDenied
	}
	return nil
}

func knownFlowState(state FlowState) bool {
	switch state {
	case FlowReported, FlowNeedsInfo, FlowQueued, FlowCodexWorking,
		FlowOwnerReview, FlowNightlyCandidate, FlowNightlyAccepted, FlowNightlyRejected,
		FlowTestersCandidate, FlowTestersAccepted, FlowTestersRejected, FlowMasterReview,
		FlowReleased, FlowNeedsOwner, FlowStopped:
		return true
	default:
		return false
	}
}

func allowedFlowTransition(from, to FlowState) bool {
	if to == FlowStopped && from != FlowReleased && from != FlowStopped {
		return true
	}
	switch from {
	case FlowReported:
		return to == FlowNeedsInfo || to == FlowQueued || to == FlowNeedsOwner
	case FlowNeedsInfo:
		return to == FlowReported
	case FlowQueued:
		return to == FlowCodexWorking || to == FlowNeedsOwner
	case FlowCodexWorking:
		return to == FlowOwnerReview || to == FlowNeedsOwner
	case FlowOwnerReview:
		return to == FlowNightlyCandidate || to == FlowNeedsOwner
	case FlowNightlyCandidate:
		return to == FlowNightlyAccepted || to == FlowNightlyRejected || to == FlowNeedsOwner
	case FlowNightlyAccepted:
		return to == FlowTestersCandidate || to == FlowNeedsOwner
	case FlowNightlyRejected:
		return to == FlowQueued || to == FlowNeedsOwner
	case FlowTestersCandidate:
		return to == FlowTestersAccepted || to == FlowTestersRejected || to == FlowNeedsOwner
	case FlowTestersAccepted:
		return to == FlowMasterReview || to == FlowNeedsOwner
	case FlowTestersRejected:
		return to == FlowQueued || to == FlowNeedsOwner
	case FlowMasterReview:
		return to == FlowReleased
	case FlowNeedsOwner:
		return to == FlowQueued
	default:
		return false
	}
}

func (state FlowState) Validate() error {
	if !knownFlowState(state) {
		return fmt.Errorf("flow state: %w", ErrUnknownState)
	}
	return nil
}
