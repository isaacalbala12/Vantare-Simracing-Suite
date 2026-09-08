package telemetryanalysis

import (
	"errors"
	"fmt"
	"sort"
)

// MaxSampleCorrections bounds a single scalar snapshot, independently of source size.
const MaxSampleCorrections = 256

var ErrOverlappingCorrections = errors.New("overlapping observation corrections")

// SampleCorrectionInput is supplied by Analysis from the same verified base.
// It is not a wire command and does not grant permission to read an artifact.
type SampleCorrectionInput struct {
	Channel HistoricalChannel
	Sample  HistoricalSample
	Request SampleValueCorrection
}

// PreparedSampleCorrectionSnapshot is an immutable-by-ownership value for future
// custody. Its digest identifies the full active set, not a durable revision,
// command, author, or authorization. No input collections are retained.
type PreparedSampleCorrectionSnapshot struct {
	ContractVersion string                     `json:"contractVersion"`
	Base            SourceAnalysisRef          `json:"base"`
	SnapshotID      string                     `json:"snapshotId"`
	Corrections     []PreparedSampleCorrection `json:"corrections"`
}

// PrepareSampleCorrectionSnapshot validates the entire set before publishing a
// result. Each scalar is checked against its original, never a previous edit.
func PrepareSampleCorrectionSnapshot(base SourceAnalysisRef, inputs []SampleCorrectionInput) (PreparedSampleCorrectionSnapshot, error) {
	var empty PreparedSampleCorrectionSnapshot
	if _, err := base.Digest(); err != nil {
		return empty, err
	}
	if len(inputs) > MaxSampleCorrections {
		return empty, fmt.Errorf("%w: at most %d scalar corrections", ErrInvalidCorrection, MaxSampleCorrections)
	}
	corrections := make([]PreparedSampleCorrection, 0, len(inputs))
	seen := make(map[SampleCorrectionTarget]bool, len(inputs))
	for i, input := range inputs {
		prepared, err := PrepareSampleCorrection(base, input.Channel, input.Sample, input.Request)
		if err != nil {
			return empty, fmt.Errorf("correction %d: %w", i, err)
		}
		target := prepared.Request.Target
		if seen[target] {
			return empty, fmt.Errorf("%w: correction %d", ErrOverlappingCorrections, i)
		}
		seen[target] = true
		corrections = append(corrections, prepared)
	}
	sort.Slice(corrections, func(i, j int) bool {
		a, b := corrections[i].Request.Target, corrections[j].Request.Target
		if a.ChannelID != b.ChannelID {
			return a.ChannelID < b.ChannelID
		}
		if a.Column != b.Column {
			return a.Column < b.Column
		}
		return a.SampleIndex < b.SampleIndex
	})
	snapshot := PreparedSampleCorrectionSnapshot{ContractVersion: "analysis.sample-snapshot.v1", Base: base, Corrections: corrections}
	// Exclude the self-referential ID from the canonical payload.
	payload := struct {
		Base        SourceAnalysisRef          `json:"base"`
		Corrections []PreparedSampleCorrection `json:"corrections"`
	}{base, corrections}
	id, err := correctionDigest(snapshot.ContractVersion, payload)
	if err != nil {
		return empty, err
	}
	snapshot.SnapshotID = id
	return snapshot, nil
}
