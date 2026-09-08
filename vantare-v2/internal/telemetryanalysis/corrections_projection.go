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
	digest, err := base.Digest()
	if err != nil {
		return empty, err
	}
	return ProjectionSessionDerivations{
		Revision:   &strategyprojection.AnalysisRevisionRef{SessionID: base.SessionID, BaseDigest: digest, RevisionID: stored.Revision.RevisionID, SnapshotID: derived.SnapshotID},
		Classified: classified, Validity: &derived.Validity, Consumption: &derived.Consumption, Curves: &derived.Curves, Pit: &derived.Pit,
	}, nil
}
