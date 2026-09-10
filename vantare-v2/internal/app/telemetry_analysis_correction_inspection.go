package app

import (
	"context"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type TelemetryAnalysisCorrectionLapRequest struct {
	SessionID  string                              `json:"sessionId"`
	Base       telemetryanalysis.SourceAnalysisRef `json:"base"`
	RevisionID string                              `json:"revisionId"`
	Start      int                                 `json:"start"`
	Limit      int                                 `json:"limit"`
}
type TelemetryAnalysisCorrectionLapPage struct {
	RevisionID string                              `json:"revisionId"`
	HeadID     string                              `json:"headId"`
	Page       telemetryanalysis.CorrectionLapPage `json:"page"`
}

func (service *TelemetryAnalysisService) InspectCorrectionLaps(ctx context.Context, request TelemetryAnalysisCorrectionLapRequest) (TelemetryAnalysisCorrectionLapPage, error) {
	var result TelemetryAnalysisCorrectionLapPage
	if request.RevisionID == "" || request.Start < 0 || request.Limit < 1 || request.Limit > telemetryanalysis.MaxCorrectionLapPage {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	err := service.withCorrectionInput(ctx, request.SessionID, func(operationCtx context.Context, input telemetryanalysis.CorrectionInput) error {
		if input.Base != request.Base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		stored, err := service.corrections.Load(operationCtx, input.Base, request.RevisionID)
		if err != nil {
			return publicCorrectionError(err)
		}
		page, err := telemetryanalysis.InspectCorrectionLaps(input, stored.Revision.Snapshot, request.Start, request.Limit)
		if err != nil {
			return publicCorrectionError(err)
		}
		if err := operationCtx.Err(); err != nil {
			return err
		}
		result = TelemetryAnalysisCorrectionLapPage{RevisionID: stored.Revision.RevisionID, HeadID: stored.HeadID, Page: page}
		return nil
	})
	if err != nil {
		return TelemetryAnalysisCorrectionLapPage{}, err
	}
	return result, nil
}
