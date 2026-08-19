package live

import (
	"errors"
	"fmt"
)

var (
	ErrInvalidPlan              = errors.New("strategy live plan is invalid")
	ErrNoActivePlan             = errors.New("strategy live active plan is unavailable")
	ErrInvalidActivePlan        = errors.New("strategy live active plan is invalid")
	ErrActiveRevisionNotFound   = errors.New("strategy live active revision was not found")
	ErrActiveRevisionMismatch   = errors.New("strategy live active revision identity does not match")
	ErrUnsupportedEditorVersion = errors.New("strategy live editor version is unsupported")
	ErrInvalidEditorDocument    = errors.New("strategy live editor document is invalid")
	ErrInvalidProjection        = errors.New("strategy live projection is invalid")
	ErrCapabilityConflict       = errors.New("strategy live projection capabilities contradict its payload")
	ErrCursorConflict           = errors.New("strategy live projection cursor conflicts with prior content")
	ErrOutOfOrder               = errors.New("strategy live update is out of order")
	ErrInvalidSource            = errors.New("strategy live source status is invalid")
	ErrSourceConflict           = errors.New("strategy live source revision conflicts with prior content")
)

// Error keeps failures machine-inspectable without exposing telemetry internals.
type Error struct {
	Kind  error
	Field string
	Cause error
}

func (err *Error) Error() string {
	if err.Cause != nil {
		return fmt.Sprintf("%v (%s): %v", err.Kind, err.Field, err.Cause)
	}
	return fmt.Sprintf("%v (%s)", err.Kind, err.Field)
}

func (err *Error) Unwrap() error { return err.Kind }

func invalid(kind error, field string, cause error) error {
	return &Error{Kind: kind, Field: field, Cause: cause}
}
