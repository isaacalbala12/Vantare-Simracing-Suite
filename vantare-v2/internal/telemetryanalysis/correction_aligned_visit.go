package telemetryanalysis

import (
	"context"
	"math"
	"reflect"
	"strings"
)

// visitAlignedCorrectionPages revisits the authorized reader without retaining
// its samples. The summary fixes which channels were aligned by the complete
// source validation; selected continuous pages receive the same GPS times.
// The reader may be a validated correctedPageReader for an exact snapshot.
// Consumers must discard accumulated output unless the whole visit succeeds.
func visitAlignedCorrectionPages(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits, summary CorrectionSummary, wanted func(HistoricalChannel) bool, visit func(HistoricalChannel, HistoricalPage) error) error {
	if wanted == nil || visit == nil {
		return ErrInvalidCorrectionSource
	}
	channels := make(map[string]HistoricalChannel, len(summary.Session.Channels))
	var gps HistoricalChannel
	for _, channel := range summary.Session.Channels {
		channels[channel.ID] = channel
		if gps.ID == "" && strings.EqualFold(strings.TrimSpace(channel.SourceName), "GPS Time") {
			gps = channel
		}
	}
	lookup := orderedGPSPageLookup{reader: reader, channel: gps, pageRows: limits.PageRows}
	rawSession, err := VisitCorrectionPages(ctx, reader, artifact, limits, func(raw HistoricalChannel, page HistoricalPage) error {
		aligned, ok := channels[raw.ID]
		if !ok || raw.SourceName != aligned.SourceName || raw.Sampling.Kind != aligned.Sampling.Kind || raw.Sampling.FrequencyHz != aligned.Sampling.FrequencyHz {
			return ErrInvalidCorrectionSource
		}
		if !wanted(aligned) {
			return nil
		}
		if aligned.Sampling.Origin == TimeOriginSourceTimestamp && page.Sampling.Origin != TimeOriginSourceTimestamp {
			if gps.ID == "" || gps.Sampling.FrequencyHz <= 0 || aligned.Sampling.FrequencyHz <= 0 ||
				gps.Sampling.FrequencyHz%aligned.Sampling.FrequencyHz != 0 {
				return ErrInvalidHistoricalPage
			}
			ratio := int64(gps.Sampling.FrequencyHz / aligned.Sampling.FrequencyHz)
			for index := range page.Samples {
				sample := &page.Samples[index]
				if sample.Index < 0 || sample.Index > math.MaxInt64/ratio {
					return ErrInvalidHistoricalPage
				}
				seconds, found, readErr := lookup.timeAt(ctx, sample.Index*ratio)
				if readErr != nil {
					return readErr
				}
				if !found {
					return ErrInvalidHistoricalPage
				}
				sample.TimestampSeconds = &seconds
			}
			page.Sampling.Origin = TimeOriginSourceTimestamp
		}
		if page.Sampling != aligned.Sampling {
			return ErrInvalidHistoricalPage
		}
		return visit(aligned, page)
	})
	if err != nil {
		return err
	}
	if len(rawSession.Channels) != len(summary.Session.Channels) {
		return ErrInvalidCorrectionSource
	}
	verified := cloneHistoricalSession(rawSession)
	for index := range verified.Channels {
		if verified.Channels[index].ID != summary.Session.Channels[index].ID {
			return ErrInvalidCorrectionSource
		}
		verified.Channels[index].Sampling.Origin = summary.Session.Channels[index].Sampling.Origin
	}
	if !reflect.DeepEqual(verified, summary.Session) {
		return ErrInvalidCorrectionSource
	}
	return nil
}
