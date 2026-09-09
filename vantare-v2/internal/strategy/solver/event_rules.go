package solver

import (
	"fmt"
	"strings"
)

// Validate checks rules without assuming a race horizon, available drivers or
// observed compound models. SolveV2 additionally checks those dependencies.
func (rules EventRules) Validate() error {
	if rules.MinPitStops != nil && *rules.MinPitStops < 0 {
		return fmt.Errorf("eventRules.minPitStops invalid")
	}
	if rules.MaxPitStops != nil && *rules.MaxPitStops < 0 {
		return fmt.Errorf("eventRules.maxPitStops invalid")
	}
	if rules.MinPitStops != nil && rules.MaxPitStops != nil && *rules.MinPitStops > *rules.MaxPitStops {
		return fmt.Errorf("eventRules pit stop range invalid")
	}
	if len(rules.RequiredWindows) > maxRequiredPitWindows {
		return fmt.Errorf("eventRules.requiredWindows exceeds %d windows", maxRequiredPitWindows)
	}
	for index, window := range rules.RequiredWindows {
		if window.FromLap < 1 || window.ToLap < window.FromLap || window.ToLap >= maxSupportedLaps {
			return fmt.Errorf("eventRules.requiredWindows[%d] is outside supported lap bounds", index)
		}
	}
	seen := make(map[TyreCompound]bool, len(rules.MandatoryCompounds))
	for index, compound := range rules.MandatoryCompounds {
		if !compound.Valid() || seen[compound] {
			return fmt.Errorf("eventRules.mandatoryCompounds[%d] is invalid or duplicated", index)
		}
		seen[compound] = true
	}
	for id, limit := range rules.DriverLimits {
		if strings.TrimSpace(id) == "" {
			return fmt.Errorf("eventRules.driverLimits requires driver identity")
		}
		if err := limit.validate(maxSupportedLaps); err != nil {
			return fmt.Errorf("eventRules.driverLimits[%q]: %w", id, err)
		}
	}
	for bucket, compounds := range rules.AllowedCompoundsByClimate {
		if !bucket.Valid() || len(compounds) == 0 {
			return fmt.Errorf("eventRules.allowedCompoundsByClimate[%q] requires valid bucket and compounds", bucket)
		}
		seen := make(map[TyreCompound]bool, len(compounds))
		for _, compound := range compounds {
			if !compound.Valid() || seen[compound] {
				return fmt.Errorf("eventRules.allowedCompoundsByClimate[%q] contains invalid or duplicate compound", bucket)
			}
			seen[compound] = true
		}
	}
	return nil
}
