package telemetryanalysis

import (
	"fmt"
	"slices"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// LapCorrectionTarget identifies a lap in the original analysis, not a row or
// lap number alone. Temporal identity is never inferred from a corrected pace.
type LapCorrectionTarget struct {
	Number int       `json:"number"`
	Start  time.Time `json:"start"`
	End    time.Time `json:"end"`
}

type LapFamilyUseCorrection struct {
	Base     SourceAnalysisRef   `json:"base"`
	Target   LapCorrectionTarget `json:"target"`
	Family   DerivationFamily    `json:"family"`
	Expected LapFamilyUse        `json:"expected"`
	Included bool                `json:"included"`
	Reason   string              `json:"reason"`
}

type PreparedLapFamilyUseCorrection struct {
	BaseID       string                 `json:"baseId"`
	CorrectionID string                 `json:"correctionId"`
	Request      LapFamilyUseCorrection `json:"request"`
	Original     LapFamilyUse           `json:"original"`
	Corrected    LapFamilyUse           `json:"corrected"`
}

const LapExclusionManual LapExclusionReason = "manual_exclusion"

// CorrectableLapFamilies contains only families whose derivation consumes the
// per-lap usage decision. Pit/observed-strategy need their own resolved targets.
func CorrectableLapFamilies() []DerivationFamily {
	return []DerivationFamily{FamilyFuelConsumption, FamilyVirtualEnergyConsumption, FamilyCombinedStintPaceCurve, FamilyTyreDegradation, FamilySavingCost}
}

// PrepareLapFamilyUseCorrection is pure. It validates against the unmodified
// validity model; a manual inclusion never creates coverage or missing signals.
// Application and persistence remain separate, Analysis-owned operations.
func PrepareLapFamilyUseCorrection(base SourceAnalysisRef, validity LapValidityAnalysis, request LapFamilyUseCorrection) (PreparedLapFamilyUseCorrection, error) {
	baseID, err := validateLapFamilyBase(base, validity)
	if err != nil {
		return PreparedLapFamilyUseCorrection{}, err
	}
	return prepareLapFamilyUseCorrection(baseID, base, validity, request)
}

func validateLapFamilyBase(base SourceAnalysisRef, validity LapValidityAnalysis) (string, error) {
	baseID, err := base.Digest()
	if err != nil {
		return "", err
	}
	if validity.SessionID != base.SessionID || validity.ComputationVersion != base.AnalysisVersion {
		return "", ErrCorrectionInterpretationChanged
	}
	if err := validity.Temporal.ContractVersion.ValidateTemporal(); err != nil {
		return "", ErrCorrectionInterpretationChanged
	}
	segmentation, err := correctionDigest("analysis.correction-segmentation.v1", validity.Temporal)
	if err != nil || segmentation != base.SegmentationDigest {
		return "", ErrCorrectionInterpretationChanged
	}
	return baseID, nil
}

// The single-item and set entrypoints validate this shared base before calling.
// A set hashes its temporal model once, not once per requested lap/family.
func prepareLapFamilyUseCorrection(baseID string, base SourceAnalysisRef, validity LapValidityAnalysis, request LapFamilyUseCorrection) (PreparedLapFamilyUseCorrection, error) {
	var empty PreparedLapFamilyUseCorrection
	if _, err := request.Base.Digest(); err != nil {
		return empty, err
	}
	if base.SessionID != request.Base.SessionID || base.ContentSHA256 != request.Base.ContentSHA256 || base.SizeBytes != request.Base.SizeBytes {
		return empty, ErrCorrectionSourceChanged
	}
	if base != request.Base {
		return empty, ErrCorrectionInterpretationChanged
	}
	prepared, err := canonicalLapFamilyCorrection(baseID, request)
	if err != nil {
		return empty, err
	}
	target := prepared.Request.Target
	var original LapFamilyUse
	var matched AnalyzedLap
	matches, uses := 0, 0
	for _, lap := range validity.Laps {
		if lap.Number != target.Number || lap.Start == nil || !lap.Start.Equal(target.Start) || !lap.End.Equal(target.End) {
			continue
		}
		matches++
		matched = lap
		for _, use := range lap.FamilyUse {
			if use.Family == request.Family {
				original = use
				uses++
			}
		}
	}
	if matches != 1 || uses != 1 {
		return empty, ErrCorrectionTarget
	}
	if original.Family != request.Expected.Family || original.Included != request.Expected.Included || !slices.Equal(original.ExclusionReasons, request.Expected.ExclusionReasons) {
		return empty, ErrCorrectionPrecondition
	}
	if request.Included {
		if err := validateLapFamilyInclusion(validity, matched, original); err != nil {
			return empty, err
		}
	}
	return prepared, nil
}

// Representation validation only. It proves neither source authority nor lap
// coverage; replay must call the live-model preparation/application functions.
func prepareStoredLapFamilyCorrection(request LapFamilyUseCorrection) (PreparedLapFamilyUseCorrection, error) {
	baseID, err := request.Base.Digest()
	if err != nil {
		return PreparedLapFamilyUseCorrection{}, err
	}
	return canonicalLapFamilyCorrection(baseID, request)
}

func canonicalLapFamilyCorrection(baseID string, request LapFamilyUseCorrection) (PreparedLapFamilyUseCorrection, error) {
	var empty PreparedLapFamilyUseCorrection
	if !correctionText(request.Reason, 1024) || !slices.Contains(CorrectableLapFamilies(), request.Family) || request.Expected.Family != request.Family {
		return empty, fmt.Errorf("%w: family or reason", ErrInvalidCorrection)
	}
	target := request.Target
	if target.Number < 0 || target.Start.IsZero() || target.End.IsZero() || !target.Start.Before(target.End) {
		return empty, ErrCorrectionTarget
	}
	if request.Included && slices.Contains(request.Expected.ExclusionReasons, LapExclusionIncomplete) {
		return empty, ErrCorrectionValue
	}
	// Normalize equivalent instants before hashing, and detach every collection.
	request.Target.Start, request.Target.End = target.Start.UTC(), target.End.UTC()
	request.Expected.ExclusionReasons = append([]LapExclusionReason(nil), request.Expected.ExclusionReasons...)
	original := request.Expected
	original.ExclusionReasons = slices.Clone(original.ExclusionReasons)
	corrected := LapFamilyUse{Family: request.Family, Included: request.Included}
	if !request.Included {
		corrected.ExclusionReasons = slices.Clone(original.ExclusionReasons)
		if !slices.Contains(corrected.ExclusionReasons, LapExclusionManual) {
			corrected.ExclusionReasons = append(corrected.ExclusionReasons, LapExclusionManual)
		}
	}
	id, err := correctionDigest("analysis.lap-family-correction.v1", request)
	if err != nil {
		return empty, err
	}
	return PreparedLapFamilyUseCorrection{BaseID: baseID, CorrectionID: id, Request: request, Original: original, Corrected: corrected}, nil
}

func validateLapFamilyInclusion(validity LapValidityAnalysis, lap AnalyzedLap, use LapFamilyUse) error {
	if !lap.Complete || lap.Start == nil || !lap.Start.Before(lap.End) || slices.Contains(use.ExclusionReasons, LapExclusionIncomplete) {
		return fmt.Errorf("%w: incomplete lap", ErrCorrectionValue)
	}
	presence, covered := lapSegmentPresence(*lap.Start, lap.End, validity.Temporal.Segments, validity.Temporal.Gaps)
	if !covered || (presence != strategyprojection.PresenceValid && presence != strategyprojection.PresenceStale) {
		return fmt.Errorf("%w: missing lap coverage", ErrCorrectionValue)
	}
	return nil
}
