package app

import (
	"context"
	"errors"
	"os"
)

type TelemetryAnalysisRecoverCopyRequest struct {
	SourceID     string `json:"sourceId"`
	UserApproved bool   `json:"userApproved"`
}

type TelemetryAnalysisRecoverCopyResult struct {
	Code      string                      `json:"code"`
	Candidate *TelemetryAnalysisCandidate `json:"candidate,omitempty"`
}

func (service *TelemetryAnalysisService) RecoverCopy(ctx context.Context, request TelemetryAnalysisRecoverCopyRequest) (TelemetryAnalysisRecoverCopyResult, error) {
	candidate, err := service.recoverCopy(ctx, request)
	switch {
	case err == nil:
		return TelemetryAnalysisRecoverCopyResult{Code: "ready", Candidate: &candidate}, nil
	case errors.Is(err, ErrTelemetryAnalysisOriginalPresent):
		return TelemetryAnalysisRecoverCopyResult{Code: "original_present"}, nil
	case errors.Is(err, ErrTelemetryAnalysisCopyChanged):
		return TelemetryAnalysisRecoverCopyResult{Code: "copy_changed"}, nil
	case errors.Is(err, ErrTelemetryAnalysisCopyUnavailable):
		return TelemetryAnalysisRecoverCopyResult{Code: "copy_unavailable"}, nil
	case errors.Is(err, ErrTelemetryAnalysisCopyRegistryFailure):
		return TelemetryAnalysisRecoverCopyResult{Code: "registry_failure"}, nil
	case errors.Is(err, ErrTelemetryAnalysisNotReady):
		return TelemetryAnalysisRecoverCopyResult{Code: "not_ready"}, nil
	case errors.Is(err, ErrTelemetryAnalysisTooLarge):
		return TelemetryAnalysisRecoverCopyResult{Code: "too_large"}, nil
	default:
		return TelemetryAnalysisRecoverCopyResult{}, err
	}
}

// recoverCopy offers a recorded copy only after the original is absent and
// the copy still has the exact bytes registered by Analysis.
func (service *TelemetryAnalysisService) recoverCopy(ctx context.Context, request TelemetryAnalysisRecoverCopyRequest) (TelemetryAnalysisCandidate, error) {
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return TelemetryAnalysisCandidate{}, err
	}
	defer finish()
	if err := operationCtx.Err(); err != nil {
		return TelemetryAnalysisCandidate{}, err
	}
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisUnauthorized
	}
	if !request.UserApproved {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisApprovalRequired
	}
	if len(request.SourceID) != 64 || !isLowerHex(request.SourceID) {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisInvalidRequest
	}
	records, err := service.readVerifiedCopyRecords()
	if err != nil {
		return TelemetryAnalysisCandidate{}, err
	}
	for _, record := range records {
		if record.SourceID != request.SourceID {
			continue
		}
		if _, err := os.Lstat(record.OriginalPath); err == nil {
			return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisOriginalPresent
		} else if !errors.Is(err, os.ErrNotExist) {
			return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisCopyRegistryFailure
		}
	}
	changed := false
	for _, record := range records {
		if record.SourceID != request.SourceID {
			continue
		}
		if err := verifyTelemetrySourceCopy(operationCtx, record); err != nil {
			if errors.Is(err, ErrTelemetryAnalysisCopyChanged) {
				changed = true
			}
			if operationCtx.Err() != nil {
				return TelemetryAnalysisCandidate{}, operationCtx.Err()
			}
			continue
		}
		candidate, err := service.SelectFile(operationCtx, TelemetryAnalysisSelectedFileRequest{Path: record.CopyPath, UserApproved: true})
		if err != nil {
			return TelemetryAnalysisCandidate{}, err
		}
		selected := service.currentCandidate(candidate.ID)
		if selected == nil {
			return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisCandidateUnknown
		}
		selected.mu.Lock()
		selected.expectedSessionID = request.SourceID
		selected.mu.Unlock()
		return candidate, nil
	}
	if changed {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisCopyChanged
	}
	return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisCopyUnavailable
}
