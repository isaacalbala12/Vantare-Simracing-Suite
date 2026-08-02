package contract

import (
	"strings"
	"time"
)

func validatePlanRevisionJSONShape(value interface{}) error {
	manifest := ManifestV1()
	document, err := requireJSONObjectFields(
		value,
		"",
		manifest.DocumentRequiredFields.PlanRevision,
		[]string{"baseRevision"},
	)
	if err != nil {
		return err
	}
	if err := validateParsedVersion(document["contractVersion"], "contractVersion"); err != nil {
		return err
	}
	algorithm, ok := document["hashAlgorithm"].(string)
	if !ok || algorithm != HashAlgorithmV1 {
		return contractError(ErrorInvalidDocument, "hashAlgorithm", "unsupported strategy canonical hash algorithm")
	}
	for _, field := range []string{"revisionId", "sourceDraftId", "planId", "variantId"} {
		if err := validateParsedIdentifier(document[field], field); err != nil {
			return err
		}
	}
	name, ok := document["name"].(string)
	if !ok || strings.TrimSpace(name) == "" {
		return contractError(ErrorInvalidDocument, "name", "plan name is required")
	}
	if err := validateParsedPlanMode(document["mode"]); err != nil {
		return err
	}
	if err := validateParsedCapabilities(document["capabilities"]); err != nil {
		return err
	}
	if err := validateParsedEvidence(document); err != nil {
		return err
	}
	if err := requireParsedTimestamp(document, "createdAt", false); err != nil {
		return err
	}
	if document["payload"] == nil {
		return contractError(ErrorInvalidDocument, "payload", "plan payload is required")
	}
	hash, ok := document["contentHash"].(string)
	if !ok {
		return contractError(ErrorInvalidDocument, "contentHash", "must be an exact lowercase SHA-256 hexadecimal digest")
	}
	if err := validateContentHash("contentHash", hash); err != nil {
		return err
	}
	if rawBase, exists := document["baseRevision"]; exists {
		base, err := requireJSONObjectFields(
			rawBase,
			"baseRevision",
			[]string{"planId", "variantId", "revisionId", "contentHash"},
			nil,
		)
		if err != nil {
			return err
		}
		if err := validateParsedRevisionRef(base, "baseRevision"); err != nil {
			return err
		}
		if base["planId"] != document["planId"] || base["variantId"] != document["variantId"] {
			return contractError(ErrorRevisionConflict, "baseRevision", "base revision belongs to another plan variant")
		}
	}
	return nil
}

func validateReplanProposalJSONShape(value interface{}) error {
	manifest := ManifestV1()
	document, err := requireJSONObjectFields(
		value,
		"",
		manifest.DocumentRequiredFields.ReplanProposal,
		[]string{"expiresAt", "decidedAt"},
	)
	if err != nil {
		return err
	}
	if err := validateParsedVersion(document["contractVersion"], "contractVersion"); err != nil {
		return err
	}
	if err := validateParsedIdentifier(document["proposalId"], "proposalId"); err != nil {
		return err
	}
	base, err := validateParsedRevisionRefObject(document["base"], "base")
	if err != nil {
		return err
	}
	candidate, err := validateParsedRevisionRefObject(document["candidate"], "candidate")
	if err != nil {
		return err
	}
	if base["planId"] != candidate["planId"] || base["variantId"] != candidate["variantId"] {
		return contractError(ErrorRevisionConflict, "candidate", "candidate belongs to another plan variant")
	}
	if base["revisionId"] == candidate["revisionId"] && base["contentHash"] == candidate["contentHash"] {
		return contractError(ErrorRevisionConflict, "candidate", "candidate must differ from the base revision")
	}
	status, err := validateParsedReplanStatus(document["status"])
	if err != nil {
		return err
	}
	if err := validateParsedIdentifier(document["reasonCode"], "reasonCode"); err != nil {
		return err
	}
	if err := validateParsedEvidence(document); err != nil {
		return err
	}
	createdAt, err := parsedTimestamp(document, "createdAt", false)
	if err != nil {
		return err
	}
	expiresAt, err := parsedTimestamp(document, "expiresAt", true)
	if err != nil {
		return err
	}
	decidedAt, err := parsedTimestamp(document, "decidedAt", true)
	if err != nil {
		return err
	}
	if expiresAt != nil && !expiresAt.After(*createdAt) {
		return contractError(ErrorInvalidState, "expiresAt", "must be after proposal creation")
	}
	if decidedAt != nil && decidedAt.Before(*createdAt) {
		return contractError(ErrorInvalidState, "decidedAt", "decision cannot predate proposal")
	}
	switch status {
	case ReplanProposed:
		if decidedAt != nil {
			return contractError(ErrorInvalidState, "decidedAt", "proposed replan cannot already have a decision")
		}
	case ReplanAccepted:
		if decidedAt == nil {
			return contractError(ErrorInvalidState, "decidedAt", "accepted replan requires a decision timestamp")
		}
		if expiresAt != nil && !decidedAt.Before(*expiresAt) {
			return contractError(ErrorProposalExpired, "expiresAt", "proposal expired before acceptance")
		}
	case ReplanRejected, ReplanExpired, ReplanSuperseded:
		if decidedAt == nil {
			return contractError(ErrorInvalidState, "decidedAt", "resolved replan requires a decision timestamp")
		}
	}
	return nil
}

func validateParsedPlanMode(value interface{}) error {
	mode, ok := value.(string)
	if !ok {
		return contractError(ErrorInvalidState, "mode", "unknown plan mode")
	}
	return PlanMode(mode).validate()
}

func validateParsedReplanStatus(value interface{}) (ReplanStatus, error) {
	status, ok := value.(string)
	if !ok {
		return "", contractError(ErrorInvalidState, "status", "unknown replan status")
	}
	typed := ReplanStatus(status)
	switch typed {
	case ReplanProposed, ReplanAccepted, ReplanRejected, ReplanExpired, ReplanSuperseded:
		return typed, nil
	default:
		return "", contractError(ErrorInvalidState, "status", "unknown replan status")
	}
}

func validateParsedEvidence(document map[string]interface{}) error {
	provenance, err := requireJSONObjectFields(
		document["provenance"],
		"provenance",
		[]string{"kind"},
		[]string{"sourceId", "observedAt"},
	)
	if err != nil {
		return err
	}
	if err := validateParsedProvenance(provenance); err != nil {
		return err
	}
	if err := requireParsedProvenanceTimestamp(document); err != nil {
		return err
	}
	confidence, err := requireJSONObjectFields(
		document["confidence"],
		"confidence",
		[]string{"level"},
		[]string{"basis"},
	)
	if err != nil {
		return err
	}
	return validateParsedConfidence(confidence)
}

func validateParsedRevisionRefObject(value interface{}, prefix string) (map[string]interface{}, error) {
	revision, err := requireJSONObjectFields(
		value,
		prefix,
		[]string{"planId", "variantId", "revisionId", "contentHash"},
		nil,
	)
	if err != nil {
		return nil, err
	}
	if err := validateParsedRevisionRef(revision, prefix); err != nil {
		return nil, err
	}
	return revision, nil
}

func parsedTimestamp(document map[string]interface{}, field string, optional bool) (*time.Time, error) {
	value, exists := document[field]
	if !exists && optional {
		return nil, nil
	}
	text, ok := value.(string)
	if !ok {
		return nil, contractError(ErrorInvalidDocument, field, "timestamp must be a string")
	}
	parsed, err := parseCanonicalTimestamp(field, text)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}
