package manual

import (
	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type RaceKind string

const (
	RaceByLaps RaceKind = "laps"
	RaceByTime RaceKind = "time"
)

type TimedFinishRule string

const (
	// TimedFinishCurrentLap completes the lap already in progress when the
	// on-track clock expires. At an exact finish-line boundary it adds none.
	TimedFinishCurrentLap TimedFinishRule = "complete_current_lap"
	// TimedFinishCurrentPlusOne completes the lap in progress and then one
	// explicit additional lap required by the event rule.
	TimedFinishCurrentPlusOne TimedFinishRule = "complete_current_plus_one"
)

type RaceInput struct {
	Kind          RaceKind                          `json:"kind"`
	TargetLaps    Sourced[contract.LapCount]        `json:"targetLaps"`
	Duration      Sourced[contract.DurationSeconds] `json:"duration"`
	AverageLap    Sourced[contract.DurationSeconds] `json:"averageLap"`
	FormationLaps Sourced[contract.LapCount]        `json:"formationLaps"`
	PitLoss       Sourced[contract.DurationSeconds] `json:"pitLoss"`
	TimedFinish   TimedFinishRule                   `json:"timedFinish,omitempty"`
	Selection     Evidence                          `json:"selection"`
}

type RaceResult struct {
	Kind                 RaceKind                 `json:"kind"`
	CompetitiveLaps      contract.LapCount        `json:"competitiveLaps"`
	FormationLaps        contract.LapCount        `json:"formationLaps"`
	TotalLaps            contract.LapCount        `json:"totalLaps"`
	LapsCompleteAtExpiry contract.LapCount        `json:"lapsCompleteAtExpiry"`
	FinalLapsAfterExpiry contract.LapCount        `json:"finalLapsAfterExpiry"`
	ScheduledSeconds     contract.DurationSeconds `json:"scheduledSeconds"`
	OnTrackBudgetSeconds contract.DurationSeconds `json:"onTrackBudgetSeconds"`
	DrivingSeconds       contract.DurationSeconds `json:"drivingSeconds"`
	PitLoss              contract.DurationSeconds `json:"pitLoss"`
	Assumptions          []Assumption             `json:"assumptions"`
}

func CalculateRace(input RaceInput) (RaceResult, error) {
	// PitLoss is always an explicit sourced input. This function never derives
	// stop count from Fuel/VE and therefore cannot hide a pit->laps->resource
	// fixed-point loop. A later solver may iterate that relationship explicitly.
	if err := validateEvidence("race.selection", input.Selection); err != nil {
		return RaceResult{}, err
	}
	if err := validateSourcedDuration("race.averageLap", input.AverageLap); err != nil {
		return RaceResult{}, err
	}
	if input.AverageLap.Value.Value() <= 0 {
		return RaceResult{}, calculationError(ErrorInvalidInput, "race.averageLap", "must be positive")
	}
	if err := validateSourcedLaps("race.formationLaps", input.FormationLaps); err != nil {
		return RaceResult{}, err
	}
	if err := validateSourcedDuration("race.pitLoss", input.PitLoss); err != nil {
		return RaceResult{}, err
	}

	result := RaceResult{
		Kind:          input.Kind,
		FormationLaps: input.FormationLaps.Value,
		PitLoss:       input.PitLoss.Value,
		Assumptions: []Assumption{
			assumption("race.kind", "race_kind", input.Kind, input.Selection),
			assumption("race.averageLap", "duration_seconds", input.AverageLap.Value.Value(), input.AverageLap.Evidence),
			assumption("race.formationLaps", "lap_count", input.FormationLaps.Value.Value(), input.FormationLaps.Evidence),
			assumption("race.pitLoss", "duration_seconds", input.PitLoss.Value.Value(), input.PitLoss.Evidence),
		},
	}

	switch input.Kind {
	case RaceByLaps:
		if err := validateSourcedLaps("race.targetLaps", input.TargetLaps); err != nil {
			return RaceResult{}, err
		}
		if input.TargetLaps.Value.Value() <= 0 {
			return RaceResult{}, calculationError(ErrorInvalidInput, "race.targetLaps", "must be positive")
		}
		result.Assumptions = append(result.Assumptions, assumption("race.targetLaps", "lap_count", input.TargetLaps.Value.Value(), input.TargetLaps.Evidence))
		result.CompetitiveLaps = input.TargetLaps.Value
		result.LapsCompleteAtExpiry = input.TargetLaps.Value
		driving, err := checkedMultiply("race.drivingSeconds", float64(input.TargetLaps.Value.Value()), input.AverageLap.Value.Value())
		if err != nil {
			return RaceResult{}, err
		}
		result.DrivingSeconds, err = duration("race.drivingSeconds", driving)
		if err != nil {
			return RaceResult{}, err
		}
		result.OnTrackBudgetSeconds = result.DrivingSeconds
		scheduled, err := checkedAdd("race.scheduledSeconds", driving, input.PitLoss.Value.Value())
		if err != nil {
			return RaceResult{}, err
		}
		result.ScheduledSeconds, err = duration("race.scheduledSeconds", scheduled)
		if err != nil {
			return RaceResult{}, err
		}
	case RaceByTime:
		if err := validateSourcedDuration("race.duration", input.Duration); err != nil {
			return RaceResult{}, err
		}
		if input.Duration.Value.Value() <= 0 {
			return RaceResult{}, calculationError(ErrorInvalidInput, "race.duration", "must be positive")
		}
		if input.TimedFinish != TimedFinishCurrentLap && input.TimedFinish != TimedFinishCurrentPlusOne {
			return RaceResult{}, calculationError(ErrorInvalidInput, "race.timedFinish", "unsupported timed finish rule")
		}
		result.Assumptions = append(result.Assumptions,
			assumption("race.duration", "duration_seconds", input.Duration.Value.Value(), input.Duration.Evidence),
			assumption("race.timedFinish", "timed_finish_rule", input.TimedFinish, input.Selection),
		)
		if input.PitLoss.Value.Value() > input.Duration.Value.Value() {
			return RaceResult{}, calculationError(ErrorInvalidInput, "race.pitLoss", "cannot exceed the timed race duration")
		}
		result.ScheduledSeconds = input.Duration.Value
		onTrack := input.Duration.Value.Value() - input.PitLoss.Value.Value()
		var err error
		result.OnTrackBudgetSeconds, err = duration("race.onTrackBudgetSeconds", onTrack)
		if err != nil {
			return RaceResult{}, err
		}
		whole, ceiling, err := stableWholeAndCeil(
			"race.competitiveLaps",
			input.Duration.Value.Value(),
			input.PitLoss.Value.Value(),
			input.AverageLap.Value.Value(),
		)
		if err != nil {
			return RaceResult{}, err
		}
		competitive := ceiling
		if input.TimedFinish == TimedFinishCurrentPlusOne && onTrack > 0 {
			competitive++
		}
		result.LapsCompleteAtExpiry, err = laps("race.lapsCompleteAtExpiry", float64(whole))
		if err != nil {
			return RaceResult{}, err
		}
		result.CompetitiveLaps, err = laps("race.competitiveLaps", float64(competitive))
		if err != nil {
			return RaceResult{}, err
		}
		result.FinalLapsAfterExpiry, err = laps("race.finalLapsAfterExpiry", float64(competitive-whole))
		if err != nil {
			return RaceResult{}, err
		}
		driving, err := checkedMultiply("race.drivingSeconds", float64(competitive), input.AverageLap.Value.Value())
		if err != nil {
			return RaceResult{}, err
		}
		result.DrivingSeconds, err = duration("race.drivingSeconds", driving)
		if err != nil {
			return RaceResult{}, err
		}
	default:
		return RaceResult{}, calculationError(ErrorInvalidInput, "race.kind", "unsupported race kind")
	}

	totalLaps := result.CompetitiveLaps.Value() + result.FormationLaps.Value()
	var err error
	result.TotalLaps, err = laps("race.totalLaps", float64(totalLaps))
	if err != nil {
		return RaceResult{}, err
	}
	return result, nil
}
