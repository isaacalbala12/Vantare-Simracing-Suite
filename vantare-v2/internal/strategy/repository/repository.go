package repository

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

const (
	RepositoryVersion = "strategy.repository.v1"
	stateFileName     = "strategy-repository.json"
	backupFileName    = "strategy-repository.bak"
	leaseFileName     = ".strategy-repository.lock"
	repositoryHashV1  = "sha256:strategy-repository-json-v1"
	maxSafeGeneration = uint64(1<<53 - 1)
)

type Limits struct {
	MaxRepositoryBytes int64
	MaxDrafts          int
	MaxRevisions       int
	MaxDocumentBytes   int
}

// DefaultLimits bounds private strategy data without imposing time-based
// retention on the user.
func DefaultLimits() Limits {
	return Limits{
		MaxRepositoryBytes: 64 << 20,
		MaxDrafts:          512,
		MaxRevisions:       8192,
		MaxDocumentBytes:   4 << 20,
	}
}

func (limits Limits) validate() error {
	if limits.MaxRepositoryBytes <= 0 || limits.MaxDrafts <= 0 || limits.MaxRevisions <= 0 || limits.MaxDocumentBytes <= 0 {
		return fmt.Errorf("%w: every repository limit must be positive", ErrLimitExceeded)
	}
	if int64(limits.MaxDocumentBytes) > limits.MaxRepositoryBytes {
		return fmt.Errorf("%w: document limit exceeds repository limit", ErrLimitExceeded)
	}
	return nil
}

// Options configures repository resource limits.
type Options struct {
	Limits Limits
}

// Repository owns the private on-disk representation of Strategy documents.
type Repository[T any] struct {
	root   string
	limits Limits
	write  atomicWriteFunc
}

// Snapshot is a defensive, versioned view used for optimistic commits.
type Snapshot[T any] struct {
	Version             uint64
	Drafts              []contract.PlanDraft[T]
	Revisions           []contract.PlanRevision[T]
	RecoveredFromBackup bool
}

// ChangeSet applies all saves and deletions as one local transaction.
type ChangeSet[T any] struct {
	Drafts      []contract.PlanDraft[T]
	Revisions   []contract.PlanRevision[T]
	DeletePlans []contract.PlanID
}

// CommitResult reports the new snapshot and effective plan deletions.
type CommitResult[T any] struct {
	Snapshot[T]
	DeletedPlans int
}

type diskEnvelope struct {
	RepositoryVersion string            `json:"repositoryVersion"`
	HashAlgorithm     string            `json:"hashAlgorithm"`
	Generation        uint64            `json:"generation"`
	Drafts            []json.RawMessage `json:"drafts"`
	Revisions         []json.RawMessage `json:"revisions"`
	ContentHash       string            `json:"contentHash"`
}

type repositoryHashInput struct {
	RepositoryVersion string            `json:"repositoryVersion"`
	HashAlgorithm     string            `json:"hashAlgorithm"`
	Generation        uint64            `json:"generation"`
	Drafts            []json.RawMessage `json:"drafts"`
	Revisions         []json.RawMessage `json:"revisions"`
}

type repositoryState[T any] struct {
	generation uint64
	drafts     []contract.PlanDraft[T]
	revisions  []contract.PlanRevision[T]
}

// Open prepares a private repository root without creating an empty state.
func Open[T any](root string, options Options) (*Repository[T], error) {
	if root == "" {
		return nil, fmt.Errorf("strategy repository root is required")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve strategy repository root: %w", err)
	}
	limits := options.Limits
	if limits == (Limits{}) {
		limits = DefaultLimits()
	}
	if err := limits.validate(); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absolute, 0o700); err != nil {
		return nil, fmt.Errorf("create strategy repository root: %w", err)
	}
	info, err := os.Stat(absolute)
	if err != nil {
		return nil, fmt.Errorf("inspect strategy repository root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("strategy repository root is not a directory")
	}
	return &Repository[T]{root: filepath.Clean(absolute), limits: limits, write: writeAtomic}, nil
}

func (repository *Repository[T]) statePath() string {
	return filepath.Join(repository.root, stateFileName)
}

func (repository *Repository[T]) Snapshot(ctx context.Context) (Snapshot[T], error) {
	if err := contextError(ctx); err != nil {
		return Snapshot[T]{}, err
	}
	lease, err := acquireRepositoryLease(filepath.Join(repository.root, leaseFileName))
	if err != nil {
		return Snapshot[T]{}, err
	}
	defer lease.Close()
	if err := cleanupOrphanedTemps(repository.root); err != nil {
		return Snapshot[T]{}, err
	}
	state, recovered, _, err := repository.loadLocked()
	if err != nil {
		return Snapshot[T]{}, err
	}
	if err := contextError(ctx); err != nil {
		return Snapshot[T]{}, err
	}
	return snapshotFromState(state, recovered)
}

func (repository *Repository[T]) Commit(ctx context.Context, expectedVersion uint64, changes ChangeSet[T]) (CommitResult[T], error) {
	if err := contextError(ctx); err != nil {
		return CommitResult[T]{}, err
	}
	lease, err := acquireRepositoryLease(filepath.Join(repository.root, leaseFileName))
	if err != nil {
		return CommitResult[T]{}, err
	}
	defer lease.Close()
	if err := cleanupOrphanedTemps(repository.root); err != nil {
		return CommitResult[T]{}, err
	}

	current, _, currentBytes, err := repository.loadLocked()
	if err != nil {
		return CommitResult[T]{}, err
	}
	if current.generation != expectedVersion {
		return CommitResult[T]{}, fmt.Errorf("%w: expected %d, current %d", ErrStaleWrite, expectedVersion, current.generation)
	}
	if current.generation >= maxSafeGeneration {
		return CommitResult[T]{}, fmt.Errorf("%w: repository generation exhausted", ErrLimitExceeded)
	}

	next, err := cloneState(current)
	if err != nil {
		return CommitResult[T]{}, err
	}
	deleted, changed, err := repository.applyChanges(&next, changes)
	if err != nil {
		return CommitResult[T]{}, err
	}
	if !changed {
		snapshot, err := snapshotFromState(next, false)
		return CommitResult[T]{Snapshot: snapshot}, err
	}
	next.generation++
	encoded, err := repository.encodeState(next)
	if err != nil {
		return CommitResult[T]{}, err
	}
	if err := contextError(ctx); err != nil {
		return CommitResult[T]{}, err
	}
	firstCommit := len(currentBytes) == 0
	backupBytes := currentBytes
	if firstCommit {
		// The first durable generation is its own recovery point. Writing it to
		// the backup first means a crash before the primary replace can never be
		// mistaken for a genuinely new generation-zero repository.
		backupBytes = encoded
	}
	backupReplaced, err := repository.write(filepath.Join(repository.root, backupFileName), backupBytes)
	if err != nil {
		if firstCommit && backupReplaced {
			return CommitResult[T]{}, &CommitUncertainError{Version: next.generation, Cause: err}
		}
		return CommitResult[T]{}, fmt.Errorf("write strategy repository backup: %w", err)
	}
	replaced, err := repository.write(repository.statePath(), encoded)
	if err != nil && (replaced || firstCommit) {
		return CommitResult[T]{}, &CommitUncertainError{Version: next.generation, Cause: err}
	}
	if err != nil {
		return CommitResult[T]{}, fmt.Errorf("commit strategy repository: %w", err)
	}
	snapshot, err := snapshotFromState(next, false)
	if err != nil {
		return CommitResult[T]{}, err
	}
	return CommitResult[T]{Snapshot: snapshot, DeletedPlans: deleted}, nil
}

func (repository *Repository[T]) loadLocked() (repositoryState[T], bool, []byte, error) {
	primary, primaryErr := repository.readFile(repository.statePath())
	if primaryErr == nil {
		state, err := repository.decodeState(primary)
		if err == nil {
			return state, false, primary, nil
		}
		if !errors.Is(err, ErrCorruptRepository) {
			return repositoryState[T]{}, false, nil, err
		}
		primaryErr = err
	} else if errors.Is(primaryErr, os.ErrNotExist) {
		_, backupErr := repository.readFile(filepath.Join(repository.root, backupFileName))
		if errors.Is(backupErr, os.ErrNotExist) {
			return repositoryState[T]{}, false, nil, nil
		}
		if backupErr != nil {
			return repositoryState[T]{}, false, nil, backupErr
		}
	} else {
		return repositoryState[T]{}, false, nil, primaryErr
	}

	backup, backupErr := repository.readFile(filepath.Join(repository.root, backupFileName))
	if backupErr != nil {
		if errors.Is(backupErr, os.ErrNotExist) {
			return repositoryState[T]{}, false, nil, fmt.Errorf("%w: primary: %v; backup: %v", ErrCorruptRepository, primaryErr, backupErr)
		}
		return repositoryState[T]{}, false, nil, backupErr
	}
	state, decodeErr := repository.decodeState(backup)
	if decodeErr != nil {
		if !errors.Is(decodeErr, ErrCorruptRepository) {
			return repositoryState[T]{}, false, nil, decodeErr
		}
		return repositoryState[T]{}, false, nil, fmt.Errorf("%w: primary: %v; backup: %v", ErrCorruptRepository, primaryErr, decodeErr)
	}
	if _, err := repository.write(repository.statePath(), backup); err != nil {
		return repositoryState[T]{}, false, nil, fmt.Errorf("restore strategy repository backup: %w", err)
	}
	return state, true, backup, nil
}

func (repository *Repository[T]) readFile(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("%w: repository state is not a regular file", ErrCorruptRepository)
	}
	if info.Size() > repository.limits.MaxRepositoryBytes {
		return nil, fmt.Errorf("%w: repository file is %d bytes", ErrLimitExceeded, info.Size())
	}
	data, err := io.ReadAll(io.LimitReader(file, repository.limits.MaxRepositoryBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > repository.limits.MaxRepositoryBytes {
		return nil, fmt.Errorf("%w: repository grew while reading", ErrLimitExceeded)
	}
	return data, nil
}

func (repository *Repository[T]) decodeState(data []byte) (repositoryState[T], error) {
	migrated, _, err := MigrateRepositoryJSON(data)
	if err != nil {
		return repositoryState[T]{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(migrated))
	decoder.DisallowUnknownFields()
	var envelope diskEnvelope
	if err := decoder.Decode(&envelope); err != nil {
		return repositoryState[T]{}, fmt.Errorf("%w: decode envelope: %v", ErrCorruptRepository, err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return repositoryState[T]{}, fmt.Errorf("%w: %v", ErrCorruptRepository, err)
	}
	if envelope.RepositoryVersion != RepositoryVersion {
		return repositoryState[T]{}, fmt.Errorf("%w: %q", ErrUnsupportedRepositoryVersion, envelope.RepositoryVersion)
	}
	if envelope.HashAlgorithm != repositoryHashV1 {
		return repositoryState[T]{}, fmt.Errorf("%w: unsupported repository hash algorithm", ErrCorruptRepository)
	}
	wantHash, err := hashEnvelope(envelope)
	if err != nil {
		return repositoryState[T]{}, err
	}
	if envelope.ContentHash != wantHash {
		return repositoryState[T]{}, fmt.Errorf("%w: repository content hash mismatch", ErrCorruptRepository)
	}
	if envelope.Generation > maxSafeGeneration {
		return repositoryState[T]{}, fmt.Errorf("%w: generation exceeds shared integer range", ErrCorruptRepository)
	}
	if len(envelope.Drafts) > repository.limits.MaxDrafts || len(envelope.Revisions) > repository.limits.MaxRevisions {
		return repositoryState[T]{}, fmt.Errorf("%w: persisted document count exceeds configured limits", ErrLimitExceeded)
	}
	state := repositoryState[T]{generation: envelope.Generation}
	for _, raw := range envelope.Drafts {
		if len(raw) > repository.limits.MaxDocumentBytes {
			return repositoryState[T]{}, fmt.Errorf("%w: draft document exceeds configured limit", ErrLimitExceeded)
		}
		migratedDraft, _, err := contract.MigrateContractJSON(raw)
		if err != nil {
			if contract.HasErrorCode(err, contract.ErrorUnsupportedVersion) {
				return repositoryState[T]{}, err
			}
			return repositoryState[T]{}, fmt.Errorf("%w: migrate draft: %v", ErrCorruptRepository, err)
		}
		var draft contract.PlanDraft[T]
		decoder := json.NewDecoder(bytes.NewReader(migratedDraft))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&draft); err != nil {
			return repositoryState[T]{}, fmt.Errorf("%w: decode draft: %v", ErrCorruptRepository, err)
		}
		if err := ensureJSONEOF(decoder); err != nil {
			return repositoryState[T]{}, fmt.Errorf("%w: decode draft: %v", ErrCorruptRepository, err)
		}
		if err := draft.Validate(); err != nil {
			return repositoryState[T]{}, fmt.Errorf("%w: validate draft: %v", ErrCorruptRepository, err)
		}
		state.drafts = append(state.drafts, draft)
	}
	for _, raw := range envelope.Revisions {
		if len(raw) > repository.limits.MaxDocumentBytes {
			return repositoryState[T]{}, fmt.Errorf("%w: revision document exceeds configured limit", ErrLimitExceeded)
		}
		revision, err := contract.DecodePlanRevision[T](raw)
		if err != nil {
			if contract.HasErrorCode(err, contract.ErrorUnsupportedVersion) {
				return repositoryState[T]{}, err
			}
			return repositoryState[T]{}, fmt.Errorf("%w: decode revision: %v", ErrCorruptRepository, err)
		}
		state.revisions = append(state.revisions, revision)
	}
	if err := validateUniqueState(state); err != nil {
		return repositoryState[T]{}, err
	}
	sortState(&state)
	return state, nil
}

func (repository *Repository[T]) encodeState(state repositoryState[T]) ([]byte, error) {
	if len(state.drafts) > repository.limits.MaxDrafts || len(state.revisions) > repository.limits.MaxRevisions {
		return nil, fmt.Errorf("%w: document count exceeds configured limits", ErrLimitExceeded)
	}
	envelope := diskEnvelope{RepositoryVersion: RepositoryVersion, HashAlgorithm: repositoryHashV1, Generation: state.generation}
	for _, draft := range state.drafts {
		if err := draft.Validate(); err != nil {
			return nil, fmt.Errorf("validate draft before persistence: %w", err)
		}
		raw, err := json.Marshal(draft)
		if err != nil {
			return nil, fmt.Errorf("encode strategy draft: %w", err)
		}
		if len(raw) > repository.limits.MaxDocumentBytes {
			return nil, fmt.Errorf("%w: draft document exceeds configured limit", ErrLimitExceeded)
		}
		envelope.Drafts = append(envelope.Drafts, raw)
	}
	for _, revision := range state.revisions {
		raw, err := json.Marshal(revision)
		if err != nil {
			return nil, fmt.Errorf("encode strategy revision: %w", err)
		}
		if len(raw) > repository.limits.MaxDocumentBytes {
			return nil, fmt.Errorf("%w: revision document exceeds configured limit", ErrLimitExceeded)
		}
		envelope.Revisions = append(envelope.Revisions, raw)
	}
	var err error
	envelope.ContentHash, err = hashEnvelope(envelope)
	if err != nil {
		return nil, err
	}
	encoded, err := json.MarshalIndent(envelope, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode strategy repository: %w", err)
	}
	encoded = append(encoded, '\n')
	if int64(len(encoded)) > repository.limits.MaxRepositoryBytes {
		return nil, fmt.Errorf("%w: encoded repository is %d bytes", ErrLimitExceeded, len(encoded))
	}
	return encoded, nil
}

func hashEnvelope(envelope diskEnvelope) (string, error) {
	input := repositoryHashInput{
		RepositoryVersion: envelope.RepositoryVersion,
		HashAlgorithm:     envelope.HashAlgorithm,
		Generation:        envelope.Generation,
		Drafts:            envelope.Drafts,
		Revisions:         envelope.Revisions,
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return "", fmt.Errorf("hash strategy repository: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return fmt.Sprintf("%x", digest), nil
}

func (repository *Repository[T]) applyChanges(state *repositoryState[T], changes ChangeSet[T]) (int, bool, error) {
	deleteSet := make(map[contract.PlanID]struct{}, len(changes.DeletePlans))
	for _, planID := range changes.DeletePlans {
		if planID == "" {
			return 0, false, fmt.Errorf("delete plan ID is required")
		}
		deleteSet[planID] = struct{}{}
	}
	for _, draft := range changes.Drafts {
		if _, conflict := deleteSet[draft.PlanID]; conflict {
			return 0, false, fmt.Errorf("cannot delete and save plan %q in one change set", draft.PlanID)
		}
	}
	for _, revision := range changes.Revisions {
		if _, conflict := deleteSet[revision.Metadata().PlanID]; conflict {
			return 0, false, fmt.Errorf("cannot delete and save plan %q in one change set", revision.Metadata().PlanID)
		}
	}

	deletedPlans := 0
	for planID := range deleteSet {
		beforeDrafts, beforeRevisions := len(state.drafts), len(state.revisions)
		state.drafts = removeDraftsForPlan(state.drafts, planID)
		state.revisions = removeRevisionsForPlan(state.revisions, planID)
		if len(state.drafts) != beforeDrafts || len(state.revisions) != beforeRevisions {
			deletedPlans++
		}
	}
	changed := deletedPlans > 0
	for _, draft := range changes.Drafts {
		if err := draft.Validate(); err != nil {
			return 0, false, err
		}
		clone, err := cloneDraft(draft)
		if err != nil {
			return 0, false, err
		}
		replaced := false
		for index := range state.drafts {
			if state.drafts[index].DraftID != draft.DraftID {
				continue
			}
			if state.drafts[index].PlanID != draft.PlanID || state.drafts[index].VariantID != draft.VariantID {
				return 0, false, fmt.Errorf("draft %q belongs to another plan variant", draft.DraftID)
			}
			state.drafts[index] = clone
			replaced = true
			changed = true
			break
		}
		if !replaced {
			state.drafts = append(state.drafts, clone)
			changed = true
		}
	}
	for _, revision := range changes.Revisions {
		raw, err := json.Marshal(revision)
		if err != nil {
			return 0, false, fmt.Errorf("encode strategy revision: %w", err)
		}
		clone, err := contract.DecodePlanRevision[T](raw)
		if err != nil {
			return 0, false, err
		}
		metadata := clone.Metadata()
		alreadyStored := false
		for _, existing := range state.revisions {
			existingMetadata := existing.Metadata()
			if existingMetadata.PlanID == metadata.PlanID && existingMetadata.VariantID == metadata.VariantID && existingMetadata.RevisionID == metadata.RevisionID {
				if existingMetadata.ContentHash != metadata.ContentHash {
					return 0, false, fmt.Errorf("%w: %s/%s/%s", ErrImmutableRevision, metadata.PlanID, metadata.VariantID, metadata.RevisionID)
				}
				alreadyStored = true
				break
			}
		}
		if !alreadyStored {
			state.revisions = append(state.revisions, clone)
			changed = true
		}
	}
	if err := validateUniqueState(*state); err != nil {
		return 0, false, err
	}
	sortState(state)
	return deletedPlans, changed, nil
}

func snapshotFromState[T any](state repositoryState[T], recovered bool) (Snapshot[T], error) {
	clone, err := cloneState(state)
	if err != nil {
		return Snapshot[T]{}, err
	}
	return Snapshot[T]{
		Version:             clone.generation,
		Drafts:              clone.drafts,
		Revisions:           clone.revisions,
		RecoveredFromBackup: recovered,
	}, nil
}

func cloneState[T any](state repositoryState[T]) (repositoryState[T], error) {
	clone := repositoryState[T]{generation: state.generation}
	for _, draft := range state.drafts {
		copied, err := cloneDraft(draft)
		if err != nil {
			return repositoryState[T]{}, err
		}
		clone.drafts = append(clone.drafts, copied)
	}
	for _, revision := range state.revisions {
		raw, err := json.Marshal(revision)
		if err != nil {
			return repositoryState[T]{}, fmt.Errorf("clone strategy revision: %w", err)
		}
		copied, err := contract.DecodePlanRevision[T](raw)
		if err != nil {
			return repositoryState[T]{}, fmt.Errorf("clone strategy revision: %w", err)
		}
		clone.revisions = append(clone.revisions, copied)
	}
	return clone, nil
}

func cloneDraft[T any](draft contract.PlanDraft[T]) (contract.PlanDraft[T], error) {
	raw, err := json.Marshal(draft)
	if err != nil {
		return contract.PlanDraft[T]{}, fmt.Errorf("clone strategy draft: %w", err)
	}
	var clone contract.PlanDraft[T]
	if err := json.Unmarshal(raw, &clone); err != nil {
		return contract.PlanDraft[T]{}, fmt.Errorf("clone strategy draft: %w", err)
	}
	return clone, nil
}

func validateUniqueState[T any](state repositoryState[T]) error {
	draftIDs := make(map[contract.DraftID]struct{}, len(state.drafts))
	for _, draft := range state.drafts {
		if _, exists := draftIDs[draft.DraftID]; exists {
			return fmt.Errorf("%w: duplicate draft %q", ErrCorruptRepository, draft.DraftID)
		}
		draftIDs[draft.DraftID] = struct{}{}
	}
	revisionIDs := make(map[string]struct{}, len(state.revisions))
	for _, revision := range state.revisions {
		metadata := revision.Metadata()
		key := string(metadata.PlanID) + "\x00" + string(metadata.VariantID) + "\x00" + string(metadata.RevisionID)
		if _, exists := revisionIDs[key]; exists {
			return fmt.Errorf("%w: duplicate revision %s/%s/%s", ErrCorruptRepository, metadata.PlanID, metadata.VariantID, metadata.RevisionID)
		}
		revisionIDs[key] = struct{}{}
	}
	return nil
}

func sortState[T any](state *repositoryState[T]) {
	sort.Slice(state.drafts, func(left, right int) bool {
		return state.drafts[left].DraftID < state.drafts[right].DraftID
	})
	sort.Slice(state.revisions, func(left, right int) bool {
		leftMetadata := state.revisions[left].Metadata()
		rightMetadata := state.revisions[right].Metadata()
		if leftMetadata.PlanID != rightMetadata.PlanID {
			return leftMetadata.PlanID < rightMetadata.PlanID
		}
		if leftMetadata.VariantID != rightMetadata.VariantID {
			return leftMetadata.VariantID < rightMetadata.VariantID
		}
		return leftMetadata.RevisionID < rightMetadata.RevisionID
	})
}

func removeDraftsForPlan[T any](drafts []contract.PlanDraft[T], planID contract.PlanID) []contract.PlanDraft[T] {
	result := drafts[:0]
	for _, draft := range drafts {
		if draft.PlanID != planID {
			result = append(result, draft)
		}
	}
	return result
}

func removeRevisionsForPlan[T any](revisions []contract.PlanRevision[T], planID contract.PlanID) []contract.PlanRevision[T] {
	result := revisions[:0]
	for _, revision := range revisions {
		if revision.Metadata().PlanID != planID {
			result = append(result, revision)
		}
	}
	return result
}

func ensureJSONEOF(decoder *json.Decoder) error {
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("repository document contains trailing data")
	}
	return nil
}

func contextError(ctx context.Context) error {
	if ctx == nil {
		return fmt.Errorf("strategy repository context is required")
	}
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("strategy repository operation canceled: %w", err)
	}
	return nil
}
