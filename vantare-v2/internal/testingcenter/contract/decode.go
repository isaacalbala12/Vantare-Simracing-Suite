package contract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

func DecodeReport(document []byte) (Report, error) {
	return decodeAndValidate(document, Report.Validate, []string{"contractVersion", "reportId", "reporterId", "channel", "state"}, nil)
}

func DecodeEvidence(document []byte) (Evidence, error) {
	return decodeAndValidate(document, Evidence.Validate, []string{"contractVersion", "evidenceId", "reportId", "kind", "digest"}, nil)
}

func DecodeTechnicalIssue(document []byte) (TechnicalIssue, error) {
	return decodeAndValidate(document, TechnicalIssue.Validate, []string{"contractVersion", "technicalIssueId", "reportId", "state"}, nil)
}

func DecodeCodexRun(document []byte) (CodexRun, error) {
	return decodeAndValidate(document, CodexRun.Validate, []string{"contractVersion", "runId", "technicalIssueId", "attempt", "state"}, nil)
}

func DecodeCandidateBuild(document []byte) (CandidateBuild, error) {
	return decodeAndValidate(document, CandidateBuild.Validate, []string{"contractVersion", "candidateId", "technicalIssueId", "channel", "buildVersion", "exactSha", "authorId", "state"}, nil)
}

func DecodeValidation(document []byte) (Validation, error) {
	return decodeAndValidate(document, Validation.Validate, []string{"contractVersion", "validationId", "candidateId", "channel", "exactSha", "decision", "actorId"}, []string{"rejectionReason"})
}

func DecodePromotion(document []byte) (Promotion, error) {
	return decodeAndValidate(document, Promotion.Validate, []string{"contractVersion", "promotionId", "candidateId", "fromChannel", "toChannel", "exactSha", "validatedSha", "state"}, []string{"authorizedById"})
}

func decodeAndValidate[T any](document []byte, validate func(T) error, required, optional []string) (T, error) {
	var value T
	if err := validateExactObjectKeys(document, required, optional); err != nil {
		return value, err
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return value, fmt.Errorf("%w: %v", ErrInvalidDocument, err)
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return value, fmt.Errorf("%w: trailing JSON data", ErrInvalidDocument)
	}
	if err := validate(value); err != nil {
		return value, err
	}
	return value, nil
}

func validateExactObjectKeys(document []byte, required, optional []string) error {
	allowed := make(map[string]bool, len(required)+len(optional))
	for _, key := range required {
		allowed[key] = true
	}
	for _, key := range optional {
		allowed[key] = true
	}
	seen := make(map[string]bool, len(allowed))
	decoder := json.NewDecoder(bytes.NewReader(document))
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return fmt.Errorf("%w: document must be an object", ErrInvalidDocument)
	}
	for decoder.More() {
		token, err = decoder.Token()
		if err != nil {
			return fmt.Errorf("%w: %v", ErrInvalidDocument, err)
		}
		key, ok := token.(string)
		if !ok || !allowed[key] || seen[key] {
			return fmt.Errorf("%w: unknown or duplicate field %q", ErrInvalidDocument, key)
		}
		seen[key] = true
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalidDocument, err)
		}
	}
	if _, err := decoder.Token(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidDocument, err)
	}
	if token, err = decoder.Token(); !errors.Is(err, io.EOF) {
		return fmt.Errorf("%w: trailing JSON data", ErrInvalidDocument)
	}
	for _, key := range required {
		if !seen[key] {
			return fmt.Errorf("%w: missing field %q", ErrInvalidDocument, key)
		}
	}
	return nil
}
