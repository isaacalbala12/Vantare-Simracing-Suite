package application

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

// equalActivePlan compares two ActivePlan values by content, handling the
// PreviousRevision pointer field correctly.
func equalActivePlan(left, right contract.ActivePlan) bool {
	if left.ContractVersion != right.ContractVersion {
		return false
	}
	if left.ActivationID != right.ActivationID {
		return false
	}
	if left.Revision != right.Revision {
		return false
	}
	if !left.ActivatedAt.Equal(right.ActivatedAt) {
		return false
	}
	// Both must be nil or both must be non-nil with equal content
	if (left.PreviousRevision == nil) != (right.PreviousRevision == nil) {
		return false
	}
	if left.PreviousRevision != nil {
		return *left.PreviousRevision == *right.PreviousRevision
	}
	return true
}

// The plan lifecycle: what a race is being driven by, whether it survives a
// restart, and whether the trail of what ran when can be trusted afterwards.

type lifecycleFixture struct {
	root     string
	service  *Service[testPayload]
	revision contract.RevisionRef
	second   contract.RevisionRef
	version  uint64
}

// twoRevisions builds a plan with two saved revisions, which is the minimum
// needed to talk about switching and rolling back.
func twoRevisions(t *testing.T) lifecycleFixture {
	t.Helper()
	root := t.TempDir()
	repo, err := repository.Open[testPayload](root, repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	draft := validDraft("draft-1", "plan-1", 10)
	createPlan(t, service, draft, 0)

	first, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-1", OperationSaveRevision, 1),
		Draft:         draft,
		RevisionID:    "revision-1",
		CreatedAt:     canonicalTime(3),
	})
	if err != nil {
		t.Fatalf("SaveRevision: %v", err)
	}
	improved := draft
	improved.Payload.Laps = 11
	improved.UpdatedAt = canonicalTime(4)
	second, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-2", OperationSaveRevision, first.RepositoryVersion),
		Draft:         improved,
		RevisionID:    "revision-2",
		CreatedAt:     canonicalTime(5),
	})
	if err != nil {
		t.Fatalf("SaveRevision: %v", err)
	}
	return lifecycleFixture{
		root:     root,
		service:  service,
		revision: first.Revision.Ref(),
		second:   second.Revision.Ref(),
		version:  second.RepositoryVersion,
	}
}

func activate(t *testing.T, fixture *lifecycleFixture, id contract.ActivationID, revision contract.RevisionRef, at int) Result[testPayload] {
	t.Helper()
	result, err := fixture.service.Activate(context.Background(), ActivateCommand{
		CommandHeader: commandHeader(CommandID("activate-"+string(id)), OperationActivate, fixture.version),
		Revision:      revision,
		ActivationID:  id,
		ActivatedAt:   canonicalTime(at),
	})
	if err != nil {
		t.Fatalf("Activate %s: %v", id, err)
	}
	fixture.version = result.RepositoryVersion
	return result
}

func TestActivatingTwiceIsIdempotent(t *testing.T) {
	fixture := twoRevisions(t)
	first := activate(t, &fixture, "activation-1", fixture.revision, 6)

	second, err := fixture.service.Activate(context.Background(), ActivateCommand{
		CommandHeader: commandHeader("activate-again", OperationActivate, first.RepositoryVersion),
		Revision:      fixture.revision,
		ActivationID:  "activation-1",
		ActivatedAt:   canonicalTime(6),
	})
	if err != nil {
		t.Fatalf("second Activate: %v", err)
	}
	if second.RepositoryVersion != first.RepositoryVersion {
		t.Fatalf("a repeated activation moved the repository from %d to %d",
			first.RepositoryVersion, second.RepositoryVersion)
	}
	if second.ActivePlan == nil || !equalActivePlan(*second.ActivePlan, *first.ActivePlan) {
		t.Fatalf("a repeated activation changed what is active: %+v", second.ActivePlan)
	}
	if len(second.Activations) != 1 {
		t.Fatalf("a repeated activation duplicated the audit trail: %+v", second.Activations)
	}
}

// Retrying with a stale version must still succeed when the outcome already
// holds; that is what makes a retry after a lost response safe.
func TestRetryingAnActivationWithAStaleVersionStillSucceeds(t *testing.T) {
	fixture := twoRevisions(t)
	staleVersion := fixture.version
	first := activate(t, &fixture, "activation-1", fixture.revision, 6)

	retry, err := fixture.service.Activate(context.Background(), ActivateCommand{
		CommandHeader: commandHeader("activate-retry", OperationActivate, staleVersion),
		Revision:      fixture.revision,
		ActivationID:  "activation-1",
		ActivatedAt:   canonicalTime(6),
	})
	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if retry.ActivePlan == nil || !equalActivePlan(*retry.ActivePlan, *first.ActivePlan) {
		t.Fatalf("retry changed what is active: %+v", retry.ActivePlan)
	}
}

func TestEditingADraftDoesNotDisturbTheActivePlan(t *testing.T) {
	fixture := twoRevisions(t)
	active := activate(t, &fixture, "activation-1", fixture.revision, 6)

	// Edit and save entirely new work on the same plan.
	edited := validDraft("draft-1", "plan-1", 99)
	edited.UpdatedAt = canonicalTime(7)
	saved, err := fixture.service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-while-active", OperationSaveRevision, fixture.version),
		Draft:         edited,
		RevisionID:    "revision-3",
		CreatedAt:     canonicalTime(8),
	})
	if err != nil {
		t.Fatalf("SaveRevision: %v", err)
	}

	listed, err := fixture.service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("list-after-edit", OperationList, 0),
	})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if listed.ActivePlan == nil {
		t.Fatal("editing a draft deactivated the running plan")
	}
	if !equalActivePlan(*listed.ActivePlan, *active.ActivePlan) {
		t.Fatalf("editing a draft changed what is active: %+v", listed.ActivePlan)
	}
	if listed.ActivePlan.Revision == saved.Revision.Ref() {
		t.Fatal("saving a revision must not silently promote it to active")
	}
}

func TestARestartRestoresTheActivePlanAndItsTrail(t *testing.T) {
	fixture := twoRevisions(t)
	activate(t, &fixture, "activation-1", fixture.revision, 6)
	rolled := activate(t, &fixture, "activation-2", fixture.second, 7)

	// A restart is a fresh repository handle over the same directory.
	reopened, err := repository.Open[testPayload](fixture.root, repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	restarted := NewService[testPayload](reopened)

	listed, err := restarted.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("list-after-restart", OperationList, 0),
	})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if listed.ActivePlan == nil {
		t.Fatal("the active plan did not survive the restart")
	}
	if !equalActivePlan(*listed.ActivePlan, *rolled.ActivePlan) {
		t.Fatalf("the restart restored the wrong revision: %+v", listed.ActivePlan)
	}
	if listed.ActivePlan.Revision != fixture.second {
		t.Fatalf("the restart restored a revision that was not the active one: %+v", listed.ActivePlan.Revision)
	}
}

func TestRollingBackKeepsTheAudit(t *testing.T) {
	fixture := twoRevisions(t)
	activate(t, &fixture, "activation-1", fixture.revision, 6)
	forward := activate(t, &fixture, "activation-2", fixture.second, 7)
	if forward.ActivePlan.PreviousRevision == nil || *forward.ActivePlan.PreviousRevision != fixture.revision {
		t.Fatalf("a revision change must record what it replaced: %+v", forward.ActivePlan.PreviousRevision)
	}

	// Roll back to the first revision under a new activation identity.
	back := activate(t, &fixture, "activation-3", fixture.revision, 8)
	if back.ActivePlan.Revision != fixture.revision {
		t.Fatalf("rollback did not restore the first revision: %+v", back.ActivePlan.Revision)
	}
	if back.ActivePlan.PreviousRevision == nil || *back.ActivePlan.PreviousRevision != fixture.second {
		t.Fatalf("rollback must record what it rolled back from: %+v", back.ActivePlan.PreviousRevision)
	}
	if len(back.Activations) != 3 {
		t.Fatalf("the trail must keep all three activations, got %d: %+v", len(back.Activations), back.Activations)
	}
	// The trail is append-only and in order, so a race can be reconstructed.
	for index, expected := range []contract.ActivationID{"activation-1", "activation-2", "activation-3"} {
		if back.Activations[index].ActivationID != expected {
			t.Fatalf("trail entry %d = %q, want %q", index, back.Activations[index].ActivationID, expected)
		}
	}
}

func TestActivatingARevisionTheRepositoryDoesNotHoldIsRefused(t *testing.T) {
	fixture := twoRevisions(t)
	_, err := fixture.service.Activate(context.Background(), ActivateCommand{
		CommandHeader: commandHeader("activate-ghost", OperationActivate, fixture.version),
		Revision: contract.RevisionRef{
			PlanID:      "plan-1",
			VariantID:   "variant-1",
			RevisionID:  "revision-absent",
			ContentHash: fixture.revision.ContentHash,
		},
		ActivationID: "activation-1",
		ActivatedAt:  canonicalTime(6),
	})
	if !errors.Is(err, ErrRevisionNotFound) {
		t.Fatalf("expected a revision-not-found refusal, got %v", err)
	}
}

func TestSwitchingToAnotherPlanRequiresDeactivatingFirst(t *testing.T) {
	fixture := twoRevisions(t)
	activate(t, &fixture, "activation-1", fixture.revision, 6)

	other := validDraft("draft-2", "plan-2", 20)
	createPlan(t, fixture.service, other, fixture.version)
	saved, err := fixture.service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-other", OperationSaveRevision, fixture.version+1),
		Draft:         other,
		RevisionID:    "revision-other",
		CreatedAt:     canonicalTime(9),
	})
	if err != nil {
		t.Fatalf("SaveRevision: %v", err)
	}

	_, err = fixture.service.Activate(context.Background(), ActivateCommand{
		CommandHeader: commandHeader("activate-other", OperationActivate, saved.RepositoryVersion),
		Revision:      saved.Revision.Ref(),
		ActivationID:  "activation-other",
		ActivatedAt:   canonicalTime(10),
	})
	if !errors.Is(err, ErrActiveConflict) {
		t.Fatalf("swapping plans mid-race must be refused, got %v", err)
	}
}

func TestDeactivatingTheWrongActivationIsRefused(t *testing.T) {
	fixture := twoRevisions(t)
	activate(t, &fixture, "activation-1", fixture.revision, 6)

	_, err := fixture.service.Deactivate(context.Background(), DeactivateCommand{
		CommandHeader:        commandHeader("deactivate-wrong", OperationDeactivate, fixture.version),
		ExpectedActivationID: "activation-somebody-else",
	})
	if !errors.Is(err, ErrActiveConflict) {
		t.Fatalf("expected an active-plan conflict, got %v", err)
	}

	listed, err := fixture.service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("list-after-refusal", OperationList, 0),
	})
	if err != nil {
		t.Fatal(err)
	}
	if listed.ActivePlan == nil {
		t.Fatal("a refused deactivation stopped the plan anyway")
	}
}

func TestDeactivatingKeepsTheTrail(t *testing.T) {
	fixture := twoRevisions(t)
	activate(t, &fixture, "activation-1", fixture.revision, 6)

	stopped, err := fixture.service.Deactivate(context.Background(), DeactivateCommand{
		CommandHeader:        commandHeader("deactivate-1", OperationDeactivate, fixture.version),
		ExpectedActivationID: "activation-1",
	})
	if err != nil {
		t.Fatalf("Deactivate: %v", err)
	}
	if stopped.ActivePlan != nil {
		t.Fatalf("deactivation left a plan active: %+v", stopped.ActivePlan)
	}
	if len(stopped.Activations) != 1 {
		t.Fatalf("deactivation erased the audit trail: %+v", stopped.Activations)
	}
}

// Concurrent readers must see a consistent active plan and must not be able to
// mutate the repository through the value they were handed.
func TestConcurrentReadersSeeAConsistentActivePlan(t *testing.T) {
	fixture := twoRevisions(t)
	active := activate(t, &fixture, "activation-1", fixture.revision, 6)
	want := *active.ActivePlan

	var group sync.WaitGroup
	failures := make(chan string, 8)
	for reader := 0; reader < 8; reader++ {
		group.Add(1)
		go func(reader int) {
			defer group.Done()
			listed, err := fixture.service.List(context.Background(), ListCommand{
				CommandHeader: commandHeader(CommandID("list-reader"), OperationList, 0),
			})
			if err != nil {
				failures <- err.Error()
				return
			}
			if listed.ActivePlan == nil || !equalActivePlan(*listed.ActivePlan, want) {
				failures <- "a reader saw a different active plan"
				return
			}
			// Mutating the handed-out value must not reach the repository.
			listed.ActivePlan.ActivationID = "tampered"
		}(reader)
	}
	group.Wait()
	close(failures)
	for failure := range failures {
		t.Fatal(failure)
	}

	after, err := fixture.service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("list-final", OperationList, 0),
	})
	if err != nil {
		t.Fatal(err)
	}
	if after.ActivePlan == nil || after.ActivePlan.ActivationID != "activation-1" {
		t.Fatalf("a reader mutated the stored active plan: %+v", after.ActivePlan)
	}
}
