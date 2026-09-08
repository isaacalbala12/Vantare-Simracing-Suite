package app

import (
	"context"
	"errors"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type TelemetryAnalysisCorrectionPreparation struct {
	Base           telemetryanalysis.SourceAnalysisRef `json:"base"`
	BaseRevisionID string                              `json:"baseRevisionId"`
}

// PrepareCorrections exposes only a stable base for an already authorized open
// session. The opaque open handle is never used as the stored source identity.
// Reading is serialized to bound aggregate working memory across open sessions.
func (service *TelemetryAnalysisService) PrepareCorrections(ctx context.Context, sessionID string) (TelemetryAnalysisCorrectionPreparation, error) {
	var empty TelemetryAnalysisCorrectionPreparation
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
	if sessionID == "" {
		return empty, ErrTelemetryAnalysisInvalidRequest
	}
	service.mu.Lock()
	ownedSession := service.sessions[sessionID]
	service.mu.Unlock()
	if ownedSession == nil {
		return empty, ErrTelemetryAnalysisSessionUnknown
	}
	if !service.correctionReadMu.TryLock() {
		return empty, ErrTelemetryAnalysisBusy
	}
	defer service.correctionReadMu.Unlock()
	ownedSession.mu.Lock()
	if ownedSession.retired || ownedSession.closed {
		ownedSession.mu.Unlock()
		return empty, ErrTelemetryAnalysisSessionUnknown
	}
	input, readErr := telemetryanalysis.ReadCorrectionInput(operationCtx, ownedSession.parser, ownedSession.artifact, telemetryanalysis.CorrectionReadLimits{
		PageRows: service.cfg.MaxPageRows, MaxSamples: 1_000_000, MaxValues: 1_000_000, MaxTextBytes: 16 << 20,
	})
	// A resource limit or missing lap data does not invalidate the open reader.
	retire := readErr != nil && !errors.Is(readErr, telemetryanalysis.ErrCorrectionReadLimit) && !errors.Is(readErr, telemetryanalysis.ErrInvalidLapValidityInput)
	if retire {
		ownedSession.retired = true
	}
	ownedSession.mu.Unlock()
	if retire {
		if cleanupErr := service.cleanupOwnedSession(ownedSession); cleanupErr != nil {
			return empty, ErrTelemetryAnalysisCleanup
		}
		service.removeSession(sessionID, ownedSession)
	}
	if errors.Is(readErr, telemetryanalysis.ErrCorrectionReadLimit) {
		return empty, ErrTelemetryAnalysisTooLarge
	}
	if readErr != nil {
		return empty, publicTelemetryAnalysisError(readErr)
	}
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return empty, ErrTelemetryAnalysisUnauthorized
	}
	if err := operationCtx.Err(); err != nil {
		return empty, err
	}
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(input.Base, nil)
	if err != nil {
		return empty, publicTelemetryAnalysisError(err)
	}
	return TelemetryAnalysisCorrectionPreparation{Base: input.Base, BaseRevisionID: initial.SnapshotID}, nil
}
