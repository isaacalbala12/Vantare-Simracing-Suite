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
	Command         telemetryanalysis.CorrectionSaveCommand      `json:"command"`
}
type TelemetryAnalysisCorrectionRevisionRequest struct {
	SessionID  string                              `json:"sessionId"`
	Base       telemetryanalysis.SourceAnalysisRef `json:"base"`
	RevisionID string                              `json:"revisionId"`
}

func (service *TelemetryAnalysisService) SaveCorrections(ctx context.Context, request TelemetryAnalysisCorrectionSaveRequest) (telemetryanalysis.CorrectionStoreResult, error) {
	var result telemetryanalysis.CorrectionStoreResult
	if len(request.Corrections)+len(request.FamilyUses)+len(request.Classifications) > telemetryanalysis.MaxSampleCorrections {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	if request.Classifications != nil && request.FamilyUses == nil {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	err := service.withCorrectionInput(ctx, request.SessionID, func(operationCtx context.Context, input telemetryanalysis.CorrectionInput) error {
		if request.Base != input.Base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		inputs, err := correctionInputsForRequests(input, request.Corrections)
		if err != nil {
			return publicCorrectionError(err)
		}
		if request.FamilyUses == nil {
			result, err = service.corrections.Save(operationCtx, input.Base, inputs, request.Command)
		} else {
			observations, prepareErr := observationInputForRequests(input, inputs, request.FamilyUses)
			if prepareErr != nil {
				return publicCorrectionError(prepareErr)
			}
			observations.Session = input.Session
			observations.Classifications = request.Classifications
			observations.ResolveCanonicalCombination = service.cfg.SessionCatalog.ResolveCanonicalCombination
			result, err = service.corrections.SaveObservations(operationCtx, input.Base, observations, request.Command)
		}
		return publicCorrectionError(err)
	})
	if err != nil {
		return telemetryanalysis.CorrectionStoreResult{}, err
	}
	return result, nil
}

func (service *TelemetryAnalysisService) LoadCorrection(ctx context.Context, request TelemetryAnalysisCorrectionRevisionRequest) (telemetryanalysis.CorrectionStoreResult, error) {
	var result telemetryanalysis.CorrectionStoreResult
	err := service.withCorrectionInput(ctx, request.SessionID, func(operationCtx context.Context, input telemetryanalysis.CorrectionInput) error {
		if request.Base != input.Base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		var err error
		result, err = service.corrections.Load(operationCtx, input.Base, request.RevisionID)
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
	if len(request.Corrections)+len(request.FamilyUses)+len(request.Classifications) > telemetryanalysis.MaxSampleCorrections {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	if request.Classifications != nil && request.FamilyUses == nil {
		return result, ErrTelemetryAnalysisInvalidRequest
	}
	err := service.withCorrectionInput(ctx, request.SessionID, func(operationCtx context.Context, input telemetryanalysis.CorrectionInput) error {
		if request.Base != input.Base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		if service.corrections == nil {
			return ErrTelemetryAnalysisCorrectionStorage
		}
		var err error
		if request.FamilyUses == nil {
			result, err = service.corrections.ResolveCommand(operationCtx, input.Base, request.Corrections, request.Command)
		} else {
			result, err = service.corrections.ResolveMixedCommand(operationCtx, input.Base, request.Corrections, request.FamilyUses, request.Classifications, request.Command)
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
	err := service.withCorrectionInput(ctx, request.SessionID, func(operationCtx context.Context, input telemetryanalysis.CorrectionInput) error {
		if request.Base != input.Base {
			return ErrTelemetryAnalysisCorrectionSourceChanged
		}
		derived, err := service.deriveCorrectionSession(operationCtx, input, request.RevisionID)
		if err != nil {
			return err
		}
		result, err = telemetryanalysis.ProduceStrategyInputProjectionV2(telemetryanalysis.ProjectionProductionRequest{GeneratedAt: service.now().UTC().Truncate(time.Millisecond), Combination: derived.Classified.Combination, Sessions: []telemetryanalysis.ProjectionSessionDerivations{derived}})
		if err != nil {
			return ErrTelemetryAnalysisIncompatible
		}
		return operationCtx.Err()
	})
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	return result, nil
}

// Caller keeps the authorized source lock across this derivation. Both single
// and multi-session projections use the same classification and scalar path.
// The initial classification gates unknown simulators and incomplete metadata;
// the effective classification of the derived revision comes from Analysis and is
// never reconstructed here.
func (service *TelemetryAnalysisService) deriveCorrectionSession(ctx context.Context, input telemetryanalysis.CorrectionInput, revisionID string) (telemetryanalysis.ProjectionSessionDerivations, error) {
	var empty telemetryanalysis.ProjectionSessionDerivations
	if service.corrections == nil {
		return empty, ErrTelemetryAnalysisCorrectionStorage
	}
	classified, err := telemetryanalysis.ClassifyHistoricalSession(input.Session)
	if err != nil {
		return empty, ErrTelemetryAnalysisIncompatible
	}
	derived, err := service.corrections.DeriveProjectionSession(ctx, input.Base, input.Session, input.Pages, classified, revisionID)
	if err != nil {
		return empty, publicCorrectionError(err)
	}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	return derived, nil
}

// Resolve only requested targets while scanning the bounded original once.
// The client supplies preconditions, never the authoritative original sample.
func correctionInputsForRequests(input telemetryanalysis.CorrectionInput, requests []telemetryanalysis.SampleValueCorrection) ([]telemetryanalysis.SampleCorrectionInput, error) {
	type key struct {
		channel string
		index   int64
	}
	wanted := make(map[key]bool, len(requests))
	for _, request := range requests {
		wanted[key{request.Target.ChannelID, request.Target.SampleIndex}] = true
	}
	samples := make(map[key]telemetryanalysis.HistoricalSample, len(wanted))
	for _, page := range input.Pages {
		for _, sample := range page.Samples {
			k := key{page.ChannelID, sample.Index}
			if wanted[k] {
				if _, duplicate := samples[k]; duplicate {
					return nil, telemetryanalysis.ErrCorrectionTarget
				}
				samples[k] = sample
			}
		}
	}
	channels := make(map[string]telemetryanalysis.HistoricalChannel, len(input.Session.Channels))
	for _, channel := range input.Session.Channels {
		channels[channel.ID] = channel
	}
	result := make([]telemetryanalysis.SampleCorrectionInput, len(requests))
	for i, request := range requests {
		sample, ok := samples[key{request.Target.ChannelID, request.Target.SampleIndex}]
		if !ok {
			return nil, telemetryanalysis.ErrCorrectionTarget
		}
		channel, ok := channels[request.Target.ChannelID]
		if !ok {
			return nil, telemetryanalysis.ErrCorrectionTarget
		}
		result[i] = telemetryanalysis.SampleCorrectionInput{Channel: channel, Sample: sample, Request: request}
	}
	return result, nil
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

// Keep the source model and reanalyzed scalar view inside the authorized command.
// Store validation resolves the entire family set against both before writing.
func observationInputForRequests(input telemetryanalysis.CorrectionInput, samples []telemetryanalysis.SampleCorrectionInput, families []telemetryanalysis.LapFamilyUseCorrection) (telemetryanalysis.ObservationCorrectionInput, error) {
	result := telemetryanalysis.ObservationCorrectionInput{Samples: samples, Original: input.Validity, Effective: input.Validity, FamilyUses: families}
	if len(samples) == 0 || len(families) == 0 {
		return result, nil
	}
	snapshot, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(input.Base, samples)
	if err != nil {
		return telemetryanalysis.ObservationCorrectionInput{}, err
	}
	view, err := telemetryanalysis.ApplySampleCorrectionSnapshot(input.Base, input.Session.Channels, input.Pages, snapshot)
	if err != nil {
		return telemetryanalysis.ObservationCorrectionInput{}, err
	}
	result.Effective, err = telemetryanalysis.AnalyzeLapValidity(input.Session, view.Pages)
	if err != nil {
		return telemetryanalysis.ObservationCorrectionInput{}, telemetryanalysis.ErrCorrectionValue
	}
	return result, nil
}
