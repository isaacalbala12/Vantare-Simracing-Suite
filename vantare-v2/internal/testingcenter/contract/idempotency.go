package contract

type IdempotencyDecision string

const (
	IdempotencyApply    IdempotencyDecision = "apply"
	IdempotencyReplay   IdempotencyDecision = "replay"
	IdempotencyConflict IdempotencyDecision = "conflict"
)

type IdempotencyOperation struct {
	Key         string
	Digest      string
	AggregateID string
	From        FlowState
	To          FlowState
	ExactSHA    string
}

func DecideIdempotency(operation IdempotencyOperation, existing *IdempotencyOperation) (IdempotencyDecision, error) {
	if err := validateIdempotencyOperation(operation); err != nil {
		return "", err
	}
	if existing == nil {
		return IdempotencyApply, nil
	}
	if err := validateIdempotencyOperation(*existing); err != nil {
		return "", err
	}
	if operation == *existing {
		return IdempotencyReplay, nil
	}
	return IdempotencyConflict, ErrIdempotencyConflict
}

func validateIdempotencyOperation(operation IdempotencyOperation) error {
	if err := validateID("idempotencyKey", operation.Key); err != nil {
		return ErrInvalidIdempotency
	}
	if err := validateDigest("digest", operation.Digest); err != nil {
		return ErrInvalidIdempotency
	}
	if err := validateID("aggregateId", operation.AggregateID); err != nil {
		return ErrInvalidIdempotency
	}
	if !knownFlowState(operation.From) || !knownFlowState(operation.To) ||
		!allowedFlowTransition(operation.From, operation.To) {
		return ErrInvalidIdempotency
	}
	if transitionRequiresSHA(operation.From, operation.To) {
		if operation.ExactSHA == "" {
			return ErrInvalidIdempotency
		}
	}
	if operation.ExactSHA != "" {
		if err := validateSHA("exactSha", operation.ExactSHA); err != nil {
			return ErrInvalidIdempotency
		}
	}
	return nil
}
