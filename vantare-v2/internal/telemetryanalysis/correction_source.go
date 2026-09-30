package telemetryanalysis

import (
	"errors"
	"fmt"
)

var ErrInvalidCorrectionSource = errors.New("invalid correction analysis source")

// CorrectionSourceFromModel binds a correction to an Analysis-owned model.
// Only the actual producer can supply the analysis version: legacy stored
// results without that stamp require reanalysis, never a version fallback.
// The returned reference identifies content but does not authorize future I/O.
func CorrectionSourceFromModel(model AuthorizedSessionModel) (SourceAnalysisRef, error) {
	var empty SourceAnalysisRef
	manifest := model.Artifact.Manifest()
	if !validAuthorizedHistoricalArtifact(model.Artifact) || model.Session.SchemaVersion != HistoricalSchemaVersion ||
		model.Session.Provenance.Source != manifest.Source || model.Session.Provenance.Parser != manifest.Parser {
		return empty, fmt.Errorf("%w: artifact or parser", ErrInvalidCorrectionSource)
	}
	validity := model.Validity
	if validity == nil || validity.SessionID != model.Session.ID || validity.ComputationVersion != lapValidityComputationVersion {
		return empty, fmt.Errorf("%w: analysis version or session", ErrInvalidCorrectionSource)
	}
	temporal := validity.Temporal
	if err := temporal.ContractVersion.ValidateTemporal(); err != nil {
		return empty, fmt.Errorf("%w: %w", ErrInvalidCorrectionSource, err)
	}
	if temporal.Segments == nil || temporal.Gaps == nil || temporal.LapBoundaries == nil || temporal.StintBoundaries == nil {
		return empty, fmt.Errorf("%w: missing temporal collections", ErrInvalidCorrectionSource)
	}
	for _, segment := range temporal.Segments {
		if err := segment.Validate(); err != nil {
			return empty, fmt.Errorf("%w: segment: %w", ErrInvalidCorrectionSource, err)
		}
	}
	for _, gap := range temporal.Gaps {
		if err := gap.Validate(); err != nil {
			return empty, fmt.Errorf("%w: gap: %w", ErrInvalidCorrectionSource, err)
		}
	}
	for _, boundary := range temporal.LapBoundaries {
		if err := boundary.Validate(); err != nil {
			return empty, fmt.Errorf("%w: lap boundary: %w", ErrInvalidCorrectionSource, err)
		}
	}
	for _, boundary := range temporal.StintBoundaries {
		if err := boundary.Validate(); err != nil {
			return empty, fmt.Errorf("%w: stint boundary: %w", ErrInvalidCorrectionSource, err)
		}
	}
	digest, err := correctionDigest("analysis.correction-segmentation.v1", temporal)
	if err != nil {
		return empty, fmt.Errorf("%w: %w", ErrInvalidCorrectionSource, err)
	}
	ref := SourceAnalysisRef{SessionID: model.Session.ID, ContentSHA256: manifest.ContentSHA256, SizeBytes: manifest.Size,
		ParserID: manifest.Parser.ID, ParserVersion: manifest.Parser.Version, SchemaFingerprint: model.Session.Provenance.SchemaFingerprint,
		AnalysisVersion: validity.ComputationVersion, SegmentationDigest: digest}
	if _, err := ref.Digest(); err != nil {
		return empty, fmt.Errorf("%w: %w", ErrInvalidCorrectionSource, err)
	}
	return ref, nil
}
