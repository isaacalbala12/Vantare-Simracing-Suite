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
	var empty PreparedLapFamilyUseCorrection
	baseID, err := base.Digest()
	if err != nil {
		return empty, err
	}
	if _, err := request.Base.Digest(); err != nil {
		return empty, err
	}
	if base.SessionID != request.Base.SessionID || base.ContentSHA256 != request.Base.ContentSHA256 || base.SizeBytes != request.Base.SizeBytes {
		return empty, ErrCorrectionSourceChanged
	}
	if base != request.Base || validity.SessionID != base.SessionID || validity.ComputationVersion != base.AnalysisVersion {
		return empty, ErrCorrectionInterpretationChanged
	}
	if err := validity.Temporal.ContractVersion.ValidateTemporal(); err != nil {
		return empty, ErrCorrectionInterpretationChanged
	}
	segmentation, err := correctionDigest("analysis.correction-segmentation.v1", validity.Temporal)
	if err != nil || segmentation != base.SegmentationDigest {
		return empty, ErrCorrectionInterpretationChanged
	}
	if !correctionText(request.Reason, 1024) || !slices.Contains(CorrectableLapFamilies(), request.Family) || request.Expected.Family != request.Family {
		return empty, fmt.Errorf("%w: family or reason", ErrInvalidCorrection)
	}
	target := request.Target
	if target.Number < 0 || target.Start.IsZero() || target.End.IsZero() || !target.Start.Before(target.End) {
		return empty, ErrCorrectionTarget
	}
	var original LapFamilyUse
	var complete bool
	matches, uses := 0, 0
	for _, lap := range validity.Laps {
		if lap.Number != target.Number || lap.Start == nil || !lap.Start.Equal(target.Start) || !lap.End.Equal(target.End) {
			continue
		}
		matches++
		complete = lap.Complete
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
	if request.Included && (!complete || slices.Contains(original.ExclusionReasons, LapExclusionIncomplete)) {
		return empty, fmt.Errorf("%w: incomplete lap", ErrCorrectionValue)
	}
	if request.Included {
		presence, covered := lapSegmentPresence(target.Start, target.End, validity.Temporal.Segments, validity.Temporal.Gaps)
		if !covered || (presence != strategyprojection.PresenceValid && presence != strategyprojection.PresenceStale) {
			return empty, fmt.Errorf("%w: missing lap coverage", ErrCorrectionValue)
		}
	}
	// Normalize equivalent instants before hashing, and detach every collection.
	request.Target.Start, request.Target.End = target.Start.UTC(), target.End.UTC()
	request.Expected.ExclusionReasons = slices.Clone(original.ExclusionReasons)
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
