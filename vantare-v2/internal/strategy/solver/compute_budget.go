package solver

import "math"

const (
	minimumBudgetServiceLevels = 4
	maximumBudgetServiceLevels = 200
)

// effectiveInputForBudget convierte el objetivo p95 en un ancho maximo de
// discretizacion antes de buscar. La politica es determinista: un milisegundo
// admite cuatro niveles por recurso; a partir de 200 ms se conserva el espacio
// completo permitido por el contrato. Los pasos solo crecen por potencias de
// dos, por lo que nunca se inventa precision cuando el presupuesto es menor.
func effectiveInputForBudget(input SolverInputV2) (SolverInputV2, BudgetDegradation) {
	requested := input.Discretization
	if requested.FuelLiters == 0 {
		requested.FuelLiters = defaultFuelStep
	}
	if requested.VEPercent == 0 {
		requested.VEPercent = defaultVEStep
	}
	effective := requested
	maxLevels := input.Budget.P95Millis
	if maxLevels < minimumBudgetServiceLevels {
		maxLevels = minimumBudgetServiceLevels
	}
	if maxLevels > maximumBudgetServiceLevels {
		maxLevels = maximumBudgetServiceLevels
	}
	effective.FuelLiters = coarsenedServiceStep(input.FuelCapacityLiters.Value, requested.FuelLiters, maxLevels)
	effective.VEPercent = coarsenedServiceStep(input.VECapacityPercent.Value, requested.VEPercent, maxLevels)
	degradation := BudgetDegradation{
		Requested: requested,
		Effective: effective,
	}
	if effective != requested {
		degradation.Applied = true
		degradation.Reason = "p95_budget_reduced_service_discretization"
		input.Discretization = effective
	}
	return input, degradation
}

func coarsenedServiceStep(capacity, step float64, maxLevels int) float64 {
	if capacity <= 0 || step <= 0 {
		return step
	}
	effective := step
	for serviceLevelCount(capacity, effective) > maxLevels {
		effective *= 2
		if effective >= capacity {
			return capacity
		}
	}
	return effective
}

func serviceLevelCount(capacity, step float64) int {
	return int(math.Floor(capacity/step)) + 1
}
