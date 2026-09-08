package telemetryanalysis

import (
	"fmt"
	"reflect"
)

// EffectiveCorrectionView is detached from the authorized input and carries its
// correction provenance. Original quality and all time/segment metadata remain
// unchanged; callers must not present corrected scalars as observed measurements.
type EffectiveCorrectionView struct {
	Base        SourceAnalysisRef
	SnapshotID  string
	Pages       []HistoricalPage
	Corrections []PreparedSampleCorrection
}

// ApplySampleCorrectionSnapshot requires complete coverage of the snapshot's
// targets in pages from the same currently authorized base. It never silently
// applies a subset. It is pure and does not authorize I/O or refresh derivatives.
func ApplySampleCorrectionSnapshot(base SourceAnalysisRef, channels []HistoricalChannel, pages []HistoricalPage, snapshot PreparedSampleCorrectionSnapshot) (EffectiveCorrectionView, error) {
	var empty EffectiveCorrectionView
	if _, err := base.Digest(); err != nil {
		return empty, err
	}
	if base != snapshot.Base {
		if base.SessionID != snapshot.Base.SessionID || base.ContentSHA256 != snapshot.Base.ContentSHA256 || base.SizeBytes != snapshot.Base.SizeBytes {
			return empty, ErrCorrectionSourceChanged
		}
		return empty, ErrCorrectionInterpretationChanged
	}
	if len(snapshot.Corrections) > MaxSampleCorrections {
		return empty, ErrInvalidCorrection
	}
	type rowKey struct {
		channel string
		index   int64
	}
	type position struct{ page, sample, count int }
	needed := make(map[rowKey]bool, len(snapshot.Corrections))
	for _, correction := range snapshot.Corrections {
		target := correction.Request.Target
		needed[rowKey{target.ChannelID, target.SampleIndex}] = true
	}
	positions := make(map[rowKey]position, len(needed))
	for p, page := range pages {
		for s, sample := range page.Samples {
			key := rowKey{page.ChannelID, sample.Index}
			if needed[key] {
				found := positions[key]
				positions[key] = position{p, s, found.count + 1}
			}
		}
	}
	channelByID := make(map[string]HistoricalChannel, len(channels))
	channelCounts := make(map[string]int, len(channels))
	for _, channel := range channels {
		channelByID[channel.ID] = channel
		channelCounts[channel.ID]++
	}
	inputs := make([]SampleCorrectionInput, len(snapshot.Corrections))
	for i, correction := range snapshot.Corrections {
		target := correction.Request.Target
		position := positions[rowKey{target.ChannelID, target.SampleIndex}]
		if position.count != 1 || channelCounts[target.ChannelID] != 1 {
			return empty, fmt.Errorf("%w: correction %d coverage", ErrCorrectionTarget, i)
		}
		inputs[i] = SampleCorrectionInput{Channel: channelByID[target.ChannelID], Sample: pages[position.page].Samples[position.sample], Request: correction.Request}
	}
	checked, err := PrepareSampleCorrectionSnapshot(base, inputs)
	if err != nil {
		return empty, err
	}
	if !reflect.DeepEqual(checked, snapshot) {
		return empty, fmt.Errorf("%w: snapshot integrity", ErrInvalidCorrection)
	}
	// Copy even unmodified samples so a later consumer cannot mutate the original
	// by writing through this effective view, including timestamp pointers.
	resultPages := make([]HistoricalPage, len(pages))
	for p, page := range pages {
		resultPages[p] = page
		if page.Samples != nil {
			resultPages[p].Samples = make([]HistoricalSample, len(page.Samples))
		}
		for s, sample := range page.Samples {
			resultPages[p].Samples[s] = sample
			if sample.Values != nil {
				resultPages[p].Samples[s].Values = append([]HistoricalValue{}, sample.Values...)
			}
			if sample.TimestampSeconds != nil {
				timestamp := *sample.TimestampSeconds
				resultPages[p].Samples[s].TimestampSeconds = &timestamp
			}
		}
	}
	for _, correction := range checked.Corrections {
		target := correction.Request.Target
		position := positions[rowKey{target.ChannelID, target.SampleIndex}]
		values := resultPages[position.page].Samples[position.sample].Values
		for i := range values {
			if values[i].Column == target.Column {
				values[i] = correction.Corrected
			}
		}
	}
	return EffectiveCorrectionView{Base: base, SnapshotID: checked.SnapshotID, Pages: resultPages, Corrections: checked.Corrections}, nil
}
