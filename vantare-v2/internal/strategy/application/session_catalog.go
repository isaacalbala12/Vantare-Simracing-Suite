package application

import (
	"context"
	"errors"
	"strings"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// ErrPinnedAnalysisProjectionUnavailable prevents the legacy catalog from
// silently replacing a plan's exact Analysis revision with unversioned input.
var ErrPinnedAnalysisProjectionUnavailable = errors.New("exact Analysis revision projection is not connected")

type revisionSessionCatalogPort interface {
	ProjectStrategyRevisionInputs(context.Context, string, []strategyprojection.AnalysisRevisionRef, time.Time) (strategyprojection.StrategyInputProjectionV2, error)
}

// ListSessionCombinations adapts the Analysis-owned catalog for Orbit. It is
// read-only and never opens DuckDB or reads Analysis storage from Strategy.
func (service *Service[T]) ListSessionCombinations(ctx context.Context, command ListSessionCombinationsCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationListSessionCombinations); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result := documentResult[T](command.CommandID, snapshot)
	result.SessionCatalogStatus = SessionCatalogNoAuthorizedTelemetry
	result.SessionCombinations = []SessionCombination{}
	if service.sessionCatalog == nil {
		return result, nil
	}
	listing, err := service.sessionCatalog.ListSessionCombinations(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result.SessionCatalogExclusions = make([]SessionCatalogExclusion, 0, len(listing.Exclusions))
	for _, exclusion := range listing.Exclusions {
		result.SessionCatalogExclusions = append(result.SessionCatalogExclusions, SessionCatalogExclusion{SessionID: exclusion.SessionID, Reason: exclusion.Reason})
	}
	if len(listing.Combinations) == 0 {
		return result, nil
	}
	result.SessionCatalogStatus = SessionCatalogAvailable
	result.SessionCombinations = make([]SessionCombination, 0, len(listing.Combinations))
	for _, entry := range listing.Combinations {
		result.SessionCombinations = append(result.SessionCombinations, adaptSessionCombination(entry))
	}
	return result, nil
}

func adaptSessionCombination(entry telemetryanalysis.CombinationCatalogEntry) SessionCombination {
	result := SessionCombination{
		CombinationID:  entry.Combination.ID,
		SimID:          entry.Combination.SimID,
		TrackName:      entry.Combination.TrackName,
		TrackLayout:    entry.Combination.TrackLayout,
		CarName:        entry.Combination.CarName,
		CarClass:       entry.Combination.CarClass,
		SessionCount:   entry.SessionCount,
		RaceCount:      entry.RaceCount,
		LastActivity:   entry.LastActivity,
		ClimateBuckets: adaptClimateBuckets(entry.ClimateBuckets),
		Sessions:       make([]SessionCombinationCatalogItem, 0, len(entry.Sessions)),
	}
	for _, session := range entry.Sessions {
		result.Sessions = append(result.Sessions, SessionCombinationCatalogItem{
			SessionID:       session.SessionID,
			Type:            string(session.Type),
			Status:          string(session.Status),
			DefaultIncluded: session.DefaultIncluded,
			ExclusionReason: string(session.ExclusionReason),
			LastActivity:    session.LastActivity,
			ClimateBuckets:  adaptClimateBuckets(session.ClimateBuckets),
		})
	}
	return result
}

func adaptClimateBuckets(source []telemetryanalysis.ClimateBucketCount) []SessionClimateBucket {
	result := make([]SessionClimateBucket, 0, len(source))
	for _, bucket := range source {
		result = append(result, SessionClimateBucket{Bucket: string(bucket.Bucket), Laps: bucket.Laps})
	}
	return result
}

// GetEventPlanningInputs is read-only. Analysis owns production; Strategy
// adapts the event selection and preserves any canonical overrides beside the
// newly produced projection.
func (service *Service[T]) GetEventPlanningInputs(ctx context.Context, command GetEventPlanningInputsCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationGetEventPlanningInputs); err != nil {
		return Result[T]{}, err
	}
	if command.GeneratedAt.IsZero() {
		return Result[T]{}, applicationError(ErrorInvalidCommand, "generatedAt", ErrInvalidCommand)
	}
	snapshot, event, err := service.readEvent(ctx, command.EventID)
	if err != nil {
		return Result[T]{}, err
	}
	planning := strategydocument.PlanningInputs{Overrides: map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{}}
	if event.PlanningInputs != nil {
		planning = *event.PlanningInputs
		planning.Overrides = clonePlanningOverrides(event.PlanningInputs.Overrides)
	}
	result := documentResult[T](command.CommandID, snapshot)
	result.PlanningInputStatus = PlanningInputManualOnly
	result.PlanningInputs = &planning
	if event.Combination == nil {
		planning.Projection = nil
		return result, nil
	}
	included := make([]string, 0, len(event.Combination.Sessions))
	var refs []strategyprojection.AnalysisRevisionRef
	for _, session := range event.Combination.Sessions {
		if session.Included {
			if session.Revision != nil {
				refs = append(refs, *session.Revision)
			}
			included = append(included, session.SessionID)
		}
	}
	if len(included) == 0 {
		planning.Projection = nil
		result.PlanningInputStatus = PlanningInputNoIncludedSessions
		return result, nil
	}
	var projection strategyprojection.StrategyInputProjectionV2
	if len(refs) > 0 {
		if err := strategyprojection.ValidateSourceRevisions(included, refs); err != nil {
			return Result[T]{}, applicationError(ErrorInvalidCommand, "combination.sessions.revision", err)
		}
		projection, err = service.projectRevisionPlanningInputs(ctx, event.Combination.CombinationID, refs, command.GeneratedAt)
		if err != nil {
			return Result[T]{}, err
		}
	} else {
		if service.sessionCatalog == nil {
			return result, nil
		}
		projection, err = service.sessionCatalog.ProjectStrategyInputs(ctx, event.Combination.CombinationID, included, canonicalMillisecond(command.GeneratedAt))
	}
	if err != nil {
		return Result[T]{}, err
	}
	planning.Projection = &projection
	result.PlanningInputStatus = PlanningInputAvailable
	return result, nil
}

// GetRevisionPlanningInputs prepares transient recorded input without creating
// a second persisted Event. Analysis remains the sole projection authority.
func (service *Service[T]) GetRevisionPlanningInputs(ctx context.Context, command GetRevisionPlanningInputsCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationGetRevisionInputs); err != nil {
		return Result[T]{}, err
	}
	if command.GeneratedAt.IsZero() || strings.TrimSpace(command.CombinationID) == "" || len(command.SourceRevisions) == 0 {
		return Result[T]{}, applicationError(ErrorInvalidCommand, "sourceRevisions", ErrInvalidCommand)
	}
	sourceSessions := make([]string, len(command.SourceRevisions))
	for index, ref := range command.SourceRevisions {
		sourceSessions[index] = ref.SessionID
	}
	if err := strategyprojection.ValidateSourceRevisions(sourceSessions, command.SourceRevisions); err != nil {
		return Result[T]{}, applicationError(ErrorInvalidCommand, "sourceRevisions", err)
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	projection, err := service.projectRevisionPlanningInputs(ctx, command.CombinationID, command.SourceRevisions, command.GeneratedAt)
	if err != nil {
		return Result[T]{}, err
	}
	result := documentResult[T](command.CommandID, snapshot)
	result.PlanningInputStatus = PlanningInputAvailable
	result.PlanningInputs = &strategydocument.PlanningInputs{
		Projection: &projection,
		Overrides:  map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{},
	}
	return result, nil
}

func (service *Service[T]) projectRevisionPlanningInputs(ctx context.Context, combinationID string, refs []strategyprojection.AnalysisRevisionRef, generatedAt time.Time) (strategyprojection.StrategyInputProjectionV2, error) {
	producer, ok := service.sessionCatalog.(revisionSessionCatalogPort)
	if !ok {
		return strategyprojection.StrategyInputProjectionV2{}, applicationError(ErrorInvalidCommand, "combination.sessions.revision", ErrPinnedAnalysisProjectionUnavailable)
	}
	projection, err := producer.ProjectStrategyRevisionInputs(ctx, combinationID, refs, canonicalMillisecond(generatedAt))
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	if err := ctx.Err(); err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	if err := projection.Validate(); err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, applicationError(ErrorCalculationInvalid, "analysis.projection", err)
	}
	if projection.CombinationID != combinationID || projection.GeneratedAt != canonicalMillisecond(generatedAt) || len(projection.SourceRevisions) != len(refs) {
		return strategyprojection.StrategyInputProjectionV2{}, applicationError(ErrorCalculationInvalid, "analysis.revisions", ErrCalculationInvalid)
	}
	selected := make(map[string]strategyprojection.AnalysisRevisionRef, len(refs))
	for _, ref := range refs {
		selected[ref.SessionID] = ref
	}
	for _, ref := range projection.SourceRevisions {
		if expected, ok := selected[ref.SessionID]; !ok || expected != ref {
			return strategyprojection.StrategyInputProjectionV2{}, applicationError(ErrorCalculationInvalid, "analysis.revisions", ErrCalculationInvalid)
		}
	}
	return projection, nil
}

func clonePlanningOverrides(source map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride) map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride {
	result := make(map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride, len(source))
	for field, override := range source {
		result[field] = override
	}
	return result
}

func canonicalMillisecond(value time.Time) time.Time {
	return value.UTC().Truncate(time.Millisecond)
}
