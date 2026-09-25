package telemetryanalysis

import (
	"context"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// DeriveProjectionSession loads an exact durable revision and derives its
// snapshot, never the current head. The calling Analysis service must verify
// current source authorization and supply the complete original input first.
// This method does not authorize files or replace the observed catalog model.
func (s *CorrectionStore) DeriveProjectionSession(ctx context.Context, base SourceAnalysisRef, session HistoricalSession, pages []HistoricalPage, classified ClassifiedSession, revisionID string) (ProjectionSessionDerivations, error) {
	var empty ProjectionSessionDerivations
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	if revisionID == "" {
		return empty, ErrCorrectionRevisionMissing
	}
	stored, err := s.Load(ctx, base, revisionID)
	if err != nil {
		return empty, err
	}
	derived, err := DeriveCorrectedSession(base, session, pages, classified, stored.Revision.Snapshot)
	if err != nil {
		return empty, err
	}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	return ProjectionSessionFromDerived(base, stored.Revision.RevisionID, derived)
}

// Bind a validated derivation to the exact durable revision that produced it.
// Both materialized and bounded readers use the same projection contract.
func ProjectionSessionFromDerived(base SourceAnalysisRef, revisionID string, derived CorrectedSessionDerivations) (ProjectionSessionDerivations, error) {
	var empty ProjectionSessionDerivations
	if revisionID == "" || derived.Base != base || derived.SnapshotID == "" {
		return empty, ErrCorrectionSourceChanged
	}
	digest, err := base.Digest()
	if err != nil {
		return empty, err
	}
	return ProjectionSessionDerivations{
		Revision:   &strategyprojection.AnalysisRevisionRef{SessionID: base.SessionID, BaseDigest: digest, RevisionID: revisionID, SnapshotID: derived.SnapshotID},
		Classified: derived.Classified, Validity: &derived.Validity, Consumption: &derived.Consumption, Curves: &derived.Curves, Pit: &derived.Pit,
	}, nil
}
