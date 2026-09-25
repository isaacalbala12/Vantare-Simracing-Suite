package app

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type TelemetryAnalysisSelectedFileRequest struct {
	Path         string `json:"path"`
	UserApproved bool   `json:"userApproved"`
}

// SelectFile admits one user-picked file outside configured discovery roots.
// It never authorizes a WAL-active or changing file and does not persist paths.
func (service *TelemetryAnalysisService) SelectFile(ctx context.Context, request TelemetryAnalysisSelectedFileRequest) (TelemetryAnalysisCandidate, error) {
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return TelemetryAnalysisCandidate{}, err
	}
	defer finish()
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisUnauthorized
	}
	if !request.UserApproved {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisApprovalRequired
	}
	if !cleanAbsolutePath(request.Path) || !strings.EqualFold(filepath.Ext(request.Path), ".duckdb") {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisInvalidRequest
	}
	if relative, err := filepath.Rel(service.cfg.StagingRoot, request.Path); err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisInvalidRequest
	}
	rootPath := filepath.Dir(request.Path)
	info, err := os.Lstat(rootPath)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisInvalidRequest
	}
	root := telemetryanalysis.SourceRoot{Kind: telemetryanalysis.SourceLMU, Root: rootPath, Format: telemetryanalysis.LMUDuckDBParserID, Extensions: []string{".duckdb"}}
	service.discoveryMu.Lock()
	defer service.discoveryMu.Unlock()
	first, err := telemetryanalysis.DiscoverSelected(operationCtx, service.metadata, root, request.Path)
	if err != nil {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisCandidateUnknown
	}
	if first.Size > service.cfg.MaxSourceBytes {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisTooLarge
	}
	if first.WALPresent {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisNotReady
	}
	tracker, err := telemetryanalysis.NewStabilityTracker(service.cfg.StabilityWindow)
	if err != nil {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisInvalidRequest
	}
	tracker.Assess(first, observationForCandidate(first, service.now()))
	timer := time.NewTimer(service.cfg.StabilityWindow)
	defer timer.Stop()
	select {
	case <-operationCtx.Done():
		return TelemetryAnalysisCandidate{}, operationCtx.Err()
	case <-timer.C:
	}
	second, err := telemetryanalysis.DiscoverSelected(operationCtx, service.metadata, root, request.Path)
	if err != nil || second.Locator != first.Locator {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisCandidateUnknown
	}
	stable := tracker.Assess(second, observationForCandidate(second, service.now()))
	if stable.State != telemetryanalysis.StateReady {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisNotReady
	}
	record := &telemetryAnalysisCandidateRecord{root: root, candidate: stable, tracker: tracker, selected: true, selectedPath: request.Path}
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.closed {
		return TelemetryAnalysisCandidate{}, ErrTelemetryAnalysisClosed
	}
	service.candidates[stable.Locator] = record
	return publicTelemetryAnalysisCandidate(stable), nil
}
