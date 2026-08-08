package application

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

type testPayload struct {
	Laps int `json:"laps"`
}

func TestServiceCreateSaveAndRetryAreIdempotent(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)

	created, err := service.Create(context.Background(), CreateCommand[testPayload]{
		CommandHeader: commandHeader("create-1", OperationCreate, 0),
		Draft:         draft,
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.RepositoryVersion != 1 || created.Draft == nil || created.SavedDraft == nil {
		t.Fatalf("created = %#v", created)
	}

	retried, err := service.Create(context.Background(), CreateCommand[testPayload]{
		CommandHeader: commandHeader("create-1", OperationCreate, 0),
		Draft:         draft,
	})
	if err != nil {
		t.Fatalf("retry create: %v", err)
	}
	if retried.RepositoryVersion != 1 {
		t.Fatalf("retry bumped repository to %d", retried.RepositoryVersion)
	}

	edited := draft
	edited.Payload.Laps = 12
	edited.UpdatedAt = canonicalTime(2)
	saved, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-1", OperationSaveRevision, 1),
		Draft:         edited,
		RevisionID:    "revision-1",
		CreatedAt:     canonicalTime(3),
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.RepositoryVersion != 2 || saved.Revision == nil || saved.SavedDraft == nil {
		t.Fatalf("saved = %#v", saved)
	}
	if saved.SavedDraft.BaseRevision == nil || *saved.SavedDraft.BaseRevision != saved.Revision.Ref() {
		t.Fatalf("saved draft base = %#v, revision = %#v", saved.SavedDraft.BaseRevision, saved.Revision.Ref())
	}

	retriedSave, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-1", OperationSaveRevision, 1),
		Draft:         edited,
		RevisionID:    "revision-1",
		CreatedAt:     canonicalTime(3),
	})
	if err != nil {
		t.Fatalf("retry save: %v", err)
	}
	if retriedSave.RepositoryVersion != 2 {
		t.Fatalf("retry save bumped repository to %d", retriedSave.RepositoryVersion)
	}
}

func TestServiceRejectsStaleDifferentSave(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create", OperationCreate, 0), Draft: draft}); err != nil {
		t.Fatal(err)
	}

	first := draft
	first.Payload.Laps = 11
	first.UpdatedAt = canonicalTime(2)
	if _, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{CommandHeader: commandHeader("save-a", OperationSaveRevision, 1), Draft: first, RevisionID: "revision-a", CreatedAt: canonicalTime(3)}); err != nil {
		t.Fatal(err)
	}

	stale := draft
	stale.Payload.Laps = 99
	stale.UpdatedAt = canonicalTime(2)
	_, err = service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{CommandHeader: commandHeader("save-b", OperationSaveRevision, 1), Draft: stale, RevisionID: "revision-b", CreatedAt: canonicalTime(3)})
	if !errors.Is(err, ErrStaleCommand) {
		t.Fatalf("stale save = %v, want ErrStaleCommand", err)
	}
}

func TestServiceCreateDoesNotOverwriteAnExistingDraft(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create-a", OperationCreate, 0), Draft: draft}); err != nil {
		t.Fatal(err)
	}
	conflict := draft
	conflict.Payload.Laps = 99
	conflict.UpdatedAt = canonicalTime(2)
	_, err = service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create-b", OperationCreate, 1), Draft: conflict})
	if !errors.Is(err, ErrDraftConflict) {
		t.Fatalf("conflicting create = %v, want ErrDraftConflict", err)
	}
	restored, err := service.Open(context.Background(), OpenCommand{CommandHeader: commandHeader("open", OperationOpen, 0), DraftID: draft.DraftID})
	if err != nil || restored.Draft.Payload.Laps != 10 {
		t.Fatalf("persisted = %#v, err=%v", restored.Draft, err)
	}
}

func TestServiceDuplicateAndRetryAreIdempotent(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create", OperationCreate, 0), Draft: draft}); err != nil {
		t.Fatal(err)
	}
	command := DuplicateCommand[testPayload]{
		CommandHeader:   commandHeader("duplicate-1", OperationDuplicate, 1),
		SourceDraft:     draft,
		TargetDraftID:   "draft-2",
		TargetPlanID:    "plan-2",
		TargetVariantID: "variant-1",
		Name:            "Copy",
		UpdatedAt:       canonicalTime(2),
	}
	created, err := service.Duplicate(context.Background(), command)
	if err != nil || created.RepositoryVersion != 2 || created.Draft.PlanID != "plan-2" {
		t.Fatalf("duplicate = %#v, err=%v", created, err)
	}
	retried, err := service.Duplicate(context.Background(), command)
	if err != nil || retried.RepositoryVersion != 2 {
		t.Fatalf("retry duplicate = %#v, err=%v", retried, err)
	}
}

func TestServiceDuplicatesUnsavedContentWithoutMutatingTheSource(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create", OperationCreate, 0), Draft: draft}); err != nil {
		t.Fatal(err)
	}

	unsaved := draft
	unsaved.Payload.Laps = 15
	unsaved.UpdatedAt = canonicalTime(2)
	duplicated, err := service.Duplicate(context.Background(), DuplicateCommand[testPayload]{
		CommandHeader:   commandHeader("duplicate", OperationDuplicate, 1),
		SourceDraft:     unsaved,
		TargetDraftID:   "draft-2",
		TargetPlanID:    "plan-2",
		TargetVariantID: "variant-2",
		Name:            "Unsaved copy",
		UpdatedAt:       canonicalTime(3),
	})
	if err != nil || duplicated.Draft == nil || duplicated.Draft.Payload.Laps != 15 {
		t.Fatalf("duplicate unsaved = %#v, err=%v", duplicated.Draft, err)
	}
	original, err := service.Open(context.Background(), OpenCommand{CommandHeader: commandHeader("open", OperationOpen, 0), DraftID: draft.DraftID})
	if err != nil || original.Draft == nil || original.Draft.Payload.Laps != 10 {
		t.Fatalf("original = %#v, err=%v", original.Draft, err)
	}
}

type uncertainRepository[T any] struct {
	snapshot repository.Snapshot[T]
}

func (repo *uncertainRepository[T]) Snapshot(context.Context) (repository.Snapshot[T], error) {
	return repo.snapshot, nil
}

func (repo *uncertainRepository[T]) Commit(_ context.Context, _ uint64, changes repository.ChangeSet[T]) (repository.CommitResult[T], error) {
	repo.snapshot.Version++
	repo.snapshot.Drafts = append(repo.snapshot.Drafts, changes.Drafts...)
	repo.snapshot.Revisions = append(repo.snapshot.Revisions, changes.Revisions...)
	return repository.CommitResult[T]{}, &repository.CommitUncertainError{Version: repo.snapshot.Version, Cause: errors.New("directory sync failed")}
}

func TestServiceReconcilesAnUncertainCommitWithoutRetrying(t *testing.T) {
	repo := &uncertainRepository[testPayload]{}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	result, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create", OperationCreate, 0), Draft: draft})
	if err != nil {
		t.Fatal(err)
	}
	if result.RepositoryVersion != 1 || result.Draft == nil {
		t.Fatalf("reconciled = %#v", result)
	}
}

func TestServiceConcurrentDifferentCommandsNeverOverwrite(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create", OperationCreate, 0), Draft: draft}); err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for index := 0; index < 2; index++ {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			candidate := draft
			candidate.Payload.Laps = 11 + index
			candidate.UpdatedAt = canonicalTime(2)
			_, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
				CommandHeader: commandHeader(CommandID("save-"+string(rune('a'+index))), OperationSaveRevision, 1),
				Draft:         candidate,
				RevisionID:    contract.RevisionID("revision-" + string(rune('a'+index))),
				CreatedAt:     canonicalTime(3),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	var successes, conflicts int
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrStaleCommand), errors.Is(err, repository.ErrWriteInProgress):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent error: %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("successes=%d conflicts=%d", successes, conflicts)
	}
}

func TestServiceActivateDeactivateAndRestore(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create", OperationCreate, 0), Draft: draft}); err != nil {
		t.Fatal(err)
	}
	saved, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{CommandHeader: commandHeader("save", OperationSaveRevision, 1), Draft: draft, RevisionID: "revision-1", CreatedAt: canonicalTime(2)})
	if err != nil {
		t.Fatal(err)
	}

	activated, err := service.Activate(context.Background(), ActivateCommand{
		CommandHeader: commandHeader("activate", OperationActivate, 2),
		Revision:      saved.Revision.Ref(),
		ActivationID:  "activation-1",
		ActivatedAt:   canonicalTime(3),
	})
	if err != nil {
		t.Fatal(err)
	}
	if activated.ActivePlan == nil || activated.ActivePlan.Revision != saved.Revision.Ref() {
		t.Fatalf("active = %#v", activated.ActivePlan)
	}

	retry, err := service.Activate(context.Background(), ActivateCommand{
		CommandHeader: commandHeader("activate", OperationActivate, 2),
		Revision:      saved.Revision.Ref(),
		ActivationID:  "activation-1",
		ActivatedAt:   canonicalTime(3),
		Current:       activated.ActivePlan,
	})
	if err != nil || retry.ActivePlan == nil || *retry.ActivePlan != *activated.ActivePlan {
		t.Fatalf("retry active = %#v, err=%v", retry.ActivePlan, err)
	}

	// Activation is durable now, so it advances the repository like any other
	// write, and deactivating has to name the version it left behind.
	deactivated, err := service.Deactivate(context.Background(), DeactivateCommand{
		CommandHeader:        commandHeader("deactivate", OperationDeactivate, activated.RepositoryVersion),
		Current:              activated.ActivePlan,
		ExpectedActivationID: "activation-1",
	})
	if err != nil || deactivated.ActivePlan != nil {
		t.Fatalf("deactivate = %#v, err=%v", deactivated.ActivePlan, err)
	}
	if _, err := service.Deactivate(context.Background(), DeactivateCommand{
		CommandHeader:        commandHeader("deactivate", OperationDeactivate, deactivated.RepositoryVersion),
		ExpectedActivationID: "activation-1",
	}); err != nil {
		t.Fatalf("retry deactivate: %v", err)
	}

	restored, err := service.Restore(context.Background(), RestoreCommand{CommandHeader: commandHeader("restore", OperationRestore, 0), DraftID: "draft-1"})
	if err != nil || restored.Draft == nil || restored.Draft.Payload.Laps != 10 {
		t.Fatalf("restore = %#v, err=%v", restored.Draft, err)
	}
}

func TestServiceEditAndCloseDoNotPersistTransientDraft(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	saved := validDraft("draft-1", "plan-1", 10)
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{CommandHeader: commandHeader("create", OperationCreate, 0), Draft: saved}); err != nil {
		t.Fatal(err)
	}
	edited := saved
	edited.Payload.Laps = 20
	edited.UpdatedAt = canonicalTime(2)

	result, err := service.Edit(context.Background(), EditCommand[testPayload]{CommandHeader: commandHeader("edit", OperationEdit, 1), Draft: edited})
	if err != nil || result.Draft == nil || result.Draft.Payload.Laps != 20 {
		t.Fatalf("edit = %#v, err=%v", result.Draft, err)
	}
	open, err := service.Open(context.Background(), OpenCommand{CommandHeader: commandHeader("open", OperationOpen, 0), DraftID: "draft-1"})
	if err != nil || open.Draft.Payload.Laps != 10 {
		t.Fatalf("persisted draft changed = %#v, err=%v", open.Draft, err)
	}

	_, err = service.Close(context.Background(), CloseCommand[testPayload]{CommandHeader: commandHeader("close", OperationClose, 1), Draft: edited, SavedDraft: saved})
	if !errors.Is(err, ErrUnsavedChanges) {
		t.Fatalf("close dirty = %v, want ErrUnsavedChanges", err)
	}
	closed, err := service.Close(context.Background(), CloseCommand[testPayload]{CommandHeader: commandHeader("close", OperationClose, 1), Draft: edited, SavedDraft: saved, Discard: true})
	if err != nil || !closed.Closed {
		t.Fatalf("discard close = %#v, err=%v", closed, err)
	}
}

func TestJSONBridgeRejectsUnknownProtocolAndTrailingFields(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	bridge := NewJSONBridge(NewService[testPayload](repo))

	for _, document := range []string{
		`{"protocolVersion":"strategy.application.v2","commandId":"open","operation":"open","draftId":"draft-1"}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"open","operation":"open","draftId":"draft-1"}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"open","commandId":"other","operation":"open","expectedRepositoryVersion":0,"draftId":"draft-1"}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"open","operation":"open","draftId":"draft-1","future":true}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"open","operation":"open","draftId":"draft-1"} trailing`,
	} {
		if _, err := bridge.Execute(context.Background(), []byte(document)); err == nil {
			t.Fatalf("Execute(%q) accepted", document)
		}
	}
}

func TestJSONBridgeDispatchesFlatVersionedCommand(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	bridge := NewJSONBridge(NewService[testPayload](repo))
	draft := validDraft("draft-1", "plan-1", 10)
	document, err := json.Marshal(CreateCommand[testPayload]{
		CommandHeader: commandHeader("create-1", OperationCreate, 0),
		Draft:         draft,
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(document) == "" || !json.Valid(document) {
		t.Fatalf("invalid command JSON: %s", document)
	}

	response, err := bridge.Execute(context.Background(), document)
	if err != nil {
		t.Fatal(err)
	}
	var result Result[testPayload]
	if err := json.Unmarshal(response, &result); err != nil {
		t.Fatal(err)
	}
	if result.ProtocolVersion != ProtocolVersionV1 || result.CommandID != "create-1" || result.RepositoryVersion != 1 {
		t.Fatalf("result = %#v", result)
	}
}

func TestJSONBridgeRequiresEveryOperationFieldBeforeDispatch(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	bridge := NewJSONBridge(NewService[testPayload](repo))
	documents := []string{
		`{"protocolVersion":"strategy.application.v1","commandId":"create","operation":"create","expectedRepositoryVersion":0}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"open","operation":"open","expectedRepositoryVersion":0}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"edit","operation":"edit","expectedRepositoryVersion":0}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"save","operation":"save_revision","expectedRepositoryVersion":0,"draft":{}}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"duplicate","operation":"duplicate","expectedRepositoryVersion":0,"sourceDraft":{}}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"activate","operation":"activate","expectedRepositoryVersion":0,"revision":{}}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"deactivate","operation":"deactivate","expectedRepositoryVersion":0}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"restore","operation":"restore","expectedRepositoryVersion":0}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"close","operation":"close","expectedRepositoryVersion":0,"draft":{},"savedDraft":{}}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"close-null","operation":"close","expectedRepositoryVersion":0,"draft":{},"savedDraft":{},"discard":null}`,
	}
	for _, document := range documents {
		if _, err := bridge.Execute(context.Background(), []byte(document)); !errors.Is(err, ErrInvalidCommand) {
			t.Fatalf("Execute(%s) = %v, want ErrInvalidCommand", document, err)
		}
	}
}

func TestJSONBridgeValidatesSemanticsBeforeIdempotentShortcuts(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	bridge := NewJSONBridge(NewService[testPayload](repo))
	documents := []string{
		`{"protocolVersion":"strategy.application.v1","commandId":"activate","operation":"activate","expectedRepositoryVersion":0,"revision":{"planId":"plan-1","variantId":"variant-1","revisionId":"revision-1","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"activationId":"activation-1","activatedAt":"2026-08-02T00:00:01Z","current":{"contractVersion":"strategy.future","activationId":"activation-1","revision":{"planId":"plan-1","variantId":"variant-1","revisionId":"revision-1","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"activatedAt":"2026-08-02T00:00:01Z"}}`,
		`{"protocolVersion":"strategy.application.v1","commandId":"deactivate","operation":"deactivate","expectedRepositoryVersion":0,"expectedActivationId":"invalid id"}`,
	}
	for _, document := range documents {
		if _, err := bridge.Execute(context.Background(), []byte(document)); err == nil {
			t.Fatalf("Execute(%s) accepted invalid semantics", document)
		}
	}
}

func TestJSONBridgeBoundsDocumentDepthAndContainerItems(t *testing.T) {
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	bridge := NewJSONBridge(NewService[testPayload](repo))
	documents := [][]byte{
		make([]byte, contract.MaxCanonicalJSONBytes+1),
		[]byte(strings.Repeat("[", contract.MaxCanonicalDepth+1) + "0" + strings.Repeat("]", contract.MaxCanonicalDepth+1)),
		[]byte("[" + strings.Repeat("0,", contract.MaxCanonicalContainerItems) + "0]"),
	}
	for index, document := range documents {
		if _, err := bridge.Execute(context.Background(), document); !errors.Is(err, ErrInvalidCommand) {
			t.Fatalf("document %d = %v, want ErrInvalidCommand", index, err)
		}
	}
}

func commandHeader(id CommandID, operation Operation, version uint64) CommandHeader {
	return CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: id, Operation: operation, ExpectedRepositoryVersion: version}
}

func validDraft(draftID contract.DraftID, planID contract.PlanID, laps int) contract.PlanDraft[testPayload] {
	return contract.PlanDraft[testPayload]{
		ContractVersion: contract.CurrentVersion,
		DraftID:         draftID,
		PlanID:          planID,
		VariantID:       "variant-1",
		Name:            "Race plan",
		Mode:            contract.PlanModeManual,
		Capabilities:    []contract.Capability{contract.CapabilityManualInputs},
		Provenance:      contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "user"},
		Confidence:      contract.Confidence{Level: contract.ConfidenceHigh, Basis: "manual input"},
		UpdatedAt:       canonicalTime(1),
		Payload:         testPayload{Laps: laps},
	}
}

func canonicalTime(second int) time.Time {
	return time.Date(2026, 8, 2, 0, 0, second, 0, time.UTC)
}

func jsonEqual(t *testing.T, left, right any) bool {
	t.Helper()
	leftJSON, err := json.Marshal(left)
	if err != nil {
		t.Fatal(err)
	}
	rightJSON, err := json.Marshal(right)
	if err != nil {
		t.Fatal(err)
	}
	return string(leftJSON) == string(rightJSON)
}
