package solver

import (
	"fmt"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	defaultSavingCostSensitivity = 0.20
	maxSavingLevels              = 16
	derivedABSavingMethod        = "derived_from_controlled_ab_protocol"
)

type savingLevelCost struct {
	level           SavingLevel
	fuelSavedPerLap int64
	veSavedPerLap   int64
	timeCostPerLap  float64
}

type savingCost struct {
	levels []savingLevelCost
	source SavingCostSource
	reason string
}

func (input SolverInputV2) savingCost() (savingCost, error) {
	familySelected := input.Projection != nil && input.Projection.SavingCost.Presence == sp.PresenceValid
	if familySelected && input.SavingCost != nil && input.SavingCost.Role == ScalarRoleUserOverride {
		familySelected = false
	}

	if familySelected {
		family := input.Projection.SavingCost
		if err := family.Provenance.Validate(); err != nil {
			return savingCost{}, err
		}
		if err := family.Confidence.Validate(); err != nil {
			return savingCost{}, err
		}
		if len(family.Levels) == 0 {
			return savingCost{
				levels: []savingLevelCost{{level: SavingNone}},
				source: SavingCostSource{Presence: family.Presence, Provenance: family.Provenance, Confidence: family.Confidence, Levels: []SavingLevelOption{}},
				reason: "empty_saving_cost_levels",
			}, nil
		}
		if family.Provenance.Kind == sp.ProvenanceDerived && family.ManualNote != derivedABSavingMethod {
			return savingCost{}, fmt.Errorf("derived saving cost requires the controlled A/B protocol")
		}
		if family.Provenance.Kind != sp.ProvenanceDerived && family.Provenance.Kind != sp.ProvenanceManual && family.Provenance.Kind != sp.ProvenanceReference {
			return savingCost{}, fmt.Errorf("projection saving provenance must be manual, reference or derived")
		}
		levels := make([]SavingLevelOption, 0, len(family.Levels))
		for _, level := range family.Levels {
			levels = append(levels, SavingLevelOption{
				Level:           SavingLevel(fmt.Sprintf("mixture_%d", level.MixtureCode)),
				FuelSavedPerLap: level.FuelSavedPerLap,
				VESavedPerLap:   level.VESavedPerLap,
				TimeCostPerLap:  level.TimeCostPerLap,
			})
		}
		return input.newSavingCost(levels, SavingCostSource{
			Presence: family.Presence, Provenance: family.Provenance,
			Confidence: family.Confidence, Levels: append([]SavingLevelOption(nil), levels...),
		})
	}

	if input.SavingCost != nil {
		levels := append([]SavingLevelOption(nil), input.SavingCost.Levels...)
		return input.newSavingCost(levels, SavingCostSource{
			Presence: input.SavingCost.Presence, Provenance: input.SavingCost.Provenance,
			Confidence: input.SavingCost.Confidence, Levels: append([]SavingLevelOption(nil), levels...),
		})
	}

	result := savingCost{
		levels: []savingLevelCost{{level: SavingNone}},
		source: SavingCostSource{
			Presence:   sp.PresenceMissing,
			Provenance: sp.Provenance{Kind: sp.ProvenanceUnknown},
			Confidence: sp.Confidence{ComputationVersion: "not-configured.v1"},
			Levels:     []SavingLevelOption{},
		},
	}
	if input.Projection != nil {
		family := input.Projection.SavingCost
		result.source = SavingCostSource{Presence: family.Presence, Provenance: family.Provenance, Confidence: family.Confidence, Levels: []SavingLevelOption{}}
		result.reason = family.Reason
	}
	return result, nil
}

func (input SolverInputV2) newSavingCost(options []SavingLevelOption, source SavingCostSource) (savingCost, error) {
	if err := validateSavingLevelOptions(options); err != nil {
		return savingCost{}, err
	}
	fuelPerLap, err := serviceUnits("savingCost.fuelPerLap", input.resourcePerLap(ResourceFuel))
	if err != nil {
		return savingCost{}, err
	}
	vePerLap, err := serviceUnits("savingCost.vePerLap", input.resourcePerLap(ResourceVirtualEnergy))
	if err != nil {
		return savingCost{}, err
	}
	result := savingCost{levels: []savingLevelCost{{level: SavingNone}}, source: source}
	for index, option := range options {
		fuelSaved, err := serviceUnits(fmt.Sprintf("savingCost.levels[%d].fuelSavedPerLap", index), option.FuelSavedPerLap)
		if err != nil {
			return savingCost{}, err
		}
		veSaved, err := serviceUnits(fmt.Sprintf("savingCost.levels[%d].veSavedPerLap", index), option.VESavedPerLap)
		if err != nil {
			return savingCost{}, err
		}
		if len(input.DriverProfiles) == 0 && fuelSaved > fuelPerLap {
			return savingCost{}, fmt.Errorf("savingCost.levels[%d].fuelSavedPerLap exceeds base consumption", index)
		}
		if len(input.DriverProfiles) == 0 && veSaved > vePerLap {
			return savingCost{}, fmt.Errorf("savingCost.levels[%d].veSavedPerLap exceeds base consumption", index)
		}
		if fuelSaved == 0 && veSaved == 0 && option.TimeCostPerLap == 0 {
			continue
		}
		result.levels = append(result.levels, savingLevelCost{
			level: option.Level, fuelSavedPerLap: fuelSaved, veSavedPerLap: veSaved,
			timeCostPerLap: option.TimeCostPerLap,
		})
	}
	return result, nil
}

func validateSavingLevelOptions(levels []SavingLevelOption) error {
	if len(levels) == 0 {
		return fmt.Errorf("levels must contain at least one declared level")
	}
	if len(levels) > maxSavingLevels {
		return fmt.Errorf("levels exceeds %d declared levels", maxSavingLevels)
	}
	seen := make(map[SavingLevel]struct{}, len(levels))
	for index, level := range levels {
		if level.Level == "" || level.Level == SavingNone {
			return fmt.Errorf("levels[%d].level must be a non-none identifier", index)
		}
		if _, duplicate := seen[level.Level]; duplicate {
			return fmt.Errorf("levels[%d].level is duplicated", index)
		}
		seen[level.Level] = struct{}{}
		for field, value := range map[string]float64{
			"fuelSavedPerLap": level.FuelSavedPerLap,
			"veSavedPerLap":   level.VESavedPerLap,
			"timeCostPerLap":  level.TimeCostPerLap,
		} {
			if value < 0 || !finite(value) {
				return fmt.Errorf("levels[%d].%s must be finite and non-negative", index, field)
			}
		}
	}
	return nil
}

func (cost savingCost) assumption() SolverReason {
	if cost.source.Presence != sp.PresenceValid {
		message := "el solver solo evalua el nivel de ahorro none"
		if cost.reason != "" {
			message = fmt.Sprintf("%s (%s)", message, cost.reason)
		}
		return SolverReason{Code: "saving_cost_degraded", Message: message}
	}
	if len(cost.source.Levels) == 0 {
		return SolverReason{Code: "saving_cost_degraded", Message: "la familia de ahorro esta vacia; el solver solo evalua el nivel none (empty_saving_cost_levels)"}
	}
	return SolverReason{
		Code: "saving_cost_source",
		Message: fmt.Sprintf("se evaluan %d niveles de ahorro declarados (%s: %s)",
			len(cost.source.Levels), cost.source.Provenance.Kind, cost.source.Provenance.SourceID),
	}
}

func savingPlanForDecision(decision DecisionVector) SavingPlan {
	plan := SavingPlan{Stints: []SavingPlanStint{}}
	for _, stint := range decision.Stints {
		if stint.SavingLevel == SavingNone {
			continue
		}
		entry := SavingPlanStint{
			StintIndex: stint.Index, Laps: stint.Laps, Level: stint.SavingLevel,
			FuelSavedPerLap: stint.FuelSavedPerLap, VESavedPerLap: stint.VESavedPerLap,
			TimeCostPerLap:   stint.TimeCostPerLap,
			TotalFuelSaved:   stint.FuelSavedPerLap * float64(stint.Laps),
			TotalVESaved:     stint.VESavedPerLap * float64(stint.Laps),
			TotalCostSeconds: stint.SavingCostSeconds,
		}
		plan.Stints = append(plan.Stints, entry)
		plan.TotalFuelSaved += entry.TotalFuelSaved
		plan.TotalVESaved += entry.TotalVESaved
		plan.TotalCostSeconds += entry.TotalCostSeconds
	}
	return plan
}
