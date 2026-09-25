package app

import (
	"context"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
	"time"
)

// StrategyRevisionCatalog retains the existing observed catalog and adds exact
// correction projections from Analysis-owned open sessions. It is not a Wails
// service and cannot authorize or automatically reopen a source by reference.
type StrategyRevisionCatalog struct {
	*telemetryanalysis.SessionCatalog
	analysis *TelemetryAnalysisService
}

func NewStrategyRevisionCatalog(catalog *telemetryanalysis.SessionCatalog, analysis *TelemetryAnalysisService) *StrategyRevisionCatalog {
	return &StrategyRevisionCatalog{SessionCatalog: catalog, analysis: analysis}
}

func (catalog *StrategyRevisionCatalog) ProjectStrategyRevisionInputs(ctx context.Context, combinationID string, refs []strategyprojection.AnalysisRevisionRef, generatedAt time.Time) (strategyprojection.StrategyInputProjectionV2, error) {
	var empty strategyprojection.StrategyInputProjectionV2
	if catalog == nil || catalog.analysis == nil {
		return empty, ErrTelemetryAnalysisRuntimeUnavailable
	}
	if len(refs) == 0 || len(refs) > maxTelemetryAnalysisOpenSessions {
		return empty, ErrTelemetryAnalysisInvalidRequest
	}
	ids := make([]string, len(refs))
	for i, ref := range refs {
		ids[i] = ref.SessionID
	}
	if err := strategyprojection.ValidateSourceRevisions(ids, refs); err != nil {
		return empty, ErrTelemetryAnalysisInvalidRequest
	}
	service := catalog.analysis
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return empty, err
	}
	defer finish()
	if err := operationCtx.Err(); err != nil {
		return empty, err
	}
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return empty, ErrTelemetryAnalysisUnauthorized
	}
	// Artifact identity is immutable after Open. Handles are resolved under the
	// service lock; withCorrectionInput subsequently checks retirement/lifecycle.
	handles := make(map[string]string, len(refs))
	requested := make(map[string]bool, len(refs))
	for _, id := range ids {
		requested[id] = true
	}
	service.mu.Lock()
	ambiguous := false
	for handle, session := range service.sessions {
		id := session.artifact.Manifest().DedupeKey
		if requested[id] {
			if _, exists := handles[id]; exists {
				ambiguous = true
			}
			handles[id] = handle
		}
	}
	service.mu.Unlock()
	if ambiguous {
		return empty, ErrTelemetryAnalysisInvalidRequest
	}
	if len(handles) != len(refs) {
		return empty, ErrTelemetryAnalysisSessionUnknown
	}
	selected := make([]telemetryanalysis.ProjectionSessionDerivations, 0, len(refs))
	var combination telemetryanalysis.CombinationIdentity
	for _, ref := range refs {
		derived, err := service.deriveCorrectionSession(operationCtx, handles[ref.SessionID], ref.RevisionID, func(base telemetryanalysis.SourceAnalysisRef) error {
			digest, err := base.Digest()
			if err != nil || base.SessionID != ref.SessionID || digest != ref.BaseDigest {
				return ErrTelemetryAnalysisCorrectionSourceChanged
			}
			return nil
		})
		if err != nil {
			return empty, err
		}
		if derived.Revision == nil || *derived.Revision != ref {
			return empty, ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if derived.Classified.Combination.ID != combinationID {
			return empty, ErrTelemetryAnalysisIncompatible
		}
		combination = derived.Classified.Combination
		selected = append(selected, derived)
	}
	result, err := telemetryanalysis.ProduceStrategyInputProjectionV2(telemetryanalysis.ProjectionProductionRequest{GeneratedAt: generatedAt, Combination: combination, Sessions: selected})
	if err != nil {
		return empty, ErrTelemetryAnalysisIncompatible
	}
	if err := operationCtx.Err(); err != nil {
		return empty, err
	}
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return empty, ErrTelemetryAnalysisUnauthorized
	}
	return result, nil
}
