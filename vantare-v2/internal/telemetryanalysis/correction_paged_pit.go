package telemetryanalysis

import (
	"context"
	"math"
	"strings"
)

// readPagedPitObservation retains pit events and one rise accumulator per
// interval. Values are corrected only after the original GPS has aligned the
// page, matching DeriveCorrectedSession's alignment-before-correction order.
// The caller must validate correctedValues against the exact stored snapshot.
func readPagedPitObservation(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits, summary CorrectionSummary, classified ClassifiedSession, correctedValues map[correctionRowKey]map[string]HistoricalValue) (SessionPitObservation, error) {
	var events []HistoricalPage
	eventRows := 0
	err := visitAlignedCorrectionPages(ctx, reader, artifact, limits, summary,
		func(channel HistoricalChannel) bool {
			return strings.EqualFold(strings.TrimSpace(channel.SourceName), "In Pits")
		},
		func(_ HistoricalChannel, page HistoricalPage) error {
			eventRows += len(page.Samples)
			if eventRows > maxCorrectionSummaryEventRows {
				return ErrCorrectionReadLimit
			}
			applyPagedCorrectionValues(&page, correctedValues)
			events = append(events, page)
			return nil
		})
	if err != nil {
		return SessionPitObservation{}, err
	}
	intervals := observedPitIntervals(readEvents(events))
	if len(intervals) == 0 {
		return derivePitObservationWithRises(summary.Session, classified, nil, nil, nil)
	}
	fuelScans := make([]pitRiseScan, len(intervals))
	veScans := make([]pitRiseScan, len(intervals))
	lastSeconds := make(map[string]float64)
	seenSeconds := make(map[string]bool)
	err = visitAlignedCorrectionPages(ctx, reader, artifact, limits, summary,
		func(channel HistoricalChannel) bool {
			name := strings.ToLower(strings.TrimSpace(channel.SourceName))
			return name == "fuel level" || name == "virtual energy"
		},
		func(channel HistoricalChannel, page HistoricalPage) error {
			applyPagedCorrectionValues(&page, correctedValues)
			if page.Sampling.Origin != TimeOriginSourceTimestamp {
				return nil
			}
			scans := fuelScans
			if strings.EqualFold(strings.TrimSpace(channel.SourceName), "Virtual Energy") {
				scans = veScans
			}
			for _, sample := range page.Samples {
				if sample.TimestampSeconds == nil || math.IsNaN(*sample.TimestampSeconds) || math.IsInf(*sample.TimestampSeconds, 0) {
					continue
				}
				value, presence, ok := numericValue(sample.Values)
				if !ok {
					continue
				}
				if seenSeconds[channel.ID] && *sample.TimestampSeconds < lastSeconds[channel.ID] {
					return ErrInvalidHistoricalPage
				}
				lastSeconds[channel.ID], seenSeconds[channel.ID] = *sample.TimestampSeconds, true
				for index, interval := range intervals {
					if !interval.open && *sample.TimestampSeconds >= interval.start && *sample.TimestampSeconds <= interval.end {
						scans[index].accept(timedMetricSample{seconds: *sample.TimestampSeconds, value: value, presence: presence})
					}
				}
			}
			return nil
		})
	if err != nil {
		return SessionPitObservation{}, err
	}
	return derivePitObservationWithRises(summary.Session, classified, intervals,
		func(index int, _ pitInterval) (riseObservation, bool) { return fuelScans[index].finish() },
		func(index int, _ pitInterval) (riseObservation, bool) { return veScans[index].finish() })
}

func applyPagedCorrectionValues(page *HistoricalPage, values map[correctionRowKey]map[string]HistoricalValue) {
	for sampleIndex := range page.Samples {
		corrections := values[correctionRowKey{page.ChannelID, page.Samples[sampleIndex].Index}]
		if len(corrections) == 0 {
			continue
		}
		page.Samples[sampleIndex].Values = append([]HistoricalValue(nil), page.Samples[sampleIndex].Values...)
		for valueIndex := range page.Samples[sampleIndex].Values {
			if corrected, ok := corrections[page.Samples[sampleIndex].Values[valueIndex].Column]; ok {
				page.Samples[sampleIndex].Values[valueIndex] = corrected
			}
		}
	}
}
