package telemetryanalysis

import (
	"context"
	"strings"
)

type correctionRowKey struct {
	channel string
	index   int64
}

type correctedPageReader struct {
	CorrectionInputReader
	values map[correctionRowKey]map[string]HistoricalValue
}

func (reader correctedPageReader) ReadPage(ctx context.Context, channelID string, start int64, limit int) (HistoricalPage, error) {
	page, err := reader.CorrectionInputReader.ReadPage(ctx, channelID, start, limit)
	if err != nil {
		return HistoricalPage{}, err
	}
	cloned := false
	for index, sample := range page.Samples {
		corrections := reader.values[correctionRowKey{channelID, sample.Index}]
		if len(corrections) == 0 {
			continue
		}
		if !cloned {
			page.Samples = append([]HistoricalSample(nil), page.Samples...)
			cloned = true
		}
		copy := sample
		copy.Values = append([]HistoricalValue(nil), sample.Values...)
		for valueIndex := range copy.Values {
			if corrected, ok := corrections[copy.Values[valueIndex].Column]; ok {
				copy.Values[valueIndex] = corrected
			}
		}
		page.Samples[index] = copy
	}
	return page, nil
}

// ReadCorrectedLapValidity validates the complete stored decision against
// original target rows, then derives effective lap validity from bounded page
// visits. It does not authorize an artifact or retain continuous sample pages.
func ReadCorrectedLapValidity(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits, original CorrectionSummary, snapshot PreparedSampleCorrectionSnapshot) (LapValidityAnalysis, error) {
	var empty LapValidityAnalysis
	if original.Session.ID != original.Base.SessionID {
		return empty, ErrCorrectionSourceChanged
	}
	targetPages, err := ReadCorrectionTargetPages(ctx, reader, original.Session, snapshot.Corrections)
	if err != nil {
		return empty, err
	}
	view, err := ApplyMixedCorrectionSnapshot(original.Base, targetPages, original.Validity, original.Session, snapshot)
	if err != nil {
		return empty, err
	}
	effective := original.Validity
	if len(view.Corrections) > 0 {
		values := make(map[correctionRowKey]map[string]HistoricalValue, len(view.Corrections))
		gpsChannels := make(map[string]bool)
		for _, channel := range original.Session.Channels {
			if strings.EqualFold(strings.TrimSpace(channel.SourceName), "GPS Time") {
				gpsChannels[channel.ID] = true
			}
		}
		for _, correction := range view.Corrections {
			target := correction.Request.Target
			// The materialized path aligns against original GPS before applying
			// scalar corrections. Corrected GPS values must not realign other
			// channels during the bounded validity pass.
			if gpsChannels[target.ChannelID] {
				continue
			}
			key := correctionRowKey{target.ChannelID, target.SampleIndex}
			if values[key] == nil {
				values[key] = make(map[string]HistoricalValue)
			}
			values[key][target.Column] = correction.Corrected
		}
		if len(values) > 0 {
			corrected, readErr := ReadCorrectionSummary(ctx, correctedPageReader{CorrectionInputReader: reader, values: values}, artifact, limits)
			if readErr != nil {
				return empty, readErr
			}
			effective = corrected.Validity
		}
	}
	if len(view.FamilyUses) > 0 {
		effective.Laps, err = ApplyLapFamilyCorrections(original.Base, original.Validity, effective, view.FamilyUses)
		if err != nil {
			return empty, err
		}
	}
	if len(view.StintBoundaries) > 0 {
		effective.Temporal.StintBoundaries, err = ApplyStintBoundaryCorrections(original.Base, original.Validity, effective, view.StintBoundaries)
		if err != nil {
			return empty, err
		}
	}
	return effective, ctx.Err()
}
