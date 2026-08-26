package backtest

import "fmt"

// CalibrationAggregateResult is the neutral quantitative summary used by
// product views. It deliberately carries no provisional gate verdict.
type CalibrationAggregateResult struct {
	RaceCount       int      `json:"raceCount"`
	TotalErrorRatio Interval `json:"totalErrorRatio"`
	StintErrorRatio Interval `json:"stintErrorRatio"`
}

// SummarizeCalibration exposes the F4-9 interval authority without exposing a
// provisional pass/fail decision to product surfaces.
func SummarizeCalibration(races []RaceResult, intervalZScore float64) (CalibrationAggregateResult, error) {
	if intervalZScore <= 0 || !finite(intervalZScore) {
		return CalibrationAggregateResult{}, fmt.Errorf("intervalZScore must be positive and finite")
	}
	totalErrors := make([]float64, 0, len(races))
	stintErrors := []float64{}
	for _, race := range races {
		totalErrors = append(totalErrors, race.Calibration.AbsoluteErrorRatio)
		for _, stint := range race.Calibration.Stints {
			stintErrors = append(stintErrors, stint.AbsoluteErrorRatio)
		}
	}
	return CalibrationAggregateResult{
		RaceCount:       len(races),
		TotalErrorRatio: meanInterval(totalErrors, intervalZScore),
		StintErrorRatio: meanInterval(stintErrors, intervalZScore),
	}, nil
}
