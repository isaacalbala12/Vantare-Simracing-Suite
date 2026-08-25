package solver

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
)

func (input SolverInputV2) validateReserves() error {
	raceLaps, err := contract.NewLapCount(input.RaceLaps)
	if err != nil {
		return fmt.Errorf("reserve race laps: %w", err)
	}
	if input.FuelReserve.Kind != "" {
		if _, err := manual.CalculateFuelReserveAmount(input.FuelReserve, raceLaps, input.resourcePerLap(ResourceFuel), 0); err != nil {
			return fmt.Errorf("fuelReserve: %w", err)
		}
	}
	if input.VirtualEnergyReserve.Kind != "" {
		if _, err := manual.CalculateVirtualEnergyReserveAmount(input.VirtualEnergyReserve, raceLaps, input.resourcePerLap(ResourceVirtualEnergy), 0); err != nil {
			return fmt.Errorf("virtualEnergyReserve: %w", err)
		}
	}
	return nil
}

func reserveStatusForNode(
	input SolverInputV2,
	node searchNode,
	fuel, ve serviceResource,
	weather weatherCostModel,
	drivers driverDecisionModel,
	saving savingCost,
) (ReserveStatus, error) {
	status := ReserveStatus{Satisfied: true, Fuel: emptyReserveStatus(ResourceFuel), VirtualEnergy: emptyReserveStatus(ResourceVirtualEnergy)}
	if len(node.decision.Stints) == 0 {
		return status, nil
	}
	last := node.decision.Stints[len(node.decision.Stints)-1]
	driver, ok := driverByID(drivers, last.Driver)
	if !ok {
		return ReserveStatus{}, solveError(ErrorInvalidInput, "reserve.driver", "last stint driver is unavailable")
	}
	level, ok := savingByID(saving, last.SavingLevel)
	if !ok {
		return ReserveStatus{}, solveError(ErrorInvalidInput, "reserve.savingLevel", "last stint saving level is unavailable")
	}
	terminalFuel, terminalVE, err := weather.usage(input.RaceLaps, 1, driver, level)
	if err != nil {
		return ReserveStatus{}, solveError(ErrorInvalidInput, "reserve.weather", err.Error())
	}
	raceLaps, err := contract.NewLapCount(input.RaceLaps)
	if err != nil {
		return ReserveStatus{}, err
	}
	fuelUsed, err := consumedResource(node, fuel, true)
	if err != nil {
		return ReserveStatus{}, err
	}
	veUsed, err := consumedResource(node, ve, false)
	if err != nil {
		return ReserveStatus{}, err
	}
	status.Fuel, err = fuelReserveStatus(input.FuelReserve, raceLaps, node.fuel, terminalFuel, fuelUsed, fuel.capacity > 0)
	if err != nil {
		return ReserveStatus{}, err
	}
	status.VirtualEnergy, err = virtualEnergyReserveStatus(input.VirtualEnergyReserve, raceLaps, node.ve, terminalVE, veUsed, ve.capacity > 0)
	if err != nil {
		return ReserveStatus{}, err
	}
	for _, resource := range []ResourceReserveStatus{status.Fuel, status.VirtualEnergy} {
		if !resource.Active {
			continue
		}
		if !resource.Satisfied {
			status.Satisfied = false
		}
		if resource.EffectiveLapsAvailable && (status.LimitingResource == "" || resource.EffectiveLaps < status.EffectiveLaps) {
			status.EffectiveLaps = resource.EffectiveLaps
			status.LimitingResource = resource.Resource
		}
	}
	return status, nil
}

func emptyReserveStatus(resource ResourceKind) ResourceReserveStatus {
	return ResourceReserveStatus{Resource: resource, Satisfied: true}
}

func consumedResource(node searchNode, resource serviceResource, fuel bool) (int64, error) {
	remaining := node.ve
	if fuel {
		remaining = node.fuel
	}
	total := resource.capacity - remaining
	for _, stop := range node.decision.PitStops {
		amount := stop.VEPercent
		if fuel {
			amount = stop.FuelLiters
		}
		units, err := serviceUnits("reserve.service", amount)
		if err != nil {
			return 0, err
		}
		total += units
	}
	return total, nil
}

func fuelReserveStatus(input manual.FuelReserveInput, raceLaps contract.LapCount, remaining, terminal, totalUsed int64, active bool) (ResourceReserveStatus, error) {
	status := emptyReserveStatus(ResourceFuel)
	status.Configured = input.Kind != ""
	status.Active = active && input.Kind != "" && input.Kind != manual.ReserveNone
	status.Kind = input.Kind
	status.RemainingAmount = serviceValue(remaining)
	status.Evidence = input.Selection
	if input.Kind == manual.ReserveLaps {
		status.RequestedLaps = input.Laps.Value
		status.Evidence = input.Laps.Evidence
	}
	if !status.Active {
		return status, nil
	}
	perLap := reserveCalculationPerLap(input.Kind, terminal, totalUsed, raceLaps.Value())
	required, err := manual.CalculateFuelReserveAmount(input, raceLaps, perLap, 0)
	if err != nil {
		return ResourceReserveStatus{}, err
	}
	return completeReserveStatus(status, required, remaining, terminal)
}

func virtualEnergyReserveStatus(input manual.VirtualEnergyReserveInput, raceLaps contract.LapCount, remaining, terminal, totalUsed int64, active bool) (ResourceReserveStatus, error) {
	status := emptyReserveStatus(ResourceVirtualEnergy)
	status.Configured = input.Kind != ""
	status.Active = active && input.Kind != "" && input.Kind != manual.ReserveNone
	status.Kind = input.Kind
	status.RemainingAmount = serviceValue(remaining)
	status.Evidence = input.Selection
	if input.Kind == manual.ReserveLaps {
		status.RequestedLaps = input.Laps.Value
		status.Evidence = input.Laps.Evidence
	}
	if !status.Active {
		return status, nil
	}
	perLap := reserveCalculationPerLap(input.Kind, terminal, totalUsed, raceLaps.Value())
	required, err := manual.CalculateVirtualEnergyReserveAmount(input, raceLaps, perLap, 0)
	if err != nil {
		return ResourceReserveStatus{}, err
	}
	return completeReserveStatus(status, required, remaining, terminal)
}

func reserveCalculationPerLap(kind manual.ReserveKind, terminal, totalUsed, raceLaps int64) float64 {
	if kind == manual.ReservePercent && raceLaps > 0 {
		return serviceValue(totalUsed) / float64(raceLaps)
	}
	return serviceValue(terminal)
}

func completeReserveStatus(status ResourceReserveStatus, required float64, remaining, terminal int64) (ResourceReserveStatus, error) {
	requiredUnits, err := serviceUnits("reserve.required", required)
	if err != nil {
		return ResourceReserveStatus{}, err
	}
	status.RequiredAmount = serviceValue(requiredUnits)
	status.Satisfied = remaining >= requiredUnits
	if terminal > 0 {
		status.EffectiveLaps = float64(remaining) / float64(terminal)
		status.EffectiveLapsAvailable = true
	}
	return status, nil
}

func reserveFailure(status ReserveStatus) (string, string) {
	resource := status.Fuel
	if status.VirtualEnergy.Active && !status.VirtualEnergy.Satisfied {
		resource = status.VirtualEnergy
	}
	if resource.Kind == manual.ReserveLaps && resource.EffectiveLapsAvailable {
		return "reserve_not_met", fmt.Sprintf(
			"el plan llega con %.2f vueltas de %s, por debajo del margen de %.2f",
			resource.EffectiveLaps, resource.Resource, resource.RequestedLaps,
		)
	}
	return "reserve_not_met", fmt.Sprintf(
		"el plan llega con %.2f de %s, por debajo del margen requerido de %.2f",
		resource.RemainingAmount, resource.Resource, resource.RequiredAmount,
	)
}

func minimumStintsForReserve(input SolverInputV2, fuel, ve serviceResource) (int64, bool) {
	minimum := int64(1)
	raceLaps, err := contract.NewLapCount(input.RaceLaps)
	if err != nil {
		return 0, false
	}
	resources := []struct {
		capacity int64
		perLap   int64
		amount   func() (float64, error)
	}{
		{capacity: fuel.capacity, perLap: fuel.perLap, amount: func() (float64, error) {
			if input.FuelReserve.Kind == "" {
				return 0, nil
			}
			return manual.CalculateFuelReserveAmount(input.FuelReserve, raceLaps, serviceValue(fuel.perLap), 0)
		}},
		{capacity: ve.capacity, perLap: ve.perLap, amount: func() (float64, error) {
			if input.VirtualEnergyReserve.Kind == "" {
				return 0, nil
			}
			return manual.CalculateVirtualEnergyReserveAmount(input.VirtualEnergyReserve, raceLaps, serviceValue(ve.perLap), 0)
		}},
	}
	for _, resource := range resources {
		if resource.capacity == 0 {
			continue
		}
		reserve, err := resource.amount()
		if err != nil {
			return 0, false
		}
		reserveUnits, err := serviceUnits("reserve.minimumStints", reserve)
		if err != nil {
			return 0, false
		}
		need := input.RaceLaps*resource.perLap + reserveUnits
		stints := (need + resource.capacity - 1) / resource.capacity
		if stints > minimum {
			minimum = stints
		}
	}
	return minimum, true
}
