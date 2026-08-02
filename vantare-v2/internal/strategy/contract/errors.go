package contract

import (
	"errors"
	"fmt"
)

// ErrorCode is stable across Go, TypeScript and persisted strategy documents.
type ErrorCode string

const (
	ErrorInvalidIdentifier    ErrorCode = "invalid_identifier"
	ErrorInvalidUnit          ErrorCode = "invalid_unit"
	ErrorInvalidState         ErrorCode = "invalid_state"
	ErrorInvalidProvenance    ErrorCode = "invalid_provenance"
	ErrorInvalidConfidence    ErrorCode = "invalid_confidence"
	ErrorUnsupportedVersion   ErrorCode = "unsupported_contract_version"
	ErrorHashMismatch         ErrorCode = "revision_hash_mismatch"
	ErrorRevisionConflict     ErrorCode = "revision_conflict"
	ErrorProposalNotAccepted  ErrorCode = "proposal_not_accepted"
	ErrorProposalExpired      ErrorCode = "proposal_expired"
	ErrorNonMonotonicSequence ErrorCode = "non_monotonic_sequence"
	ErrorIncompatibleUnits    ErrorCode = "incompatible_units"
	ErrorInvalidDocument      ErrorCode = "invalid_document"
)

// ContractError exposes a machine-readable code and field without coupling
// callers to validation text.
type ContractError struct {
	Code    ErrorCode
	Field   string
	Message string
	Cause   error
}

func (err *ContractError) Error() string {
	if err.Field == "" {
		return fmt.Sprintf("%s: %s", err.Code, err.Message)
	}
	return fmt.Sprintf("%s (%s): %s", err.Code, err.Field, err.Message)
}

func (err *ContractError) Unwrap() error { return err.Cause }

func contractError(code ErrorCode, field, message string) error {
	return &ContractError{Code: code, Field: field, Message: message}
}

func wrapContractError(code ErrorCode, field, message string, cause error) error {
	return &ContractError{Code: code, Field: field, Message: message, Cause: cause}
}

// HasErrorCode lets consumers branch on contract failures without comparing
// error strings.
func HasErrorCode(err error, code ErrorCode) bool {
	var contractErr *ContractError
	return errors.As(err, &contractErr) && contractErr.Code == code
}
