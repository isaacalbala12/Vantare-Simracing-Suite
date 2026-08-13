package live

import (
	"fmt"
	"math"
	"regexp"
	"slices"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

const (
	maxSafeInteger = contract.LapCount(1<<53 - 1)
	maxStints      = 128
	maxFuelTargets = 4096
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type Stint struct {
	ID   string
	Laps contract.LapCount
}

type FuelTarget struct {
	CompletedLaps contract.LapCount
	Fuel          contract.FuelLiters
}

type PlanInput struct {
	ActivePlan  contract.ActivePlan
	Stints      []Stint
	FuelTargets []FuelTarget
}

// Plan owns its slices and exposes copies. A live run cannot be changed by an
// editor alias after activation.
type Plan struct {
	activePlan  contract.ActivePlan
	stints      []Stint
	fuelTargets []FuelTarget
	fuelByLap   map[contract.LapCount]contract.FuelLiters
	totalLaps   contract.LapCount
}

func NewPlan(input PlanInput) (Plan, error) {
	// Bound untrusted collections before allocating indexes or owned copies.
	if len(input.Stints) > maxStints {
		return Plan{}, invalid(ErrInvalidPlan, "stints", nil)
	}
	if len(input.FuelTargets) > maxFuelTargets {
		return Plan{}, invalid(ErrInvalidPlan, "fuelTargets", nil)
	}
	if err := input.ActivePlan.Validate(); err != nil {
		return Plan{}, invalid(ErrInvalidPlan, "activePlan", err)
	}
	if len(input.Stints) == 0 {
		return Plan{}, invalid(ErrInvalidPlan, "stints", nil)
	}
	seenIDs := make(map[string]struct{}, len(input.Stints))
	var total contract.LapCount
	for index, stint := range input.Stints {
		if !safeID.MatchString(stint.ID) {
			return Plan{}, invalid(ErrInvalidPlan, fmt.Sprintf("stints[%d].id", index), nil)
		}
		if _, exists := seenIDs[stint.ID]; exists {
			return Plan{}, invalid(ErrInvalidPlan, fmt.Sprintf("stints[%d].id", index), nil)
		}
		seenIDs[stint.ID] = struct{}{}
		if stint.Laps <= 0 || stint.Laps > maxSafeInteger-total {
			return Plan{}, invalid(ErrInvalidPlan, fmt.Sprintf("stints[%d].laps", index), nil)
		}
		total += stint.Laps
	}
	seenTargets := make(map[contract.LapCount]struct{}, len(input.FuelTargets))
	for index, target := range input.FuelTargets {
		if target.CompletedLaps < 0 || target.CompletedLaps > total {
			return Plan{}, invalid(ErrInvalidPlan, fmt.Sprintf("fuelTargets[%d].completedLaps", index), nil)
		}
		if _, exists := seenTargets[target.CompletedLaps]; exists {
			return Plan{}, invalid(ErrInvalidPlan, fmt.Sprintf("fuelTargets[%d].completedLaps", index), nil)
		}
		seenTargets[target.CompletedLaps] = struct{}{}
		fuel := target.Fuel.Value()
		if math.IsNaN(fuel) || math.IsInf(fuel, 0) || fuel < 0 {
			return Plan{}, invalid(ErrInvalidPlan, fmt.Sprintf("fuelTargets[%d].fuel", index), nil)
		}
	}
	return Plan{
		activePlan: cloneActivePlan(input.ActivePlan),
		stints:     slices.Clone(input.Stints), fuelTargets: slices.Clone(input.FuelTargets),
		fuelByLap: fuelIndex(input.FuelTargets), totalLaps: total,
	}, nil
}

func (plan Plan) ActivePlan() contract.ActivePlan { return cloneActivePlan(plan.activePlan) }
func (plan Plan) Stints() []Stint                 { return slices.Clone(plan.stints) }
func (plan Plan) FuelTargets() []FuelTarget       { return slices.Clone(plan.fuelTargets) }
func (plan Plan) TotalLaps() contract.LapCount    { return plan.totalLaps }

func (plan Plan) fuelTarget(completed contract.LapCount) (contract.FuelLiters, bool) {
	target, present := plan.fuelByLap[completed]
	return target, present
}

func fuelIndex(targets []FuelTarget) map[contract.LapCount]contract.FuelLiters {
	index := make(map[contract.LapCount]contract.FuelLiters, len(targets))
	for _, target := range targets {
		index[target.CompletedLaps] = target.Fuel
	}
	return index
}

func cloneActivePlan(active contract.ActivePlan) contract.ActivePlan {
	clone := active
	if active.PreviousRevision != nil {
		previous := *active.PreviousRevision
		clone.PreviousRevision = &previous
	}
	return clone
}
