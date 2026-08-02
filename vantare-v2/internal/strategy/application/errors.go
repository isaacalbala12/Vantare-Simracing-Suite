package application

import (
	"errors"
	"fmt"
)

type ErrorCode string

const (
	ErrorInvalidCommand   ErrorCode = "invalid_command"
	ErrorStaleCommand     ErrorCode = "stale_command"
	ErrorDraftNotFound    ErrorCode = "draft_not_found"
	ErrorDraftConflict    ErrorCode = "draft_conflict"
	ErrorRevisionNotFound ErrorCode = "revision_not_found"
	ErrorActiveConflict   ErrorCode = "active_plan_conflict"
	ErrorUnsavedChanges   ErrorCode = "unsaved_changes"
)

var (
	ErrInvalidCommand   = errors.New("invalid strategy application command")
	ErrStaleCommand     = errors.New("strategy application command is stale")
	ErrDraftNotFound    = errors.New("strategy draft not found")
	ErrDraftConflict    = errors.New("strategy draft conflicts with an existing draft")
	ErrRevisionNotFound = errors.New("strategy revision not found")
	ErrActiveConflict   = errors.New("strategy active plan conflict")
	ErrUnsavedChanges   = errors.New("strategy draft has unsaved changes")
)

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
