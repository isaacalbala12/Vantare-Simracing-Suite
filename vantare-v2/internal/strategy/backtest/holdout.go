package backtest

import (
	"fmt"
	"math"
	"sort"
)

func RunHoldout(cases []RaceCase, config Config) (HoldoutResult, error) {
	if err := validateThresholds(config.Thresholds); err != nil {
		return HoldoutResult{}, err
	}
	if err := validateHoldoutConfig(config.Holdout); err != nil {
		return HoldoutResult{}, err
	}
	selected := make([]RaceCase, 0, len(cases))
	seen := make(map[string]bool, len(cases))
	for _, race := range cases {
		key := race.CombinationID + "\x00" + race.RaceID
		if seen[key] {
			return HoldoutResult{}, fmt.Errorf("duplicate race %q in combination %q", race.RaceID, race.CombinationID)
		}
		seen[key] = true
		cutoff, ok := config.Holdout.CutoffByCombination[race.CombinationID]
		if !ok {
			return HoldoutResult{}, fmt.Errorf("combination %q has no holdout cutoff", race.CombinationID)
		}
		if !race.OccurredAt.After(cutoff) {
			continue
		}
		if race.TrainingDataThrough.After(cutoff) {
			return HoldoutResult{}, fmt.Errorf("race %q training data crosses its holdout cutoff", race.RaceID)
		}
		selected = append(selected, race)
	}
	sort.SliceStable(selected, func(i, j int) bool {
		if selected[i].CombinationID != selected[j].CombinationID {
			return selected[i].CombinationID < selected[j].CombinationID
		}
		if !selected[i].OccurredAt.Equal(selected[j].OccurredAt) {
			return selected[i].OccurredAt.Before(selected[j].OccurredAt)
		}
		return selected[i].RaceID < selected[j].RaceID
	})

	result := HoldoutResult{ContractVersion: ContractVersionV1, Races: make([]RaceResult, 0, len(selected))}
	for _, race := range selected {
		raceResult, err := RunRace(race, config.Thresholds)
		if err != nil {
			return HoldoutResult{}, fmt.Errorf("race %q: %w", race.RaceID, err)
		}
		result.Races = append(result.Races, raceResult)
	}
	result.Aggregate = aggregate(result.Races, config)
	return result, nil
}

func aggregate(races []RaceResult, config Config) AggregateResult {
	totalErrors := make([]float64, 0, len(races))
	stintErrors := []float64{}
	rankingCount, coherentCount := 0, 0
	maxRegret := 0.0
	allCalibration, allFeasible, allRanking := true, true, true
	for _, race := range races {
		totalErrors = append(totalErrors, race.Calibration.AbsoluteErrorRatio)
		for _, stint := range race.Calibration.Stints {
			stintErrors = append(stintErrors, stint.AbsoluteErrorRatio)
		}
		allCalibration = allCalibration && race.Calibration.Passed
		allFeasible = allFeasible && race.Feasibility.Passed
		if race.Ranking.Applicable {
			rankingCount++
			if race.Ranking.Evaluable && race.Ranking.SignCoherent {
				coherentCount++
			}
			allRanking = allRanking && race.Ranking.Passed
		}
		if race.Ranking.InternalRegretSeconds > maxRegret {
			maxRegret = race.Ranking.InternalRegretSeconds
		}
	}
	agreement := 0.0
	if rankingCount > 0 {
		agreement = float64(coherentCount) / float64(rankingCount)
	}
	enoughRaces := len(races) >= config.Holdout.MinimumRaces
	enoughRanking := rankingCount >= config.Holdout.MinimumRankingRaces
	calibrationPassed := enoughRaces && allCalibration
	feasibilityPassed := enoughRaces && allFeasible
	rankingPassed := enoughRanking && allRanking &&
		agreement >= config.Thresholds.RankingSignAgreementRatio &&
		maxRegret <= config.Thresholds.RegretToleranceSeconds
	return AggregateResult{
		RaceCount:                    len(races),
		RankingRaceCount:             rankingCount,
		TotalErrorRatio:              meanInterval(totalErrors, config.Holdout.IntervalZScore),
		StintErrorRatio:              meanInterval(stintErrors, config.Holdout.IntervalZScore),
		RankingSignAgreementRatio:    agreement,
		MaximumInternalRegretSeconds: maxRegret,
		CalibrationPassed:            calibrationPassed,
		FeasibilityPassed:            feasibilityPassed,
		RankingPassed:                rankingPassed,
		Passed:                       calibrationPassed && feasibilityPassed && rankingPassed,
		Thresholds:                   config.Thresholds,
	}
}

func meanInterval(values []float64, z float64) Interval {
	result := Interval{Count: len(values)}
	if len(values) == 0 {
		return result
	}
	for _, value := range values {
		result.Mean += value
	}
	result.Mean /= float64(len(values))
	if len(values) == 1 {
		result.Lower, result.Upper = result.Mean, result.Mean
		return result
	}
	variance := 0.0
	for _, value := range values {
		delta := value - result.Mean
		variance += delta * delta
	}
	variance /= float64(len(values) - 1)
	margin := z * math.Sqrt(variance/float64(len(values)))
	result.Lower = math.Max(0, result.Mean-margin)
	result.Upper = result.Mean + margin
	return result
}

func validateHoldoutConfig(config HoldoutConfig) error {
	if len(config.CutoffByCombination) == 0 {
		return fmt.Errorf("cutoffByCombination is required")
	}
	for combination, cutoff := range config.CutoffByCombination {
		if combination == "" || cutoff.IsZero() {
			return fmt.Errorf("each holdout combination and cutoff is required")
		}
	}
	if config.MinimumRaces <= 0 || config.MinimumRankingRaces < 0 {
		return fmt.Errorf("minimum race counts are invalid")
	}
	if config.IntervalZScore <= 0 || !finite(config.IntervalZScore) {
		return fmt.Errorf("intervalZScore must be positive and finite")
	}
	return nil
}
