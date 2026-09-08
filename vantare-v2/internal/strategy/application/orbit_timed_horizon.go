package application

import (
	"context"
	"fmt"
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
)

// Each horizon is solved and replayed in full. The estimate only selects the
// next horizon; only the actual replay clock can accept a recommendation.
func resolveOrbitTimedHorizon(ctx context.Context, race manual.RaceInput, laps int64, variantIndex int, calculate func(int64) (OrbitCalculationPlan, error)) (OrbitCalculationPlan, error) {
	duration := race.Duration.Value.Value()
	tolerance := 1e-12 * math.Max(1, duration)
	seen := make(map[int64]bool)
	field := fmt.Sprintf("input.variants.%d", variantIndex)
	for attempt := 0; attempt < 32; attempt++ {
		if err := ctx.Err(); err != nil {
			return OrbitCalculationPlan{}, mapOrbitCalculationError(err, field)
		}
		if laps <= 0 || seen[laps] {
			break
		}
		seen[laps] = true
		plan, err := calculate(laps)
		if err != nil {
			return OrbitCalculationPlan{}, err
		}
		if plan.FinalLapStartSeconds < duration-tolerance && plan.TotalSeconds+tolerance >= duration {
			return plan, nil
		}
		var next int64
		if plan.PitSeconds > duration {
			// CalculateRace rejects a pit budget larger than the whole event.
			// Scale this search estimate down; its next plan is still fully checked.
			next = int64(math.Floor(float64(laps) * duration / plan.TotalSeconds))
		} else {
			race.AverageLap.Value, err = contract.NewDurationSeconds(plan.DrivingSeconds / float64(laps))
			if err != nil {
				return OrbitCalculationPlan{}, mapOrbitCalculationError(err, field)
			}
			race.PitLoss.Value, err = contract.NewDurationSeconds(plan.PitSeconds)
			if err != nil {
				return OrbitCalculationPlan{}, mapOrbitCalculationError(err, field)
			}
			estimate, err := manual.CalculateRace(race)
			if err != nil {
				return OrbitCalculationPlan{}, mapOrbitCalculationError(err, field)
			}
			next = estimate.CompetitiveLaps.Value()
		}
		if next == laps {
			if plan.TotalSeconds < duration-tolerance {
				next++
			} else {
				next--
			}
		}
		laps = next
	}
	return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationOverflow, field, fmt.Errorf("timed horizon did not converge: %w", ErrCalculationOverflow))
}
