package application

import (
	"context"
	"fmt"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/backtest"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const validatedExamplesIntervalZScore = 1.96

// GetValidatedExamples replays only race cases supplied through the
// authorized historical boundary. Strategy owns the replay and metrics; it
// never opens Analysis storage or fabricates an example.
func (service *Service[T]) GetValidatedExamples(ctx context.Context, command GetValidatedExamplesCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationGetValidatedExamples); err != nil {
		return Result[T]{}, err
	}
	snapshot, event, err := service.readEvent(ctx, command.EventID)
	if err != nil {
		return Result[T]{}, err
	}
	result := documentResult[T](command.CommandID, snapshot)
	validated := ValidatedExamplesResult{
		Status: ValidatedExamplesNoCombination,
		Races:  []ValidatedRaceExample{},
	}
	result.ValidatedExamples = &validated
	if event.Combination == nil {
		return result, nil
	}
	validated.CombinationID = event.Combination.CombinationID
	validated.Status = ValidatedExamplesNoRaces
	if service.raceCases == nil {
		return result, nil
	}
	cases, err := service.raceCases.ListRaceCases(ctx, validated.CombinationID)
	if err != nil {
		return Result[T]{}, err
	}
	sort.SliceStable(cases, func(i, j int) bool {
		if !cases[i].OccurredAt.Equal(cases[j].OccurredAt) {
			return cases[i].OccurredAt.After(cases[j].OccurredAt)
		}
		return cases[i].RaceID < cases[j].RaceID
	})
	replayed := make([]backtest.RaceResult, 0, len(cases))
	for _, race := range cases {
		if race.CombinationID != validated.CombinationID {
			return Result[T]{}, fmt.Errorf("validated race %q belongs to combination %q", race.RaceID, race.CombinationID)
		}
		raceResult, err := backtest.RunRace(race, backtest.ProvisionalThresholds(0))
		if err != nil {
			return Result[T]{}, fmt.Errorf("replay validated race %q: %w", race.RaceID, err)
		}
		replayed = append(replayed, raceResult)
		validated.Races = append(validated.Races, adaptValidatedRace(race, raceResult))
	}
	if len(replayed) == 0 {
		return result, nil
	}
	validated.Aggregate, err = backtest.SummarizeCalibration(replayed, validatedExamplesIntervalZScore)
	if err != nil {
		return Result[T]{}, err
	}
	validated.Status = ValidatedExamplesAvailable
	return result, nil
}

func adaptValidatedRace(race backtest.RaceCase, replay backtest.RaceResult) ValidatedRaceExample {
	metricsByStint := make(map[int]backtest.StintError, len(replay.Calibration.Stints))
	for _, metric := range replay.Calibration.Stints {
		metricsByStint[metric.StintNumber] = metric
	}
	observed := append([]sp.ObservedStint(nil), race.Observed.Stints...)
	sort.SliceStable(observed, func(i, j int) bool { return observed[i].StintNumber < observed[j].StintNumber })
	stints := make([]ValidatedExampleStint, 0, len(observed))
	for _, stint := range observed {
		metric := metricsByStint[stint.StintNumber]
		stints = append(stints, ValidatedExampleStint{
			StintNumber:        stint.StintNumber,
			Laps:               stint.EndLap - stint.StartLap + 1,
			CompoundRaw:        stint.CompoundRaw,
			PredictedSeconds:   metric.PredictedSeconds,
			ObservedSeconds:    metric.ObservedSeconds,
			AbsoluteError:      metric.AbsoluteError,
			AbsoluteErrorRatio: metric.AbsoluteErrorRatio,
		})
	}
	return ValidatedRaceExample{
		RaceID:                race.RaceID,
		OccurredAt:            race.OccurredAt,
		PredictedTotalSeconds: replay.Calibration.PredictedTotalSeconds,
		ObservedTotalSeconds:  replay.Calibration.ObservedTotalSeconds,
		AbsoluteErrorSeconds:  replay.Calibration.AbsoluteErrorSeconds,
		AbsoluteErrorRatio:    replay.Calibration.AbsoluteErrorRatio,
		Stints:                stints,
		PitLaps:               append([]int64(nil), replay.Calibration.ObservedPitLaps...),
	}
}
