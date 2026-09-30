package app

import (
	"context"
	"errors"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

var (
	ErrTelemetryAnalysisCorrectionConflict              = errors.New("the correction revision changed; reload before saving")
	ErrTelemetryAnalysisCorrectionSourceChanged         = errors.New("the correction source or analysis changed; prepare it again")
	ErrTelemetryAnalysisCorrectionMissing               = errors.New("the requested correction revision is unavailable")
	ErrTelemetryAnalysisCorrectionUncertain             = errors.New("correction save confirmation was lost; retry the same command")
	ErrTelemetryAnalysisCorrectionStorage               = errors.New("the correction history is unavailable")
	ErrTelemetryAnalysisCanonicalCombinationUnavailable = errors.New("the canonical combination catalog is unavailable")
)

type TelemetryAnalysisCorrectionSaveRequest struct {
	SessionID   string                                    `json:"sessionId"`
	Base        telemetryanalysis.SourceAnalysisRef       `json:"base"`
	Corrections []telemetryanalysis.SampleValueCorrection `json:"corrections"`
	// Omitted/null is legacy; a non-nil empty set explicitly removes family uses.
	FamilyUses []telemetryanalysis.LapFamilyUseCorrection `json:"familyUses"`
	// Same nil contract for classification decisions: omitted/null means the
	// caller is unaware of the group and must never silently drop it.
	Classifications []telemetryanalysis.ClassificationCorrection `json:"classifications"`
	// Omitted/null is legacy; a non-nil empty set explicitly removes stint
	// boundary decisions while preserving prior revisions.
	StintBoundaries []telemetryanalysis.StintBoundaryCorrection `json:"stintBoundaries"`
	Command         telemetryanalysis.CorrectionSaveCommand     `json:"command"`
}
type TelemetryAnalysisCorrectionRevisionRequest struct {
	SessionID  string                              `json:"sessionId"`
	Base       telemetryanalysis.SourceAnalysisRef `json:"base"`
	RevisionID string                              `json:"revisionId"`
}
type TelemetryAnalysisCorrectionPendingRequest struct {
	SessionID string                              `json:"sessionId"`
	Base      telemetryanalysis.SourceAnalysisRef `json:"base"`
	CommandID string                              `json:"commandId,omitempty"`
}

func (service *TelemetryAnalysisService) SaveCorrections(ctx context.Context, request TelemetryAnalysisCorrectionSaveRequest) (telemetryanalysis.CorrectionStoreResult, error) {
	return service.saveCorrections(ctx, request, false)
}

// SaveRecoverableCorrections retains the complete current-format command before
// dispatching its write. The pending intent remains until the client confirms
// receipt through AcknowledgeCorrectionCommand.
func (service *TelemetryAnalysisService) SaveRecoverableCorrections(ctx context.Context, request TelemetryAnalysisCorrectionSaveRequest) (telemetryanalysis.CorrectionStoreResult, error) {
	if request.FamilyUses == nil || request.Classifications == nil || request.StintBoundaries == nil {
		return telemetryanalysis.CorrectionStoreResult{}, ErrTelemetryAnalysisInvalidRequest
	}
	return service.saveCorrections(ctx, request, true)
}

func (service *TelemetryAnalysisService) saveCorrections(ctx context.Context, request TelemetryAnalysisCorrectionSaveRequest, recoverable bool) (telemetryanalysis.CorrectionStoreResult, error) {
	var result telemetryanalysis.CorrectionStoreResult
	if len(request.Corrections)+len(request.FamilyUses)+len(request.Classifications)+len(request.StintBoundaries) > telemetryanalysis.MaxSampleCorrections {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	if (request.Classifications != nil || request.StintBoundaries != nil) && request.FamilyUses == nil {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	type preparedSave struct {
		summary   telemetryanalysis.CorrectionSummary
		inputs    []telemetryanalysis.SampleCorrectionInput
		effective telemetryanalysis.LapValidityAnalysis
		business  error
	}
	err := withCorrectionRead(service, ctx, request.SessionID,
		func(operationCtx context.Context, owned *telemetryAnalysisSession, limits telemetryanalysis.CorrectionReadLimits) (preparedSave, error) {
			var state preparedSave
			summary, err := readCorrectionSummary(operationCtx, owned, limits)
			if err != nil {
				return state, err
			}
			state.summary = summary
			if request.Base != summary.Base {
				state.business = ErrTelemetryAnalysisCorrectionSourceChanged
				return state, nil
			}
			if service.corrections == nil {
				state.business = ErrTelemetryAnalysisCorrectionStorage
				return state, nil
			}
			state.inputs, err = correctionInputsForRequestsPaged(operationCtx, owned.parser, summary.Session, request.Corrections)
			if err != nil {
				if correctionSourceReadFailure(err) {
					return state, err
				}
				state.business = publicCorrectionError(err)
				return state, nil
			}
			state.effective = summary.Validity
			if len(state.inputs) > 0 && (len(request.FamilyUses) > 0 || len(request.StintBoundaries) > 0) {
				scalar, prepareErr := telemetryanalysis.PrepareSampleCorrectionSnapshot(summary.Base, state.inputs)
				if prepareErr != nil {
					state.business = publicCorrectionError(prepareErr)
					return state, nil
				}
				state.effective, err = telemetryanalysis.ReadCorrectedLapValidity(operationCtx, owned.parser, owned.artifact, limits, summary, scalar)
				if err != nil {
					if correctionSourceReadFailure(err) {
						return state, err
					}
					state.business = publicCorrectionError(err)
					return state, nil
				}
			}
			return state, nil
		},
		func(operationCtx context.Context, state preparedSave) error {
			if state.business != nil {
				return state.business
			}
			var err error
			base := state.summary.Base
			if request.FamilyUses == nil {
				result, err = service.corrections.Save(operationCtx, base, state.inputs, request.Command)
			} else {
				observations := telemetryanalysis.ObservationCorrectionInput{
					Samples: state.inputs, Original: state.summary.Validity, Effective: state.effective,
					FamilyUses: request.FamilyUses, StintBoundaries: request.StintBoundaries,
					Session: state.summary.Session, Classifications: request.Classifications,
					ResolveCanonicalCombination: service.cfg.SessionCatalog.ResolveCanonicalCombination,
				}
				if recoverable {
					_, err = service.corrections.StagePendingCommand(operationCtx, base, telemetryanalysis.PendingCorrectionCommand{
						Corrections: request.Corrections, FamilyUses: request.FamilyUses, Classifications: request.Classifications,
						StintBoundaries: request.StintBoundaries, Command: request.Command,
					})
					if err != nil {
						return publicCorrectionError(err)
					}
				}
				result, err = service.corrections.SaveObservations(operationCtx, base, observations, request.Command)
			}
			if recoverable && err != nil && !correctionOutcomeUncertain(err) {
				if acknowledgeErr := service.corrections.AcknowledgePendingCommand(operationCtx, base, request.Command.CommandID); acknowledgeErr != nil {
					return publicCorrectionError(acknowledgeErr)
				}
			}
			return publicCorrectionError(err)
		})
	if err != nil {
		return telemetryanalysis.CorrectionStoreResult{}, err
	}
	return result, nil
}

func correctionOutcomeUncertain(err error) bool {
	return errors.Is(err, telemetryanalysis.ErrCorrectionCommitUncertain) || errors.Is(err, telemetryanalysis.ErrCorrectionWriteInProgress) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

func (service *TelemetryAnalysisService) LoadPendingCorrectionCommand(ctx context.Context, request TelemetryAnalysisCorrectionPendingRequest) (*telemetryanalysis.PendingCorrectionCommand, error) {
	var result *telemetryanalysis.PendingCorrectionCommand
	err := service.withCorrectionBase(ctx, request.SessionID, func(operationCtx context.Context, base telemetryanalysis.SourceAnalysisRef) error {
		if request.Base != base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		var err error
		result, err = service.corrections.LoadPendingCommand(operationCtx, base)
		return publicCorrectionError(err)
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (service *TelemetryAnalysisService) AcknowledgeCorrectionCommand(ctx context.Context, request TelemetryAnalysisCorrectionPendingRequest) error {
	return service.withCorrectionBase(ctx, request.SessionID, func(operationCtx context.Context, base telemetryanalysis.SourceAnalysisRef) error {
		if request.Base != base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		return publicCorrectionError(service.corrections.AcknowledgePendingCommand(operationCtx, base, request.CommandID))
	})
}

func (service *TelemetryAnalysisService) LoadCorrection(ctx context.Context, request TelemetryAnalysisCorrectionRevisionRequest) (telemetryanalysis.CorrectionStoreResult, error) {
	var result telemetryanalysis.CorrectionStoreResult
	err := service.withCorrectionBase(ctx, request.SessionID, func(operationCtx context.Context, base telemetryanalysis.SourceAnalysisRef) error {
		if request.Base != base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		var err error
		result, err = service.corrections.Load(operationCtx, base, request.RevisionID)
		return publicCorrectionError(err)
	})
	if err != nil {
		return telemetryanalysis.CorrectionStoreResult{}, err
	}
	return result, nil
}

// Resolve an uncertain command under current source authorization. It never
// creates a revision or adopts the current head for a Strategy plan.
func (service *TelemetryAnalysisService) ResolveCorrectionCommand(ctx context.Context, request TelemetryAnalysisCorrectionSaveRequest) (telemetryanalysis.CorrectionCommandResolution, error) {
	var result telemetryanalysis.CorrectionCommandResolution
	if len(request.Corrections)+len(request.FamilyUses)+len(request.Classifications)+len(request.StintBoundaries) > telemetryanalysis.MaxSampleCorrections {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	if (request.Classifications != nil || request.StintBoundaries != nil) && request.FamilyUses == nil {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	err := service.withCorrectionBase(ctx, request.SessionID, func(operationCtx context.Context, base telemetryanalysis.SourceAnalysisRef) error {
		if request.Base != base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		var err error
		if request.FamilyUses == nil {
			result, err = service.corrections.ResolveCommand(operationCtx, base, request.Corrections, request.Command)
		} else if request.StintBoundaries != nil {
			result, err = service.corrections.ResolveStintMixedCommand(operationCtx, base, request.Corrections, request.FamilyUses, request.Classifications, request.StintBoundaries, request.Command)
		} else {
			result, err = service.corrections.ResolveMixedCommand(operationCtx, base, request.Corrections, request.FamilyUses, request.Classifications, request.Command)
		}
		return publicCorrectionError(err)
	})
	if err != nil {
		return telemetryanalysis.CorrectionCommandResolution{}, err
	}
	return result, nil
}

func (service *TelemetryAnalysisService) ProjectCorrection(ctx context.Context, request TelemetryAnalysisCorrectionRevisionRequest) (strategyprojection.StrategyInputProjectionV2, error) {
	var result strategyprojection.StrategyInputProjectionV2
	if request.RevisionID == "" {
		return result, ErrTelemetryAnalysisCorrectionMissing
	}
	derived, err := service.deriveCorrectionSession(ctx, request.SessionID, request.RevisionID, func(base telemetryanalysis.SourceAnalysisRef) error {
		if request.Base != base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		return nil
	})
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	result, err = telemetryanalysis.ProduceStrategyInputProjectionV2(telemetryanalysis.ProjectionProductionRequest{GeneratedAt: service.now().UTC().Truncate(time.Millisecond), Combination: derived.Classified.Combination, Sessions: []telemetryanalysis.ProjectionSessionDerivations{derived}})
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, ErrTelemetryAnalysisIncompatible
	}
	if err := ctx.Err(); err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return strategyprojection.StrategyInputProjectionV2{}, ErrTelemetryAnalysisUnauthorized
	}
	return result, nil
}

// Both projection commands use one bounded derivation. The first authorized
// read resolves classification and the exact durable snapshot; the second
// revalidates the same base and holds the source lock through every page visit.
func (service *TelemetryAnalysisService) deriveCorrectionSession(ctx context.Context, sessionID, revisionID string, expected func(telemetryanalysis.SourceAnalysisRef) error) (telemetryanalysis.ProjectionSessionDerivations, error) {
	var empty telemetryanalysis.ProjectionSessionDerivations
	if service.corrections == nil {
		return empty, ErrTelemetryAnalysisCorrectionStorage
	}
	var summary telemetryanalysis.CorrectionSummary
	var classified telemetryanalysis.ClassifiedSession
	var snapshot telemetryanalysis.PreparedSampleCorrectionSnapshot
	err := service.withCorrectionSummary(ctx, sessionID, func(readCtx context.Context, input telemetryanalysis.CorrectionSummary) error {
		if expected != nil {
			if err := expected(input.Base); err != nil {
				return err
			}
		}
		var err error
		classified, err = telemetryanalysis.ClassifyHistoricalSession(input.Session)
		if err != nil {
			return ErrTelemetryAnalysisIncompatible
		}
		stored, err := service.corrections.Load(readCtx, input.Base, revisionID)
		if err != nil {
			return publicCorrectionError(err)
		}
		summary, snapshot = input, stored.Revision.Snapshot
		return nil
	})
	if err != nil {
		return empty, err
	}
	var result telemetryanalysis.ProjectionSessionDerivations
	err = withCorrectionRead(service, ctx, sessionID,
		func(readCtx context.Context, owned *telemetryAnalysisSession, limits telemetryanalysis.CorrectionReadLimits) (telemetryanalysis.ProjectionSessionDerivations, error) {
			current, err := readCorrectionSummary(readCtx, owned, limits)
			if err != nil {
				return empty, err
			}
			if current.Base != summary.Base {
				return empty, telemetryanalysis.ErrCorrectionSourceChanged
			}
			derived, err := telemetryanalysis.DerivePagedCorrectedSession(readCtx, owned.parser, owned.artifact, limits, current, classified, snapshot)
			if err != nil {
				return empty, err
			}
			return telemetryanalysis.ProjectionSessionFromDerived(current.Base, revisionID, derived)
		},
		func(_ context.Context, derived telemetryanalysis.ProjectionSessionDerivations) error {
			result = derived
			return nil
		})
	if err != nil {
		return empty, err
	}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	return result, nil
}

// Resolve exact requested originals without retaining unrelated sample pages.
// The service has already verified the complete source through its summary.
func correctionInputsForRequestsPaged(ctx context.Context, reader telemetryanalysis.CorrectionInputReader, session telemetryanalysis.HistoricalSession, requests []telemetryanalysis.SampleValueCorrection) ([]telemetryanalysis.SampleCorrectionInput, error) {
	prepared := make([]telemetryanalysis.PreparedSampleCorrection, len(requests))
	for i, request := range requests {
		prepared[i].Request = request
	}
	pages, err := telemetryanalysis.ReadCorrectionTargetPages(ctx, reader, session, prepared)
	if err != nil {
		return nil, err
	}
	type key struct {
		channel string
		index   int64
	}
	samples := make(map[key]telemetryanalysis.HistoricalSample, len(pages))
	for _, page := range pages {
		samples[key{page.ChannelID, page.Samples[0].Index}] = page.Samples[0]
	}
	channels := make(map[string]telemetryanalysis.HistoricalChannel, len(session.Channels))
	for _, channel := range session.Channels {
		channels[channel.ID] = channel
	}
	inputs := make([]telemetryanalysis.SampleCorrectionInput, len(requests))
	for i, request := range requests {
		target := request.Target
		inputs[i] = telemetryanalysis.SampleCorrectionInput{Channel: channels[target.ChannelID], Sample: samples[key{target.ChannelID, target.SampleIndex}], Request: request}
	}
	return inputs, ctx.Err()
}

func publicCorrectionError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return err
	case errors.Is(err, telemetryanalysis.ErrCorrectionConflict):
		return ErrTelemetryAnalysisCorrectionConflict
	case errors.Is(err, telemetryanalysis.ErrCorrectionSourceChanged), errors.Is(err, telemetryanalysis.ErrCorrectionInterpretationChanged):
		return ErrTelemetryAnalysisCorrectionSourceChanged
	case errors.Is(err, telemetryanalysis.ErrUnsupportedSessionSimulator):
		return ErrTelemetryAnalysisIncompatible
	case errors.Is(err, telemetryanalysis.ErrInvalidSessionClassification):
		return ErrTelemetryAnalysisInvalidRequest
	case errors.Is(err, telemetryanalysis.ErrCanonicalCombinationUnavailable):
		return ErrTelemetryAnalysisCanonicalCombinationUnavailable
	case errors.Is(err, telemetryanalysis.ErrCanonicalCombinationUnknown):
		return ErrTelemetryAnalysisInvalidRequest
	case errors.Is(err, telemetryanalysis.ErrCorrectionRevisionMissing):
		return ErrTelemetryAnalysisCorrectionMissing
	case errors.Is(err, telemetryanalysis.ErrCorrectionCommitUncertain):
		return ErrTelemetryAnalysisCorrectionUncertain
	case errors.Is(err, telemetryanalysis.ErrCorrectionWriteInProgress):
		return ErrTelemetryAnalysisBusy
	case errors.Is(err, telemetryanalysis.ErrInvalidCorrection), errors.Is(err, telemetryanalysis.ErrCorrectionTarget), errors.Is(err, telemetryanalysis.ErrCorrectionPrecondition), errors.Is(err, telemetryanalysis.ErrCorrectionValue), errors.Is(err, telemetryanalysis.ErrOverlappingCorrections):
		return ErrTelemetryAnalysisInvalidRequest
	default:
		return ErrTelemetryAnalysisCorrectionStorage
	}
}
