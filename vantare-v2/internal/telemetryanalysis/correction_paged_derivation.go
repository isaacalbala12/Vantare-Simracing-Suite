package telemetryanalysis

import (
	"context"
	"fmt"
)

// DerivePagedCorrectedSession computes the same revision model from an
// authorized paged reader. Its caller retains source ownership and must load
// the exact durable snapshot before calling. Product commands remain on the
// paged path after fixture and recorded-source parity checks.
func DerivePagedCorrectedSession(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits, original CorrectionSummary, classified ClassifiedSession, snapshot PreparedSampleCorrectionSnapshot) (CorrectedSessionDerivations, error) {
	var empty CorrectedSessionDerivations
	if original.Session.ID != original.Base.SessionID || classified.SessionID != original.Base.SessionID {
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
	validity, err := ReadCorrectedLapValidity(ctx, reader, artifact, limits, original, snapshot)
	if err != nil {
		return empty, fmt.Errorf("corrected validity: %w", err)
	}
	values := make(map[correctionRowKey]map[string]HistoricalValue, len(view.Corrections))
	for _, correction := range view.Corrections {
		target := correction.Request.Target
		key := correctionRowKey{target.ChannelID, target.SampleIndex}
		if values[key] == nil {
			values[key] = make(map[string]HistoricalValue)
		}
		values[key][target.Column] = correction.Corrected
	}
	effectiveClassified, _, err := effectiveClassification(original.Session, validity, view, classified, len(snapshot.Classifications) > 0)
	if err != nil {
		return empty, err
	}
	rows, err := readPagedProjectionRows(ctx, reader, artifact, limits, original, validity, values)
	if err != nil {
		return empty, err
	}
	pit, err := readPagedPitObservationFromEvents(ctx, reader, artifact, limits, original, effectiveClassified, rows.pitEvents, values)
	if err != nil {
		return empty, err
	}
	return deriveCorrectedObservationsWithPit(original.Base, original.Session, rows.pages, classified, validity, view, len(snapshot.Classifications) > 0, &pit)
}
