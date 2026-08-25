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
	resourcePlan, err := minimumResourcePlanForDecision(input, node.decision, fuel, ve, weather, drivers, saving)
	if err != nil {
		return ReserveStatus{}, err
	}
	status.Fuel, err = fuelReserveStatus(input.FuelReserve, raceLaps, node.fuel, terminalFuel, resourcePlan.fuelUsed, fuel.capacity > 0)
	if err != nil {
		return ReserveStatus{}, err
	}
	status.VirtualEnergy, err = virtualEnergyReserveStatus(input.VirtualEnergyReserve, raceLaps, node.ve, terminalVE, resourcePlan.veUsed, ve.capacity > 0)
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

type decisionResourcePlan struct {
	fuelStart int64
	veStart   int64
	fuelUsed  int64
	veUsed    int64
}

type resourceBalance struct {
	used         int64
	serviced     int64
	minimumStart int64
}

func (balance *resourceBalance) consume(amount int64) {
	balance.used += amount
	if required := balance.used - balance.serviced; required > balance.minimumStart {
		balance.minimumStart = required
	}
}

func (balance *resourceBalance) service(amount int64) {
	balance.serviced += amount
}

func (balance *resourceBalance) requireFinish(reserve int64) {
	if required := balance.used + reserve - balance.serviced; required > balance.minimumStart {
		balance.minimumStart = required
	}
}

func minimumResourcePlanForDecision(
	input SolverInputV2,
	decision DecisionVector,
	fuel, ve serviceResource,
	weather weatherCostModel,
	drivers driverDecisionModel,
	saving savingCost,
) (decisionResourcePlan, error) {
	fuelBalance, veBalance := resourceBalance{}, resourceBalance{}
	lap := int64(0)
	for index, stint := range decision.Stints {
		driverID := stint.Driver
		if driverID == "" && len(drivers.order) == 1 {
			driverID = drivers.order[0].id
		}
		driver, ok := driverByID(drivers, driverID)
		if !ok {
			return decisionResourcePlan{}, solveError(ErrorInvalidInput, "decision.start.driver", "stint driver is unavailable")
		}
		levelID := stint.SavingLevel
		if levelID == "" {
			levelID = SavingNone
		}
		level, ok := savingByID(saving, levelID)
		if !ok {
			return decisionResourcePlan{}, solveError(ErrorInvalidInput, "decision.start.savingLevel", "stint saving level is unavailable")
		}
		fuelUsed, veUsed, err := weather.usage(lap+1, stint.Laps, driver, level)
		if err != nil {
			return decisionResourcePlan{}, solveError(ErrorInvalidInput, "decision.start.weather", err.Error())
		}
		fuelBalance.consume(fuelUsed)
		veBalance.consume(veUsed)
		lap += stint.Laps
		if index >= len(decision.PitStops) {
			continue
		}
		fuelAmount, err := serviceUnits("decision.start.fuelService", decision.PitStops[index].FuelLiters)
		if err != nil {
			return decisionResourcePlan{}, err
		}
		veAmount, err := serviceUnits("decision.start.virtualEnergyService", decision.PitStops[index].VEPercent)
		if err != nil {
			return decisionResourcePlan{}, err
		}
		fuelBalance.service(fuelAmount)
		veBalance.service(veAmount)
	}
	if len(decision.Stints) == 0 {
		return decisionResourcePlan{}, nil
	}
	last := decision.Stints[len(decision.Stints)-1]
	lastDriverID := last.Driver
	if lastDriverID == "" && len(drivers.order) == 1 {
		lastDriverID = drivers.order[0].id
	}
	lastDriver, ok := driverByID(drivers, lastDriverID)
	if !ok {
		return decisionResourcePlan{}, solveError(ErrorInvalidInput, "decision.start.driver", "last stint driver is unavailable")
	}
	lastLevelID := last.SavingLevel
	if lastLevelID == "" {
		lastLevelID = SavingNone
	}
	lastLevel, ok := savingByID(saving, lastLevelID)
	if !ok {
		return decisionResourcePlan{}, solveError(ErrorInvalidInput, "decision.start.savingLevel", "last stint saving level is unavailable")
	}
	terminalFuel, terminalVE, err := weather.usage(input.RaceLaps, 1, lastDriver, lastLevel)
	if err != nil {
		return decisionResourcePlan{}, solveError(ErrorInvalidInput, "decision.start.weather", err.Error())
	}
	raceLaps, err := contract.NewLapCount(input.RaceLaps)
	if err != nil {
		return decisionResourcePlan{}, err
	}
	fuelReserve, err := reserveUnitsForFuel(input.FuelReserve, raceLaps, terminalFuel, fuelBalance.used)
	if err != nil {
		return decisionResourcePlan{}, err
	}
	veReserve, err := reserveUnitsForVirtualEnergy(input.VirtualEnergyReserve, raceLaps, terminalVE, veBalance.used)
	if err != nil {
		return decisionResourcePlan{}, err
	}
	fuelBalance.requireFinish(fuelReserve)
	veBalance.requireFinish(veReserve)
	if fuelBalance.minimumStart > fuel.capacity {
		fuelBalance.minimumStart = fuel.capacity
	}
	if veBalance.minimumStart > ve.capacity {
		veBalance.minimumStart = ve.capacity
	}
	return decisionResourcePlan{
		fuelStart: fuelBalance.minimumStart,
		veStart:   veBalance.minimumStart,
		fuelUsed:  fuelBalance.used,
		veUsed:    veBalance.used,
	}, nil
}

func reserveUnitsForFuel(input manual.FuelReserveInput, raceLaps contract.LapCount, terminal, totalUsed int64) (int64, error) {
	if input.Kind == "" || input.Kind == manual.ReserveNone {
		return 0, nil
	}
	perLap := reserveCalculationPerLap(input.Kind, terminal, totalUsed, raceLaps.Value())
	amount, err := manual.CalculateFuelReserveAmount(input, raceLaps, perLap, 0)
	if err != nil {
		return 0, err
	}
	return serviceUnits("decision.start.fuelReserve", amount)
}

func reserveUnitsForVirtualEnergy(input manual.VirtualEnergyReserveInput, raceLaps contract.LapCount, terminal, totalUsed int64) (int64, error) {
	if input.Kind == "" || input.Kind == manual.ReserveNone {
		return 0, nil
	}
	perLap := reserveCalculationPerLap(input.Kind, terminal, totalUsed, raceLaps.Value())
	amount, err := manual.CalculateVirtualEnergyReserveAmount(input, raceLaps, perLap, 0)
	if err != nil {
		return 0, err
	}
	return serviceUnits("decision.start.virtualEnergyReserve", amount)
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
