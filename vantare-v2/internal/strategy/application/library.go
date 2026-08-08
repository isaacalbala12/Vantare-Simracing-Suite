package application

import (
	"context"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

// List builds the read model behind "My plans". It reads the repository
// snapshot and reports one summary per plan variant, without loading any
// payload: a library needs to identify plans, not to open them.
//
// Plans stay private. Listing is local and nothing leaves the machine.
func (service *Service[T]) List(ctx context.Context, command ListCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationList); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	return Result[T]{
		ProtocolVersion:     ProtocolVersionV1,
		CommandID:           command.CommandID,
		RepositoryVersion:   snapshot.Version,
		Plans:               summarise(snapshot),
		RecoveredFromBackup: snapshot.RecoveredFromBackup,
	}, nil
}

// planKey identifies one variant of one plan. Two variants of the same plan are
// separate entries in the library because they are separately openable.
type planKey struct {
	planID    contract.PlanID
	variantID contract.VariantID
}

func summarise[T any](snapshot repository.Snapshot[T]) []PlanSummary {
	byPlan := make(map[planKey]*PlanSummary)
	ordered := make([]planKey, 0, len(snapshot.Drafts)+len(snapshot.Revisions))

	entry := func(key planKey) *PlanSummary {
		if existing, found := byPlan[key]; found {
			return existing
		}
		summary := &PlanSummary{PlanID: key.planID, VariantID: key.variantID}
		byPlan[key] = summary
		ordered = append(ordered, key)
		return summary
	}

	for _, draft := range snapshot.Drafts {
		summary := entry(planKey{planID: draft.PlanID, variantID: draft.VariantID})
		summary.DraftID = draft.DraftID
		summary.HasDraft = true
		summary.Name = draft.Name
		summary.Mode = draft.Mode
		if draft.UpdatedAt.After(summary.UpdatedAt) {
			summary.UpdatedAt = draft.UpdatedAt
		}
	}

	for _, revision := range snapshot.Revisions {
		metadata := revision.Metadata()
		summary := entry(planKey{planID: metadata.PlanID, variantID: metadata.VariantID})
		summary.RevisionCount++
		// A draft's name is the working one and wins; otherwise the newest
		// revision names the plan.
		if !summary.HasDraft && (summary.LatestRevisionAt == nil || metadata.CreatedAt.After(*summary.LatestRevisionAt)) {
			summary.Name = metadata.Name
			summary.Mode = metadata.Mode
		}
		if summary.LatestRevisionAt == nil || metadata.CreatedAt.After(*summary.LatestRevisionAt) {
			createdAt := metadata.CreatedAt
			reference := revision.Ref()
			summary.LatestRevisionAt = &createdAt
			summary.LatestRevision = &reference
		}
		if metadata.CreatedAt.After(summary.UpdatedAt) {
			summary.UpdatedAt = metadata.CreatedAt
		}
	}

	summaries := make([]PlanSummary, 0, len(ordered))
	for _, key := range ordered {
		summaries = append(summaries, *byPlan[key])
	}
	sortSummaries(summaries)
	return summaries
}

// sortSummaries puts the most recently touched plan first. Identical timestamps
// fall back to identity so the same repository always lists in the same order.
func sortSummaries(summaries []PlanSummary) {
	sort.SliceStable(summaries, func(left, right int) bool {
		first, second := summaries[left], summaries[right]
		if !first.UpdatedAt.Equal(second.UpdatedAt) {
			return first.UpdatedAt.After(second.UpdatedAt)
		}
		if first.PlanID != second.PlanID {
			return first.PlanID < second.PlanID
		}
		return first.VariantID < second.VariantID
	})
}
