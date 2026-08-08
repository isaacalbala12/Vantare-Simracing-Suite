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
	// ErrRevisionNotStored guards the active pointer: the repository refuses to
	// name a revision it does not hold.
	ErrRevisionNotStored = errors.New("strategy revision is not stored in this repository")
	// ErrImmutableActivation protects the audit trail from being rewritten.
	ErrImmutableActivation = errors.New("strategy activation is immutable")
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
