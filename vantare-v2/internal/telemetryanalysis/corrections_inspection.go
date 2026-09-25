package telemetryanalysis

import (
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const MaxCorrectionLapPage = 50

type LapFamilyCapability struct {
	// Rule eligibility is separate from signal availability and metric presence.
	AutomaticIncluded bool             `json:"automaticIncluded"`
	EffectiveIncluded *bool            `json:"effectiveIncluded,omitempty"`
	Family            DerivationFamily `json:"family"`
	CanInclude        bool             `json:"canInclude"`
	CanExclude        bool             `json:"canExclude"`
	Reason            string           `json:"reason,omitempty"`
}
type CorrectionLapInspection struct {
	Original      AnalyzedLap                       `json:"original"`
	Effective     *AnalyzedLap                      `json:"effective,omitempty"`
	Target        *LapCorrectionTarget              `json:"target,omitempty"`
	StintBoundary *strategyprojection.StintBoundary `json:"stintBoundary,omitempty"`
	Capabilities  []LapFamilyCapability             `json:"capabilities"`
}
type CorrectionLapPage struct {
	Base       SourceAnalysisRef         `json:"base"`
	SnapshotID string                    `json:"snapshotId"`
	Start      int                       `json:"start"`
	Total      int                       `json:"total"`
	Laps       []CorrectionLapInspection `json:"laps"`
}

// InspectCorrectionLaps is a pure bounded view, not permission to read or edit.
// It preserves original targets; capabilities must be checked again at save.
func InspectCorrectionLaps(input CorrectionInput, snapshot PreparedSampleCorrectionSnapshot, start, limit int) (CorrectionLapPage, error) {
	var empty CorrectionLapPage
	if start < 0 || limit < 1 || limit > MaxCorrectionLapPage {
		return empty, ErrInvalidCorrection
	}
	if input.Session.ID != input.Base.SessionID {
		return empty, ErrCorrectionSourceChanged
	}
	view, err := ApplyMixedCorrectionSnapshot(input.Base, input.Pages, input.Validity, input.Session, snapshot)
	if err != nil {
		return empty, err
	}
	effective := input.Validity
	if len(view.Corrections) > 0 {
		effective, err = AnalyzeLapValidity(input.Session, view.Pages)
		if err != nil {
			return empty, fmt.Errorf("inspect corrected validity: %w", err)
		}
	}
	if len(view.FamilyUses) > 0 {
		effective.Laps, err = ApplyLapFamilyCorrections(input.Base, input.Validity, effective, view.FamilyUses)
		if err != nil {
			return empty, err
		}
	}
	return BuildCorrectionLapPage(input.Base, input.Validity, effective, view.SnapshotID, start, limit)
}

// BuildCorrectionLapPage assembles the same detached public view after a
// caller has validated a snapshot and derived its effective lap validity.
func BuildCorrectionLapPage(base SourceAnalysisRef, originalValidity, effective LapValidityAnalysis, snapshotID string, start, limit int) (CorrectionLapPage, error) {
	var empty CorrectionLapPage
	if start < 0 || limit < 1 || limit > MaxCorrectionLapPage {
		return empty, ErrInvalidCorrection
	}
	baseID, err := validateLapFamilyBase(base, originalValidity)
	if err != nil {
		return empty, err
	}
	result := CorrectionLapPage{Base: base, SnapshotID: snapshotID, Start: start, Total: len(originalValidity.Laps), Laps: []CorrectionLapInspection{}}
	if start >= result.Total {
		return result, nil
	}
	// One index for effective targets, and only page-sized detached public rows.
	byTarget := make(map[LapCorrectionTarget]int, len(effective.Laps))
	counts := make(map[LapCorrectionTarget]int, len(effective.Laps))
	originalCounts := make(map[LapCorrectionTarget]int, len(originalValidity.Laps))
	for _, lap := range originalValidity.Laps {
		if lap.Start != nil {
			if key, ok := derivedLapTarget(lap.Number, *lap.Start, lap.End); ok {
				originalCounts[key]++
			}
		}
	}
	for i, lap := range effective.Laps {
		if lap.Start == nil {
			continue
		}
		if key, ok := derivedLapTarget(lap.Number, *lap.Start, lap.End); ok {
			byTarget[key] = i
			counts[key]++
		}
	}
	originals := cloneFamilyCorrectionLaps(originalValidity.Laps[start:min(result.Total, start+limit)])
	for _, original := range originals {
		row := CorrectionLapInspection{Original: original, Capabilities: []LapFamilyCapability{}}
		if original.Start != nil {
			if key, ok := derivedLapTarget(original.Number, *original.Start, original.End); ok {
				row.Target = &key
				if counts[key] == 1 && originalCounts[key] == 1 {
					copy := cloneFamilyCorrectionLaps(effective.Laps[byTarget[key] : byTarget[key]+1])
					row.Effective = &copy[0]
				}
			}
			row.StintBoundary = precedingRecordedStintBoundary(*original.Start, originalValidity.Temporal.StintBoundaries)
		}
		for _, family := range CorrectableLapFamilies() {
			capability := LapFamilyCapability{Family: family, Reason: "target_unresolved", AutomaticIncluded: inspectionFamilyRuleIncluded(original, family)}
			if row.Effective != nil {
				included := inspectionFamilyRuleIncluded(*row.Effective, family)
				capability.EffectiveIncluded = &included
			}
			if row.Target != nil && row.Effective != nil {
				var expected LapFamilyUse
				for _, use := range original.FamilyUse {
					if use.Family == family {
						expected = use
					}
				}
				request := LapFamilyUseCorrection{Base: base, Target: *row.Target, Family: family, Expected: expected, Reason: "capability inspection"}
				if _, err := prepareLapFamilyUseCorrection(baseID, base, originalValidity, request); err == nil {
					var effectiveUse LapFamilyUse
					matches := 0
					for _, use := range row.Effective.FamilyUse {
						if use.Family == family {
							effectiveUse = use
							matches++
						}
					}
					if matches == 1 {
						capability.CanExclude = true
						capability.Reason = "inclusion_requires_complete_coverage"
						if validateLapFamilyInclusion(originalValidity, original, expected) == nil && validateLapFamilyInclusion(effective, *row.Effective, effectiveUse) == nil {
							capability.CanInclude = true
							capability.Reason = ""
						}
					}
				}
			}
			row.Capabilities = append(row.Capabilities, capability)
		}
		result.Laps = append(result.Laps, row)
	}
	return result, nil
}

// No synthetic first stint: return only an actual preceding recorded boundary.
// Equal-time conflicting boundaries are unresolved, rather than order-dependent.
func precedingRecordedStintBoundary(at time.Time, boundaries []strategyprojection.StintBoundary) *strategyprojection.StintBoundary {
	var selected *strategyprojection.StintBoundary
	ambiguous := false
	for _, boundary := range boundaries {
		if boundary.Timestamp.IsZero() || boundary.Timestamp.After(at) {
			continue
		}
		if selected == nil || boundary.Timestamp.After(selected.Timestamp) {
			copy := boundary
			selected = &copy
			ambiguous = false
		} else if boundary.Timestamp.Equal(selected.Timestamp) {
			ambiguous = true
		}
	}
	if ambiguous {
		return nil
	}
	if selected != nil {
		if selected.Provenance.ObservedAt != nil {
			at := *selected.Provenance.ObservedAt
			selected.Provenance.ObservedAt = &at
		}
		if selected.Confidence.RangeLower != nil {
			value := *selected.Confidence.RangeLower
			selected.Confidence.RangeLower = &value
		}
		if selected.Confidence.RangeUpper != nil {
			value := *selected.Confidence.RangeUpper
			selected.Confidence.RangeUpper = &value
		}
		if selected.Confidence.Variance != nil {
			value := *selected.Confidence.Variance
			selected.Confidence.Variance = &value
		}
	}
	return selected
}

func inspectionFamilyRuleIncluded(lap AnalyzedLap, family DerivationFamily) bool {
	if family == FamilyCombinedStintPaceCurve || family == FamilySavingCost {
		return curveFamilyIncluded(lap, family)
	}
	return familyIncluded(lap, family)
}
