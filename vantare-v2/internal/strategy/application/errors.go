package application

import (
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

type ErrorCode string

const (
	ErrorInvalidCommand          ErrorCode = "invalid_command"
	ErrorStaleCommand            ErrorCode = "stale_command"
	ErrorDraftNotFound           ErrorCode = "draft_not_found"
	ErrorDraftConflict           ErrorCode = "draft_conflict"
	ErrorRevisionNotFound        ErrorCode = "revision_not_found"
	ErrorActiveConflict          ErrorCode = "active_plan_conflict"
	ErrorUnsavedChanges          ErrorCode = "unsaved_changes"
	ErrorPlanNotFound            ErrorCode = "plan_not_found"
	ErrorEventNotFound           ErrorCode = "event_not_found"
	ErrorEventConflict           ErrorCode = "event_conflict"
	ErrorDriverNotFound          ErrorCode = "driver_not_found"
	ErrorDriverConflict          ErrorCode = "driver_conflict"
	ErrorDriverInUse             ErrorCode = "driver_in_use"
	ErrorVariantNotFound         ErrorCode = "variant_not_found"
	ErrorVariantConflict         ErrorCode = "variant_conflict"
	ErrorLegacyMigrationConflict ErrorCode = "legacy_migration_conflict"
	ErrorLegacyMigrationNotFound ErrorCode = "legacy_migration_not_found"
	ErrorCalculationInvalid      ErrorCode = "calculation_invalid"
	ErrorCalculationInfeasible   ErrorCode = "calculation_infeasible"
	ErrorCalculationOverflow     ErrorCode = "calculation_overflow"
	ErrorCalculationTimeout      ErrorCode = "calculation_timeout"
	// ErrorImportRefused means the package was readable and intact but would
	// have collided with what is already stored. Nothing was written.
	ErrorImportRefused ErrorCode = "import_refused"
)

var (
	ErrInvalidCommand          = errors.New("invalid strategy application command")
	ErrStaleCommand            = errors.New("strategy application command is stale")
	ErrDraftNotFound           = errors.New("strategy draft not found")
	ErrDraftConflict           = errors.New("strategy draft conflicts with an existing draft")
	ErrRevisionNotFound        = errors.New("strategy revision not found")
	ErrActiveConflict          = errors.New("strategy active plan conflict")
	ErrUnsavedChanges          = errors.New("strategy draft has unsaved changes")
	ErrPlanNotFound            = errors.New("strategy plan not found")
	ErrEventNotFound           = errors.New("strategy event not found")
	ErrEventConflict           = errors.New("strategy event conflicts with an existing event")
	ErrDriverNotFound          = errors.New("strategy driver not found")
	ErrDriverConflict          = errors.New("strategy driver conflicts with an existing driver")
	ErrDriverInUse             = errors.New("strategy driver is the only driver in a variant")
	ErrVariantNotFound         = errors.New("strategy variant not found")
	ErrVariantConflict         = errors.New("strategy variant conflicts with an existing variant")
	ErrLegacyMigrationConflict = errors.New("legacy migration fingerprint or journal conflicts with persisted state")
	ErrLegacyMigrationNotFound = errors.New("legacy migration journal not found")
	ErrCalculationInvalid      = errors.New("strategy calculation input is invalid")
	ErrCalculationInfeasible   = errors.New("strategy calculation is infeasible")
	ErrCalculationOverflow     = errors.New("strategy calculation overflowed")
	ErrCalculationTimeout      = errors.New("strategy calculation reached its deadline")
	ErrImportRefused           = errors.New("strategy package import refused")
)

// ImportRefusedError reports a package that was intact but could not be
// applied, and carries the preview so the interface can explain exactly which
// documents collided. Its existence is the signal that nothing was written.
type ImportRefusedError struct {
	Preview packaging.Preview
}

func (err *ImportRefusedError) Error() string {
	return fmt.Sprintf("%s: %v", ErrorImportRefused, ErrImportRefused)
}

func (err *ImportRefusedError) Unwrap() error { return ErrImportRefused }

type ApplicationError struct {
	Code  ErrorCode
	Field string
	Cause error
}

func (err *ApplicationError) Error() string {
	if err.Field == "" {
		return fmt.Sprintf("%s: %v", err.Code, err.Cause)
	}
	return fmt.Sprintf("%s (%s): %v", err.Code, err.Field, err.Cause)
}

func (err *ApplicationError) Unwrap() error { return err.Cause }

func applicationError(code ErrorCode, field string, cause error) error {
	if code == ErrorInvalidCommand && !errors.Is(cause, ErrInvalidCommand) {
		cause = errors.Join(ErrInvalidCommand, cause)
	}
	return &ApplicationError{Code: code, Field: field, Cause: cause}
}
