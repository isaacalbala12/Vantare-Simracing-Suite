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
	type prepared struct {
		original  telemetryanalysis.CorrectionSummary
		effective telemetryanalysis.LapValidityAnalysis
		revision  string
		snapshot  string
		head      string
		business  error
	}
	err := withCorrectionRead(service, ctx, request.SessionID,
		func(operationCtx context.Context, owned *telemetryAnalysisSession, limits telemetryanalysis.CorrectionReadLimits) (prepared, error) {
			var state prepared
			original, err := readCorrectionSummary(operationCtx, owned, limits)
			if err != nil {
				return state, err
			}
			state.original = original
			if request.Base != original.Base {
				state.business = ErrTelemetryAnalysisCorrectionSourceChanged
				return state, nil
			}
			if service.corrections == nil {
				state.business = ErrTelemetryAnalysisCorrectionStorage
				return state, nil
			}
			stored, err := service.corrections.Load(operationCtx, original.Base, request.RevisionID)
			if err != nil {
				state.business = publicCorrectionError(err)
				return state, nil
			}
			state.revision, state.head, state.snapshot = stored.Revision.RevisionID, stored.HeadID, stored.Revision.Snapshot.SnapshotID
			state.effective, err = telemetryanalysis.ReadCorrectedLapValidity(operationCtx, owned.parser, owned.artifact, limits, original, stored.Revision.Snapshot)
			if err != nil && !correctionSourceReadFailure(err) {
				state.business = publicCorrectionError(err)
				return state, nil
			}
			return state, err
		},
		func(operationCtx context.Context, state prepared) error {
			if state.business != nil {
				return state.business
			}
			page, err := telemetryanalysis.BuildCorrectionLapPage(state.original.Base, state.original.Validity, state.effective, state.snapshot, request.Start, request.Limit)
			if err != nil {
				return publicCorrectionError(err)
			}
			if err := operationCtx.Err(); err != nil {
				return err
			}
			result = TelemetryAnalysisCorrectionLapPage{RevisionID: state.revision, HeadID: state.head, Page: page}
			return nil
		})
	if err != nil {
		return TelemetryAnalysisCorrectionLapPage{}, err
	}
	return result, nil
}
