package backtest

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func RunRace(race RaceCase, thresholds Thresholds) (RaceResult, error) {
	if err := validateThresholds(thresholds); err != nil {
		return RaceResult{}, err
	}
	if err := validateRaceCase(race); err != nil {
		return RaceResult{}, err
	}
	observedDecision, err := observedDecision(race)
	if err != nil {
		return RaceResult{}, err
	}

	recommended, err := solver.SolveV2(race.PredictionInput)
	if err != nil {
		return RaceResult{}, fmt.Errorf("solve recommended plan: %w", err)
	}
	if !recommended.Feasible {
		return RaceResult{}, fmt.Errorf("solve recommended plan: no feasible plan: %+v", recommended.Reasons)
	}
	calibrationReplay, err := solver.ReplayDecisionV2(race.PredictionInput, observedDecision)
	if err != nil {
		return RaceResult{}, fmt.Errorf("replay observed calibration: %w", err)
	}
	if !calibrationReplay.Feasible {
		return RaceResult{}, fmt.Errorf("replay observed calibration: fixed observed plan is infeasible: %+v", calibrationReplay.Reasons)
	}

	calibration, err := calibrationMetrics(race, observedDecision, recommended, calibrationReplay, thresholds)
	if err != nil {
		return RaceResult{}, err
	}
	recommendedRealized, err := solver.ReplayDecisionV2(race.RealizedInput, recommended.Best)
	if err != nil {
		return RaceResult{}, fmt.Errorf("replay recommended plan against realized data: %w", err)
	}
	feasibility := FeasibilityResult{
		Passed:  recommendedRealized.Feasible,
		Replay:  recommendedRealized,
		Reasons: append([]solver.SolverReason(nil), recommendedRealized.Reasons...),
	}
	ranking, err := rankingMetrics(race, observedDecision, recommended, calibrationReplay, recommendedRealized, thresholds)
	if err != nil {
		return RaceResult{}, err
	}

	// Wall-clock duration is solver telemetry, not a deterministic backtest
	// metric. The structured replay keeps counts and budget status only.
	recommended.ComputeStats.Duration = 0
	return RaceResult{
		ContractVersion: ContractVersionV1,
		RaceID:          race.RaceID,
		CombinationID:   race.CombinationID,
		OccurredAt:      race.OccurredAt,
		Calibration:     calibration,
		Feasibility:     feasibility,
		Ranking:         ranking,
		Recommended:     recommended,
	}, nil
}

func calibrationMetrics(
	race RaceCase,
	observedDecision solver.DecisionVector,
	recommended solver.SolverResultV2,
	replayed solver.ReplayResultV1,
	thresholds Thresholds,
) (CalibrationResult, error) {
	observedTotal := race.Observed.Result.TotalTimeSeconds
	errorSeconds := math.Abs(replayed.Evaluation.TotalSeconds - observedTotal)
	result := CalibrationResult{
		PredictedTotalSeconds: replayed.Evaluation.TotalSeconds,
		ObservedTotalSeconds:  observedTotal,
		AbsoluteErrorSeconds:  errorSeconds,
		AbsoluteErrorRatio:    errorSeconds / observedTotal,
		Stints:                make([]StintError, 0, len(race.Observed.Stints)),
		ObservedPitLaps:       pitLaps(observedDecision),
		RecommendedPitLaps:    pitLaps(recommended.Best),
	}
	if len(replayed.Stints) != len(race.Observed.Stints) {
		return CalibrationResult{}, fmt.Errorf("calibration replay returned %d stints, want %d", len(replayed.Stints), len(race.Observed.Stints))
	}
	for index, stint := range race.Observed.Stints {
		observed := *stint.TotalTimeSeconds
		predicted := replayed.Stints[index].Evaluation.TotalSeconds
		absolute := math.Abs(predicted - observed)
		result.Stints = append(result.Stints, StintError{
			StintNumber:        stint.StintNumber,
			PredictedSeconds:   predicted,
			ObservedSeconds:    observed,
			AbsoluteError:      absolute,
			AbsoluteErrorRatio: absolute / observed,
		})
	}
	result.DryPitStopsExact = !race.Dry || equalInt64s(result.ObservedPitLaps, result.RecommendedPitLaps)
	result.Passed = result.AbsoluteErrorRatio < thresholds.TotalErrorRatio &&
		(!thresholds.RequireExactDryPitStops || result.DryPitStopsExact)
	return result, nil
}

func rankingMetrics(
	race RaceCase,
	observedDecision solver.DecisionVector,
	recommended solver.SolverResultV2,
	observedPrediction solver.ReplayResultV1,
	recommendedRealized solver.ReplayResultV1,
	thresholds Thresholds,
) (RankingResult, error) {
	result := RankingResult{
		Applicable:            !sameStrategyShape(observedDecision, recommended.Best),
		InternalRegretSeconds: internalRegret(recommended),
	}
	if !result.Applicable {
		result.Passed = result.InternalRegretSeconds <= thresholds.RegretToleranceSeconds
		result.Reason = "observed_strategy_matches_recommendation"
		return result, nil
	}
	if !recommendedRealized.Feasible {
		result.Reason = "recommended_plan_infeasible_on_realized_data"
		return result, nil
	}
	observedRealized, err := solver.ReplayDecisionV2(race.RealizedInput, observedDecision)
	if err != nil {
		return RankingResult{}, fmt.Errorf("replay observed plan against realized data: %w", err)
	}
	if !observedRealized.Feasible {
		result.Reason = "observed_plan_infeasible_on_realized_data"
		return result, nil
	}
	result.Evaluable = true
	result.PredictedDeltaSeconds = recommended.Expected.TotalSeconds - observedPrediction.Evaluation.TotalSeconds
	result.RealizedDeltaSeconds = recommendedRealized.Evaluation.TotalSeconds - observedRealized.Evaluation.TotalSeconds
	result.SignCoherent = deltaSign(result.PredictedDeltaSeconds, thresholds.SignToleranceSeconds) ==
		deltaSign(result.RealizedDeltaSeconds, thresholds.SignToleranceSeconds)
	result.Passed = result.SignCoherent && result.InternalRegretSeconds <= thresholds.RegretToleranceSeconds
	return result, nil
}

func observedDecision(race RaceCase) (solver.DecisionVector, error) {
	observed := race.Observed
	decision := solver.DecisionVector{
		Stints:   make([]solver.StintDecision, 0, len(observed.Stints)),
		PitStops: make([]solver.PitStopDecision, 0, len(observed.PitStops)),
	}
	stints := append([]sp.ObservedStint(nil), observed.Stints...)
	sort.SliceStable(stints, func(i, j int) bool { return stints[i].StintNumber < stints[j].StintNumber })
	pits := append([]sp.ObservedPitStop(nil), observed.PitStops...)
	sort.SliceStable(pits, func(i, j int) bool { return pits[i].LapNumber < pits[j].LapNumber })
	if len(pits) != len(stints)-1 {
		return solver.DecisionVector{}, fmt.Errorf("observed strategy has %d stints but %d pit stops", len(stints), len(pits))
	}
	expectedStart := 1
	for index, stint := range stints {
		if stint.StartLap != expectedStart || stint.TotalTimeSeconds == nil {
			return solver.DecisionVector{}, fmt.Errorf("observed stint %d is non-contiguous or lacks observed time", stint.StintNumber)
		}
		compound, err := mappedCompound(stint.CompoundRaw, race.CompoundMapping)
		if err != nil {
			return solver.DecisionVector{}, fmt.Errorf("observed stint %d: %w", stint.StintNumber, err)
		}
		decision.Stints = append(decision.Stints, solver.StintDecision{
			Index:       index,
			Laps:        int64(stint.EndLap - stint.StartLap + 1),
			Compound:    compound,
			SavingLevel: solver.SavingNone,
		})
		expectedStart = stint.EndLap + 1
		if index == len(stints)-1 {
			continue
		}
		pit := pits[index]
		if pit.LapNumber != stint.EndLap {
			return solver.DecisionVector{}, fmt.Errorf("observed pit %d is on lap %d, want stint boundary %d", index+1, pit.LapNumber, stint.EndLap)
		}
		fuel, ve := 0.0, 0.0
		if pit.FuelAddedLiters != nil {
			fuel = *pit.FuelAddedLiters
		}
		if pit.VEAddedPercent != nil {
			ve = *pit.VEAddedPercent
		}
		decision.PitStops = append(decision.PitStops, solver.PitStopDecision{
			Lap:         int64(pit.LapNumber),
			FuelLiters:  fuel,
			VEPercent:   ve,
			ChangeTyres: observedTyreChange(observed, pit.LapNumber, stints[index], stints[index+1]),
		})
	}
	return decision, nil
}

func observedTyreChange(observed sp.ObservedStrategyV1, lap int, current, next sp.ObservedStint) bool {
	if current.CompoundRaw != nil && next.CompoundRaw != nil && *current.CompoundRaw != *next.CompoundRaw {
		return true
	}
	for _, change := range observed.Changes {
		if change.LapNumber == lap && change.Kind == sp.ObservedChangeTyreChange {
			return true
		}
	}
	return false
}

func mappedCompound(raw *int, mapping map[int]solver.TyreCompound) (solver.TyreCompound, error) {
	if raw == nil {
		return "", nil
	}
	compound, ok := mapping[*raw]
	if len(mapping) > 0 && !ok {
		return "", fmt.Errorf("raw compound %d has no configured mapping", *raw)
	}
	return compound, nil
}

func validateThresholds(value Thresholds) error {
	if value.TotalErrorRatio <= 0 || !finite(value.TotalErrorRatio) {
		return fmt.Errorf("totalErrorRatio must be positive and finite")
	}
	if value.RankingSignAgreementRatio < 0 || value.RankingSignAgreementRatio > 1 || !finite(value.RankingSignAgreementRatio) {
		return fmt.Errorf("rankingSignAgreementRatio must be between 0 and 1")
	}
	if value.RegretToleranceSeconds < 0 || value.SignToleranceSeconds < 0 ||
		!finite(value.RegretToleranceSeconds) || !finite(value.SignToleranceSeconds) {
		return fmt.Errorf("ranking tolerances must be finite and non-negative")
	}
	return nil
}

func validateRaceCase(race RaceCase) error {
	if strings.TrimSpace(race.RaceID) == "" || strings.TrimSpace(race.CombinationID) == "" || race.OccurredAt.IsZero() || race.TrainingDataThrough.IsZero() {
		return fmt.Errorf("race identity, occurredAt and trainingDataThrough are required")
	}
	if !race.TrainingDataThrough.Before(race.OccurredAt) {
		return fmt.Errorf("trainingDataThrough must be before occurredAt")
	}
	if err := race.Observed.Validate(); err != nil {
		return fmt.Errorf("observed strategy: %w", err)
	}
	if race.Observed.SessionID != race.RaceID || race.Observed.Result == nil || !race.Observed.Result.Completed || race.Observed.Result.TotalTimeSeconds <= 0 {
		return fmt.Errorf("observed strategy must contain the completed race result")
	}
	for label, input := range map[string]solver.SolverInputV2{"predictionInput": race.PredictionInput, "realizedInput": race.RealizedInput} {
		if input.RaceLaps != int64(race.Observed.Result.CompletedLaps) {
			return fmt.Errorf("%s raceLaps does not match observed completed laps", label)
		}
		if input.Projection != nil {
			if input.Projection.CombinationID != race.CombinationID {
				return fmt.Errorf("%s projection combination does not match race", label)
			}
		}
	}
	if race.PredictionInput.Projection != nil {
		for _, sessionID := range race.PredictionInput.Projection.SourceSessions {
			if sessionID == race.RaceID {
				return fmt.Errorf("predictionInput projection leaks the holdout race")
			}
		}
	}
	if race.PredictionInput.Observed != nil && race.PredictionInput.Observed.SessionID == race.RaceID {
		return fmt.Errorf("predictionInput observed strategy leaks the holdout race")
	}
	return nil
}

func internalRegret(result solver.SolverResultV2) float64 {
	bestEnumerated := result.Expected.TotalSeconds
	for _, candidate := range result.CandidateDetails {
		if candidate.Feasible && candidate.Evaluation.TotalSeconds < bestEnumerated {
			bestEnumerated = candidate.Evaluation.TotalSeconds
		}
	}
	regret := result.Expected.TotalSeconds - bestEnumerated
	if regret < 0 {
		return 0
	}
	return regret
}

func sameStrategyShape(left, right solver.DecisionVector) bool {
	if !equalInt64s(pitLaps(left), pitLaps(right)) || len(left.Stints) != len(right.Stints) {
		return false
	}
	for index := range left.Stints {
		if left.Stints[index].Laps != right.Stints[index].Laps || left.Stints[index].Compound != right.Stints[index].Compound {
			return false
		}
	}
	return true
}

func pitLaps(decision solver.DecisionVector) []int64 {
	result := make([]int64, 0, len(decision.PitStops))
	for _, pit := range decision.PitStops {
		result = append(result, pit.Lap)
	}
	return result
}

func equalInt64s(left, right []int64) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func deltaSign(value, tolerance float64) int {
	if value > tolerance {
		return 1
	}
	if value < -tolerance {
		return -1
	}
	return 0
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
