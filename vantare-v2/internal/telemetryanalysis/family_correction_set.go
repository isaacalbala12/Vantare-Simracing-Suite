package telemetryanalysis

import (
	"fmt"
	"reflect"
	"slices"
	"sort"
)

// PrepareLapFamilyCorrections validates the whole set against original analysis.
// This is an in-memory set, not another store or independently saved snapshot.
func PrepareLapFamilyCorrections(base SourceAnalysisRef, original LapValidityAnalysis, requests []LapFamilyUseCorrection) ([]PreparedLapFamilyUseCorrection, error) {
	if len(requests) > MaxSampleCorrections {
		return nil, fmt.Errorf("%w: family correction quota", ErrInvalidCorrection)
	}
	baseID, err := validateLapFamilyBase(base, original)
	if err != nil {
		return nil, err
	}
	result := make([]PreparedLapFamilyUseCorrection, 0, len(requests))
	for i, request := range requests {
		prepared, err := prepareLapFamilyUseCorrection(baseID, base, original, request)
		if err != nil {
			return nil, fmt.Errorf("family correction %d: %w", i, err)
		}
		result = append(result, prepared)
	}
	return canonicalLapFamilySet(result)
}

func prepareStoredLapFamilyCorrections(base SourceAnalysisRef, requests []LapFamilyUseCorrection) ([]PreparedLapFamilyUseCorrection, error) {
	if _, err := base.Digest(); err != nil {
		return nil, err
	}
	if len(requests) > MaxSampleCorrections {
		return nil, ErrInvalidCorrection
	}
	result := make([]PreparedLapFamilyUseCorrection, 0, len(requests))
	for _, request := range requests {
		if request.Base != base {
			return nil, ErrCorrectionInterpretationChanged
		}
		prepared, err := prepareStoredLapFamilyCorrection(request)
		if err != nil {
			return nil, err
		}
		result = append(result, prepared)
	}
	return canonicalLapFamilySet(result)
}

func canonicalLapFamilySet(result []PreparedLapFamilyUseCorrection) ([]PreparedLapFamilyUseCorrection, error) {
	sort.Slice(result, func(i, j int) bool {
		a, b := result[i].Request, result[j].Request
		if a.Family != b.Family {
			return a.Family < b.Family
		}
		if !a.Target.Start.Equal(b.Target.Start) {
			return a.Target.Start.Before(b.Target.Start)
		}
		if !a.Target.End.Equal(b.Target.End) {
			return a.Target.End.Before(b.Target.End)
		}
		return a.Target.Number < b.Target.Number
	})
	for i := 1; i < len(result); i++ {
		previous, current := result[i-1].Request, result[i].Request
		if previous.Family == current.Family && current.Target.Start.Before(previous.Target.End) {
			return nil, ErrOverlappingCorrections
		}
	}
	return result, nil
}

// ApplyLapFamilyCorrections revalidates the prepared set and resolves each exact
// target again after scalar reanalysis. Changed boundaries never silently move a
// correction. Returned laps are detached; temporal analysis stays with its owner.
func ApplyLapFamilyCorrections(base SourceAnalysisRef, original, effective LapValidityAnalysis, corrections []PreparedLapFamilyUseCorrection) ([]AnalyzedLap, error) {
	if effective.SessionID != base.SessionID || effective.ComputationVersion != base.AnalysisVersion {
		return nil, ErrCorrectionInterpretationChanged
	}
	if err := effective.Temporal.ContractVersion.ValidateTemporal(); err != nil {
		return nil, ErrCorrectionInterpretationChanged
	}
	if len(corrections) > MaxSampleCorrections {
		return nil, ErrInvalidCorrection
	}
	requests := make([]LapFamilyUseCorrection, len(corrections))
	for i, correction := range corrections {
		requests[i] = correction.Request
	}
	checked, err := PrepareLapFamilyCorrections(base, original, requests)
	if err != nil {
		return nil, err
	}
	if len(checked) != 0 && !reflect.DeepEqual(checked, corrections) {
		return nil, fmt.Errorf("%w: family set integrity", ErrInvalidCorrection)
	}
	type position struct{ lap, family int }
	positions := make([]position, len(checked))
	for i, correction := range checked {
		target := correction.Request.Target
		matches, families := 0, 0
		for l, lap := range effective.Laps {
			if lap.Number != target.Number || lap.Start == nil || !lap.Start.Equal(target.Start) || !lap.End.Equal(target.End) {
				continue
			}
			matches++
			for f, use := range lap.FamilyUse {
				if use.Family != correction.Request.Family {
					continue
				}
				families++
				positions[i] = position{l, f}
				if correction.Request.Included {
					if err := validateLapFamilyInclusion(effective, lap, use); err != nil {
						return nil, err
					}
				}
			}
		}
		if matches != 1 || families != 1 {
			return nil, ErrCorrectionTarget
		}
	}
	result := cloneFamilyCorrectionLaps(effective.Laps)
	for i, correction := range checked {
		p := positions[i]
		use := &result[p.lap].FamilyUse[p.family]
		use.Included = correction.Request.Included
		if use.Included {
			use.ExclusionReasons = nil
		} else if !slices.Contains(use.ExclusionReasons, LapExclusionManual) {
			use.ExclusionReasons = append(use.ExclusionReasons, LapExclusionManual)
		}
	}
	return result, nil
}

func cloneFamilyCorrectionLaps(laps []AnalyzedLap) []AnalyzedLap {
	result := slices.Clone(laps)
	for i, lap := range laps {
		if lap.Start != nil {
			start := *lap.Start
			result[i].Start = &start
		}
		if lap.LapTimeSeconds != nil {
			seconds := *lap.LapTimeSeconds
			result[i].LapTimeSeconds = &seconds
		}
		result[i].Labels = slices.Clone(lap.Labels)
		result[i].FamilyUse = slices.Clone(lap.FamilyUse)
		for j, use := range lap.FamilyUse {
			result[i].FamilyUse[j].ExclusionReasons = slices.Clone(use.ExclusionReasons)
		}
	}
	return result
}
