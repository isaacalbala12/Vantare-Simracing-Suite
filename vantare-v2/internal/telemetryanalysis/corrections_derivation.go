package telemetryanalysis

import (
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

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
	Observed    *strategyprojection.ObservedStrategyV1
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
	if len(snapshot.FamilyUses) > 0 || len(snapshot.StintBoundaries) > 0 {
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
	if len(view.StintBoundaries) > 0 {
		validity.Temporal.StintBoundaries, err = ApplyStintBoundaryCorrections(base, original, validity, view.StintBoundaries)
		if err != nil {
			return empty, fmt.Errorf("corrected stint boundaries: %w", err)
		}
	}
	return deriveCorrectedObservations(base, session, view.Pages, classified, validity, view, len(snapshot.Classifications) > 0)
}

// Reuse the same projection calculations after either the materialized reader
// or a future bounded reader has validated the exact correction and validity.
// The caller must supply effective pages from that same validated snapshot.
func deriveCorrectedObservations(base SourceAnalysisRef, session HistoricalSession, pages []HistoricalPage, classified ClassifiedSession, validity LapValidityAnalysis, view EffectiveCorrectionView, classificationsActive bool) (CorrectedSessionDerivations, error) {
	var empty CorrectedSessionDerivations
	classified, effective, err := effectiveClassification(session, validity, view, classified, classificationsActive)
	if err != nil {
		return empty, err
	}
	consumption, err := DeriveSessionConsumptionPace(effective, pages, classified, validity)
	if err != nil {
		return empty, fmt.Errorf("corrected consumption/pace: %w", err)
	}
	curves, err := DeriveSessionCurves(effective, pages, classified, validity, consumption)
	if err != nil {
		return empty, fmt.Errorf("corrected curves: %w", err)
	}
	pit, err := DeriveSessionPitObservation(effective, pages, classified)
	if err != nil {
		return empty, fmt.Errorf("corrected pit observation: %w", err)
	}
	var observed *strategyprojection.ObservedStrategyV1
	if classified.Type == SessionTypeRace {
		if generatedAt, ok := correctedDerivationGeneratedAt(validity); ok {
			value, err := DeriveObservedStrategy(effective, pages, classified, validity, pit, generatedAt)
			if err != nil {
				return empty, fmt.Errorf("corrected observed strategy: %w", err)
			}
			if len(view.StintBoundaries) > 0 {
				for index := range value.Stints {
					value.Stints[index].Provenance = strategyprojection.Provenance{Kind: strategyprojection.ProvenanceCorrected, SourceID: view.SnapshotID}
				}
			}
			observed = &value
		}
	}
	return CorrectedSessionDerivations{Base: base, SnapshotID: view.SnapshotID, Validity: validity, Consumption: consumption, Curves: curves, Pit: pit, Classified: classified, Observed: observed}, nil
}

// correctedDerivationGeneratedAt binds the derived artifact to the recorded
// temporal horizon. It stays deterministic across replay and restoration.
func correctedDerivationGeneratedAt(validity LapValidityAnalysis) (time.Time, bool) {
	var latest time.Time
	for _, segment := range validity.Temporal.Segments {
		if segment.SessionEndTs.After(latest) {
			latest = segment.SessionEndTs
		}
	}
	for _, lap := range validity.Laps {
		if lap.End.After(latest) {
			latest = lap.End
		}
	}
	if latest.IsZero() {
		return time.Time{}, false
	}
	return latest.Truncate(time.Millisecond).UTC(), true
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
