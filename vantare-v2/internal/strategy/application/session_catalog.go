package application

import (
	"context"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

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
	for _, session := range event.Combination.Sessions {
		if session.Included {
			included = append(included, session.SessionID)
		}
	}
	if len(included) == 0 {
		planning.Projection = nil
		result.PlanningInputStatus = PlanningInputNoIncludedSessions
		return result, nil
	}
	if service.sessionCatalog == nil {
		return result, nil
	}
	projection, err := service.sessionCatalog.ProjectStrategyInputs(ctx, event.Combination.CombinationID, included, canonicalMillisecond(command.GeneratedAt))
	if err != nil {
		return Result[T]{}, err
	}
	planning.Projection = &projection
	result.PlanningInputStatus = PlanningInputAvailable
	return result, nil
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
