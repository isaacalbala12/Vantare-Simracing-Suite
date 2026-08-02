package commands

import (
	"context"
	"errors"
	"sync"
)

const DialogueContractVersionV1 = "engineer.dialogue.v1"

type TurnOutcome string

const (
	OutcomeQueryAnswered  TurnOutcome = "query_answered"
	OutcomeUnavailable    TurnOutcome = "unavailable"
	OutcomeActionProposed TurnOutcome = "action_proposed"
	OutcomeActionApplied  TurnOutcome = "action_applied"
	OutcomeActionRejected TurnOutcome = "action_rejected"
	OutcomeTimedOut       TurnOutcome = "timed_out"
	OutcomeCancelled      TurnOutcome = "cancelled"
	OutcomeUnknown        TurnOutcome = "unknown"
	OutcomeAmbiguous      TurnOutcome = "ambiguous"
	OutcomeInvalid        TurnOutcome = "invalid"
	OutcomeRetry          TurnOutcome = "retry"
	OutcomeFallback       TurnOutcome = "fallback"
)

type TurnReason string

const (
	ReasonUnknownUtterance  TurnReason = "unknown_utterance"
	ReasonAmbiguousInput    TurnReason = "ambiguous_input"
	ReasonInvalidInput      TurnReason = "invalid_input"
	ReasonEvidenceMissing   TurnReason = "evidence_missing"
	ReasonEvidenceStale     TurnReason = "evidence_stale"
	ReasonInvalidPortResult TurnReason = "invalid_port_result"
	ReasonPortUnavailable   TurnReason = "port_unavailable"
	ReasonTooManyFailures   TurnReason = "too_many_failures"
	ReasonActionUnavailable TurnReason = "action_unavailable"
	ReasonUserRejected      TurnReason = "user_rejected"
	ReasonDialogueTimeout   TurnReason = "dialogue_timeout"
	ReasonLifecycleChanged  TurnReason = "lifecycle_changed"
	ReasonLocaleChanged     TurnReason = "locale_changed"
	ReasonClockRollback     TurnReason = "clock_rollback"
	ReasonContextCancelled  TurnReason = "context_cancelled"
)

type FallbackMode string

const FallbackPTTOrUI FallbackMode = "ptt_or_ui"

type DialogueLifecycle struct {
	SessionID string `json:"session_id"`
	DriverID  string `json:"driver_id"`
	SourceID  string `json:"source_id"`
	Epoch     uint64 `json:"epoch"`
}

type TurnInput struct {
	AtMS      int64
	Locale    Locale
	Text      string
	Lifecycle DialogueLifecycle
}

type Turn struct {
	SchemaVersion        string            `json:"schema_version"`
	AtMS                 int64             `json:"at_ms"`
	Outcome              TurnOutcome       `json:"outcome"`
	Reason               TurnReason        `json:"reason,omitempty"`
	IntentID             string            `json:"intent_id,omitempty"`
	ResponseKey          string            `json:"response_key,omitempty"`
	Values               map[string]string `json:"values,omitempty"`
	RequiresConfirmation bool              `json:"requires_confirmation,omitempty"`
	ProposalID           string            `json:"proposal_id,omitempty"`
	Fallback             FallbackMode      `json:"fallback,omitempty"`
}

type QueryState string

const (
	QueryFresh   QueryState = "fresh"
	QueryMissing QueryState = "missing"
	QueryStale   QueryState = "stale"
)

type CommandEvidence struct {
	Lifecycle    DialogueLifecycle
	Sequence     uint64
	FreshUntilMS int64
}

type QueryRequest struct {
	IntentID      string
	Slots         map[string]string
	Preconditions []string
	Lifecycle     DialogueLifecycle
	AtMS          int64
}

type QueryResult struct {
	State       QueryState
	ResponseKey string
	Values      map[string]string
	Evidence    CommandEvidence
}

type ActionRequest struct {
	IntentID      string
	Slots         map[string]string
	Preconditions []string
	Lifecycle     DialogueLifecycle
	AtMS          int64
}

type ActionProposal struct {
	ID       string
	IntentID string
	Evidence CommandEvidence
}

type ConfirmedAction struct {
	ProposalID    string
	IntentID      string
	Slots         map[string]string
	Preconditions []string
	Evidence      CommandEvidence
	Lifecycle     DialogueLifecycle
	ConfirmedAtMS int64
}

type ActionState string

const (
	ActionApplied     ActionState = "applied"
	ActionRejected    ActionState = "rejected"
	ActionUnavailable ActionState = "unavailable"
	ActionStale       ActionState = "stale"
)

type ActionResult struct {
	State  ActionState
	Values map[string]string
}

type QueryPort interface {
	ResolveQuery(context.Context, QueryRequest) (QueryResult, error)
}

type ActionPort interface {
	ProposeAction(context.Context, ActionRequest) (ActionProposal, error)
	ApplyAction(context.Context, ConfirmedAction) (ActionResult, error)
}

type Router struct {
	mu           sync.Mutex
	harness      *TextHarness
	intents      map[string]IntentDefinition
	queryPort    QueryPort
	actionPort   ActionPort
	timeoutMS    int64
	lifecycle    DialogueLifecycle
	lifecycleSet bool
	lastAtMS     int64
	timeSet      bool
	failures     int
	pending      *pendingAction
}

type pendingAction struct {
	proposal    ActionProposal
	intent      IntentDefinition
	locale      Locale
	slots       map[string]string
	expiresAtMS int64
}

func NewRouter(catalog Catalog, queryPort QueryPort, actionPort ActionPort, timeoutMS int64) (*Router, error) {
	if queryPort == nil || actionPort == nil || timeoutMS <= 0 || timeoutMS > 60_000 {
		return nil, ErrInvalidInput
	}
	harness, err := NewTextHarness(catalog)
	if err != nil {
		return nil, err
	}
	intents := make(map[string]IntentDefinition, len(harness.catalog.Intents))
	for _, intent := range harness.catalog.Intents {
		intents[intent.ID] = intent
	}
	return &Router{harness: harness, intents: intents, queryPort: queryPort, actionPort: actionPort, timeoutMS: timeoutMS}, nil
}

func (router *Router) Handle(ctx context.Context, input TurnInput) Turn {
	if router == nil {
		return newTurn(input.AtMS, OutcomeInvalid, ReasonInvalidInput)
	}
	router.mu.Lock()
	defer router.mu.Unlock()

	if ctx == nil || input.AtMS < 0 || !validDialogueLifecycle(input.Lifecycle) {
		return router.failureTurn(input.AtMS, OutcomeInvalid, ReasonInvalidInput)
	}
	if ctx.Err() != nil {
		router.pending = nil
		router.failures = 0
		return newTurn(input.AtMS, OutcomeCancelled, ReasonContextCancelled)
	}
	if router.lifecycleSet && router.lifecycle != input.Lifecycle {
		if router.pending != nil {
			router.pending = nil
			router.failures = 0
			router.lifecycle = input.Lifecycle
			router.lastAtMS = input.AtMS
			router.timeSet = true
			return newTurn(input.AtMS, OutcomeCancelled, ReasonLifecycleChanged)
		}
		router.failures = 0
		router.timeSet = false
	}
	if router.timeSet && input.AtMS < router.lastAtMS {
		router.failures = 0
		if router.pending != nil {
			router.pending = nil
			return newTurn(input.AtMS, OutcomeCancelled, ReasonClockRollback)
		}
		return newTurn(input.AtMS, OutcomeInvalid, ReasonInvalidInput)
	}
	router.lifecycle = input.Lifecycle
	router.lifecycleSet = true
	router.lastAtMS = input.AtMS
	router.timeSet = true
	if router.pending != nil {
		return router.handlePending(ctx, input)
	}

	match, err := router.harness.Match(input.Locale, input.Text)
	if err != nil {
		switch {
		case errors.Is(err, ErrUnknownUtterance):
			return router.failureTurn(input.AtMS, OutcomeUnknown, ReasonUnknownUtterance)
		case errors.Is(err, ErrAmbiguousInput):
			return router.failureTurn(input.AtMS, OutcomeAmbiguous, ReasonAmbiguousInput)
		default:
			return router.failureTurn(input.AtMS, OutcomeInvalid, ReasonInvalidInput)
		}
	}
	router.failures = 0
	intent, exists := router.intents[match.IntentID]
	if !exists || intent.Kind != match.Kind {
		return newTurn(input.AtMS, OutcomeInvalid, ReasonInvalidInput)
	}
	if intent.Kind == KindQuery {
		return router.resolveQuery(ctx, input, intent, match)
	}
	return router.proposeAction(ctx, input, intent, match)
}

func (router *Router) handlePending(ctx context.Context, input TurnInput) Turn {
	pending := router.pending
	if input.Locale != pending.locale {
		router.pending = nil
		router.failures = 0
		return newTurn(input.AtMS, OutcomeCancelled, ReasonLocaleChanged)
	}
	if input.AtMS >= pending.expiresAtMS || !pending.proposal.Evidence.validAt(input.Lifecycle, input.AtMS) {
		router.pending = nil
		router.failures = 0
		return newTurn(input.AtMS, OutcomeTimedOut, ReasonDialogueTimeout)
	}
	dialogue, err := router.harness.MatchDialogue(input.Locale, input.Text)
	if err != nil {
		router.failures++
		if router.failures >= 2 {
			router.pending = nil
			router.failures = 0
			turn := newTurn(input.AtMS, OutcomeFallback, ReasonTooManyFailures)
			turn.Fallback = FallbackPTTOrUI
			return turn
		}
		turn := newTurn(input.AtMS, OutcomeRetry, ReasonUnknownUtterance)
		if errors.Is(err, ErrAmbiguousInput) {
			turn.Reason = ReasonAmbiguousInput
		} else if !errors.Is(err, ErrUnknownUtterance) {
			turn.Reason = ReasonInvalidInput
		}
		return turn
	}
	router.failures = 0
	if dialogue == DialogueCancel {
		router.pending = nil
		turn := newTurn(input.AtMS, OutcomeActionRejected, ReasonUserRejected)
		turn.IntentID = pending.intent.ID
		turn.ProposalID = pending.proposal.ID
		return turn
	}
	return router.applyAction(ctx, input, pending)
}

func (router *Router) proposeAction(ctx context.Context, input TurnInput, intent IntentDefinition, match Match) Turn {
	proposal, err := router.actionPort.ProposeAction(ctx, ActionRequest{
		IntentID: intent.ID, Slots: cloneStringMap(match.Slots),
		Preconditions: append([]string(nil), intent.Preconditions...),
		Lifecycle:     input.Lifecycle, AtMS: input.AtMS,
	})
	if err != nil {
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonPortUnavailable)
	}
	if ctx.Err() != nil {
		return newTurn(input.AtMS, OutcomeCancelled, ReasonContextCancelled)
	}
	if !proposal.Evidence.validAt(input.Lifecycle, input.AtMS) {
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonEvidenceStale)
	}
	if !validIdentifier(proposal.ID) || proposal.IntentID != intent.ID {
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonInvalidPortResult)
	}
	const maxInt64 = int64(1<<63 - 1)
	expiresAtMS := maxInt64
	if input.AtMS <= maxInt64-router.timeoutMS {
		expiresAtMS = input.AtMS + router.timeoutMS
	}
	if proposal.Evidence.FreshUntilMS < expiresAtMS {
		expiresAtMS = proposal.Evidence.FreshUntilMS
	}
	router.pending = &pendingAction{
		proposal: proposal, intent: intent, locale: input.Locale,
		slots: cloneStringMap(match.Slots), expiresAtMS: expiresAtMS,
	}
	turn := newTurn(input.AtMS, OutcomeActionProposed, "")
	turn.IntentID = intent.ID
	turn.ResponseKey = intent.ResponseKey + ".readback"
	turn.Values = cloneStringMap(match.Slots)
	turn.RequiresConfirmation = true
	turn.ProposalID = proposal.ID
	return turn
}

func (router *Router) applyAction(ctx context.Context, input TurnInput, pending *pendingAction) Turn {
	router.pending = nil
	result, err := router.actionPort.ApplyAction(ctx, ConfirmedAction{
		ProposalID: pending.proposal.ID, IntentID: pending.intent.ID,
		Slots: cloneStringMap(pending.slots), Preconditions: append([]string(nil), pending.intent.Preconditions...),
		Evidence: pending.proposal.Evidence, Lifecycle: input.Lifecycle, ConfirmedAtMS: input.AtMS,
	})
	if err != nil {
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonPortUnavailable)
	}
	turn := newTurn(input.AtMS, OutcomeUnavailable, ReasonInvalidPortResult)
	turn.IntentID = pending.intent.ID
	turn.ProposalID = pending.proposal.ID
	switch result.State {
	case ActionApplied:
		if !validResponseValues(result.Values) {
			return turn
		}
		turn.Outcome = OutcomeActionApplied
		turn.Reason = ""
		turn.ResponseKey = pending.intent.ResponseKey
		turn.Values = cloneStringMap(result.Values)
	case ActionRejected:
		turn.Outcome = OutcomeActionRejected
		turn.Reason = ReasonUserRejected
	case ActionUnavailable:
		turn.Reason = ReasonPortUnavailable
	case ActionStale:
		turn.Reason = ReasonEvidenceStale
	default:
		return turn
	}
	return turn
}

func (router *Router) resolveQuery(ctx context.Context, input TurnInput, intent IntentDefinition, match Match) Turn {
	result, err := router.queryPort.ResolveQuery(ctx, QueryRequest{
		IntentID: intent.ID, Slots: cloneStringMap(match.Slots),
		Preconditions: append([]string(nil), intent.Preconditions...),
		Lifecycle:     input.Lifecycle, AtMS: input.AtMS,
	})
	if err != nil {
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonPortUnavailable)
	}
	if ctx.Err() != nil {
		return newTurn(input.AtMS, OutcomeCancelled, ReasonContextCancelled)
	}
	switch result.State {
	case QueryMissing:
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonEvidenceMissing)
	case QueryStale:
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonEvidenceStale)
	case QueryFresh:
		if !result.Evidence.validAt(input.Lifecycle, input.AtMS) {
			return newTurn(input.AtMS, OutcomeUnavailable, ReasonEvidenceStale)
		}
		if result.ResponseKey != intent.ResponseKey || !validResponseValues(result.Values) {
			return newTurn(input.AtMS, OutcomeUnavailable, ReasonInvalidPortResult)
		}
		turn := newTurn(input.AtMS, OutcomeQueryAnswered, "")
		turn.IntentID = intent.ID
		turn.ResponseKey = intent.ResponseKey
		turn.Values = cloneStringMap(result.Values)
		return turn
	default:
		return newTurn(input.AtMS, OutcomeUnavailable, ReasonInvalidPortResult)
	}
}

func (router *Router) failureTurn(atMS int64, outcome TurnOutcome, reason TurnReason) Turn {
	router.failures++
	if router.failures < 2 {
		return newTurn(atMS, outcome, reason)
	}
	router.failures = 0
	router.pending = nil
	turn := newTurn(atMS, OutcomeFallback, ReasonTooManyFailures)
	turn.Fallback = FallbackPTTOrUI
	return turn
}

func (evidence CommandEvidence) validAt(lifecycle DialogueLifecycle, atMS int64) bool {
	return evidence.Lifecycle == lifecycle && evidence.Sequence > 0 && evidence.FreshUntilMS > atMS
}

func validDialogueLifecycle(lifecycle DialogueLifecycle) bool {
	return lifecycle.Epoch > 0 && validIdentifier(lifecycle.SessionID) &&
		validIdentifier(lifecycle.DriverID) && validIdentifier(lifecycle.SourceID)
}

func validResponseValues(values map[string]string) bool {
	if len(values) > 16 {
		return false
	}
	for key, value := range values {
		if !validIdentifier(key) || !validText(value, 256) {
			return false
		}
	}
	return true
}

func cloneStringMap(source map[string]string) map[string]string {
	if len(source) == 0 {
		return nil
	}
	clone := make(map[string]string, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func newTurn(atMS int64, outcome TurnOutcome, reason TurnReason) Turn {
	return Turn{SchemaVersion: DialogueContractVersionV1, AtMS: atMS, Outcome: outcome, Reason: reason}
}
