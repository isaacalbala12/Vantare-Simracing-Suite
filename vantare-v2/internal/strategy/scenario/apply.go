package scenario

import (
	"fmt"
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/solver"
)

// Capability indicates whether the solver can honour a particular effect.
type Capability string

const (
	CapabilitySupported   Capability = "supported"
	CapabilityDegraded    Capability = "degraded"
	CapabilityUnsupported Capability = "unsupported"
	CapabilityMissing     Capability = "missing"
)

// Capabilities maps an effect kind to what the solver can actually do with it.
type Capabilities map[EffectKind]Capability

// Scenario describes a race after applying rules to a base solver input.
type Scenario struct {
	Input       solver.Input    `json:"input"`
	Assumptions []solver.Reason `json:"assumptions"`
	Applied     []string        `json:"applied"`
	Skipped     []SkippedRule   `json:"skipped"`
	RuleSetHash string          `json:"ruleSetHash"`
}

// SkippedRule describes why a rule was not applied.
type SkippedRule struct {
	RuleID     string     `json:"ruleId"`
	Effect     EffectKind `json:"effect"`
	Capability Capability `json:"capability"`
	Reason     string     `json:"reason"`
}

// Apply takes a base solver input and applies rules to it, producing a scenario.
// Rules are validated first, as is the base input to prevent division by zero.
// Skipped rules are recorded without mutation. Every applied rule produces at
// least one assumption. The final computed input is checked for NaN/Inf to catch
// overflow from composed multipliers.
func Apply(base solver.Input, set RuleSet, capabilities Capabilities) (Scenario, error) {
	// Validate the base input first to prevent division by zero and NaN/Inf corruption.
	if err := ValidateInput(base); err != nil {
		return Scenario{}, err
	}

	// Validate the rule set structure.
	if err := set.Validate(); err != nil {
		return Scenario{}, err
	}

	// Get the rule set hash.
	ruleSetHash, err := set.Hash()
	if err != nil {
		return Scenario{}, err
	}

	// Start with a copy of the base input so we never mutate it.
	current := base

	scenario := Scenario{
		Input:       current,
		Assumptions: []solver.Reason{},
		Applied:     []string{},
		Skipped:     []SkippedRule{},
		RuleSetHash: ruleSetHash,
	}

	// Apply each rule in order. Rules compose multiplicatively, so order matters.
	for _, rule := range set.Rules {
		// Check capability for this effect.
		capability, ok := capabilities[rule.Effect]
		if !ok {
			// Effect not in map defaults to Supported.
			capability = CapabilitySupported
		}

		if capability == CapabilityUnsupported || capability == CapabilityMissing {
			// Skip the rule and record why.
			reason := fmt.Sprintf("capability is %s for this effect", capability)
			scenario.Skipped = append(scenario.Skipped, SkippedRule{
				RuleID:     rule.ID,
				Effect:     rule.Effect,
				Capability: capability,
				Reason:     reason,
			})
			continue
		}

		// Add assumption if capability is degraded.
		if capability == CapabilityDegraded {
			scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
				Code:    "degraded_capability",
				Message: fmt.Sprintf("Rule %s applied with degraded capability", rule.ID),
			})
		}

		// Apply the rule. If it fails validation in context (e.g., safety car longer
		// than race after a race-length change), return the error immediately.
		if err := applyRule(&scenario, rule, &current); err != nil {
			return Scenario{}, err
		}
		scenario.Applied = append(scenario.Applied, rule.ID)
	}

	// Final guard: rules compose multiplicatively, so check that composed multipliers
	// did not overflow to NaN or Inf. This catches cases where every individual rule
	// was sound but their product is not.
	if err := validateFiniteness(current); err != nil {
		return Scenario{}, err
	}

	// Set the final input in the scenario.
	scenario.Input = current

	return scenario, nil
}

func applyRule(scenario *Scenario, rule Rule, current *solver.Input) error {
	switch rule.Effect {
	case EffectSafetyCar, EffectFullCourseYellow:
		return applySafetyCarRule(scenario, rule, current)
	case EffectWeather:
		return applyWeatherRule(scenario, rule, current)
	case EffectDamage:
		return applyDamageRule(scenario, rule, current)
	case EffectPenalty:
		return applyPenaltyRule(scenario, rule, current)
	case EffectRaceLength:
		return applyRaceLengthRule(scenario, rule, current)
	}
	return nil
}

func applySafetyCarRule(scenario *Scenario, rule Rule, current *solver.Input) error {
	scRule := rule.SafetyCar
	if scRule == nil {
		return nil
	}

	// Validate that the safety car rule is not longer than the current race.
	// This check must use the current race length, not the original, because
	// an earlier RaceLength rule may have changed it.
	if scRule.Laps >= current.RaceLaps {
		return scenarioError(ErrorInvalidRule, "safetyCar.laps",
			fmt.Sprintf("Rule %s: Safety car laps (%d) must be < race laps (%d)", rule.ID, scRule.Laps, current.RaceLaps))
	}

	// Model safety car as a weighted average increase in base lap time.
	// Those laps cost (LapTimeMultiplier - 1) * BaseLapSeconds extra each.
	// Amortized across all laps: newBase = BaseLapSeconds * (1 + (LapTimeMultiplier-1)*SafetyCarLaps/RaceLaps).
	raceLapsFloat := float64(current.RaceLaps)
	safetyCarLapsFloat := float64(scRule.Laps)

	averageMultiplier := 1 + (scRule.LapTimeMultiplier-1)*(safetyCarLapsFloat/raceLapsFloat)
	current.BaseLapSeconds *= averageMultiplier

	scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
		Code:    "safety_car_averaged",
		Message: fmt.Sprintf("Rule %s: Safety car laps (%d) averaged into base lap time (multiplier %.4f)", rule.ID, scRule.Laps, averageMultiplier),
	})

	// Apply pit loss multiplier if > 0.
	if scRule.PitLossMultiplier > 0 {
		current.PitLossSeconds *= scRule.PitLossMultiplier
		scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
			Code:    "safety_car_pit_loss",
			Message: fmt.Sprintf("Rule %s: Pit loss reduced under safety car (multiplier %.4f)", rule.ID, scRule.PitLossMultiplier),
		})
	}

	return nil
}

func applyWeatherRule(scenario *Scenario, rule Rule, current *solver.Input) error {
	wRule := rule.Weather
	if wRule == nil {
		return nil
	}

	current.BaseLapSeconds *= wRule.LapTimeMultiplier
	current.DegradationPerLapSeconds *= wRule.DegradationMultiplier

	if current.TyreLifeLaps > 0 {
		newLife := int64(math.Floor(float64(current.TyreLifeLaps) * wRule.TyreLifeMultiplier))
		if newLife < 1 {
			newLife = 1
		}
		current.TyreLifeLaps = newLife
	}

	scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
		Code:    "weather_applied",
		Message: fmt.Sprintf("Rule %s: Weather conditions applied (lap multiplier %.4f, degradation multiplier %.4f, tyre life multiplier %.4f)", rule.ID, wRule.LapTimeMultiplier, wRule.DegradationMultiplier, wRule.TyreLifeMultiplier),
	})

	return nil
}

func applyDamageRule(scenario *Scenario, rule Rule, current *solver.Input) error {
	dRule := rule.Damage
	if dRule == nil {
		return nil
	}

	// Amortise repair time across the race.
	if dRule.RepairSeconds > 0 {
		raceLapsFloat := float64(current.RaceLaps)
		amortisedTime := dRule.RepairSeconds / raceLapsFloat
		current.BaseLapSeconds += amortisedTime

		scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
			Code:    "damage_amortised",
			Message: fmt.Sprintf("Rule %s: Repair time (%.2f seconds) amortised across race", rule.ID, dRule.RepairSeconds),
		})
	}

	// Record additional stops if any.
	if dRule.AdditionalPitStops > 0 {
		scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
			Code:    "additional_stops_not_modelled",
			Message: fmt.Sprintf("Rule %s: %d additional pit stops required but not modelled in input", rule.ID, dRule.AdditionalPitStops),
		})
	}

	return nil
}

func applyPenaltyRule(scenario *Scenario, rule Rule, current *solver.Input) error {
	pRule := rule.Penalty
	if pRule == nil {
		return nil
	}

	// Amortise penalty across the race.
	if pRule.AddedSeconds > 0 {
		raceLapsFloat := float64(current.RaceLaps)
		amortisedTime := pRule.AddedSeconds / raceLapsFloat
		current.BaseLapSeconds += amortisedTime

		scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
			Code:    "penalty_amortised",
			Message: fmt.Sprintf("Rule %s: Penalty time (%.2f seconds) amortised across race", rule.ID, pRule.AddedSeconds),
		})
	}

	return nil
}

func applyRaceLengthRule(scenario *Scenario, rule Rule, current *solver.Input) error {
	rlRule := rule.RaceLength
	if rlRule == nil {
		return nil
	}

	current.RaceLaps = rlRule.RaceLaps

	scenario.Assumptions = append(scenario.Assumptions, solver.Reason{
		Code:    "race_length_changed",
		Message: fmt.Sprintf("Rule %s: Race length changed to %d laps", rule.ID, rlRule.RaceLaps),
	})

	return nil
}

// validateFiniteness checks that the computed input has no NaN or Inf values.
// Rules compose multiplicatively, so a combination can overflow to Inf even
// when each rule was individually sound. This guard catches that case.
func validateFiniteness(input solver.Input) error {
	if math.IsNaN(input.BaseLapSeconds) || math.IsInf(input.BaseLapSeconds, 0) {
		return scenarioError(ErrorInvalidInput, "BaseLapSeconds",
			fmt.Sprintf("BaseLapSeconds overflowed to %v after rule composition", input.BaseLapSeconds))
	}

	if math.IsNaN(input.DegradationPerLapSeconds) || math.IsInf(input.DegradationPerLapSeconds, 0) {
		return scenarioError(ErrorInvalidInput, "DegradationPerLapSeconds",
			fmt.Sprintf("DegradationPerLapSeconds overflowed to %v after rule composition", input.DegradationPerLapSeconds))
	}

	if math.IsNaN(input.PitLossSeconds) || math.IsInf(input.PitLossSeconds, 0) {
		return scenarioError(ErrorInvalidInput, "PitLossSeconds",
			fmt.Sprintf("PitLossSeconds overflowed to %v after rule composition", input.PitLossSeconds))
	}

	if math.IsNaN(input.Fuel.UsableCapacity) || math.IsInf(input.Fuel.UsableCapacity, 0) {
		return scenarioError(ErrorInvalidInput, "Fuel.UsableCapacity",
			fmt.Sprintf("Fuel.UsableCapacity overflowed to %v after rule composition", input.Fuel.UsableCapacity))
	}

	if math.IsNaN(input.Fuel.PerLap) || math.IsInf(input.Fuel.PerLap, 0) {
		return scenarioError(ErrorInvalidInput, "Fuel.PerLap",
			fmt.Sprintf("Fuel.PerLap overflowed to %v after rule composition", input.Fuel.PerLap))
	}

	if math.IsNaN(input.VirtualEnergy.UsableCapacity) || math.IsInf(input.VirtualEnergy.UsableCapacity, 0) {
		return scenarioError(ErrorInvalidInput, "VirtualEnergy.UsableCapacity",
			fmt.Sprintf("VirtualEnergy.UsableCapacity overflowed to %v after rule composition", input.VirtualEnergy.UsableCapacity))
	}

	if math.IsNaN(input.VirtualEnergy.PerLap) || math.IsInf(input.VirtualEnergy.PerLap, 0) {
		return scenarioError(ErrorInvalidInput, "VirtualEnergy.PerLap",
			fmt.Sprintf("VirtualEnergy.PerLap overflowed to %v after rule composition", input.VirtualEnergy.PerLap))
	}

	return nil
}

// ValidateInput rejects a base input that cannot produce a meaningful scenario.
// Rules are validated on their own, but amortising a repair, damage, or safety car
// divides by the race length, so the input must be sound before any rule touches it.
// This also catches NaN/Inf values that would silently corrupt the scenario.
func ValidateInput(input solver.Input) error {
	if input.RaceLaps <= 0 {
		return scenarioError(ErrorInvalidInput, "RaceLaps",
			fmt.Sprintf("RaceLaps must be > 0, got %d", input.RaceLaps))
	}

	if math.IsNaN(input.BaseLapSeconds) || math.IsInf(input.BaseLapSeconds, 0) {
		return scenarioError(ErrorInvalidInput, "BaseLapSeconds",
			fmt.Sprintf("BaseLapSeconds must be a finite number, got %v", input.BaseLapSeconds))
	}

	if input.BaseLapSeconds <= 0 {
		return scenarioError(ErrorInvalidInput, "BaseLapSeconds",
			fmt.Sprintf("BaseLapSeconds must be > 0, got %v", input.BaseLapSeconds))
	}

	if math.IsNaN(input.DegradationPerLapSeconds) || math.IsInf(input.DegradationPerLapSeconds, 0) {
		return scenarioError(ErrorInvalidInput, "DegradationPerLapSeconds",
			fmt.Sprintf("DegradationPerLapSeconds must be a finite number, got %v", input.DegradationPerLapSeconds))
	}

	if input.DegradationPerLapSeconds < 0 {
		return scenarioError(ErrorInvalidInput, "DegradationPerLapSeconds",
			fmt.Sprintf("DegradationPerLapSeconds must be >= 0, got %v", input.DegradationPerLapSeconds))
	}

	if math.IsNaN(input.PitLossSeconds) || math.IsInf(input.PitLossSeconds, 0) {
		return scenarioError(ErrorInvalidInput, "PitLossSeconds",
			fmt.Sprintf("PitLossSeconds must be a finite number, got %v", input.PitLossSeconds))
	}

	if input.PitLossSeconds < 0 {
		return scenarioError(ErrorInvalidInput, "PitLossSeconds",
			fmt.Sprintf("PitLossSeconds must be >= 0, got %v", input.PitLossSeconds))
	}

	if input.TyreLifeLaps < 0 {
		return scenarioError(ErrorInvalidInput, "TyreLifeLaps",
			fmt.Sprintf("TyreLifeLaps must be >= 0, got %d", input.TyreLifeLaps))
	}

	// Check Fuel resource fields for NaN/Inf
	if math.IsNaN(input.Fuel.UsableCapacity) || math.IsInf(input.Fuel.UsableCapacity, 0) {
		return scenarioError(ErrorInvalidInput, "Fuel.UsableCapacity",
			fmt.Sprintf("Fuel.UsableCapacity must be a finite number, got %v", input.Fuel.UsableCapacity))
	}

	if math.IsNaN(input.Fuel.PerLap) || math.IsInf(input.Fuel.PerLap, 0) {
		return scenarioError(ErrorInvalidInput, "Fuel.PerLap",
			fmt.Sprintf("Fuel.PerLap must be a finite number, got %v", input.Fuel.PerLap))
	}

	// Check VirtualEnergy resource fields for NaN/Inf
	if math.IsNaN(input.VirtualEnergy.UsableCapacity) || math.IsInf(input.VirtualEnergy.UsableCapacity, 0) {
		return scenarioError(ErrorInvalidInput, "VirtualEnergy.UsableCapacity",
			fmt.Sprintf("VirtualEnergy.UsableCapacity must be a finite number, got %v", input.VirtualEnergy.UsableCapacity))
	}

	if math.IsNaN(input.VirtualEnergy.PerLap) || math.IsInf(input.VirtualEnergy.PerLap, 0) {
		return scenarioError(ErrorInvalidInput, "VirtualEnergy.PerLap",
			fmt.Sprintf("VirtualEnergy.PerLap must be a finite number, got %v", input.VirtualEnergy.PerLap))
	}

	return nil
}
