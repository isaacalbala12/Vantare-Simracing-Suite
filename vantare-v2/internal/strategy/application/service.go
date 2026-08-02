package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

const maxSafeRepositoryVersion = uint64(1<<53 - 1)

type repositoryPort[T any] interface {
	Snapshot(context.Context) (repository.Snapshot[T], error)
	Commit(context.Context, uint64, repository.ChangeSet[T]) (repository.CommitResult[T], error)
}

// Service is the only application facade for Strategy documents. The
// repository remains the authority for persisted drafts/revisions; transient
// editor history belongs to the frontend store.
type Service[T any] struct {
	repository repositoryPort[T]
}

func NewService[T any](repo repositoryPort[T]) *Service[T] {
	return &Service[T]{repository: repo}
}

func (service *Service[T]) Create(ctx context.Context, command CreateCommand[T]) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationCreate); err != nil {
		return Result[T]{}, err
	}
	if err := command.Draft.Validate(); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	if existing, exists := findDraft(snapshot, command.Draft.DraftID); exists {
		if equalJSON(existing, command.Draft) {
			return resultForDraft(command.CommandID, snapshot, existing, nil)
		}
		return Result[T]{}, applicationError(ErrorDraftConflict, "draft.draftId", ErrDraftConflict)
	}
	if snapshot.Version != command.ExpectedRepositoryVersion {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", ErrStaleCommand)
	}
	commit, err := service.repository.Commit(ctx, command.ExpectedRepositoryVersion, repository.ChangeSet[T]{Drafts: []contract.PlanDraft[T]{command.Draft}})
	if err == nil {
		return resultForDraft(command.CommandID, commit.Snapshot, command.Draft, nil)
	}
	return service.reconcileDraft(ctx, command.CommandHeader, command.Draft, nil, err)
}

func (service *Service[T]) Open(ctx context.Context, command OpenCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationOpen); err != nil {
		return Result[T]{}, err
	}
	if err := validateApplicationIdentifier("draftId", command.DraftID); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	draft, ok := findDraft(snapshot, command.DraftID)
	if !ok {
		return Result[T]{}, applicationError(ErrorDraftNotFound, "draftId", ErrDraftNotFound)
	}
	return resultForDraft(command.CommandID, snapshot, draft, nil)
}

func (service *Service[T]) Edit(_ context.Context, command EditCommand[T]) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationEdit); err != nil {
		return Result[T]{}, err
	}
	if err := command.Draft.Validate(); err != nil {
		return Result[T]{}, err
	}
	draft, err := cloneDraft(command.Draft)
	if err != nil {
		return Result[T]{}, err
	}
	return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: command.CommandID, RepositoryVersion: command.ExpectedRepositoryVersion, Draft: &draft}, nil
}

func (service *Service[T]) SaveRevision(ctx context.Context, command SaveRevisionCommand[T]) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationSaveRevision); err != nil {
		return Result[T]{}, err
	}
	revision, err := contract.NewPlanRevision(command.Draft, contract.RevisionMetadata{RevisionID: command.RevisionID, CreatedAt: command.CreatedAt})
	if err != nil {
		return Result[T]{}, err
	}
	savedDraft, err := cloneDraft(command.Draft)
	if err != nil {
		return Result[T]{}, err
	}
	ref := revision.Ref()
	savedDraft.BaseRevision = &ref
	commit, err := service.repository.Commit(ctx, command.ExpectedRepositoryVersion, repository.ChangeSet[T]{
		Drafts:    []contract.PlanDraft[T]{savedDraft},
		Revisions: []contract.PlanRevision[T]{revision},
	})
	if err == nil {
		return resultForDraft(command.CommandID, commit.Snapshot, savedDraft, &revision)
	}
	return service.reconcileDraft(ctx, command.CommandHeader, savedDraft, &revision, err)
}

func (service *Service[T]) Duplicate(ctx context.Context, command DuplicateCommand[T]) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationDuplicate); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	if err := command.SourceDraft.Validate(); err != nil {
		return Result[T]{}, err
	}
	target, err := cloneDraft(command.SourceDraft)
	if err != nil {
		return Result[T]{}, err
	}
	target.DraftID = command.TargetDraftID
	target.PlanID = command.TargetPlanID
	target.VariantID = command.TargetVariantID
	target.Name = strings.TrimSpace(command.Name)
	target.UpdatedAt = command.UpdatedAt
	target.BaseRevision = nil
	if err := target.Validate(); err != nil {
		return Result[T]{}, err
	}
	if existing, exists := findDraft(snapshot, target.DraftID); exists {
		if equalJSON(existing, target) {
			return resultForDraft(command.CommandID, snapshot, existing, nil)
		}
		return Result[T]{}, applicationError(ErrorDraftConflict, "targetDraftId", ErrDraftConflict)
	}
	if snapshot.Version != command.ExpectedRepositoryVersion {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", ErrStaleCommand)
	}
	storedSource, ok := findDraft(snapshot, command.SourceDraft.DraftID)
	if !ok {
		return Result[T]{}, applicationError(ErrorDraftNotFound, "sourceDraft.draftId", ErrDraftNotFound)
	}
	if storedSource.PlanID != command.SourceDraft.PlanID || storedSource.VariantID != command.SourceDraft.VariantID {
		return Result[T]{}, applicationError(ErrorDraftConflict, "sourceDraft", ErrDraftConflict)
	}
	commit, err := service.repository.Commit(ctx, command.ExpectedRepositoryVersion, repository.ChangeSet[T]{Drafts: []contract.PlanDraft[T]{target}})
	if err == nil {
		return resultForDraft(command.CommandID, commit.Snapshot, target, nil)
	}
	return service.reconcileDraft(ctx, command.CommandHeader, target, nil, err)
}

func (service *Service[T]) Activate(ctx context.Context, command ActivateCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationActivate); err != nil {
		return Result[T]{}, err
	}
	active, err := contract.NewActivePlan(command.ActivationID, command.Revision, command.ActivatedAt)
	if err != nil {
		return Result[T]{}, err
	}
	if command.Current != nil {
		if err := command.Current.Validate(); err != nil {
			return Result[T]{}, err
		}
	}
	if command.Current != nil && command.Current.ActivationID == command.ActivationID && command.Current.Revision == command.Revision && command.Current.ActivatedAt.Equal(command.ActivatedAt) {
		active := *command.Current
		return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: command.CommandID, RepositoryVersion: command.ExpectedRepositoryVersion, ActivePlan: &active}, nil
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	if snapshot.Version != command.ExpectedRepositoryVersion {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", ErrStaleCommand)
	}
	if !hasRevision(snapshot, command.Revision) {
		return Result[T]{}, applicationError(ErrorRevisionNotFound, "revision", ErrRevisionNotFound)
	}
	if command.Current != nil {
		if command.Current.Revision.PlanID != command.Revision.PlanID || command.Current.Revision.VariantID != command.Revision.VariantID {
			return Result[T]{}, applicationError(ErrorActiveConflict, "current", ErrActiveConflict)
		}
		previous := command.Current.Revision
		active.PreviousRevision = &previous
		if err := active.Validate(); err != nil {
			return Result[T]{}, err
		}
	}
	return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: command.CommandID, RepositoryVersion: snapshot.Version, ActivePlan: &active, RecoveredFromBackup: snapshot.RecoveredFromBackup}, nil
}

func (service *Service[T]) Deactivate(_ context.Context, command DeactivateCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationDeactivate); err != nil {
		return Result[T]{}, err
	}
	if err := validateApplicationIdentifier("expectedActivationId", command.ExpectedActivationID); err != nil {
		return Result[T]{}, err
	}
	if command.Current == nil {
		return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: command.CommandID, RepositoryVersion: command.ExpectedRepositoryVersion}, nil
	}
	if err := command.Current.Validate(); err != nil {
		return Result[T]{}, err
	}
	if command.Current.ActivationID != command.ExpectedActivationID {
		return Result[T]{}, applicationError(ErrorActiveConflict, "expectedActivationId", ErrActiveConflict)
	}
	return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: command.CommandID, RepositoryVersion: command.ExpectedRepositoryVersion}, nil
}

func (service *Service[T]) Restore(ctx context.Context, command RestoreCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationRestore); err != nil {
		return Result[T]{}, err
	}
	if err := validateApplicationIdentifier("draftId", command.DraftID); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	draft, ok := findDraft(snapshot, command.DraftID)
	if !ok {
		return Result[T]{}, applicationError(ErrorDraftNotFound, "draftId", ErrDraftNotFound)
	}
	return resultForDraft(command.CommandID, snapshot, draft, nil)
}

func (service *Service[T]) Close(_ context.Context, command CloseCommand[T]) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationClose); err != nil {
		return Result[T]{}, err
	}
	if err := command.Draft.Validate(); err != nil {
		return Result[T]{}, err
	}
	if err := command.SavedDraft.Validate(); err != nil {
		return Result[T]{}, err
	}
	if !reflect.DeepEqual(command.Draft, command.SavedDraft) && !command.Discard {
		return Result[T]{}, applicationError(ErrorUnsavedChanges, "draft", ErrUnsavedChanges)
	}
	return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: command.CommandID, RepositoryVersion: command.ExpectedRepositoryVersion, Closed: true}, nil
}

func (service *Service[T]) reconcileDraft(ctx context.Context, header CommandHeader, wanted contract.PlanDraft[T], revision *contract.PlanRevision[T], operationErr error) (Result[T], error) {
	if !errors.Is(operationErr, repository.ErrStaleWrite) && !errors.Is(operationErr, repository.ErrCommitUncertain) {
		return Result[T]{}, operationErr
	}
	snapshot, snapshotErr := service.repository.Snapshot(ctx)
	if snapshotErr != nil {
		return Result[T]{}, errors.Join(operationErr, snapshotErr)
	}
	stored, ok := findDraft(snapshot, wanted.DraftID)
	if ok && equalJSON(stored, wanted) && (revision == nil || hasRevision(snapshot, revision.Ref())) {
		return resultForDraft(header.CommandID, snapshot, stored, revision)
	}
	if errors.Is(operationErr, repository.ErrStaleWrite) {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", errors.Join(ErrStaleCommand, operationErr))
	}
	return Result[T]{}, operationErr
}

func resultForDraft[T any](commandID CommandID, snapshot repository.Snapshot[T], draft contract.PlanDraft[T], revision *contract.PlanRevision[T]) (Result[T], error) {
	current, err := cloneDraft(draft)
	if err != nil {
		return Result[T]{}, err
	}
	saved, err := cloneDraft(draft)
	if err != nil {
		return Result[T]{}, err
	}
	return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: commandID, RepositoryVersion: snapshot.Version, Draft: &current, SavedDraft: &saved, Revision: revision, RecoveredFromBackup: snapshot.RecoveredFromBackup}, nil
}

func validateHeader(header CommandHeader, operation Operation) error {
	if header.ProtocolVersion != ProtocolVersionV1 {
		return applicationError(ErrorInvalidCommand, "protocolVersion", ErrInvalidCommand)
	}
	if !commandIDPattern.MatchString(string(header.CommandID)) {
		return applicationError(ErrorInvalidCommand, "commandId", ErrInvalidCommand)
	}
	if header.Operation != operation {
		return applicationError(ErrorInvalidCommand, "operation", ErrInvalidCommand)
	}
	if header.ExpectedRepositoryVersion > maxSafeRepositoryVersion {
		return applicationError(ErrorInvalidCommand, "expectedRepositoryVersion", ErrInvalidCommand)
	}
	return nil
}

func validateApplicationIdentifier[T ~string](field string, value T) error {
	if !commandIDPattern.MatchString(string(value)) {
		return applicationError(ErrorInvalidCommand, field, ErrInvalidCommand)
	}
	return nil
}

func findDraft[T any](snapshot repository.Snapshot[T], draftID contract.DraftID) (contract.PlanDraft[T], bool) {
	for _, draft := range snapshot.Drafts {
		if draft.DraftID == draftID {
			clone, err := cloneDraft(draft)
			return clone, err == nil
		}
	}
	return contract.PlanDraft[T]{}, false
}

func hasRevision[T any](snapshot repository.Snapshot[T], ref contract.RevisionRef) bool {
	for _, revision := range snapshot.Revisions {
		if revision.Ref() == ref {
			return true
		}
	}
	return false
}

func cloneDraft[T any](draft contract.PlanDraft[T]) (contract.PlanDraft[T], error) {
	raw, err := json.Marshal(draft)
	if err != nil {
		return contract.PlanDraft[T]{}, fmt.Errorf("clone application draft: %w", err)
	}
	var clone contract.PlanDraft[T]
	if err := json.Unmarshal(raw, &clone); err != nil {
		return contract.PlanDraft[T]{}, fmt.Errorf("clone application draft: %w", err)
	}
	return clone, nil
}

func equalJSON(left, right any) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && string(leftJSON) == string(rightJSON)
}
