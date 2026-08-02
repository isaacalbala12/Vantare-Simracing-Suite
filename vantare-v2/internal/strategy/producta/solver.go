package producta

import (
	"fmt"
	"math"
)

// SolverInput contains only deterministic projections and manual timing
// assumptions; it has no UI or persistence dependency.
type SolverInput struct {
	RaceLaps              float64
	LapTimeSeconds        float64
	Fuel                  ResourceProjection
	VE                    ResourceProjection
	PitLossPerStop        float64
	TyreDegradationPerLap float64
	LockedPitLap          *float64
	LockedPitWindow       *PitWindow
}

// StrategyCandidate is one explainable candidate emitted by the bounded
// generator.
type StrategyCandidate struct {
	Name                  string      `json:"name"`
	Stints                []StintPlan `json:"stints"`
	Stops                 int         `json:"stops"`
	TotalTimeSeconds      float64     `json:"totalTimeSeconds"`
	Margin                float64     `json:"margin"`
	ReasonCodes           []string    `json:"reasonCodes"`
	Valid                 bool        `json:"valid"`
	OptimisticOnly        bool        `json:"optimisticOnly"`
	CriticalRisk          bool        `json:"criticalRisk"`
	RiskCode              string      `json:"riskCode,omitempty"`
	RankingPenaltySeconds float64     `json:"rankingPenaltySeconds,omitempty"`
}

// GenerateCandidates produces a small deterministic set of candidate shapes.
// It intentionally does not explore an unbounded combinatorial space.
func GenerateCandidates(input SolverInput) ([]StrategyCandidate, error) {
	if !isFinite(input.RaceLaps) || input.RaceLaps <= 0 || !isFinite(input.LapTimeSeconds) || input.LapTimeSeconds <= 0 {
		return nil, fmt.Errorf("race projection must have finite positive laps and lap time")
	}
	if !isFinite(input.PitLossPerStop) || input.PitLossPerStop < 0 || !isFinite(input.TyreDegradationPerLap) || input.TyreDegradationPerLap < 0 {
		return nil, fmt.Errorf("solver timing assumptions must be finite and non-negative")
	}
	baseStops := maxInt(input.Fuel.StopsRequired, input.VE.StopsRequired)
	if baseStops < 0 {
		return nil, fmt.Errorf("stop count must be non-negative")
	}
	if baseStops > 0 && !input.Fuel.Used && !input.VE.Used {
		return nil, fmt.Errorf("stops require an active resource")
	}

	candidates := make([]StrategyCandidate, 0, 6)
	appendCandidate := func(name string, stops int, distribution string, reason string) error {
		candidate, err := buildCandidate(input, name, stops, distribution, reason)
		if err != nil {
			return err
		}
		candidates = append(candidates, candidate)
		return nil
	}
	if err := appendCandidate("minimum-stops", baseStops, "balanced", "minimum_resource_stops"); err != nil {
		return nil, err
	}
	if err := appendCandidate("fast", baseStops, "front-loaded", "shorter_early_stints"); err != nil {
		return nil, err
	}
	if baseStops > 0 {
		if err := appendCandidate("safe", baseStops+1, "balanced", "additional_reserve"); err != nil {
			return nil, err
		}
	}
	if err := appendCandidate("balanced", baseStops, "balanced", "even_stints"); err != nil {
		return nil, err
	}
	if input.TyreDegradationPerLap > 0 {
		if err := appendCandidate("long-first", baseStops, "long-first", "preserve_late_tyre_life"); err != nil {
			return nil, err
		}
		if err := appendCandidate("long-last", baseStops, "long-last", "preserve_early_tyre_life"); err != nil {
			return nil, err
		}
	}
	return candidates, nil
}

func buildCandidate(input SolverInput, name string, stops int, distribution, reason string) (StrategyCandidate, error) {
	if stops < 0 {
		return StrategyCandidate{}, fmt.Errorf("stop count must be non-negative")
	}
	laps := distributeLaps(input.RaceLaps, stops+1, distribution)
	stintInputs := make([]StintInput, len(laps))
	cumulative := 0.0
	for index, stintLaps := range laps {
		stintInputs[index] = StintInput{Laps: stintLaps}
		if index >= len(laps)-1 {
			continue
		}
		cumulative += stintLaps
		pit := PitStopInput{Required: true}
		if input.Fuel.Used {
			pit.Fuel.Amount = input.Fuel.UsableCapacity
		}
		if input.VE.Used {
			pit.VE.Amount = input.VE.UsableCapacity
		}
		if pit.Fuel.Amount == 0 && pit.VE.Amount == 0 {
			return StrategyCandidate{}, fmt.Errorf("candidate pit has no resource service")
		}
		pit.Window = candidatePitWindow(input, cumulative)
		stintInputs[index].Pit = pit
	}
	stints, err := BuildStints(stintInputs)
	if err != nil {
		return StrategyCandidate{}, err
	}
	return StrategyCandidate{
		Name:             name,
		Stints:           stints,
		Stops:            stops,
		TotalTimeSeconds: input.RaceLaps*input.LapTimeSeconds + float64(stops)*input.PitLossPerStop,
		Margin:           input.Fuel.AvailableAmount + input.VE.AvailableAmount,
		ReasonCodes:      []string{reason},
		Valid:            true,
	}, nil
}

func candidatePitWindow(input SolverInput, cumulative float64) PitWindow {
	if input.LockedPitLap != nil {
		return PitWindow{Kind: PitWindowExact, Lap: *input.LockedPitLap}
	}
	if input.LockedPitWindow != nil {
		return *input.LockedPitWindow
	}
	return PitWindow{Kind: PitWindowWindow, StartLap: math.Max(1, cumulative-1), EndLap: cumulative + 1}
}

func distributeLaps(total float64, stintCount int, distribution string) []float64 {
	if stintCount <= 1 {
		return []float64{total}
	}
	laps := make([]float64, stintCount)
	switch distribution {
	case "front-loaded", "long-first":
		laps[0] = total * 0.5
		remaining := total - laps[0]
		for index := 1; index < stintCount; index++ {
			laps[index] = remaining / float64(stintCount-1)
		}
	case "long-last":
		remaining := total * 0.5
		for index := 0; index < stintCount-1; index++ {
			laps[index] = remaining / float64(stintCount-1)
		}
		laps[stintCount-1] = total - remaining
	default:
		for index := range laps {
			laps[index] = total / float64(stintCount)
		}
	}
	return laps
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
