package app

import (
	"context"
	"errors"
	"os"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

var ErrTelemetryAnalysisCopyFailed = errors.New("the verified telemetry copy could not be saved")

type TelemetryAnalysisCopyRequest struct {
	SessionID            string `json:"sessionId"`
	DestinationDirectory string `json:"destinationDirectory"`
	UserApproved         bool   `json:"userApproved"`
}

type TelemetryAnalysisCopyResult struct {
	Path          string `json:"path"`
	ContentSHA256 string `json:"contentSha256"`
	SizeBytes     int64  `json:"sizeBytes"`
}

// SaveVerifiedCopy keeps a second file chosen by the user, independent of the
// private staged copy released when this session closes.
func (service *TelemetryAnalysisService) SaveVerifiedCopy(ctx context.Context, request TelemetryAnalysisCopyRequest) (TelemetryAnalysisCopyResult, error) {
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return TelemetryAnalysisCopyResult{}, err
	}
	defer finish()
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisUnauthorized
	}
	if !request.UserApproved {
		return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisApprovalRequired
	}
	if request.SessionID == "" || request.DestinationDirectory == "" {
		return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisInvalidRequest
	}
	service.mu.Lock()
	ownedSession := service.sessions[request.SessionID]
	service.mu.Unlock()
	if ownedSession == nil {
		return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisSessionUnknown
	}
	ownedSession.mu.Lock()
	defer ownedSession.mu.Unlock()
	if ownedSession.closed || ownedSession.retired {
		return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisSessionUnknown
	}
	path, err := telemetryanalysis.PersistVerifiedHistoricalCopy(operationCtx, ownedSession.staged, request.DestinationDirectory)
	if err != nil {
		if ctxErr := operationCtx.Err(); ctxErr != nil {
			return TelemetryAnalysisCopyResult{}, ctxErr
		}
		return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisCopyFailed
	}
	if err := service.recordVerifiedCopy(ownedSession, path); err != nil {
		if cleanupErr := os.Remove(path); cleanupErr != nil {
			return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisCleanup
		}
		return TelemetryAnalysisCopyResult{}, err
	}
	evidence := ownedSession.staged.Evidence()
	return TelemetryAnalysisCopyResult{Path: path, ContentSHA256: evidence.ContentSHA256, SizeBytes: evidence.Metadata.Size}, nil
}
