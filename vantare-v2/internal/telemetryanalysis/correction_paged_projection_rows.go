package telemetryanalysis

import (
	"context"
	"sort"
	"strings"
)

type pagedProjectionRows struct {
	pages     []HistoricalPage
	pitEvents []HistoricalPage
}

// readPagedProjectionRows retains the event rows and only the continuous rows
// bracketing the instants queried by the existing derivators. The correction
// map has already been validated against the exact stored snapshot. Original
// GPS alignment always precedes application of its corrected values.
func readPagedProjectionRows(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits, summary CorrectionSummary, validity LapValidityAnalysis, correctedValues map[correctionRowKey]map[string]HistoricalValue) (pagedProjectionRows, error) {
	var empty pagedProjectionRows
	queries := projectionBoundaryQueries(validity)
	scans := make(map[string]*orderedProjectionBoundaryScan)
	for _, channel := range summary.Session.Channels {
		if projectionContinuousChannel(channel.SourceName) {
			scan, err := newOrderedProjectionBoundaryScan(queries)
			if err != nil {
				return empty, err
			}
			scans[channel.ID] = scan
		}
	}
	result := pagedProjectionRows{pages: make([]HistoricalPage, 0, len(summary.Session.Channels))}
	eventRows := 0
	err := visitAlignedCorrectionPages(ctx, reader, artifact, limits, summary,
		func(channel HistoricalChannel) bool {
			return projectionContinuousChannel(channel.SourceName) || projectionEventChannel(channel.SourceName) || strings.EqualFold(strings.TrimSpace(channel.SourceName), "In Pits")
		},
		func(channel HistoricalChannel, page HistoricalPage) error {
			applyPagedCorrectionValues(&page, correctedValues)
			if !projectionContinuousChannel(channel.SourceName) {
				eventRows += len(page.Samples)
				if eventRows > maxCorrectionSummaryEventRows {
					return ErrCorrectionReadLimit
				}
				if strings.EqualFold(strings.TrimSpace(channel.SourceName), "In Pits") {
					result.pitEvents = append(result.pitEvents, page)
				} else {
					result.pages = append(result.pages, page)
				}
				return nil
			}
			scan := scans[channel.ID]
			vector := strings.EqualFold(strings.TrimSpace(channel.SourceName), "Tyres Wear")
			for _, sample := range page.Samples {
				usable := false
				if vector {
					_, _, usable = numericVector(sample.Values)
				} else {
					_, _, usable = numericValue(sample.Values)
				}
				if !scan.accept(sample, usable) {
					return ErrInvalidHistoricalPage
				}
			}
			return nil
		})
	if err != nil {
		return empty, err
	}
	for _, channel := range summary.Session.Channels {
		if scan := scans[channel.ID]; scan != nil {
			result.pages = append(result.pages, HistoricalPage{ChannelID: channel.ID, Sampling: channel.Sampling, Samples: scan.finish()})
		}
	}
	return result, ctx.Err()
}

func projectionBoundaryQueries(validity LapValidityAnalysis) []float64 {
	queries := make([]float64, 0, len(validity.Laps)*4)
	for _, lap := range validity.Laps {
		queries = append(queries, timestampSeconds(lap.End))
		if lap.Start != nil {
			start := timestampSeconds(*lap.Start)
			queries = append(queries, start, start+0.001, start+vectorBoundaryToleranceSeconds)
		}
	}
	sort.Float64s(queries)
	unique := queries[:0]
	for _, query := range queries {
		if len(unique) == 0 || query != unique[len(unique)-1] {
			unique = append(unique, query)
		}
	}
	return unique
}

func projectionContinuousChannel(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "fuel level", "virtual energy", "minimum path wetness", "fuelmixturemap", "tyres wear":
		return true
	}
	return false
}

func projectionEventChannel(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "tyrescompound", "finish status":
		return true
	}
	return false
}
