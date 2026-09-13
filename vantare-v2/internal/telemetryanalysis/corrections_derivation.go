package telemetryanalysis

import "fmt"

// CorrectedSessionDerivations must retain Base/SnapshotID when projected or
// cached. It is not an AuthorizedSessionModel and must never overwrite the
// catalog's observed analysis. The projection binding is a separate contract.
// Classified carries the effective classification: reclassified from the
// effective metadata when the snapshot holds active classifications, or the
// caller identity with the usability gate refreshed from the reanalysed
// validity for legacy snapshots.
type CorrectedSessionDerivations struct {
	Base        SourceAnalysisRef
	SnapshotID  string
	Validity    LapValidityAnalysis
	Consumption SessionConsumptionPace
	Curves      SessionDerivedCurves
	Pit         SessionPitObservation
	Classified  ClassifiedSession
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
	alignment := BuildTemporalAlignment(session, pages)
	session, pages = alignment.Session, alignment.Pages
	var original LapValidityAnalysis
	if len(snapshot.FamilyUses) > 0 {
		var err error
		original, err = AnalyzeAlignedLapValidity(alignment)
		if err != nil {
			return empty, fmt.Errorf("original validity: %w", err)
		}
	}
	view, err := ApplyMixedCorrectionSnapshot(base, pages, original, session, snapshot)
	if err != nil {
		return empty, err
	}
	alignment.Pages = view.Pages
	validity, err := AnalyzeAlignedLapValidity(alignment)
	if err != nil {
		return empty, fmt.Errorf("corrected validity: %w", err)
	}
	if len(view.FamilyUses) > 0 {
		validity.Laps, err = ApplyLapFamilyCorrections(base, original, validity, view.FamilyUses)
		if err != nil {
			return empty, fmt.Errorf("corrected family use: %w", err)
		}
	}
	classified, effective, err := effectiveClassification(session, validity, view, classified, len(snapshot.Classifications) > 0)
	if err != nil {
		return empty, err
	}
	consumption, err := DeriveSessionConsumptionPace(effective, view.Pages, classified, validity)
	if err != nil {
		return empty, fmt.Errorf("corrected consumption/pace: %w", err)
	}
	curves, err := DeriveSessionCurves(effective, view.Pages, classified, validity, consumption)
	if err != nil {
		return empty, fmt.Errorf("corrected curves: %w", err)
	}
	pit, err := DeriveSessionPitObservation(effective, view.Pages, classified)
	if err != nil {
		return empty, fmt.Errorf("corrected pit observation: %w", err)
	}
	return CorrectedSessionDerivations{Base: base, SnapshotID: view.SnapshotID, Validity: validity, Consumption: consumption, Curves: curves, Pit: pit, Classified: classified}, nil
}

// effectiveClassification selects the classification for derivation and
// refreshes its preliminary usability gate from the actually reanalysed
// validity. Legacy snapshots keep the caller type, weather and identity
// without requiring complete metadata; active snapshots reclassify from the
// detached effective metadata instead. Missing metadata fails atomically with
// the wrapped classification error and produces nothing.
func effectiveClassification(session HistoricalSession, validity LapValidityAnalysis, view EffectiveCorrectionView, caller ClassifiedSession, active bool) (ClassifiedSession, HistoricalSession, error) {
	if !active {
		return refreshClassifiedDerivation(caller, validity), session, nil
	}
	effective := session
	effective.Metadata = view.Metadata
	reclassified, err := ClassifyHistoricalSession(effective)
	if err != nil {
		return ClassifiedSession{}, HistoricalSession{}, fmt.Errorf("corrected classification: %w", err)
	}
	return refreshClassifiedDerivation(reclassified, validity), effective, nil
}

// refreshClassifiedDerivation refreshes the preliminary usability gate from
// the actually reanalysed validity: one complete analyzed lap marks the
// session usable, otherwise families stay unavailable with cause. It reuses
// the shared familyUsability gate and never invents laps.
func refreshClassifiedDerivation(classified ClassifiedSession, validity LapValidityAnalysis) ClassifiedSession {
	complete := false
	for _, lap := range validity.Laps {
		if lap.Complete {
			complete = true
			break
		}
	}
	refreshed := classified
	refreshed.Status = SessionStatusIdentifiedNotUsable
	if complete {
		refreshed.Status = SessionStatusIdentifiedUsable
	}
	refreshed.Families = familyUsability(refreshed.Type, complete)
	return refreshed
}
