package application

import (
	"context"
	"errors"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

// Export and Import are the only paths a plan takes in or out of this machine.
// Both go through the repository, which stays the authority: packaging owns
// the format and this file owns the transaction.
//
// Neither operation contacts a network. Export returns bytes to the caller and
// Import consumes bytes the user supplied.

// Export builds a package for the selected plans. It is a read: the repository
// is never written, so a failed export leaves nothing behind.
func (service *Service[T]) Export(ctx context.Context, command ExportCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationExport); err != nil {
		return Result[T]{}, err
	}
	if len(command.Plans) == 0 {
		return Result[T]{}, applicationError(ErrorInvalidCommand, "plans", ErrInvalidCommand)
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	bundles := make([]packaging.Bundle[T], 0, len(command.Plans))
	selected := make(map[packaging.RevisionKey]struct{})
	for _, selector := range command.Plans {
		bundle, found := collectBundle(snapshot, selector)
		if !found {
			return Result[T]{}, applicationError(ErrorPlanNotFound, "plans", ErrPlanNotFound)
		}
		key := packaging.RevisionKey{PlanID: selector.PlanID, VariantID: selector.VariantID}
		if _, duplicate := selected[key]; duplicate {
			return Result[T]{}, applicationError(ErrorInvalidCommand, "plans", ErrInvalidCommand)
		}
		selected[key] = struct{}{}
		bundles = append(bundles, bundle)
	}
	built, err := packaging.Build(command.Provenance, bundles)
	if err != nil {
		return Result[T]{}, err
	}
	encoded, err := packaging.Encode(built)
	if err != nil {
		return Result[T]{}, err
	}
	return Result[T]{
		ProtocolVersion:     ProtocolVersionV1,
		CommandID:           command.CommandID,
		RepositoryVersion:   snapshot.Version,
		Package:             encoded,
		RecoveredFromBackup: snapshot.RecoveredFromBackup,
	}, nil
}

// Import decodes, previews, and — unless the command is a dry run — applies the
// whole package as one repository commit.
//
// Every reason to refuse is established before the single write: an
// unreadable, unversioned, tampered or conflicting package returns an error
// having called Commit zero times, so the repository cannot be left half
// imported.
func (service *Service[T]) Import(ctx context.Context, command ImportCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationImport); err != nil {
		return Result[T]{}, err
	}
	decoded, err := packaging.Decode[T](command.Package)
	if err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	preview := packaging.Reconcile(decoded, localState(snapshot))
	if !preview.Importable {
		// A conflicting package is refused with its preview attached, so the
		// interface can say which revisions collide instead of only that
		// something did.
		return Result[T]{}, &ImportRefusedError{Preview: preview}
	}
	if command.DryRun {
		return Result[T]{
			ProtocolVersion:     ProtocolVersionV1,
			CommandID:           command.CommandID,
			RepositoryVersion:   snapshot.Version,
			Preview:             &preview,
			Imported:            false,
			RecoveredFromBackup: snapshot.RecoveredFromBackup,
		}, nil
	}
	if snapshot.Version != command.ExpectedRepositoryVersion {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", ErrStaleCommand)
	}
	changes := repository.ChangeSet[T]{}
	for _, bundle := range decoded.Bundles {
		if bundle.Draft != nil {
			changes.Drafts = append(changes.Drafts, *bundle.Draft)
		}
		changes.Revisions = append(changes.Revisions, bundle.Revisions...)
	}
	commit, err := service.repository.Commit(ctx, command.ExpectedRepositoryVersion, changes)
	if err != nil {
		return service.reconcileImport(ctx, command, decoded, err)
	}
	return Result[T]{
		ProtocolVersion:     ProtocolVersionV1,
		CommandID:           command.CommandID,
		RepositoryVersion:   commit.Snapshot.Version,
		Preview:             &preview,
		Imported:            true,
		RecoveredFromBackup: commit.Snapshot.RecoveredFromBackup,
	}, nil
}

// reconcileImport handles the one case where a write may or may not have
// landed. It re-reads and reports success only if everything the package
// carried is present, so an uncertain commit never reports a partial import as
// a complete one.
func (service *Service[T]) reconcileImport(ctx context.Context, command ImportCommand, decoded packaging.Package[T], commitErr error) (Result[T], error) {
	if !errors.Is(commitErr, repository.ErrStaleWrite) && !errors.Is(commitErr, repository.ErrCommitUncertain) {
		return Result[T]{}, commitErr
	}
	snapshot, snapshotErr := service.repository.Snapshot(ctx)
	if snapshotErr != nil {
		return Result[T]{}, errors.Join(commitErr, snapshotErr)
	}
	settled := packaging.Reconcile(decoded, localState(snapshot))
	if applied(settled) {
		return Result[T]{
			ProtocolVersion:     ProtocolVersionV1,
			CommandID:           command.CommandID,
			RepositoryVersion:   snapshot.Version,
			Preview:             &settled,
			Imported:            true,
			RecoveredFromBackup: snapshot.RecoveredFromBackup,
		}, nil
	}
	if errors.Is(commitErr, repository.ErrStaleWrite) {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", errors.Join(ErrStaleCommand, commitErr))
	}
	return Result[T]{}, commitErr
}

// applied reports whether the repository now already holds everything the
// package carried.
func applied(preview packaging.Preview) bool {
	if !preview.Importable {
		return false
	}
	for _, entry := range preview.Entries {
		if entry.Disposition != packaging.DispositionUnchanged {
			return false
		}
	}
	return true
}

func collectBundle[T any](snapshot repository.Snapshot[T], selector PlanSelector) (packaging.Bundle[T], bool) {
	bundle := packaging.Bundle[T]{PlanID: selector.PlanID, VariantID: selector.VariantID}
	for _, draft := range snapshot.Drafts {
		if draft.PlanID == selector.PlanID && draft.VariantID == selector.VariantID {
			clone, err := cloneDraft(draft)
			if err != nil {
				return packaging.Bundle[T]{}, false
			}
			bundle.Draft = &clone
			break
		}
	}
	for _, revision := range snapshot.Revisions {
		metadata := revision.Metadata()
		if metadata.PlanID == selector.PlanID && metadata.VariantID == selector.VariantID {
			bundle.Revisions = append(bundle.Revisions, revision)
		}
	}
	return bundle, bundle.Draft != nil || len(bundle.Revisions) > 0
}

// localState projects the repository into the identity-and-fingerprint view
// the reconciler needs, so packaging never has to know a repository exists.
func localState[T any](snapshot repository.Snapshot[T]) packaging.LocalState {
	state := packaging.LocalState{
		DraftHashes:    make(map[contract.DraftID]string, len(snapshot.Drafts)),
		RevisionHashes: make(map[packaging.RevisionKey]string, len(snapshot.Revisions)),
	}
	for _, draft := range snapshot.Drafts {
		state.DraftHashes[draft.DraftID] = packaging.DraftFingerprint(draft)
	}
	for _, revision := range snapshot.Revisions {
		metadata := revision.Metadata()
		state.RevisionHashes[packaging.RevisionKey{
			PlanID:     metadata.PlanID,
			VariantID:  metadata.VariantID,
			RevisionID: metadata.RevisionID,
		}] = metadata.ContentHash
	}
	return state
}
