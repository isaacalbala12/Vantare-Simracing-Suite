package contract

import (
	"encoding/json"
	"strings"
	"time"
)

// PlanDraft is the only intentionally mutable strategy document. It is local
// editing state and cannot become active without first being captured as a
// verified PlanRevision.
type PlanDraft[T any] struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	DraftID         DraftID         `json:"draftId"`
	PlanID          PlanID          `json:"planId"`
	VariantID       VariantID       `json:"variantId"`
	BaseRevision    *RevisionRef    `json:"baseRevision,omitempty"`
	Name            string          `json:"name"`
	Mode            PlanMode        `json:"mode"`
	Capabilities    []Capability    `json:"capabilities"`
	Provenance      Provenance      `json:"provenance"`
	Confidence      Confidence      `json:"confidence"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	Payload         T               `json:"payload"`
}

func (draft PlanDraft[T]) Validate() error {
	if draft.ContractVersion != CurrentVersion {
		return contractError(ErrorUnsupportedVersion, "contractVersion", "unsupported strategy contract version")
	}
	if err := validateIdentifier("draftId", draft.DraftID); err != nil {
		return err
	}
	if err := validateIdentifier("planId", draft.PlanID); err != nil {
		return err
	}
	if err := validateIdentifier("variantId", draft.VariantID); err != nil {
		return err
	}
	if strings.TrimSpace(draft.Name) == "" {
		return contractError(ErrorInvalidDocument, "name", "plan name is required")
	}
	if err := draft.Mode.validate(); err != nil {
		return err
	}
	if _, err := normalizeCapabilities(draft.Capabilities); err != nil {
		return err
	}
	if err := draft.Provenance.validate(); err != nil {
		return err
	}
	if err := draft.Confidence.validate(); err != nil {
		return err
	}
	if err := validateTimestamp("updatedAt", draft.UpdatedAt); err != nil {
		return err
	}
	if draft.BaseRevision != nil {
		if err := validateRevisionRef(*draft.BaseRevision, "baseRevision"); err != nil {
			return err
		}
		if draft.BaseRevision.PlanID != draft.PlanID || draft.BaseRevision.VariantID != draft.VariantID {
			return contractError(ErrorRevisionConflict, "baseRevision", "base revision belongs to another plan variant")
		}
	}
	payload, err := json.Marshal(draft.Payload)
	if err != nil {
		if HasErrorCode(err, ErrorInvalidUnit) {
			return err
		}
		return wrapContractError(ErrorInvalidDocument, "payload", "encode plan payload", err)
	}
	if string(payload) == "null" {
		return contractError(ErrorInvalidDocument, "payload", "plan payload is required")
	}
	return nil
}

type RevisionMetadata struct {
	RevisionID RevisionID
	CreatedAt  time.Time
}

// PlanRevisionMetadata exposes revision identity and evidence without exposing
// the immutable payload bytes owned by PlanRevision.
type PlanRevisionMetadata struct {
	ContractVersion ContractVersion
	HashAlgorithm   string
	RevisionID      RevisionID
	SourceDraftID   DraftID
	PlanID          PlanID
	VariantID       VariantID
	BaseRevision    *RevisionRef
	Name            string
	Mode            PlanMode
	Capabilities    []Capability
	Provenance      Provenance
	Confidence      Confidence
	CreatedAt       time.Time
	ContentHash     string
}

// RevisionRef is the complete identity needed to prevent applying a stale or
// substituted plan revision.
type RevisionRef struct {
	PlanID      PlanID     `json:"planId"`
	VariantID   VariantID  `json:"variantId"`
	RevisionID  RevisionID `json:"revisionId"`
	ContentHash string     `json:"contentHash"`
}

func (ref RevisionRef) Validate() error {
	return validateRevisionRef(ref, "revision")
}

func validateRevisionRef(ref RevisionRef, prefix string) error {
	if err := validateIdentifier(fieldPath(prefix, "planId"), ref.PlanID); err != nil {
		return err
	}
	if err := validateIdentifier(fieldPath(prefix, "variantId"), ref.VariantID); err != nil {
		return err
	}
	if err := validateIdentifier(fieldPath(prefix, "revisionId"), ref.RevisionID); err != nil {
		return err
	}
	return validateContentHash(fieldPath(prefix, "contentHash"), ref.ContentHash)
}

type revisionEnvelope struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	HashAlgorithm   string          `json:"hashAlgorithm"`
	RevisionID      RevisionID      `json:"revisionId"`
	SourceDraftID   DraftID         `json:"sourceDraftId"`
	PlanID          PlanID          `json:"planId"`
	VariantID       VariantID       `json:"variantId"`
	BaseRevision    *RevisionRef    `json:"baseRevision,omitempty"`
	Name            string          `json:"name"`
	Mode            PlanMode        `json:"mode"`
	Capabilities    []Capability    `json:"capabilities"`
	Provenance      Provenance      `json:"provenance"`
	Confidence      Confidence      `json:"confidence"`
	CreatedAt       time.Time       `json:"createdAt"`
	Payload         json.RawMessage `json:"payload"`
	ContentHash     string          `json:"contentHash"`
}

type revisionHashInput struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	HashAlgorithm   string          `json:"hashAlgorithm"`
	RevisionID      RevisionID      `json:"revisionId"`
	SourceDraftID   DraftID         `json:"sourceDraftId"`
	PlanID          PlanID          `json:"planId"`
	VariantID       VariantID       `json:"variantId"`
	BaseRevision    *RevisionRef    `json:"baseRevision,omitempty"`
	Name            string          `json:"name"`
	Mode            PlanMode        `json:"mode"`
	Capabilities    []Capability    `json:"capabilities"`
	Provenance      Provenance      `json:"provenance"`
	Confidence      Confidence      `json:"confidence"`
	CreatedAt       time.Time       `json:"createdAt"`
	Payload         json.RawMessage `json:"payload"`
}

// PlanRevision stores an independent JSON snapshot so callers cannot mutate a
// revision through an alias to draft maps or slices. Its hash uses the shared
// canonical binary form, not the storage JSON bytes.
type PlanRevision[T any] struct {
	envelope revisionEnvelope
}

func NewPlanRevision[T any](draft PlanDraft[T], metadata RevisionMetadata) (PlanRevision[T], error) {
	if err := draft.Validate(); err != nil {
		return PlanRevision[T]{}, err
	}
	if err := validateIdentifier("revisionId", metadata.RevisionID); err != nil {
		return PlanRevision[T]{}, err
	}
	if err := validateTimestamp("createdAt", metadata.CreatedAt); err != nil {
		return PlanRevision[T]{}, err
	}
	if metadata.CreatedAt.Before(draft.UpdatedAt) {
		return PlanRevision[T]{}, contractError(ErrorInvalidDocument, "createdAt", "revision cannot predate its draft")
	}
	payload, err := json.Marshal(draft.Payload)
	if err != nil {
		if HasErrorCode(err, ErrorInvalidUnit) {
			return PlanRevision[T]{}, err
		}
		return PlanRevision[T]{}, wrapContractError(ErrorInvalidDocument, "payload", "encode plan payload", err)
	}
	capabilities, err := normalizeCapabilities(draft.Capabilities)
	if err != nil {
		return PlanRevision[T]{}, err
	}
	envelope := revisionEnvelope{
		ContractVersion: CurrentVersion,
		HashAlgorithm:   HashAlgorithmV1,
		RevisionID:      metadata.RevisionID,
		SourceDraftID:   draft.DraftID,
		PlanID:          draft.PlanID,
		VariantID:       draft.VariantID,
		BaseRevision:    cloneRevisionRef(draft.BaseRevision),
		Name:            strings.TrimSpace(draft.Name),
		Mode:            draft.Mode,
		Capabilities:    capabilities,
		Provenance:      cloneProvenance(draft.Provenance),
		Confidence:      draft.Confidence,
		CreatedAt:       metadata.CreatedAt,
		Payload:         append(json.RawMessage(nil), payload...),
	}
	hash, err := hashRevision(envelope)
	if err != nil {
		return PlanRevision[T]{}, err
	}
	envelope.ContentHash = hash
	return PlanRevision[T]{envelope: envelope}, nil
}

func (revision PlanRevision[T]) Payload() (T, error) {
	var payload T
	if err := json.Unmarshal(revision.envelope.Payload, &payload); err != nil {
		return payload, wrapContractError(ErrorInvalidDocument, "payload", "decode plan payload", err)
	}
	return payload, nil
}

func (revision PlanRevision[T]) ContentHash() string { return revision.envelope.ContentHash }

// Metadata returns a defensive copy so consumers can inspect a revision
// without gaining a mutation path into its hash-covered state.
func (revision PlanRevision[T]) Metadata() PlanRevisionMetadata {
	return PlanRevisionMetadata{
		ContractVersion: revision.envelope.ContractVersion,
		HashAlgorithm:   revision.envelope.HashAlgorithm,
		RevisionID:      revision.envelope.RevisionID,
		SourceDraftID:   revision.envelope.SourceDraftID,
		PlanID:          revision.envelope.PlanID,
		VariantID:       revision.envelope.VariantID,
		BaseRevision:    cloneRevisionRef(revision.envelope.BaseRevision),
		Name:            revision.envelope.Name,
		Mode:            revision.envelope.Mode,
		Capabilities:    append([]Capability(nil), revision.envelope.Capabilities...),
		Provenance:      cloneProvenance(revision.envelope.Provenance),
		Confidence:      revision.envelope.Confidence,
		CreatedAt:       revision.envelope.CreatedAt,
		ContentHash:     revision.envelope.ContentHash,
	}
}

func (revision PlanRevision[T]) Ref() RevisionRef {
	return RevisionRef{
		PlanID:      revision.envelope.PlanID,
		VariantID:   revision.envelope.VariantID,
		RevisionID:  revision.envelope.RevisionID,
		ContentHash: revision.envelope.ContentHash,
	}
}

func (revision PlanRevision[T]) MarshalJSON() ([]byte, error) {
	if err := validateRevisionEnvelope(revision.envelope); err != nil {
		return nil, err
	}
	return json.Marshal(revision.envelope)
}

func DecodePlanRevision[T any](document []byte) (PlanRevision[T], error) {
	parsedDocument, err := parseCanonicalJSONV1(document)
	if err != nil {
		return PlanRevision[T]{}, err
	}
	if err := validateDeclaredContractVersion(parsedDocument); err != nil {
		return PlanRevision[T]{}, err
	}
	if err := validatePlanRevisionJSONShape(parsedDocument); err != nil {
		return PlanRevision[T]{}, err
	}
	migrated, _, err := MigrateContractJSON(document)
	if err != nil {
		return PlanRevision[T]{}, err
	}
	var envelope revisionEnvelope
	_, err = decodeStrictJSON(migrated, &envelope)
	if err != nil {
		return PlanRevision[T]{}, err
	}
	if err := validateRevisionEnvelope(envelope); err != nil {
		return PlanRevision[T]{}, err
	}
	var typedPayload T
	if err := json.Unmarshal(envelope.Payload, &typedPayload); err != nil {
		return PlanRevision[T]{}, wrapContractError(ErrorInvalidDocument, "payload", "decode typed plan payload", err)
	}
	wantHash, err := hashRevision(envelope)
	if err != nil {
		return PlanRevision[T]{}, err
	}
	if envelope.ContentHash != wantHash {
		return PlanRevision[T]{}, contractError(ErrorHashMismatch, "contentHash", "plan revision content does not match its hash")
	}
	envelope.Payload = append(json.RawMessage(nil), envelope.Payload...)
	envelope.Capabilities = append([]Capability(nil), envelope.Capabilities...)
	envelope.BaseRevision = cloneRevisionRef(envelope.BaseRevision)
	envelope.Provenance = cloneProvenance(envelope.Provenance)
	return PlanRevision[T]{envelope: envelope}, nil
}

func validateRevisionEnvelope(envelope revisionEnvelope) error {
	if envelope.ContractVersion != CurrentVersion {
		return contractError(ErrorUnsupportedVersion, "contractVersion", "unsupported strategy contract version")
	}
	if envelope.HashAlgorithm != HashAlgorithmV1 {
		return contractError(ErrorInvalidDocument, "hashAlgorithm", "unsupported strategy canonical hash algorithm")
	}
	if err := validateIdentifier("revisionId", envelope.RevisionID); err != nil {
		return err
	}
	if err := validateIdentifier("sourceDraftId", envelope.SourceDraftID); err != nil {
		return err
	}
	if err := validateIdentifier("planId", envelope.PlanID); err != nil {
		return err
	}
	if err := validateIdentifier("variantId", envelope.VariantID); err != nil {
		return err
	}
	if strings.TrimSpace(envelope.Name) == "" {
		return contractError(ErrorInvalidDocument, "name", "plan name is required")
	}
	if err := envelope.Mode.validate(); err != nil {
		return err
	}
	normalized, err := normalizeCapabilities(envelope.Capabilities)
	if err != nil {
		return err
	}
	if !sameCapabilities(envelope.Capabilities, normalized) {
		return contractError(ErrorInvalidDocument, "capabilities", "capabilities must be sorted and unique")
	}
	if err := envelope.Provenance.validate(); err != nil {
		return err
	}
	if err := envelope.Confidence.validate(); err != nil {
		return err
	}
	if err := validateTimestamp("createdAt", envelope.CreatedAt); err != nil {
		return err
	}
	if envelope.BaseRevision != nil {
		if err := validateRevisionRef(*envelope.BaseRevision, "baseRevision"); err != nil {
			return err
		}
		if envelope.BaseRevision.PlanID != envelope.PlanID || envelope.BaseRevision.VariantID != envelope.VariantID {
			return contractError(ErrorRevisionConflict, "baseRevision", "base revision belongs to another plan variant")
		}
	}
	if len(envelope.Payload) == 0 || string(envelope.Payload) == "null" {
		return contractError(ErrorInvalidDocument, "payload", "plan payload is required")
	}
	return validateContentHash("contentHash", envelope.ContentHash)
}

func hashRevision(envelope revisionEnvelope) (string, error) {
	content := revisionHashInput{
		ContractVersion: envelope.ContractVersion,
		HashAlgorithm:   envelope.HashAlgorithm,
		RevisionID:      envelope.RevisionID,
		SourceDraftID:   envelope.SourceDraftID,
		PlanID:          envelope.PlanID,
		VariantID:       envelope.VariantID,
		BaseRevision:    envelope.BaseRevision,
		Name:            envelope.Name,
		Mode:            envelope.Mode,
		Capabilities:    envelope.Capabilities,
		Provenance:      envelope.Provenance,
		Confidence:      envelope.Confidence,
		CreatedAt:       envelope.CreatedAt,
		Payload:         envelope.Payload,
	}
	encoded, err := json.Marshal(content)
	if err != nil {
		return "", wrapContractError(ErrorInvalidDocument, "", "encode revision hash input", err)
	}
	_, digest, err := CanonicalizeAndHashJSONV1(encoded)
	return digest, err
}

func cloneRevisionRef(ref *RevisionRef) *RevisionRef {
	if ref == nil {
		return nil
	}
	clone := *ref
	return &clone
}

func cloneProvenance(value Provenance) Provenance {
	clone := value
	if value.ObservedAt != nil {
		observedAt := *value.ObservedAt
		clone.ObservedAt = &observedAt
	}
	return clone
}

func sameCapabilities(left, right []Capability) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
