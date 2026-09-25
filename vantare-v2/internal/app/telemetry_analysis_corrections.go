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
	return withCorrectionRead(service, ctx, sessionID, func(ctx context.Context, owned *telemetryAnalysisSession, limits telemetryanalysis.CorrectionReadLimits) (telemetryanalysis.CorrectionInput, error) {
		input, err := telemetryanalysis.ReadCorrectionInput(ctx, owned.parser, owned.artifact, limits)
		if err == nil {
			owned.correctionBase = &input.Base
		}
		return input, err
	}, action)
}

func (service *TelemetryAnalysisService) withCorrectionSummary(ctx context.Context, sessionID string, action func(context.Context, telemetryanalysis.CorrectionSummary) error) error {
	return withCorrectionRead(service, ctx, sessionID, func(ctx context.Context, owned *telemetryAnalysisSession, limits telemetryanalysis.CorrectionReadLimits) (telemetryanalysis.CorrectionSummary, error) {
		return readCorrectionSummary(ctx, owned, limits)
	}, action)
}

// The summary contains laps and bounded events, never continuous sample pages.
// A cache hit still verifies the exact staged bytes and catalog via Inspect.
// The caller holds the open-session lock across both validation and use.
func readCorrectionSummary(ctx context.Context, owned *telemetryAnalysisSession, limits telemetryanalysis.CorrectionReadLimits) (telemetryanalysis.CorrectionSummary, error) {
	if owned.correctionSummary != nil {
		if _, err := owned.parser.Inspect(ctx); err != nil {
			return telemetryanalysis.CorrectionSummary{}, err
		}
		return *owned.correctionSummary, nil
	}
	summary, err := telemetryanalysis.ReadCorrectionSummary(ctx, owned.parser, owned.artifact, limits)
	if err == nil {
		owned.correctionSummary = &summary
		owned.correctionBase = &summary.Base
	}
	return summary, err
}

// History commands only need the exact source identity. Inspect recomputes
// artifact evidence and checks the catalog before reusing an open-session base.
func (service *TelemetryAnalysisService) withCorrectionBase(ctx context.Context, sessionID string, action func(context.Context, telemetryanalysis.SourceAnalysisRef) error) error {
	return withCorrectionRead(service, ctx, sessionID, func(ctx context.Context, owned *telemetryAnalysisSession, limits telemetryanalysis.CorrectionReadLimits) (telemetryanalysis.SourceAnalysisRef, error) {
		if owned.correctionBase != nil {
			if _, err := owned.parser.Inspect(ctx); err != nil {
				return telemetryanalysis.SourceAnalysisRef{}, err
			}
			return *owned.correctionBase, nil
		}
		summary, err := telemetryanalysis.ReadCorrectionSummary(ctx, owned.parser, owned.artifact, limits)
		if err != nil {
			return telemetryanalysis.SourceAnalysisRef{}, err
		}
		owned.correctionBase = &summary.Base
		return summary.Base, nil
	}, action)
}

// Both readers share the same authorization, source lifetime and error policy.
func withCorrectionRead[T any](service *TelemetryAnalysisService, ctx context.Context, sessionID string,
	read func(context.Context, *telemetryAnalysisSession, telemetryanalysis.CorrectionReadLimits) (T, error),
	action func(context.Context, T) error,
) error {
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
	// Covers the measured 71-lap LMU recording while retaining a hard bound.
	// Multi-value channels require a separate value budget from sample count.
	input, readErr := read(operationCtx, ownedSession, service.correctionReadLimits())
	// A resource limit or missing lap data does not invalidate the open reader.
	retire := readErr != nil && !errors.Is(readErr, telemetryanalysis.ErrCorrectionReadLimit) &&
		!errors.Is(readErr, telemetryanalysis.ErrInvalidLapValidityInput) &&
		!errors.Is(readErr, context.Canceled) && !errors.Is(readErr, context.DeadlineExceeded)
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

func (service *TelemetryAnalysisService) correctionReadLimits() telemetryanalysis.CorrectionReadLimits {
	return telemetryanalysis.CorrectionReadLimits{PageRows: service.cfg.MaxPageRows, MaxSamples: 1_250_000, MaxValues: 1_500_000, MaxTextBytes: 16 << 20}
}

// Source/read failures follow the session retirement policy. Invalid stored
// decisions remain business errors and must not retire an otherwise valid file.
func correctionSourceReadFailure(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, telemetryanalysis.ErrCorrectionReadLimit) || errors.Is(err, telemetryanalysis.ErrInvalidLapValidityInput) ||
		errors.Is(err, telemetryanalysis.ErrInvalidCorrectionSource) || errors.Is(err, telemetryanalysis.ErrInvalidHistoricalPage) ||
		errors.Is(err, telemetryanalysis.ErrHistoricalSource) || errors.Is(err, telemetryanalysis.ErrHistoricalArtifactChanged)
}

// PrepareCorrections exposes a stable base, never the temporary open handle as
// source identity. It does not save an edit or change the observed catalog.
func (service *TelemetryAnalysisService) PrepareCorrections(ctx context.Context, sessionID string) (TelemetryAnalysisCorrectionPreparation, error) {
	var result TelemetryAnalysisCorrectionPreparation
	err := service.withCorrectionSummary(ctx, sessionID, func(_ context.Context, input telemetryanalysis.CorrectionSummary) error {
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
		result.EditableChannelIDs = append([]string{}, input.EditableChannelIDs...)
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
