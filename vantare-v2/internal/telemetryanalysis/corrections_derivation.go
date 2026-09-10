package telemetryanalysis

import "fmt"

// CorrectedSessionDerivations must retain Base/SnapshotID when projected or
// cached. It is not an AuthorizedSessionModel and must never overwrite the
// catalog's observed analysis. The projection binding is a separate contract.
type CorrectedSessionDerivations struct {
	Base        SourceAnalysisRef
	SnapshotID  string
	Validity    LapValidityAnalysis
	Consumption SessionConsumptionPace
	Curves      SessionDerivedCurves
	Pit         SessionPitObservation
}

// DeriveCorrectedSession reuses the current derivation pipeline after validating
// and applying scalar and family corrections. It introduces no quality thresholds and
// does not publish, persist, authorize sources or calculate a race strategy.
func DeriveCorrectedSession(base SourceAnalysisRef, session HistoricalSession, pages []HistoricalPage, classified ClassifiedSession, snapshot PreparedSampleCorrectionSnapshot) (CorrectedSessionDerivations, error) {
	var empty CorrectedSessionDerivations
	if session.ID != base.SessionID || classified.SessionID != base.SessionID {
		return empty, ErrCorrectionSourceChanged
	}
	if session.SchemaVersion != HistoricalSchemaVersion || session.Provenance.Parser.ID != base.ParserID || session.Provenance.Parser.Version != base.ParserVersion || session.Provenance.SchemaFingerprint != base.SchemaFingerprint {
		return empty, ErrCorrectionInterpretationChanged
	}
	var original LapValidityAnalysis
	if len(snapshot.FamilyUses) > 0 {
		var err error
		original, err = AnalyzeLapValidity(session, pages)
		if err != nil {
			return empty, fmt.Errorf("original validity: %w", err)
		}
	}
	view, err := ApplyObservationCorrectionSnapshot(base, session.Channels, pages, original, snapshot)
	if err != nil {
		return empty, err
	}
	validity, err := AnalyzeLapValidity(session, view.Pages)
	if err != nil {
		return empty, fmt.Errorf("corrected validity: %w", err)
	}
	if len(view.FamilyUses) > 0 {
		validity.Laps, err = ApplyLapFamilyCorrections(base, original, validity, view.FamilyUses)
		if err != nil {
			return empty, fmt.Errorf("corrected family use: %w", err)
		}
	}
	consumption, err := DeriveSessionConsumptionPace(session, view.Pages, classified, validity)
	if err != nil {
		return empty, fmt.Errorf("corrected consumption/pace: %w", err)
	}
	curves, err := DeriveSessionCurves(session, view.Pages, classified, validity, consumption)
	if err != nil {
		return empty, fmt.Errorf("corrected curves: %w", err)
	}
	pit, err := DeriveSessionPitObservation(session, view.Pages, classified)
	if err != nil {
		return empty, fmt.Errorf("corrected pit observation: %w", err)
	}
	return CorrectedSessionDerivations{Base: base, SnapshotID: view.SnapshotID, Validity: validity, Consumption: consumption, Curves: curves, Pit: pit}, nil
}
