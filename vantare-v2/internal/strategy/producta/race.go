package producta

import (
	"errors"
	"fmt"
)

// ErrNonConvergent indicates that the timed race and stop-count loop did not
// reach a stable result within its bounded iteration budget.
var ErrNonConvergent = errors.New("timed race projection did not converge")

// RaceProjection is the deterministic length estimate consumed by resources
// and the later stint solver.
type RaceProjection struct {
	RaceLaps             float64 `json:"raceLaps"`
	FormationLaps        float64 `json:"formationLaps"`
	TotalLaps            float64 `json:"totalLaps"`
	EffectiveRaceSeconds float64 `json:"effectiveRaceSeconds"`
	PitSeconds           float64 `json:"pitSeconds"`
}

// TimedRaceProjection adds convergence diagnostics to a race projection.
type TimedRaceProjection struct {
	RaceProjection
	Stops      int    `json:"stops"`
	Iterations int    `json:"iterations"`
	Converged  bool   `json:"converged"`
	Diagnostic string `json:"diagnostic,omitempty"`
}

// ProjectRace projects competitive and formation laps from a race input. For
// timed races, pit loss reduces the time available for competitive laps.
func ProjectRace(input RaceInput, totalPitSeconds float64) (RaceProjection, error) {
	if !isFinite(input.LapTimeSeconds) || input.LapTimeSeconds <= 0 {
		return RaceProjection{}, fmt.Errorf("lap time must be finite and positive")
	}
	if !isFinite(input.FormationLaps) || input.FormationLaps < 0 {
		return RaceProjection{}, fmt.Errorf("formation laps must be finite and non-negative")
	}
	if !isFinite(totalPitSeconds) || totalPitSeconds < 0 {
		return RaceProjection{}, fmt.Errorf("pit loss must be finite and non-negative")
	}

	projection := RaceProjection{
		FormationLaps: input.FormationLaps,
		PitSeconds:    totalPitSeconds,
	}

	switch input.Kind {
	case RaceByLaps:
		if input.Laps <= 0 {
			return RaceProjection{}, fmt.Errorf("lap count must be positive")
		}
		projection.RaceLaps = float64(input.Laps)
		if input.ExtraLap {
			projection.RaceLaps++
		}
		projection.EffectiveRaceSeconds = projection.RaceLaps * input.LapTimeSeconds
	case RaceByTime:
		if !isFinite(input.DurationSeconds) || input.DurationSeconds <= 0 {
			return RaceProjection{}, fmt.Errorf("duration must be finite and positive")
		}
		projection.EffectiveRaceSeconds = input.DurationSeconds - totalPitSeconds
		if projection.EffectiveRaceSeconds < 0 {
			projection.EffectiveRaceSeconds = 0
		}
		projection.RaceLaps = projection.EffectiveRaceSeconds / input.LapTimeSeconds
		if input.ExtraLap {
			projection.RaceLaps++
		}
	default:
		return RaceProjection{}, fmt.Errorf("unsupported race kind %q", input.Kind)
	}

	projection.TotalLaps = projection.RaceLaps + projection.FormationLaps
	return projection, nil
}

// ProjectTimedRaceWithStops iterates race length and resource stops until the
// stop count stabilizes. The fixed limit protects callers from oscillating
// inputs and makes failure deterministic.
func ProjectTimedRaceWithStops(input RaceInput, resource ResourceInput, pitLossPerStop float64) (TimedRaceProjection, error) {
	if input.Kind != RaceByTime {
		return TimedRaceProjection{}, fmt.Errorf("timed projection requires race kind %q", RaceByTime)
	}
	if !isFinite(pitLossPerStop) || pitLossPerStop < 0 {
		return TimedRaceProjection{}, fmt.Errorf("pit loss per stop must be finite and non-negative")
	}

	stops := 0
	var last RaceProjection
	for iteration := 1; iteration <= 32; iteration++ {
		projection, err := ProjectRace(input, float64(stops)*pitLossPerStop)
		if err != nil {
			return TimedRaceProjection{}, err
		}
		last = projection

		resourceProjection, err := ProjectResource(resource, projection.RaceLaps)
		if err != nil {
			return TimedRaceProjection{}, err
		}
		if resourceProjection.StopsRequired == stops {
			return TimedRaceProjection{
				RaceProjection: projection,
				Stops:          stops,
				Iterations:     iteration,
				Converged:      true,
			}, nil
		}
		stops = resourceProjection.StopsRequired
	}

	return TimedRaceProjection{
		RaceProjection: last,
		Stops:          stops,
		Iterations:     32,
		Converged:      false,
		Diagnostic:     "non_convergent",
	}, ErrNonConvergent
}
