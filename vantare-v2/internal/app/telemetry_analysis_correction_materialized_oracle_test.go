package app

import "github.com/vantare/overlays/v2/internal/telemetryanalysis"

// Keep the materialized route only as an independent oracle for paged correction tests.
func correctionInputsForRequests(input telemetryanalysis.CorrectionInput, requests []telemetryanalysis.SampleValueCorrection) ([]telemetryanalysis.SampleCorrectionInput, error) {
	type key struct {
		channel string
		index   int64
	}
	wanted := make(map[key]bool, len(requests))
	for _, request := range requests {
		wanted[key{request.Target.ChannelID, request.Target.SampleIndex}] = true
	}
	samples := make(map[key]telemetryanalysis.HistoricalSample, len(wanted))
	for _, page := range input.Pages {
		for _, sample := range page.Samples {
			k := key{page.ChannelID, sample.Index}
			if wanted[k] {
				if _, duplicate := samples[k]; duplicate {
					return nil, telemetryanalysis.ErrCorrectionTarget
				}
				samples[k] = sample
			}
		}
	}
	channels := make(map[string]telemetryanalysis.HistoricalChannel, len(input.Session.Channels))
	for _, channel := range input.Session.Channels {
		channels[channel.ID] = channel
	}
	result := make([]telemetryanalysis.SampleCorrectionInput, len(requests))
	for i, request := range requests {
		sample, ok := samples[key{request.Target.ChannelID, request.Target.SampleIndex}]
		if !ok {
			return nil, telemetryanalysis.ErrCorrectionTarget
		}
		channel, ok := channels[request.Target.ChannelID]
		if !ok {
			return nil, telemetryanalysis.ErrCorrectionTarget
		}
		result[i] = telemetryanalysis.SampleCorrectionInput{Channel: channel, Sample: sample, Request: request}
	}
	return result, nil
}

func observationInputForRequests(input telemetryanalysis.CorrectionInput, samples []telemetryanalysis.SampleCorrectionInput, families []telemetryanalysis.LapFamilyUseCorrection, stints []telemetryanalysis.StintBoundaryCorrection) (telemetryanalysis.ObservationCorrectionInput, error) {
	result := telemetryanalysis.ObservationCorrectionInput{Samples: samples, Original: input.Validity, Effective: input.Validity, FamilyUses: families, StintBoundaries: stints}
	if len(samples) == 0 || (len(families) == 0 && len(stints) == 0) {
		return result, nil
	}
	snapshot, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(input.Base, samples)
	if err != nil {
		return telemetryanalysis.ObservationCorrectionInput{}, err
	}
	view, err := telemetryanalysis.ApplySampleCorrectionSnapshot(input.Base, input.Session.Channels, input.Pages, snapshot)
	if err != nil {
		return telemetryanalysis.ObservationCorrectionInput{}, err
	}
	result.Effective, err = telemetryanalysis.AnalyzeLapValidity(input.Session, view.Pages)
	if err != nil {
		return telemetryanalysis.ObservationCorrectionInput{}, telemetryanalysis.ErrCorrectionValue
	}
	return result, nil
}
