package application

import (
	"context"

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
	entries, err := service.sessionCatalog.ListSessionCombinations(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	if len(entries) == 0 {
		return result, nil
	}
	result.SessionCatalogStatus = SessionCatalogAvailable
	result.SessionCombinations = make([]SessionCombination, 0, len(entries))
	for _, entry := range entries {
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
