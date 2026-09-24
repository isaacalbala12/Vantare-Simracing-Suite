package app

import (
	"context"
	"errors"
	"os"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

var ErrTelemetryAnalysisCopyFailed = errors.New("the verified telemetry copy could not be saved")
var ErrTelemetryAnalysisCopyPermission = errors.New("the telemetry copy destination is not writable")
var ErrTelemetryAnalysisCopyNoSpace = errors.New("the telemetry copy destination has no space")

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

type TelemetryAnalysisCopyStatus struct {
	Code string                       `json:"code"`
	Copy *TelemetryAnalysisCopyResult `json:"copy,omitempty"`
}

// SaveVerifiedCopyStatus provides stable outcomes for the desktop UI while
// preserving the typed errors of SaveVerifiedCopy for other callers.
func (service *TelemetryAnalysisService) SaveVerifiedCopyStatus(ctx context.Context, request TelemetryAnalysisCopyRequest) (TelemetryAnalysisCopyStatus, error) {
	copy, err := service.SaveVerifiedCopy(ctx, request)
	switch {
	case err == nil:
		return TelemetryAnalysisCopyStatus{Code: "saved", Copy: &copy}, nil
	case errors.Is(err, ErrTelemetryAnalysisCopyPermission):
		return TelemetryAnalysisCopyStatus{Code: "permission"}, nil
	case errors.Is(err, ErrTelemetryAnalysisCopyNoSpace):
		return TelemetryAnalysisCopyStatus{Code: "no_space"}, nil
	case errors.Is(err, ErrTelemetryAnalysisCopyRegistryFailure):
		return TelemetryAnalysisCopyStatus{Code: "registry_failure"}, nil
	case errors.Is(err, ErrTelemetryAnalysisCleanup):
		return TelemetryAnalysisCopyStatus{Code: "cleanup_failure"}, nil
	case errors.Is(err, ErrTelemetryAnalysisCopyFailed):
		return TelemetryAnalysisCopyStatus{Code: "failed"}, nil
	default:
		return TelemetryAnalysisCopyStatus{}, err
	}
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
		if errors.Is(err, telemetryanalysis.ErrPersistentCopyPermission) {
			return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisCopyPermission
		}
		if errors.Is(err, telemetryanalysis.ErrPersistentCopyNoSpace) {
			return TelemetryAnalysisCopyResult{}, ErrTelemetryAnalysisCopyNoSpace
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
