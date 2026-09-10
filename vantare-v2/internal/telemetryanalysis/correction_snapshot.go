package telemetryanalysis

import (
	"errors"
	"fmt"
	"sort"
)

// MaxSampleCorrections is the existing shared operation budget for one snapshot.
const MaxSampleCorrections = 256

var ErrOverlappingCorrections = errors.New("overlapping observation corrections")

// SampleCorrectionInput is supplied by Analysis from the same verified base.
// It is not a wire command and does not grant permission to read an artifact.
type SampleCorrectionInput struct {
	Channel HistoricalChannel
	Sample  HistoricalSample
	Request SampleValueCorrection
}

// PreparedSampleCorrectionSnapshot retains its historical type name for callers.
// The tagged representation is scalar v1, mixed v2 or classification v3. Its
// digest identifies the full active set, not a durable revision, command,
// author, or authorization. Without active classifications the v1 and v2
// representations keep their exact bytes and digests.
type PreparedSampleCorrectionSnapshot struct {
	ContractVersion string                             `json:"contractVersion"`
	Base            SourceAnalysisRef                  `json:"base"`
	SnapshotID      string                             `json:"snapshotId"`
	Corrections     []PreparedSampleCorrection         `json:"corrections"`
	FamilyUses      []PreparedLapFamilyUseCorrection   `json:"familyUses,omitempty"`
	Classifications []PreparedClassificationCorrection `json:"classifications,omitempty"`
}

// PrepareObservationCorrectionSnapshot extends the same source snapshot with
// typed family decisions. Scalar-only snapshots retain their v1 representation.
func PrepareObservationCorrectionSnapshot(base SourceAnalysisRef, inputs []SampleCorrectionInput, original LapValidityAnalysis, familyRequests []LapFamilyUseCorrection) (PreparedSampleCorrectionSnapshot, error) {
	if len(inputs)+len(familyRequests) > MaxSampleCorrections {
		return PreparedSampleCorrectionSnapshot{}, ErrInvalidCorrection
	}
	scalar, err := PrepareSampleCorrectionSnapshot(base, inputs)
	if err != nil || len(familyRequests) == 0 {
		return scalar, err
	}
	families, err := PrepareLapFamilyCorrections(base, original, familyRequests)
	if err != nil {
		return PreparedSampleCorrectionSnapshot{}, err
	}
	return combineObservationSnapshot(scalar, families)
}

// PrepareMixedCorrectionSnapshot extends the same source snapshot with typed
// classification decisions for SessionType and WeatherConditions. Every group
// is prepared live against the same verified base: scalars against their
// channel/sample, families against the validity model, classifications
// against the original session via T12a. Without classification requests the
// result is byte-identical to PrepareObservationCorrectionSnapshot (v1/v2).
// The shared 256-operation quota counts all three groups before any work;
// rejection is atomic and returns no partials.
func PrepareMixedCorrectionSnapshot(base SourceAnalysisRef, inputs []SampleCorrectionInput, original LapValidityAnalysis, familyRequests []LapFamilyUseCorrection, session HistoricalSession, classRequests []ClassificationCorrection) (PreparedSampleCorrectionSnapshot, error) {
	var empty PreparedSampleCorrectionSnapshot
	if len(classRequests) == 0 {
		return PrepareObservationCorrectionSnapshot(base, inputs, original, familyRequests)
	}
	if len(inputs)+len(familyRequests)+len(classRequests) > MaxSampleCorrections {
		return empty, fmt.Errorf("%w: at most %d mixed corrections", ErrInvalidCorrection, MaxSampleCorrections)
	}
	scalar, err := PrepareSampleCorrectionSnapshot(base, inputs)
	if err != nil {
		return empty, err
	}
	var families []PreparedLapFamilyUseCorrection
	if len(familyRequests) > 0 {
		families, err = PrepareLapFamilyCorrections(base, original, familyRequests)
		if err != nil {
			return empty, err
		}
	}
	classes, err := PrepareClassificationCorrectionSet(base, session, classRequests)
	if err != nil {
		return empty, err
	}
	return combineMixedSnapshot(scalar, families, classes)
}

// combineMixedSnapshot joins the three prepared groups in deterministic order.
// The v3 digest covers the base and every group, including each precondition,
// replacement, reason and provenance carried by the prepared requests. v3 is
// only produced with active classifications; otherwise the v1/v2 path applies.
func combineMixedSnapshot(scalar PreparedSampleCorrectionSnapshot, families []PreparedLapFamilyUseCorrection, classes []PreparedClassificationCorrection) (PreparedSampleCorrectionSnapshot, error) {
	var empty PreparedSampleCorrectionSnapshot
	if len(scalar.Corrections)+len(families)+len(classes) > MaxSampleCorrections {
		return empty, ErrInvalidCorrection
	}
	if len(classes) == 0 {
		return combineObservationSnapshot(scalar, families)
	}
	snapshot := scalar
	snapshot.ContractVersion = "analysis.mixed-snapshot.v3"
	if len(families) == 0 {
		families = nil
	}
	snapshot.FamilyUses = families
	snapshot.Classifications = classes
	payload := struct {
		Base            SourceAnalysisRef                  `json:"base"`
		Corrections     []PreparedSampleCorrection         `json:"corrections"`
		FamilyUses      []PreparedLapFamilyUseCorrection   `json:"familyUses"`
		Classifications []PreparedClassificationCorrection `json:"classifications"`
	}{snapshot.Base, snapshot.Corrections, snapshot.FamilyUses, snapshot.Classifications}
	id, err := correctionDigest(snapshot.ContractVersion, payload)
	if err != nil {
		return empty, err
	}
	snapshot.SnapshotID = id
	return snapshot, nil
}

// prepareStoredClassificationCorrections revalidates stored classification
// requests for internal consistency only. It proves neither source authority
// nor metadata quality; replay must call the live preparation functions. The
// minimal session view is rebuilt from the stored originals plus the base
// identity, never from a live source, and never becomes source evidence.
func prepareStoredClassificationCorrections(base SourceAnalysisRef, requests []ClassificationCorrection) ([]PreparedClassificationCorrection, error) {
	if _, err := base.Digest(); err != nil {
		return nil, err
	}
	if len(requests) > MaxSampleCorrections {
		return nil, fmt.Errorf("%w: at most %d stored classification corrections", ErrInvalidCorrection, MaxSampleCorrections)
	}
	session := HistoricalSession{
		SchemaVersion: HistoricalSchemaVersion,
		ID:            base.SessionID,
		Provenance: HistoricalProvenance{
			Source:            ManifestSource{Kind: SourceLMU},
			Parser:            ParserRef{ID: base.ParserID, Version: base.ParserVersion},
			SchemaFingerprint: base.SchemaFingerprint,
		},
	}
	seen := make(map[ClassificationField]bool, len(requests))
	for _, request := range requests {
		if request.Base != base {
			return nil, ErrCorrectionInterpretationChanged
		}
		if seen[request.Field] {
			return nil, ErrOverlappingCorrections
		}
		seen[request.Field] = true
		session.Metadata = append(session.Metadata, HistoricalMetadata{Key: string(request.Field), Present: true, Value: request.ExpectedOriginal, Quality: QualityValid})
	}
	return PrepareClassificationCorrectionSet(base, session, requests)
}

// Both callers supply independently validated/canonical scalar and family sets.
func combineObservationSnapshot(scalar PreparedSampleCorrectionSnapshot, families []PreparedLapFamilyUseCorrection) (PreparedSampleCorrectionSnapshot, error) {
	if len(scalar.Corrections)+len(families) > MaxSampleCorrections {
		return PreparedSampleCorrectionSnapshot{}, ErrInvalidCorrection
	}
	if len(families) == 0 {
		return scalar, nil
	}
	snapshot := scalar
	snapshot.ContractVersion = "analysis.observation-snapshot.v2"
	snapshot.FamilyUses = families
	payload := struct {
		Base        SourceAnalysisRef                `json:"base"`
		Corrections []PreparedSampleCorrection       `json:"corrections"`
		FamilyUses  []PreparedLapFamilyUseCorrection `json:"familyUses"`
	}{snapshot.Base, snapshot.Corrections, snapshot.FamilyUses}
	id, err := correctionDigest(snapshot.ContractVersion, payload)
	if err != nil {
		return PreparedSampleCorrectionSnapshot{}, err
	}
	snapshot.SnapshotID = id
	return snapshot, nil
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
	return canonicalSampleCorrectionSnapshot(base, corrections)
}

// Representation only: callers must validate the prepared scalars against their
// authorized source before applying this projection of a mixed snapshot.
func canonicalSampleCorrectionSnapshot(base SourceAnalysisRef, corrections []PreparedSampleCorrection) (PreparedSampleCorrectionSnapshot, error) {
	var empty PreparedSampleCorrectionSnapshot
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
