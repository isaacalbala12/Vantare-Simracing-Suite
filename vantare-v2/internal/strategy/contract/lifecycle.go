package contract

import (
	"strings"
	"time"
)

type ActivePlan struct {
	ContractVersion  ContractVersion `json:"contractVersion"`
	ActivationID     ActivationID    `json:"activationId"`
	Revision         RevisionRef     `json:"revision"`
	PreviousRevision *RevisionRef    `json:"previousRevision,omitempty"`
	ActivatedAt      time.Time       `json:"activatedAt"`
}

func NewActivePlan(activationID ActivationID, revision RevisionRef, activatedAt time.Time) (ActivePlan, error) {
	if err := validateIdentifier("activationId", activationID); err != nil {
		return ActivePlan{}, err
	}
	if err := revision.Validate(); err != nil {
		return ActivePlan{}, err
	}
	if err := validateTimestamp("activatedAt", activatedAt); err != nil {
		return ActivePlan{}, err
	}
	return ActivePlan{
		ContractVersion: CurrentVersion,
		ActivationID:    activationID,
		Revision:        revision,
		ActivatedAt:     activatedAt,
	}, nil
}

func (active ActivePlan) Validate() error {
	if active.ContractVersion != CurrentVersion {
		return contractError(ErrorUnsupportedVersion, "contractVersion", "unsupported strategy contract version")
	}
	if err := validateIdentifier("activationId", active.ActivationID); err != nil {
		return err
	}
	if err := validateRevisionRef(active.Revision, "activePlan.revision"); err != nil {
		return err
	}
	if active.PreviousRevision != nil {
		if err := validateRevisionRef(*active.PreviousRevision, "activePlan.previousRevision"); err != nil {
			return err
		}
		if active.PreviousRevision.PlanID != active.Revision.PlanID || active.PreviousRevision.VariantID != active.Revision.VariantID {
			return contractError(ErrorRevisionConflict, "previousRevision", "previous revision belongs to another plan variant")
		}
	}
	return validateTimestamp("activatedAt", active.ActivatedAt)
}

type ExecutionStatus string

const (
	ExecutionIdle             ExecutionStatus = "idle"
	ExecutionMonitoring       ExecutionStatus = "monitoring"
	ExecutionDeviated         ExecutionStatus = "deviated"
	ExecutionAwaitingDecision ExecutionStatus = "awaiting_decision"
	ExecutionCompleted        ExecutionStatus = "completed"
	ExecutionStopped          ExecutionStatus = "stopped"
)

func (status ExecutionStatus) validate() error {
	switch status {
	case ExecutionIdle, ExecutionMonitoring, ExecutionDeviated, ExecutionAwaitingDecision, ExecutionCompleted, ExecutionStopped:
		return nil
	default:
		return contractError(ErrorInvalidState, "status", "unknown execution status")
	}
}

type StrategyExecutionState struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	ExecutionID     ExecutionID     `json:"executionId"`
	ActivePlan      ActivePlan      `json:"activePlan"`
	Epoch           uint64          `json:"epoch"`
	Sequence        uint64          `json:"sequence"`
	Status          ExecutionStatus `json:"status"`
	Capabilities    []Capability    `json:"capabilities"`
	Provenance      Provenance      `json:"provenance"`
	Confidence      Confidence      `json:"confidence"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

type ExecutionStateInput struct {
	ExecutionID  ExecutionID
	ActivePlan   ActivePlan
	Epoch        uint64
	Sequence     uint64
	Status       ExecutionStatus
	Capabilities []Capability
	Provenance   Provenance
	Confidence   Confidence
	UpdatedAt    time.Time
}

func NewStrategyExecutionState(input ExecutionStateInput) (StrategyExecutionState, error) {
	if err := validateIdentifier("executionId", input.ExecutionID); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := input.ActivePlan.Validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := validateExecutionCounter("epoch", input.Epoch); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := validateExecutionCounter("sequence", input.Sequence); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := input.Status.validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	capabilities, err := normalizeCapabilities(input.Capabilities)
	if err != nil {
		return StrategyExecutionState{}, err
	}
	if err := input.Provenance.validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := input.Confidence.validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := validateTimestamp("updatedAt", input.UpdatedAt); err != nil {
		return StrategyExecutionState{}, err
	}
	state := StrategyExecutionState{
		ContractVersion: CurrentVersion,
		ExecutionID:     input.ExecutionID,
		ActivePlan:      cloneActivePlan(input.ActivePlan),
		Epoch:           input.Epoch,
		Sequence:        input.Sequence,
		Status:          input.Status,
		Capabilities:    capabilities,
		Provenance:      cloneProvenance(input.Provenance),
		Confidence:      input.Confidence,
		UpdatedAt:       input.UpdatedAt,
	}
	if err := state.Validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	return state, nil
}

func (state StrategyExecutionState) Advance(sequence uint64, status ExecutionStatus, updatedAt time.Time) (StrategyExecutionState, error) {
	if err := state.Validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	if state.Status == ExecutionCompleted || state.Status == ExecutionStopped {
		return StrategyExecutionState{}, contractError(ErrorInvalidState, "status", "terminal execution state cannot advance")
	}
	if sequence <= state.Sequence {
		return StrategyExecutionState{}, contractError(ErrorNonMonotonicSequence, "sequence", "must increase within the current epoch")
	}
	if err := validateExecutionCounter("sequence", sequence); err != nil {
		return StrategyExecutionState{}, err
	}
	if !updatedAt.After(state.UpdatedAt) {
		return StrategyExecutionState{}, contractError(ErrorInvalidState, "updatedAt", "must advance with the execution sequence")
	}
	if err := status.validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	next := cloneExecutionState(state)
	next.Sequence = sequence
	next.Status = status
	next.UpdatedAt = updatedAt
	if err := next.Validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	return next, nil
}

func (state StrategyExecutionState) Validate() error {
	if state.ContractVersion != CurrentVersion {
		return contractError(ErrorUnsupportedVersion, "contractVersion", "unsupported strategy contract version")
	}
	if err := validateIdentifier("executionId", state.ExecutionID); err != nil {
		return err
	}
	if err := state.ActivePlan.Validate(); err != nil {
		return err
	}
	if err := validateExecutionCounter("epoch", state.Epoch); err != nil {
		return err
	}
	if err := validateExecutionCounter("sequence", state.Sequence); err != nil {
		return err
	}
	if err := state.Status.validate(); err != nil {
		return err
	}
	normalized, err := normalizeCapabilities(state.Capabilities)
	if err != nil {
		return err
	}
	if !sameCapabilities(state.Capabilities, normalized) {
		return contractError(ErrorInvalidDocument, "capabilities", "capabilities must be sorted and unique")
	}
	if err := state.Provenance.validate(); err != nil {
		return err
	}
	if err := state.Confidence.validate(); err != nil {
		return err
	}
	return validateTimestamp("updatedAt", state.UpdatedAt)
}

// DecodeStrategyExecutionState is the strict JSON boundary for live strategy
// state. It rejects shape drift before conversion and returns an owned snapshot.
func DecodeStrategyExecutionState(document []byte) (StrategyExecutionState, error) {
	parsed, err := parseCanonicalJSONV1(document)
	if err != nil {
		return StrategyExecutionState{}, err
	}
	if err := validateDeclaredContractVersion(parsed); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := validateExecutionStateJSONShape(parsed); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := requireParsedTimestamp(parsed, "updatedAt", false); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := requireParsedNestedTimestamp(parsed, "activePlan", "activatedAt"); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := requireParsedProvenanceTimestamp(parsed); err != nil {
		return StrategyExecutionState{}, err
	}
	migrated, _, err := MigrateContractJSON(document)
	if err != nil {
		return StrategyExecutionState{}, err
	}
	var state StrategyExecutionState
	if _, err := decodeStrictJSON(migrated, &state); err != nil {
		return StrategyExecutionState{}, err
	}
	if err := state.Validate(); err != nil {
		return StrategyExecutionState{}, err
	}
	return cloneExecutionState(state), nil
}

func validateExecutionStateJSONShape(value interface{}) error {
	manifest := ManifestV1()
	document, err := requireJSONObjectFields(value, "", manifest.DocumentRequiredFields.ExecutionState, nil)
	if err != nil {
		return err
	}
	if err := validateParsedVersion(document["contractVersion"], "contractVersion"); err != nil {
		return err
	}
	if err := validateParsedIdentifier(document["executionId"], "executionId"); err != nil {
		return err
	}
	active, err := requireJSONObjectFields(document["activePlan"], "activePlan", manifest.DocumentRequiredFields.ActivePlan, []string{"previousRevision"})
	if err != nil {
		return err
	}
	if err := validateParsedVersion(active["contractVersion"], "activePlan.contractVersion"); err != nil {
		return err
	}
	if err := validateParsedIdentifier(active["activationId"], "activePlan.activationId"); err != nil {
		return err
	}
	revision, err := requireJSONObjectFields(active["revision"], "activePlan.revision", []string{"planId", "variantId", "revisionId", "contentHash"}, nil)
	if err != nil {
		return err
	}
	if err := validateParsedRevisionRef(revision, "activePlan.revision"); err != nil {
		return err
	}
	if previous, ok := active["previousRevision"]; ok {
		previousRevision, err := requireJSONObjectFields(previous, "activePlan.previousRevision", []string{"planId", "variantId", "revisionId", "contentHash"}, nil)
		if err != nil {
			return err
		}
		if err := validateParsedRevisionRef(previousRevision, "activePlan.previousRevision"); err != nil {
			return err
		}
	}
	provenance, err := requireJSONObjectFields(document["provenance"], "provenance", []string{"kind"}, []string{"sourceId", "observedAt"})
	if err != nil {
		return err
	}
	if err := validateParsedProvenance(provenance); err != nil {
		return err
	}
	confidence, err := requireJSONObjectFields(document["confidence"], "confidence", []string{"level"}, []string{"basis"})
	if err != nil {
		return err
	}
	if err := validateParsedConfidence(confidence); err != nil {
		return err
	}
	if err := validateParsedExecutionCounter(document["epoch"], "epoch"); err != nil {
		return err
	}
	if err := validateParsedExecutionCounter(document["sequence"], "sequence"); err != nil {
		return err
	}
	if err := validateParsedExecutionStatus(document["status"]); err != nil {
		return err
	}
	return validateParsedCapabilities(document["capabilities"])
}

func validateParsedVersion(value interface{}, field string) error {
	version, ok := value.(string)
	if !ok || ContractVersion(version) != CurrentVersion {
		return contractError(ErrorUnsupportedVersion, field, "unsupported strategy contract version")
	}
	return nil
}

func validateParsedIdentifier(value interface{}, field string) error {
	identifier, ok := value.(string)
	if !ok {
		return contractError(ErrorInvalidIdentifier, field, "must be 1-128 safe identifier characters")
	}
	return validateIdentifier(field, identifier)
}

func validateParsedRevisionRef(revision map[string]interface{}, prefix string) error {
	for _, field := range []string{"planId", "variantId", "revisionId"} {
		if err := validateParsedIdentifier(revision[field], fieldPath(prefix, field)); err != nil {
			return err
		}
	}
	hash, ok := revision["contentHash"].(string)
	if !ok {
		return contractError(ErrorInvalidDocument, fieldPath(prefix, "contentHash"), "must be an exact lowercase SHA-256 hexadecimal digest")
	}
	return validateContentHash(fieldPath(prefix, "contentHash"), hash)
}

func validateParsedExecutionStatus(value interface{}) error {
	status, ok := value.(string)
	if !ok {
		return contractError(ErrorInvalidState, "status", "unknown execution status")
	}
	return ExecutionStatus(status).validate()
}

func validateParsedCapabilities(value interface{}) error {
	values, ok := value.([]interface{})
	if !ok {
		return contractError(ErrorInvalidDocument, "capabilities", "must be an array")
	}
	capabilities := make([]Capability, 0, len(values))
	for _, value := range values {
		text, ok := value.(string)
		if !ok {
			return contractError(ErrorInvalidDocument, "capabilities", "contains an unknown contract value")
		}
		capabilities = append(capabilities, Capability(text))
	}
	normalized, err := normalizeCapabilities(capabilities)
	if err != nil {
		return err
	}
	if !sameCapabilities(capabilities, normalized) {
		return contractError(ErrorInvalidDocument, "capabilities", "capabilities must be sorted and unique")
	}
	return nil
}

func validateParsedProvenance(provenance map[string]interface{}) error {
	kindText, ok := provenance["kind"].(string)
	if !ok {
		return contractError(ErrorInvalidProvenance, "provenance.kind", "unknown provenance kind")
	}
	kind := ProvenanceKind(kindText)
	source, hasSource := provenance["sourceId"]
	_, hasObservedAt := provenance["observedAt"]
	if kind == ProvenanceUnknown {
		if hasSource || hasObservedAt {
			return contractError(ErrorInvalidProvenance, "provenance", "unknown provenance cannot claim a source")
		}
		return nil
	}
	switch kind {
	case ProvenanceObserved, ProvenanceCorrected, ProvenanceManual, ProvenanceDerived, ProvenanceEstimated, ProvenanceRange:
		sourceID, ok := source.(string)
		if !hasSource || !ok || strings.TrimSpace(sourceID) == "" {
			return contractError(ErrorInvalidProvenance, "provenance.sourceId", "source is required")
		}
		return nil
	default:
		return contractError(ErrorInvalidProvenance, "provenance.kind", "unknown provenance kind")
	}
}

func validateParsedConfidence(confidence map[string]interface{}) error {
	levelText, ok := confidence["level"].(string)
	if !ok {
		return contractError(ErrorInvalidConfidence, "confidence.level", "unknown confidence level")
	}
	level := ConfidenceLevel(levelText)
	basis, hasBasis := confidence["basis"]
	if level == ConfidenceUnknown {
		if hasBasis && basis != "" {
			return contractError(ErrorInvalidConfidence, "confidence.basis", "unknown confidence cannot claim a basis")
		}
		return nil
	}
	switch level {
	case ConfidenceLow, ConfidenceMedium, ConfidenceHigh:
		basisText, ok := basis.(string)
		if !hasBasis || !ok || strings.TrimSpace(basisText) == "" {
			return contractError(ErrorInvalidConfidence, "confidence.basis", "basis is required")
		}
		return nil
	default:
		return contractError(ErrorInvalidConfidence, "confidence.level", "unknown confidence level")
	}
}

func validateParsedExecutionCounter(value interface{}, field string) error {
	number, ok := value.(float64)
	if !ok || number < 1 || number > maxSafeJSONInteger || number != float64(uint64(number)) {
		return contractError(ErrorInvalidState, field, "must be between one and the shared safe integer maximum")
	}
	return nil
}

type ReplanStatus string

const (
	ReplanProposed   ReplanStatus = "proposed"
	ReplanAccepted   ReplanStatus = "accepted"
	ReplanRejected   ReplanStatus = "rejected"
	ReplanExpired    ReplanStatus = "expired"
	ReplanSuperseded ReplanStatus = "superseded"
)

type ReplanProposal struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	ProposalID      ProposalID      `json:"proposalId"`
	Base            RevisionRef     `json:"base"`
	Candidate       RevisionRef     `json:"candidate"`
	Status          ReplanStatus    `json:"status"`
	ReasonCode      string          `json:"reasonCode"`
	Provenance      Provenance      `json:"provenance"`
	Confidence      Confidence      `json:"confidence"`
	CreatedAt       time.Time       `json:"createdAt"`
	ExpiresAt       *time.Time      `json:"expiresAt,omitempty"`
	DecidedAt       *time.Time      `json:"decidedAt,omitempty"`
}

type ReplanProposalInput struct {
	ProposalID ProposalID
	Base       RevisionRef
	Candidate  RevisionRef
	ReasonCode string
	Provenance Provenance
	Confidence Confidence
	CreatedAt  time.Time
	ExpiresAt  *time.Time
}

func NewReplanProposal(input ReplanProposalInput) (ReplanProposal, error) {
	proposal := ReplanProposal{
		ContractVersion: CurrentVersion,
		ProposalID:      input.ProposalID,
		Base:            input.Base,
		Candidate:       input.Candidate,
		Status:          ReplanProposed,
		ReasonCode:      input.ReasonCode,
		Provenance:      cloneProvenance(input.Provenance),
		Confidence:      input.Confidence,
		CreatedAt:       input.CreatedAt,
		ExpiresAt:       cloneTime(input.ExpiresAt),
	}
	if err := proposal.Validate(); err != nil {
		return ReplanProposal{}, err
	}
	return proposal, nil
}

func AcceptReplanProposal(proposal ReplanProposal, decidedAt time.Time) (ReplanProposal, error) {
	if err := proposal.Validate(); err != nil {
		return ReplanProposal{}, err
	}
	if proposal.Status != ReplanProposed {
		return ReplanProposal{}, contractError(ErrorInvalidState, "status", "only a proposed replan can be accepted")
	}
	if err := validateTimestamp("decidedAt", decidedAt); err != nil {
		return ReplanProposal{}, err
	}
	if decidedAt.Before(proposal.CreatedAt) {
		return ReplanProposal{}, contractError(ErrorInvalidState, "decidedAt", "decision cannot predate proposal")
	}
	if proposal.ExpiresAt != nil && !decidedAt.Before(*proposal.ExpiresAt) {
		return ReplanProposal{}, contractError(ErrorProposalExpired, "expiresAt", "proposal expired before acceptance")
	}
	accepted := cloneReplanProposal(proposal)
	accepted.Status = ReplanAccepted
	accepted.DecidedAt = &decidedAt
	if err := accepted.Validate(); err != nil {
		return ReplanProposal{}, err
	}
	return accepted, nil
}

func ActivateAcceptedProposal(current ActivePlan, proposal ReplanProposal, activationID ActivationID, activatedAt time.Time) (ActivePlan, error) {
	if err := current.Validate(); err != nil {
		return ActivePlan{}, err
	}
	if err := proposal.Validate(); err != nil {
		return ActivePlan{}, err
	}
	if proposal.Status != ReplanAccepted || proposal.DecidedAt == nil {
		return ActivePlan{}, contractError(ErrorProposalNotAccepted, "status", "replan requires explicit acceptance")
	}
	if current.Revision == proposal.Candidate {
		if current.PreviousRevision == nil || *current.PreviousRevision != proposal.Base {
			return ActivePlan{}, contractError(ErrorRevisionConflict, "previousRevision", "active candidate does not match the accepted proposal history")
		}
		return cloneActivePlan(current), nil
	}
	if current.Revision != proposal.Base {
		return ActivePlan{}, contractError(ErrorRevisionConflict, "base", "active plan changed after the proposal was created")
	}
	if activatedAt.Before(*proposal.DecidedAt) {
		return ActivePlan{}, contractError(ErrorInvalidState, "activatedAt", "activation cannot predate acceptance")
	}
	active, err := NewActivePlan(activationID, proposal.Candidate, activatedAt)
	if err != nil {
		return ActivePlan{}, err
	}
	previous := current.Revision
	active.PreviousRevision = &previous
	if err := active.Validate(); err != nil {
		return ActivePlan{}, err
	}
	return active, nil
}

func validateExecutionCounter(field string, value uint64) error {
	if value == 0 || value > maxSafeJSONInteger {
		return contractError(ErrorInvalidState, field, "must be between one and the shared safe integer maximum")
	}
	return nil
}

func (proposal ReplanProposal) Validate() error {
	if proposal.ContractVersion != CurrentVersion {
		return contractError(ErrorUnsupportedVersion, "contractVersion", "unsupported strategy contract version")
	}
	if err := validateIdentifier("proposalId", proposal.ProposalID); err != nil {
		return err
	}
	if err := validateRevisionRef(proposal.Base, "base"); err != nil {
		return err
	}
	if err := validateRevisionRef(proposal.Candidate, "candidate"); err != nil {
		return err
	}
	if proposal.Base.PlanID != proposal.Candidate.PlanID || proposal.Base.VariantID != proposal.Candidate.VariantID {
		return contractError(ErrorRevisionConflict, "candidate", "candidate belongs to another plan variant")
	}
	if proposal.Base == proposal.Candidate {
		return contractError(ErrorRevisionConflict, "candidate", "candidate must differ from the base revision")
	}
	if err := validateIdentifier("reasonCode", proposal.ReasonCode); err != nil {
		return err
	}
	if err := proposal.Provenance.validate(); err != nil {
		return err
	}
	if err := proposal.Confidence.validate(); err != nil {
		return err
	}
	if err := validateTimestamp("createdAt", proposal.CreatedAt); err != nil {
		return err
	}
	if proposal.ExpiresAt != nil {
		if err := validateTimestamp("expiresAt", *proposal.ExpiresAt); err != nil {
			return err
		}
		if !proposal.ExpiresAt.After(proposal.CreatedAt) {
			return contractError(ErrorInvalidState, "expiresAt", "must be after proposal creation")
		}
	}
	if proposal.DecidedAt != nil {
		if err := validateTimestamp("decidedAt", *proposal.DecidedAt); err != nil {
			return err
		}
		if proposal.DecidedAt.Before(proposal.CreatedAt) {
			return contractError(ErrorInvalidState, "decidedAt", "decision cannot predate proposal")
		}
	}
	switch proposal.Status {
	case ReplanProposed:
		if proposal.DecidedAt != nil {
			return contractError(ErrorInvalidState, "decidedAt", "proposed replan cannot already have a decision")
		}
	case ReplanAccepted:
		if proposal.DecidedAt == nil {
			return contractError(ErrorInvalidState, "decidedAt", "accepted replan requires a decision timestamp")
		}
		if proposal.ExpiresAt != nil && !proposal.DecidedAt.Before(*proposal.ExpiresAt) {
			return contractError(ErrorProposalExpired, "expiresAt", "proposal expired before acceptance")
		}
	case ReplanRejected, ReplanExpired, ReplanSuperseded:
		if proposal.DecidedAt == nil {
			return contractError(ErrorInvalidState, "decidedAt", "resolved replan requires a decision timestamp")
		}
	default:
		return contractError(ErrorInvalidState, "status", "unknown replan status")
	}
	return nil
}

func DecodeReplanProposal(document []byte) (ReplanProposal, error) {
	parsedDocument, err := parseCanonicalJSONV1(document)
	if err != nil {
		return ReplanProposal{}, err
	}
	if err := validateDeclaredContractVersion(parsedDocument); err != nil {
		return ReplanProposal{}, err
	}
	if err := validateReplanProposalJSONShape(parsedDocument); err != nil {
		return ReplanProposal{}, err
	}
	migrated, _, err := MigrateContractJSON(document)
	if err != nil {
		return ReplanProposal{}, err
	}
	var proposal ReplanProposal
	_, err = decodeStrictJSON(migrated, &proposal)
	if err != nil {
		return ReplanProposal{}, err
	}
	if err := proposal.Validate(); err != nil {
		return ReplanProposal{}, err
	}
	proposal.Provenance = cloneProvenance(proposal.Provenance)
	proposal.ExpiresAt = cloneTime(proposal.ExpiresAt)
	proposal.DecidedAt = cloneTime(proposal.DecidedAt)
	return proposal, nil
}

func cloneActivePlan(value ActivePlan) ActivePlan {
	clone := value
	clone.PreviousRevision = cloneRevisionRef(value.PreviousRevision)
	return clone
}

func cloneExecutionState(value StrategyExecutionState) StrategyExecutionState {
	clone := value
	clone.ActivePlan = cloneActivePlan(value.ActivePlan)
	clone.Capabilities = append([]Capability(nil), value.Capabilities...)
	clone.Provenance = cloneProvenance(value.Provenance)
	return clone
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	clone := *value
	return &clone
}

func cloneReplanProposal(value ReplanProposal) ReplanProposal {
	clone := value
	clone.Provenance = cloneProvenance(value.Provenance)
	clone.ExpiresAt = cloneTime(value.ExpiresAt)
	clone.DecidedAt = cloneTime(value.DecidedAt)
	return clone
}
