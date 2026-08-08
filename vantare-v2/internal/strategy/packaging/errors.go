package packaging

import (
	"errors"
	"fmt"
	"strings"
)

// ErrorCode is stable across Go and TypeScript so the interface can explain a
// rejected package without matching on message text.
type ErrorCode string

const (
	ErrorInvalidPackage             ErrorCode = "invalid_package"
	ErrorUnsupportedPackageVersion  ErrorCode = "unsupported_package_version"
	ErrorUnsupportedContractVersion ErrorCode = "unsupported_contract_version"
	ErrorChecksumMismatch           ErrorCode = "package_checksum_mismatch"
	ErrorInvalidProvenance          ErrorCode = "invalid_package_provenance"
	ErrorEmptyPackage               ErrorCode = "empty_package"
	ErrorEmptyBundle                ErrorCode = "empty_plan_bundle"
	ErrorDuplicateDocument          ErrorCode = "duplicate_package_document"
	ErrorMisplacedDocument          ErrorCode = "misplaced_package_document"
	// ErrorRevisionConflict means the package carries a revision whose
	// identity already exists locally with different content. Importing would
	// have to rewrite history, so it is refused instead.
	ErrorRevisionConflict ErrorCode = "package_revision_conflict"
)

// ErrRejected is the shared sentinel: every packaging failure wraps it, so a
// caller can tell "this package was refused" from "the disk failed".
var ErrRejected = errors.New("strategy package rejected")

type PackagingError struct {
	Code    ErrorCode
	Field   string
	Message string
	Cause   error
}

func (err *PackagingError) Error() string {
	if err.Field == "" {
		return fmt.Sprintf("%s: %s", err.Code, err.Message)
	}
	return fmt.Sprintf("%s (%s): %s", err.Code, err.Field, err.Message)
}

func (err *PackagingError) Unwrap() []error {
	if err.Cause == nil {
		return []error{ErrRejected}
	}
	return []error{ErrRejected, err.Cause}
}

func packagingError(code ErrorCode, field, message string) error {
	return &PackagingError{Code: code, Field: field, Message: message}
}

func wrapPackagingError(code ErrorCode, field, message string, cause error) error {
	return &PackagingError{Code: code, Field: field, Message: message, Cause: cause}
}

// HasErrorCode lets callers branch on why a package was refused.
func HasErrorCode(err error, code ErrorCode) bool {
	var packagingErr *PackagingError
	return errors.As(err, &packagingErr) && packagingErr.Code == code
}

func trimmed(value string) string { return strings.TrimSpace(value) }
