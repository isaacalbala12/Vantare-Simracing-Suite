package app

import (
	"context"
	"errors"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type TelemetryAnalysisCorrectionPreparation struct {
	Base                         telemetryanalysis.SourceAnalysisRef     `json:"base"`
	BaseDigest                   string                                  `json:"baseDigest"`
	BaseRevisionID               string                                  `json:"baseRevisionId"`
	EditableChannelIDs           []string                                `json:"editableChannelIds"`
	StintBoundaries              []strategyprojection.StintBoundary      `json:"stintBoundaries"`
	StintAnchors                 []telemetryanalysis.StintBoundaryAnchor `json:"stintAnchors"`
	Combination                  *telemetryanalysis.CombinationIdentity  `json:"combination,omitempty"`
	CombinationUnavailableReason string                                  `json:"combinationUnavailableReason,omitempty"`
}

// withCorrectionInput keeps authorization, lifecycle and the open-session lock
// across the complete command. Reads are serialized to bound working memory.
func (service *TelemetryAnalysisService) withCorrectionInput(ctx context.Context, sessionID string, action func(context.Context, telemetryanalysis.CorrectionInput) error) error {
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return err
	}
	defer finish()
	if err := operationCtx.Err(); err != nil {
		return err
	}
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return ErrTelemetryAnalysisUnauthorized
	}
	if sessionID == "" {
		return ErrTelemetryAnalysisInvalidRequest
	}
	service.mu.Lock()
	ownedSession := service.sessions[sessionID]
	service.mu.Unlock()
	if ownedSession == nil {
		return ErrTelemetryAnalysisSessionUnknown
	}
	if !service.correctionReadMu.TryLock() {
		return ErrTelemetryAnalysisBusy
	}
	defer service.correctionReadMu.Unlock()
	ownedSession.mu.Lock()
	if ownedSession.retired || ownedSession.closed {
		ownedSession.mu.Unlock()
		return ErrTelemetryAnalysisSessionUnknown
	}
	input, readErr := telemetryanalysis.ReadCorrectionInput(operationCtx, ownedSession.parser, ownedSession.artifact, telemetryanalysis.CorrectionReadLimits{
		PageRows: service.cfg.MaxPageRows, MaxSamples: 1_000_000, MaxValues: 1_000_000, MaxTextBytes: 16 << 20,
	})
	// A resource limit or missing lap data does not invalidate the open reader.
	retire := readErr != nil && !errors.Is(readErr, telemetryanalysis.ErrCorrectionReadLimit) && !errors.Is(readErr, telemetryanalysis.ErrInvalidLapValidityInput)
	if retire {
		ownedSession.retired = true
	}
	if readErr != nil {
		ownedSession.mu.Unlock()
	} else {
		defer ownedSession.mu.Unlock()
	}
	if retire {
		if cleanupErr := service.cleanupOwnedSession(ownedSession); cleanupErr != nil {
			return ErrTelemetryAnalysisCleanup
		}
		service.removeSession(sessionID, ownedSession)
	}
	if errors.Is(readErr, telemetryanalysis.ErrCorrectionReadLimit) {
		return ErrTelemetryAnalysisTooLarge
	}
	if readErr != nil {
		return publicTelemetryAnalysisError(readErr)
	}
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return ErrTelemetryAnalysisUnauthorized
	}
	if err := operationCtx.Err(); err != nil {
		return err
	}
	return action(operationCtx, input)
}

// PrepareCorrections exposes a stable base, never the temporary open handle as
// source identity. It does not save an edit or change the observed catalog.
func (service *TelemetryAnalysisService) PrepareCorrections(ctx context.Context, sessionID string) (TelemetryAnalysisCorrectionPreparation, error) {
	var result TelemetryAnalysisCorrectionPreparation
	err := service.withCorrectionInput(ctx, sessionID, func(_ context.Context, input telemetryanalysis.CorrectionInput) error {
		baseDigest, err := input.Base.Digest()
		if err != nil {
			return publicTelemetryAnalysisError(err)
		}
		initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(input.Base, nil)
		if err != nil {
			return publicTelemetryAnalysisError(err)
		}
		result = TelemetryAnalysisCorrectionPreparation{
			Base: input.Base, BaseDigest: baseDigest, BaseRevisionID: initial.SnapshotID,
			EditableChannelIDs: []string{},
			StintBoundaries:    append([]strategyprojection.StintBoundary{}, input.Validity.Temporal.StintBoundaries...),
			StintAnchors:       telemetryanalysis.EligibleStintBoundaryAnchors(input.Validity),
		}
		// Inspection can expose channels outside the bounded correction read.
		// Advertise only channels backed by prepared samples and known units.
		preparedChannels := make(map[string]bool)
		for _, page := range input.Pages {
			if len(page.Samples) > 0 {
				preparedChannels[page.ChannelID] = true
			}
		}
		for _, channel := range input.Session.Channels {
			if preparedChannels[channel.ID] && channel.Unit.Quality == telemetryanalysis.QualityValid {
				result.EditableChannelIDs = append(result.EditableChannelIDs, channel.ID)
				delete(preparedChannels, channel.ID)
			}
		}
		// Reuse the session already read under the Analysis authorization/lock.
		// Missing identity does not prevent reviewing that source's observations.
		classified, classificationErr := telemetryanalysis.ClassifyHistoricalSession(input.Session)
		if classificationErr != nil {
			result.CombinationUnavailableReason = "metadata_unavailable"
		} else {
			result.Combination = &classified.Combination
		}
		return nil
	})
	if err != nil {
		return TelemetryAnalysisCorrectionPreparation{}, err
	}
	return result, nil
}
