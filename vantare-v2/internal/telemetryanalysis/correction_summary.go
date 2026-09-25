package telemetryanalysis

import (
	"context"
	"math"
	"reflect"
	"strings"
)

const maxCorrectionSummaryEventRows = 100_000

// CorrectionSummary contains the prepared observations without retaining the
// recorded sample pages. It is sufficient for preparation, not projection.
type CorrectionSummary struct {
	Base               SourceAnalysisRef
	Session            HistoricalSession
	Validity           LapValidityAnalysis
	EditableChannelIDs []string
}

// ReadCorrectionSummary first validates the complete authorized source, then
// rereads continuous channels against bounded GPS windows. Event pages are
// retained only up to an explicit budget; long continuous signals are not.
func ReadCorrectionSummary(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits) (CorrectionSummary, error) {
	var empty CorrectionSummary
	eventPagesByID := make(map[string][]HistoricalPage)
	alignedEventPagesByID := make(map[string][]HistoricalPage)
	prepared := make(map[string]bool)
	var gpsScan orderedGPSClockScan
	var gpsPageStatus TemporalAlignmentStatus
	var gpsPageInvalid bool
	var gpsID string
	eventRows := 0
	var resetScan orderedLapDistResetScan
	session, err := VisitCorrectionPages(ctx, reader, artifact, limits, func(channel HistoricalChannel, page HistoricalPage) error {
		name := strings.ToLower(strings.TrimSpace(channel.SourceName))
		prepared[channel.ID] = true
		switch name {
		case "gps time":
			if gpsID == "" {
				gpsID = channel.ID
			}
			if gpsID == channel.ID && !gpsPageInvalid {
				status, ordered := gpsScan.accept(channel, page)
				if !ordered {
					return ErrInvalidHistoricalPage
				}
				if !status.Aligned {
					gpsPageStatus, gpsPageInvalid = status, true
				}
			}
		case "lap dist":
			if !resetScan.accept(page) {
				return ErrInvalidHistoricalPage
			}
		case "lap", "lap time", "in pits", "lastimpactmagnitude", "tyrescompound":
			eventRows += len(page.Samples)
			if eventRows > maxCorrectionSummaryEventRows {
				return ErrCorrectionReadLimit
			}
			eventPagesByID[channel.ID] = append(eventPagesByID[channel.ID], page)
		}
		return nil
	})
	if err != nil {
		return empty, err
	}
	bridge, bridgeStatus := scannedGPSBridge(session, gpsScan, gpsPageStatus, gpsPageInvalid)
	resets, resetFrequency := resetScan.finish()
	observations := lapValidityObservations{resets: resets, resetFrequency: resetFrequency}
	alignment := TemporalAlignmentResult{Session: cloneHistoricalSession(session), Bridge: bridgeStatus, Channels: make(map[string]TemporalAlignmentStatus)}
	if bridgeStatus.Aligned {
		lookup := orderedGPSPageLookup{reader: reader, channel: bridge, pageRows: limits.PageRows}
		coverage := make(map[string]*orderedCoverageScan)
		var fuel orderedFuelRiseScan
		channelByID := make(map[string]HistoricalChannel, len(session.Channels))
		for _, channel := range session.Channels {
			channelByID[channel.ID] = channel
		}
		secondSession, visitErr := visitCorrectionPages(ctx, reader, artifact, limits, "", SamplingContinuousImplicitFrequency, func(channel HistoricalChannel, page HistoricalPage) error {
			if channel.Sampling.Kind != SamplingContinuousImplicitFrequency {
				return nil
			}
			status, seen := alignment.Channels[channel.ID]
			if seen && !status.Aligned {
				return nil
			}
			if channel.Sampling.FrequencyHz <= 0 || page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz != channel.Sampling.FrequencyHz {
				alignment.Channels[channel.ID] = TemporalAlignmentStatus{Reason: "invalid_frequency"}
				return nil
			}
			if bridge.Sampling.FrequencyHz%channel.Sampling.FrequencyHz != 0 {
				alignment.Channels[channel.ID] = TemporalAlignmentStatus{Reason: "incompatible_frequency"}
				return nil
			}
			ratio := int64(bridge.Sampling.FrequencyHz / channel.Sampling.FrequencyHz)
			for index := range page.Samples {
				sample := &page.Samples[index]
				if sample.Index < 0 || sample.Index > math.MaxInt64/ratio {
					alignment.Channels[channel.ID] = TemporalAlignmentStatus{Reason: "invalid_sample_index"}
					return nil
				}
				seconds, found, readErr := lookup.timeAt(ctx, sample.Index*ratio)
				if readErr != nil {
					return readErr
				}
				if !found {
					alignment.Channels[channel.ID] = TemporalAlignmentStatus{Reason: "truncated_coverage"}
					return nil
				}
				sample.TimestampSeconds = &seconds
			}
			page.Sampling.Origin = TimeOriginSourceTimestamp
			alignment.Channels[channel.ID] = TemporalAlignmentStatus{Aligned: true, Reason: "aligned"}
			name := strings.ToLower(strings.TrimSpace(channel.SourceName))
			switch name {
			case "ambient temperature", "track temperature", "wind heading", "wind speed", "lap dist":
				scan := coverage[channel.ID]
				if scan == nil {
					scan = &orderedCoverageScan{}
					coverage[channel.ID] = scan
				}
				if !scan.accept(page) {
					return ErrInvalidHistoricalPage
				}
			case "fuel level":
				if !fuel.accept(page) {
					return ErrInvalidHistoricalPage
				}
			case "lap", "lap time", "in pits", "lastimpactmagnitude", "tyrescompound":
				alignedEventPagesByID[channel.ID] = append(alignedEventPagesByID[channel.ID], page)
			}
			return nil
		})
		if visitErr != nil {
			return empty, visitErr
		}
		if !reflect.DeepEqual(secondSession, session) {
			return empty, ErrInvalidCorrectionSource
		}
		for index := range alignment.Session.Channels {
			channel := &alignment.Session.Channels[index]
			if alignment.Channels[channel.ID].Aligned {
				channel.Sampling.Origin = TimeOriginSourceTimestamp
			}
		}
		for _, name := range []string{"ambient temperature", "track temperature", "wind heading", "wind speed", "lap dist"} {
			for id, channel := range channelByID {
				if strings.EqualFold(strings.TrimSpace(channel.SourceName), name) && alignment.Channels[id].Aligned {
					if scan := coverage[id]; scan != nil {
						if start, end, ok := scan.finish(); ok {
							observations.continuousStart, observations.continuousEnd, observations.hasContinuousCoverage = start, end, true
							break
						}
					}
				}
			}
			if observations.hasContinuousCoverage {
				break
			}
		}
		for id, channel := range channelByID {
			if strings.EqualFold(strings.TrimSpace(channel.SourceName), "fuel level") && alignment.Channels[id].Aligned {
				observations.fuelRises = fuel.finish()
			}
			if strings.EqualFold(strings.TrimSpace(channel.SourceName), "lap dist") && alignment.Channels[id].Aligned {
				ratio := int64(bridge.Sampling.FrequencyHz / channel.Sampling.FrequencyHz)
				for index := range observations.resets {
					seconds, found, readErr := lookup.timeAt(ctx, observations.resets[index].index*ratio)
					if readErr != nil {
						return empty, readErr
					}
					if !found {
						return empty, ErrInvalidHistoricalPage
					}
					observations.resets[index].seconds = &seconds
				}
			}
		}
		observations.labelTraffic = func(laps []AnalyzedLap) error {
			trafficSession, visitErr := visitCorrectionPages(ctx, reader, artifact, limits, "time behind next", "", func(channel HistoricalChannel, page HistoricalPage) error {
				if !alignment.Channels[channel.ID].Aligned {
					return nil
				}
				ratio := int64(bridge.Sampling.FrequencyHz / channel.Sampling.FrequencyHz)
				for _, sample := range page.Samples {
					gap, ok := firstNumber(sample.Values)
					if !ok || math.Abs(gap) < 0.05 || math.Abs(gap) > trafficMaximumGapSeconds {
						continue
					}
					seconds, found, readErr := lookup.timeAt(ctx, sample.Index*ratio)
					if readErr != nil {
						return readErr
					}
					if !found {
						return ErrInvalidHistoricalPage
					}
					if index := lapIndexAt(laps, seconds); index < len(laps) {
						addLapLabel(&laps[index], LapLabelTraffic)
					}
				}
				return nil
			})
			if visitErr != nil {
				return visitErr
			}
			if !reflect.DeepEqual(trafficSession, session) {
				return ErrInvalidCorrectionSource
			}
			return nil
		}
	}
	eventPages := make(map[string][]HistoricalPage)
	for _, channel := range alignment.Session.Channels {
		name := strings.ToLower(strings.TrimSpace(channel.SourceName))
		switch name {
		case "lap", "lap time", "in pits", "lastimpactmagnitude", "tyrescompound":
			pages := eventPagesByID[channel.ID]
			if alignment.Channels[channel.ID].Aligned {
				pages = alignedEventPagesByID[channel.ID]
			}
			eventPages[name] = append(eventPages[name], pages...)
		}
	}
	observations.lapEvents, observations.duplicateLapEvents = readLapEvents(eventPages["lap"])
	observations.lapTimes = readEvents(eventPages["lap time"])
	observations.pitEvents = readEvents(eventPages["in pits"])
	observations.impactEvents = readEvents(eventPages["lastimpactmagnitude"])
	observations.tyreEvents = readEvents(eventPages["tyrescompound"])
	validity, err := analyzeLapValidityObservations(alignment, observations)
	if err != nil {
		return empty, err
	}
	base, err := CorrectionSourceFromModel(AuthorizedSessionModel{Artifact: artifact, Session: alignment.Session, Validity: &validity})
	if err != nil {
		return empty, err
	}
	result := CorrectionSummary{Base: base, Session: alignment.Session, Validity: validity, EditableChannelIDs: []string{}}
	for _, channel := range alignment.Session.Channels {
		if prepared[channel.ID] && channel.Unit.Quality == QualityValid {
			result.EditableChannelIDs = append(result.EditableChannelIDs, channel.ID)
			delete(prepared, channel.ID)
		}
	}
	return result, ctx.Err()
}
