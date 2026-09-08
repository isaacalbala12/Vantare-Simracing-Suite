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
// and applying all scalar corrections. It introduces no quality thresholds and
// does not publish, persist, authorize sources or calculate a race strategy.
func DeriveCorrectedSession(base SourceAnalysisRef, session HistoricalSession, pages []HistoricalPage, classified ClassifiedSession, snapshot PreparedSampleCorrectionSnapshot) (CorrectedSessionDerivations, error) {
	var empty CorrectedSessionDerivations
	if session.ID != base.SessionID || classified.SessionID != base.SessionID {
		return empty, ErrCorrectionSourceChanged
	}
	if session.SchemaVersion != HistoricalSchemaVersion || session.Provenance.Parser.ID != base.ParserID || session.Provenance.Parser.Version != base.ParserVersion || session.Provenance.SchemaFingerprint != base.SchemaFingerprint {
		return empty, ErrCorrectionInterpretationChanged
	}
	view, err := ApplySampleCorrectionSnapshot(base, session.Channels, pages, snapshot)
	if err != nil {
		return empty, err
	}
	validity, err := AnalyzeLapValidity(session, view.Pages)
	if err != nil {
		return empty, fmt.Errorf("corrected validity: %w", err)
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
