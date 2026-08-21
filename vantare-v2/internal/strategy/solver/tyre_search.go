package solver

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/strategy/tyres"
)

const maxRequiredPitWindows = 64

type tyreChoice struct {
	compound tyres.Compound
	fitment  tyres.Fitment
}

type tyreDecisionModel struct {
	enabled  bool
	pace     compoundPaceCosts
	bits     map[tyres.Compound]uint64
	fitments map[tyres.Compound][]tyres.Fitment
}

type pitTyreChoice struct {
	choice tyreChoice
	change bool
}

func newTyreDecisionModel(input SolverInputV2, pace compoundPaceCosts) (tyreDecisionModel, error) {
	if !pace.enabled {
		return tyreDecisionModel{}, nil
	}
	inventory, err := tyres.NewInventory(input.TyreInventory.Maximum, input.TyreInventory.Tyres)
	if err != nil {
		return tyreDecisionModel{}, err
	}
	model := tyreDecisionModel{
		enabled: true, pace: pace,
		bits:     make(map[tyres.Compound]uint64, len(pace.order)),
		fitments: make(map[tyres.Compound][]tyres.Fitment, len(pace.order)),
	}
	for index, compound := range pace.order {
		model.bits[compound] = uint64(1) << index
		excluded := []tyres.TyreID(nil)
		for {
			fitment, err := inventory.SelectFitmentExcluding(uniformFitmentRequest(compound), excluded)
			if err != nil {
				break
			}
			model.fitments[compound] = append(model.fitments[compound], fitment)
			excluded = append(excluded, fitmentIDs(fitment)...)
		}
	}
	return model, nil
}

func (model tyreDecisionModel) initialChoices() []tyreChoice {
	if !model.enabled {
		return []tyreChoice{{}}
	}
	result := make([]tyreChoice, 0, len(model.pace.order))
	for _, compound := range model.pace.order {
		if len(model.fitments[compound]) > 0 {
			result = append(result, tyreChoice{compound: compound, fitment: model.fitments[compound][0]})
		}
	}
	return result
}

func (model tyreDecisionModel) nextChoices(current tyreChoice) []pitTyreChoice {
	if !model.enabled {
		return []pitTyreChoice{{change: true}}
	}
	result := []pitTyreChoice{{choice: current, change: false}}
	for _, compound := range model.pace.order {
		for _, fitment := range model.fitments[compound] {
			if fitment == current.fitment {
				continue
			}
			result = append(result, pitTyreChoice{
				choice: tyreChoice{compound: compound, fitment: fitment},
				change: true,
			})
		}
	}
	return result
}

func uniformFitmentRequest(compound tyres.Compound) tyres.FitmentRequest {
	return tyres.FitmentRequest{
		FrontLeft: compound, FrontRight: compound,
		RearLeft: compound, RearRight: compound,
	}
}

func fitmentIDs(fitment tyres.Fitment) []tyres.TyreID {
	return []tyres.TyreID{fitment.FrontLeft, fitment.FrontRight, fitment.RearLeft, fitment.RearRight}
}

func fitmentPointer(fitment tyres.Fitment) *tyres.Fitment {
	copy := fitment
	return &copy
}

func (model tyreDecisionModel) compoundBit(compound tyres.Compound) uint64 {
	return model.bits[compound]
}

func (model tyreDecisionModel) mandatoryMask(compounds []TyreCompound) uint64 {
	var mask uint64
	for _, compound := range compounds {
		mask |= model.compoundBit(compound)
	}
	return mask
}

func (input SolverInputV2) validateF45(pace compoundPaceCosts) error {
	if len(input.EventRules.RequiredWindows) > maxRequiredPitWindows {
		return fmt.Errorf("eventRules.requiredWindows exceeds %d windows", maxRequiredPitWindows)
	}
	for index, window := range input.EventRules.RequiredWindows {
		if window.FromLap < 1 || window.ToLap < window.FromLap || window.ToLap >= input.RaceLaps {
			return fmt.Errorf("eventRules.requiredWindows[%d] must satisfy 1 <= fromLap <= toLap < raceLaps", index)
		}
	}
	seen := make(map[TyreCompound]struct{}, len(input.EventRules.MandatoryCompounds))
	for index, compound := range input.EventRules.MandatoryCompounds {
		if !compound.Valid() {
			return fmt.Errorf("eventRules.mandatoryCompounds[%d] is invalid", index)
		}
		if _, duplicate := seen[compound]; duplicate {
			return fmt.Errorf("eventRules.mandatoryCompounds[%d] is duplicated", index)
		}
		seen[compound] = struct{}{}
		if !pace.enabled {
			return fmt.Errorf("eventRules.mandatoryCompounds requires tyreInventory and compoundPace")
		}
		if _, configured := pace.byName[compound]; !configured {
			return fmt.Errorf("eventRules.mandatoryCompounds[%d] has no compoundPace parameter", index)
		}
	}
	return nil
}

func (input SolverInputV2) fullWindowMask() uint64 {
	if len(input.EventRules.RequiredWindows) == 64 {
		return ^uint64(0)
	}
	return (uint64(1) << len(input.EventRules.RequiredWindows)) - 1
}

func (input SolverInputV2) windowMaskAtLap(lap int64) uint64 {
	var mask uint64
	for index, window := range input.EventRules.RequiredWindows {
		if lap >= window.FromLap && lap <= window.ToLap {
			mask |= uint64(1) << index
		}
	}
	return mask
}

func (input SolverInputV2) firstClosedWindow(lap int64, satisfied uint64) (int, bool) {
	for index, window := range input.EventRules.RequiredWindows {
		bit := uint64(1) << index
		if lap > window.ToLap && satisfied&bit == 0 {
			return index, true
		}
	}
	return 0, false
}
