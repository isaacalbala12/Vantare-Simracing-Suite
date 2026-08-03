package producta

import (
	"fmt"
	"math"
)

// SensitivityScenario is one deterministic assumption band.
type SensitivityScenario string

const (
	SensitivityMinimum SensitivityScenario = "minimum"
	SensitivityBase    SensitivityScenario = "base"
	SensitivityMaximum SensitivityScenario = "maximum"
)

// SensitivityInput describes configurable consumption and pace deltas.
type SensitivityInput struct {
	Base             SolverInput
	ConsumptionDelta float64
	PaceDeltaSeconds float64
}

type SensitivityCase struct {
	Scenario   SensitivityScenario
	Input      SolverInput
	Comparison Comparison
}

type SensitivityReport struct {
	Cases []SensitivityCase `json:"cases"`
}

// RunSensitivity reuses the bounded solver for minimum, base and maximum
// assumptions. It deliberately does not sample randomly.
func RunSensitivity(input SensitivityInput) (SensitivityReport, error) {
	if !isFinite(input.ConsumptionDelta) || input.ConsumptionDelta < 0 || input.ConsumptionDelta >= 1 {
		return SensitivityReport{}, fmt.Errorf("consumption delta must be finite and in [0, 1)")
	}
	if !isFinite(input.PaceDeltaSeconds) || input.PaceDeltaSeconds < 0 {
		return SensitivityReport{}, fmt.Errorf("pace delta must be finite and non-negative")
	}

	definitions := []struct {
		scenario SensitivityScenario
		sign     float64
	}{
		{scenario: SensitivityMinimum, sign: -1},
		{scenario: SensitivityBase, sign: 0},
		{scenario: SensitivityMaximum, sign: 1},
	}
	report := SensitivityReport{Cases: make([]SensitivityCase, 0, len(definitions))}
	for _, definition := range definitions {
		adjusted := input.Base
		adjusted.LapTimeSeconds += definition.sign * input.PaceDeltaSeconds
		adjusted.Fuel = scaleResourceProjection(input.Base.Fuel, definition.sign*input.ConsumptionDelta)
		adjusted.VE = scaleResourceProjection(input.Base.VE, definition.sign*input.ConsumptionDelta)
		if !isFinite(adjusted.LapTimeSeconds) || adjusted.LapTimeSeconds <= 0 {
			return SensitivityReport{}, fmt.Errorf("sensitivity produced invalid lap time")
		}
		candidates, err := GenerateCandidates(adjusted)
		if err != nil {
			return SensitivityReport{}, err
		}
		report.Cases = append(report.Cases, SensitivityCase{Scenario: definition.scenario, Input: adjusted, Comparison: Rank(candidates)})
	}
	return report, nil
}

func scaleResourceProjection(resource ResourceProjection, delta float64) ResourceProjection {
	adjusted := resource
	if !resource.Used {
		return adjusted
	}
	adjusted.RaceNeed *= 1 + delta
	adjusted.FormationNeed *= 1 + delta
	adjusted.ReserveAmount *= 1 + delta
	adjusted.TotalNeed *= 1 + delta
	adjusted.AdditionalAmount = adjusted.TotalNeed - adjusted.AvailableAmount
	if adjusted.AdditionalAmount < 0 {
		adjusted.AdditionalAmount = 0
	}
	if adjusted.UsableCapacity > 0 {
		adjusted.StopsRequired = int(math.Ceil(adjusted.AdditionalAmount / adjusted.UsableCapacity))
	}
	return adjusted
}
