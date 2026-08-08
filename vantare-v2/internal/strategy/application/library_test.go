package application

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

func libraryService(t *testing.T) *Service[testPayload] {
	t.Helper()
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	return NewService[testPayload](repo)
}

func listPlans(t *testing.T, service *Service[testPayload], id CommandID) []PlanSummary {
	t.Helper()
	result, err := service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader(id, OperationList, 0),
	})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	return result.Plans
}

func createPlan(t *testing.T, service *Service[testPayload], draft contract.PlanDraft[testPayload], version uint64) {
	t.Helper()
	if _, err := service.Create(context.Background(), CreateCommand[testPayload]{
		CommandHeader: commandHeader(CommandID("create-"+string(draft.DraftID)), OperationCreate, version),
		Draft:         draft,
	}); err != nil {
		t.Fatalf("Create %s: %v", draft.PlanID, err)
	}
}

func TestListReportsAnEmptyLibraryWithoutFailing(t *testing.T) {
	service := libraryService(t)
	result, err := service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("list-1", OperationList, 0),
	})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(result.Plans) != 0 {
		t.Fatalf("a fresh repository has no plans, got %+v", result.Plans)
	}
	if result.ProtocolVersion != ProtocolVersionV1 || result.CommandID != "list-1" {
		t.Fatalf("result lost its envelope: %+v", result)
	}
}

func TestListSummarisesADraftWithoutItsPayload(t *testing.T) {
	service := libraryService(t)
	draft := validDraft("draft-1", "plan-1", 42)
	createPlan(t, service, draft, 0)

	plans := listPlans(t, service, "list-1")
	if len(plans) != 1 {
		t.Fatalf("expected one plan, got %+v", plans)
	}
	summary := plans[0]
	if summary.PlanID != draft.PlanID || summary.VariantID != draft.VariantID {
		t.Fatalf("summary identifies the wrong plan: %+v", summary)
	}
	if !summary.HasDraft || summary.DraftID != draft.DraftID {
		t.Fatalf("an open draft must be visible: %+v", summary)
	}
	if summary.Name != draft.Name {
		t.Fatalf("the draft name should title the plan: %q", summary.Name)
	}
	if summary.RevisionCount != 0 || summary.LatestRevision != nil {
		t.Fatalf("an unsaved plan has no revisions: %+v", summary)
	}
}

func TestListCountsRevisionsAndPointsAtTheNewest(t *testing.T) {
	service := libraryService(t)
	draft := validDraft("draft-1", "plan-1", 10)
	createPlan(t, service, draft, 0)

	for index, revision := range []struct {
		id   contract.RevisionID
		laps int
		at   int
	}{{"revision-1", 11, 3}, {"revision-2", 12, 5}} {
		saved := draft
		saved.Payload.Laps = revision.laps
		saved.UpdatedAt = canonicalTime(revision.at)
		if _, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
			CommandHeader: commandHeader(CommandID("save-"+string(revision.id)), OperationSaveRevision, uint64(index+1)),
			Draft:         saved,
			RevisionID:    revision.id,
			CreatedAt:     canonicalTime(revision.at),
		}); err != nil {
			t.Fatalf("SaveRevision %s: %v", revision.id, err)
		}
	}

	plans := listPlans(t, service, "list-1")
	if len(plans) != 1 {
		t.Fatalf("revisions of one plan stay one entry, got %+v", plans)
	}
	summary := plans[0]
	if summary.RevisionCount != 2 {
		t.Fatalf("expected two revisions, got %d", summary.RevisionCount)
	}
	if summary.LatestRevision == nil || summary.LatestRevision.RevisionID != "revision-2" {
		t.Fatalf("the newest revision must be the one offered: %+v", summary.LatestRevision)
	}
	if summary.LatestRevisionAt == nil || !summary.LatestRevisionAt.Equal(canonicalTime(5)) {
		t.Fatalf("latest revision time is wrong: %+v", summary.LatestRevisionAt)
	}
	// The reference must be complete enough to activate without ambiguity.
	if summary.LatestRevision.ContentHash == "" {
		t.Fatal("a revision reference without its hash cannot be trusted")
	}
}

func TestListKeepsVariantsOfOnePlanApart(t *testing.T) {
	service := libraryService(t)
	first := validDraft("draft-1", "plan-1", 10)
	second := validDraft("draft-2", "plan-1", 20)
	second.VariantID = "variant-2"

	createPlan(t, service, first, 0)
	createPlan(t, service, second, 1)

	plans := listPlans(t, service, "list-1")
	if len(plans) != 2 {
		t.Fatalf("two variants are two entries, got %+v", plans)
	}
	seen := map[contract.VariantID]bool{}
	for _, summary := range plans {
		if summary.PlanID != "plan-1" {
			t.Fatalf("variant lost its plan: %+v", summary)
		}
		seen[summary.VariantID] = true
	}
	if len(seen) != 2 {
		t.Fatalf("both variants must appear: %+v", plans)
	}
}

func TestListPutsTheMostRecentlyTouchedPlanFirst(t *testing.T) {
	service := libraryService(t)
	older := validDraft("draft-old", "plan-old", 10)
	older.UpdatedAt = canonicalTime(2)
	newer := validDraft("draft-new", "plan-new", 10)
	newer.UpdatedAt = canonicalTime(9)

	createPlan(t, service, older, 0)
	createPlan(t, service, newer, 1)

	plans := listPlans(t, service, "list-1")
	if len(plans) != 2 || plans[0].PlanID != "plan-new" {
		t.Fatalf("the freshest plan leads the library: %+v", plans)
	}
}

func TestListIsStableAcrossRepeatedCalls(t *testing.T) {
	service := libraryService(t)
	// Identical timestamps, so only the tie-break decides the order.
	for index, planID := range []contract.PlanID{"plan-c", "plan-a", "plan-b"} {
		draft := validDraft(contract.DraftID("draft-"+string(planID)), planID, 10)
		createPlan(t, service, draft, uint64(index))
	}

	first := listPlans(t, service, "list-1")
	if len(first) != 3 {
		t.Fatalf("expected three plans, got %d", len(first))
	}
	if first[0].PlanID != "plan-a" || first[2].PlanID != "plan-c" {
		t.Fatalf("ties must fall back to identity: %+v", first)
	}
	for attempt := 0; attempt < 10; attempt++ {
		again := listPlans(t, service, "list-repeat")
		for index, summary := range again {
			if summary.PlanID != first[index].PlanID {
				t.Fatal("the library reordered itself between reads")
			}
		}
	}
}

func TestListNeverWritesToTheRepository(t *testing.T) {
	service := libraryService(t)
	createPlan(t, service, validDraft("draft-1", "plan-1", 10), 0)

	before, err := service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("list-1", OperationList, 0),
	})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	for attempt := 0; attempt < 5; attempt++ {
		after, err := service.List(context.Background(), ListCommand{
			CommandHeader: commandHeader("list-again", OperationList, 0),
		})
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if after.RepositoryVersion != before.RepositoryVersion {
			t.Fatalf("listing bumped the repository from %d to %d",
				before.RepositoryVersion, after.RepositoryVersion)
		}
	}
}

func TestListRejectsACommandForAnotherOperation(t *testing.T) {
	service := libraryService(t)
	if _, err := service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("list-1", OperationOpen, 0),
	}); err == nil {
		t.Fatal("expected the header check to reject a mismatched operation")
	}
}
