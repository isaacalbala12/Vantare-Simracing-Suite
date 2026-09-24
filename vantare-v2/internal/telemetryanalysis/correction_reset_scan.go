package telemetryanalysis

import (
	"context"
	"math"
	"strings"
)

// scanCorrectionLapDistResets keeps only lap resets and one GPS window. The
// first visit validates the complete source and bridge; the second verifies
// coverage of every Lap Dist sample before assigning timestamps to resets.
// It does not replace the full correction input or its other derivations.
func scanCorrectionLapDistResets(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits) ([]observedLapReset, int, TemporalAlignmentStatus, TemporalAlignmentStatus, error) {
	var gpsScan orderedGPSClockScan
	var resetScan orderedLapDistResetScan
	var gpsPageStatus TemporalAlignmentStatus
	var gpsPageInvalid bool
	var gpsChannelID string
	var lapDistPages bool
	session, err := VisitCorrectionPages(ctx, reader, artifact, limits, func(channel HistoricalChannel, page HistoricalPage) error {
		switch strings.ToLower(strings.TrimSpace(channel.SourceName)) {
		case "gps time":
			if gpsChannelID == "" {
				gpsChannelID = channel.ID
			}
			if channel.ID != gpsChannelID {
				return nil // Metadata validation reports duplicate bridges.
			}
			if !gpsPageInvalid {
				status, ordered := gpsScan.accept(channel, page)
				if !ordered {
					return ErrInvalidHistoricalPage
				}
				if !status.Aligned {
					gpsPageStatus, gpsPageInvalid = status, true
				}
			}
		case "lap dist":
			lapDistPages = true
			if !resetScan.accept(page) {
				return ErrInvalidHistoricalPage
			}
		}
		return nil
	})
	if err != nil {
		return nil, 0, TemporalAlignmentStatus{}, TemporalAlignmentStatus{}, err
	}
	resets, frequency := resetScan.finish()
	bridge, bridgeStatus := scannedGPSBridge(session, gpsScan, gpsPageStatus, gpsPageInvalid)
	if !bridgeStatus.Aligned || !lapDistPages {
		return resets, frequency, bridgeStatus, TemporalAlignmentStatus{}, nil
	}

	lookup := orderedGPSPageLookup{reader: reader, channel: bridge, pageRows: limits.PageRows}
	channelStatus := TemporalAlignmentStatus{Aligned: true, Reason: "aligned"}
	var ratio int64
	_, err = VisitCorrectionPages(ctx, reader, artifact, limits, func(channel HistoricalChannel, page HistoricalPage) error {
		if !strings.EqualFold(strings.TrimSpace(channel.SourceName), "lap dist") || !channelStatus.Aligned {
			return nil
		}
		if channel.Sampling.FrequencyHz <= 0 || page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz != channel.Sampling.FrequencyHz {
			channelStatus = TemporalAlignmentStatus{Reason: "invalid_frequency"}
			return nil
		}
		if bridge.Sampling.FrequencyHz%channel.Sampling.FrequencyHz != 0 {
			channelStatus = TemporalAlignmentStatus{Reason: "incompatible_frequency"}
			return nil
		}
		ratio = int64(bridge.Sampling.FrequencyHz / channel.Sampling.FrequencyHz)
		for _, sample := range page.Samples {
			if sample.Index < 0 || sample.Index > math.MaxInt64/ratio {
				channelStatus = TemporalAlignmentStatus{Reason: "invalid_sample_index"}
				break
			}
			_, found, readErr := lookup.timeAt(ctx, sample.Index*ratio)
			if readErr != nil {
				return readErr
			}
			if !found {
				channelStatus = TemporalAlignmentStatus{Reason: "truncated_coverage"}
				break
			}
		}
		return nil
	})
	if err != nil {
		return nil, 0, TemporalAlignmentStatus{}, TemporalAlignmentStatus{}, err
	}
	if !channelStatus.Aligned {
		return resets, frequency, bridgeStatus, channelStatus, nil
	}
	for index := range resets {
		seconds, found, readErr := lookup.timeAt(ctx, resets[index].index*ratio)
		if readErr != nil {
			return nil, 0, TemporalAlignmentStatus{}, TemporalAlignmentStatus{}, readErr
		}
		if !found {
			return nil, 0, TemporalAlignmentStatus{}, TemporalAlignmentStatus{}, ErrInvalidHistoricalPage
		}
		resets[index].seconds = &seconds
	}
	return resets, frequency, bridgeStatus, channelStatus, nil
}

func scannedGPSBridge(session HistoricalSession, scan orderedGPSClockScan, pageStatus TemporalAlignmentStatus, pageInvalid bool) (HistoricalChannel, TemporalAlignmentStatus) {
	var bridge HistoricalChannel
	found := false
	for _, channel := range session.Channels {
		if !strings.EqualFold(strings.TrimSpace(channel.SourceName), "gps time") {
			continue
		}
		if found {
			return HistoricalChannel{}, TemporalAlignmentStatus{Reason: "bridge_invalid_shape"}
		}
		bridge, found = channel, true
	}
	if !found {
		return bridge, TemporalAlignmentStatus{Reason: "bridge_absent"}
	}
	if bridge.Sampling.Kind != SamplingContinuousImplicitFrequency {
		return bridge, TemporalAlignmentStatus{Reason: "bridge_not_continuous"}
	}
	if bridge.Sampling.FrequencyHz <= 0 {
		return bridge, TemporalAlignmentStatus{Reason: "bridge_invalid_frequency"}
	}
	if len(bridge.Columns) != 1 {
		return bridge, TemporalAlignmentStatus{Reason: "bridge_invalid_shape"}
	}
	if pageInvalid {
		return bridge, pageStatus
	}
	return bridge, scan.finish()
}
