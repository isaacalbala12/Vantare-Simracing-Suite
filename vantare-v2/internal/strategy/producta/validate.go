package producta

import "fmt"

// Diagnostic is a stable validation finding. MessageKey is resolved by the UI
// locale; the domain never returns localized copy.
type Diagnostic struct {
	Code       string `json:"code"`
	Field      string `json:"field"`
	MessageKey string `json:"messageKey"`
}

// ValidationResult separates blocking errors from actionable warnings.
type ValidationResult struct {
	Errors   []Diagnostic `json:"errors"`
	Warnings []Diagnostic `json:"warnings"`
}

// ValidateDraft checks the structural and numeric assumptions required before
// a draft can be sent to the strategy engine.
func ValidateDraft(draft Draft) ValidationResult {
	result := ValidationResult{}

	switch draft.Race.Kind {
	case RaceByLaps:
		if draft.Race.Laps <= 0 {
			result.addError("race.laps_positive", "race.laps", "strategy.validation.race.lapsPositive")
		}
	case RaceByTime:
		if draft.Race.DurationSeconds <= 0 {
			result.addError("race.duration_required", "race.durationSeconds", "strategy.validation.race.durationRequired")
		} else if !isFinite(draft.Race.DurationSeconds) {
			result.addError("race.duration_finite", "race.durationSeconds", "strategy.validation.race.durationFinite")
		}
	default:
		result.addError("race.kind_invalid", "race.kind", "strategy.validation.race.kindInvalid")
	}

	if !isFinite(draft.Race.LapTimeSeconds) {
		result.addError("race.lap_time_finite", "race.lapTimeSeconds", "strategy.validation.race.lapTimeFinite")
	} else if draft.Race.LapTimeSeconds <= 0 {
		result.addError("race.lap_time_required", "race.lapTimeSeconds", "strategy.validation.race.lapTimeRequired")
	}
	if !isFinite(draft.Race.FormationLaps) || draft.Race.FormationLaps < 0 {
		result.addError("race.formation_laps_non_negative", "race.formationLaps", "strategy.validation.race.formationLapsNonNegative")
	}

	validateResource(&result, "fuel", draft.Fuel)
	validateResource(&result, "virtualEnergy", draft.VirtualEnergy)
	return result
}

func validateResource(result *ValidationResult, name string, resource ResourceInput) {
	if !isFinite(resource.Capacity) {
		result.addError(name+".capacity_finite", name+".capacity", "strategy.validation.resource.capacityFinite")
	} else if resource.Capacity < 0 {
		result.addError(name+".capacity_non_negative", name+".capacity", "strategy.validation.resource.capacityNonNegative")
	}

	if !isFinite(resource.UsableCapacity) {
		result.addError(name+".usable_capacity_finite", name+".usableCapacity", "strategy.validation.resource.usableCapacityFinite")
	} else if resource.UsableCapacity < 0 {
		result.addError(name+".usable_capacity_non_negative", name+".usableCapacity", "strategy.validation.resource.usableCapacityNonNegative")
	}

	if !isFinite(resource.StartAmount) {
		result.addError(name+".start_finite", name+".startAmount", "strategy.validation.resource.startFinite")
	} else if resource.StartAmount < 0 {
		result.addError(name+".start_non_negative", name+".startAmount", "strategy.validation.resource.startNonNegative")
	}

	if !isFinite(resource.ConsumptionPerLap) {
		result.addError(name+".consumption_finite", name+".consumptionPerLap", "strategy.validation.resource.consumptionFinite")
	} else if resource.ConsumptionPerLap < 0 {
		result.addError(name+".consumption_non_negative", name+".consumptionPerLap", "strategy.validation.resource.consumptionNonNegative")
	}

	if isFinite(resource.Capacity) && isFinite(resource.StartAmount) && resource.StartAmount > resource.Capacity {
		result.addWarning(name+".start_exceeds_capacity", name+".startAmount", "strategy.validation.resource.startExceedsCapacity")
	}
	if isFinite(resource.Capacity) && isFinite(resource.UsableCapacity) && resource.UsableCapacity > resource.Capacity {
		result.addWarning(name+".usable_exceeds_capacity", name+".usableCapacity", "strategy.validation.resource.usableExceedsCapacity")
	}
	if resource.Enabled && resource.ConsumptionPerLap > 0 && resource.Capacity == 0 {
		result.addWarning(name+".capacity_insufficient", name+".capacity", "strategy.validation.resource.capacityInsufficient")
	}
}

func (result *ValidationResult) addError(code, field, messageKey string) {
	result.Errors = append(result.Errors, Diagnostic{Code: code, Field: field, MessageKey: messageKey})
}

func (result *ValidationResult) addWarning(code, field, messageKey string) {
	result.Warnings = append(result.Warnings, Diagnostic{Code: code, Field: field, MessageKey: messageKey})
}

func (diagnostic Diagnostic) String() string {
	return fmt.Sprintf("%s (%s)", diagnostic.Code, diagnostic.Field)
}
