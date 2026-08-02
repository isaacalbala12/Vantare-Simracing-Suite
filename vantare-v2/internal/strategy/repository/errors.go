package repository

import (
	"errors"
	"fmt"
)

var (
	ErrStaleWrite                   = errors.New("strategy repository write is stale")
	ErrWriteInProgress              = errors.New("strategy repository write is already in progress")
	ErrImmutableRevision            = errors.New("strategy revision is immutable")
	ErrLimitExceeded                = errors.New("strategy repository limit exceeded")
	ErrCorruptRepository            = errors.New("strategy repository is corrupt")
	ErrUnsupportedRepositoryVersion = errors.New("unsupported strategy repository version")
	ErrCommitUncertain              = errors.New("strategy repository commit outcome is uncertain")
)

// CommitUncertainError means the primary file was atomically replaced but the
// final durability sync failed. Callers must read Snapshot and reconcile the
// reported generation instead of retrying the same change blindly.
type CommitUncertainError struct {
	Version uint64
	Cause   error
}

func (err *CommitUncertainError) Error() string {
	return fmt.Sprintf("%v at generation %d: %v", ErrCommitUncertain, err.Version, err.Cause)
}

func (err *CommitUncertainError) Unwrap() []error {
	return []error{ErrCommitUncertain, err.Cause}
}
