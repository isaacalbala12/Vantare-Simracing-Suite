package catalog

import (
	"errors"
	"fmt"
)

type ErrorCode string

const (
	ErrorInvalidBundle    ErrorCode = "invalid_catalog_bundle"
	ErrorInvalidManifest  ErrorCode = "invalid_catalog_manifest"
	ErrorInvalidPayload   ErrorCode = "invalid_catalog_payload"
	ErrorInvalidTrust     ErrorCode = "invalid_catalog_trust"
	ErrorUnknownKey       ErrorCode = "catalog_unknown_key"
	ErrorKeyWindow        ErrorCode = "catalog_key_out_of_window"
	ErrorSignature        ErrorCode = "catalog_signature_invalid"
	ErrorChecksum         ErrorCode = "catalog_checksum_mismatch"
	ErrorRollback         ErrorCode = "catalog_sequence_rollback"
	ErrorSequenceConflict ErrorCode = "catalog_sequence_conflict"
	ErrorUnavailable      ErrorCode = "catalog_unavailable"
	ErrorTransport        ErrorCode = "catalog_transport_failed"
)

var (
	ErrRejected    = errors.New("official strategy catalog rejected")
	ErrUnavailable = errors.New("official strategy catalog unavailable")
)

type CatalogError struct {
	Code  ErrorCode
	Field string
	Cause error
}

func (err *CatalogError) Error() string {
	if err.Field == "" {
		return string(err.Code)
	}
	return fmt.Sprintf("%s (%s)", err.Code, err.Field)
}

func (err *CatalogError) Unwrap() []error {
	base := ErrRejected
	if err.Code == ErrorUnavailable || err.Code == ErrorTransport {
		base = ErrUnavailable
	}
	if err.Cause == nil {
		return []error{base}
	}
	return []error{base, err.Cause}
}

func catalogError(code ErrorCode, field string) error { return &CatalogError{Code: code, Field: field} }
func wrapCatalogError(code ErrorCode, field string, cause error) error {
	return &CatalogError{Code: code, Field: field, Cause: cause}
}

func HasErrorCode(err error, code ErrorCode) bool {
	var target *CatalogError
	return errors.As(err, &target) && target.Code == code
}
