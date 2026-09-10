package telemetryanalysis

import (
	"fmt"
	"reflect"
	"strings"
)

// EffectiveCorrectionView is detached from the authorized input and carries its
// correction provenance. Original quality and all time/segment metadata remain
// unchanged; callers must not present corrected scalars as observed measurements.
// Metadata holds the effective classification values on a detached copy: only
// the Value of a validly corrected field changes, never quality, presence,
// clock, units or source.
type EffectiveCorrectionView struct {
	Base            SourceAnalysisRef
	SnapshotID      string
	Pages           []HistoricalPage
	Corrections     []PreparedSampleCorrection
	FamilyUses      []PreparedLapFamilyUseCorrection
	Metadata        []HistoricalMetadata
	Classifications []PreparedClassificationCorrection
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

// ApplyObservationCorrectionSnapshot validates both operation sets against the
// original authorized input. It retains the mixed identity; family decisions are
// applied to reanalyzed laps by the derivation pipeline, never to raw pages.
func ApplyObservationCorrectionSnapshot(base SourceAnalysisRef, channels []HistoricalChannel, pages []HistoricalPage, original LapValidityAnalysis, snapshot PreparedSampleCorrectionSnapshot) (EffectiveCorrectionView, error) {
	if len(snapshot.FamilyUses) == 0 {
		return ApplySampleCorrectionSnapshot(base, channels, pages, snapshot)
	}
	var empty EffectiveCorrectionView
	if len(snapshot.Corrections)+len(snapshot.FamilyUses) > MaxSampleCorrections {
		return empty, ErrInvalidCorrection
	}
	scalar, err := canonicalSampleCorrectionSnapshot(snapshot.Base, snapshot.Corrections)
	if err != nil {
		return empty, err
	}
	view, err := ApplySampleCorrectionSnapshot(base, channels, pages, scalar)
	if err != nil {
		return empty, err
	}
	requests := make([]LapFamilyUseCorrection, len(snapshot.FamilyUses))
	for i, family := range snapshot.FamilyUses {
		requests[i] = family.Request
	}
	families, err := PrepareLapFamilyCorrections(base, original, requests)
	if err != nil {
		return empty, err
	}
	checked, err := combineObservationSnapshot(scalar, families)
	if err != nil {
		return empty, err
	}
	if !reflect.DeepEqual(checked, snapshot) {
		return empty, fmt.Errorf("%w: observation snapshot integrity", ErrInvalidCorrection)
	}
	view.SnapshotID = checked.SnapshotID
	view.FamilyUses = families
	return view, nil
}

// ApplyMixedCorrectionSnapshot validates all three operation sets against the
// original authorized input: scalars against pages, families against the
// validity model, classifications against the original session via T12a/J1.
// The session is the single authority for channels and metadata. A v4 snapshot
// is rebuilt through the canonical J1 set with its persisted target and the
// J2 combiner, validating complete equality before applying; an inert target
// is rejected. It retains the snapshot identity and exposes the effective
// metadata on a detached copy plus the prepared classification decisions,
// without duplicating the whole session and without carrying the resolved
// target into the view. Without classifications the v1/v2 semantics and APIs
// apply unchanged. It is pure and does not authorize I/O or refresh
// derivatives.
func ApplyMixedCorrectionSnapshot(base SourceAnalysisRef, pages []HistoricalPage, original LapValidityAnalysis, session HistoricalSession, snapshot PreparedSampleCorrectionSnapshot) (EffectiveCorrectionView, error) {
	if len(snapshot.Classifications) == 0 {
		return ApplyObservationCorrectionSnapshot(base, session.Channels, pages, original, snapshot)
	}
	var empty EffectiveCorrectionView
	if len(snapshot.Corrections)+len(snapshot.FamilyUses)+len(snapshot.Classifications) > MaxSampleCorrections {
		return empty, ErrInvalidCorrection
	}
	scalar, err := canonicalSampleCorrectionSnapshot(snapshot.Base, snapshot.Corrections)
	if err != nil {
		return empty, err
	}
	combined, err := combineObservationSnapshot(scalar, snapshot.FamilyUses)
	if err != nil {
		return empty, err
	}
	view, err := ApplyObservationCorrectionSnapshot(base, session.Channels, pages, original, combined)
	if err != nil {
		return empty, err
	}
	classRequests := make([]ClassificationCorrection, len(snapshot.Classifications))
	for i, classification := range snapshot.Classifications {
		classRequests[i] = classification.Request
	}
	classes, err := PrepareCanonicalClassificationCorrectionSet(base, session, classRequests, snapshot.CanonicalCombination)
	if err != nil {
		return empty, err
	}
	checked, err := combineCanonicalMixedSnapshot(scalar, view.FamilyUses, classes, snapshot.CanonicalCombination)
	if err != nil {
		return empty, err
	}
	if !reflect.DeepEqual(checked, snapshot) {
		return empty, fmt.Errorf("%w: mixed snapshot integrity", ErrInvalidCorrection)
	}
	metadata := append([]HistoricalMetadata(nil), session.Metadata...)
	for _, classification := range classes {
		var key string
		if isIdentityClassificationField(classification.Request.Field) {
			k, _, _, err := identityTargetField(snapshot.CanonicalCombination, classification.Request.Field)
			if err != nil {
				return empty, err
			}
			key = k
		} else {
			k, _, err := classificationCorrectionKey(classification.Request.Field)
			if err != nil {
				return empty, err
			}
			key = k
		}
		applied := false
		for i := range metadata {
			if strings.ToLower(strings.TrimSpace(metadata[i].Key)) == key {
				metadata[i].Value = classification.Corrected
				applied = true
				break
			}
		}
		if !applied {
			return empty, fmt.Errorf("%w: classification target", ErrCorrectionTarget)
		}
	}
	view.SnapshotID = checked.SnapshotID
	view.Metadata = metadata
	view.Classifications = classes
	return view, nil
}
