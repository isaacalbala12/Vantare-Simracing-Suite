package solver

// simpleResourceDecisions cierra el caso escalar sin dimensiones que puedan
// beneficiarse de abrir un stint adicional. En ese espacio, el optimo probado
// usa el minimo numero de stints: cada uno queda limitado solo por Fuel, VE o
// vida de neumatico; el desempate canonico coloca la primera parada lo antes
// posible y reposta la cantidad discretizada minima para el stint siguiente.
func simpleResourceDecisions(
	input SolverInputV2,
	fuel, ve serviceResource,
	pace stintPaceCost,
	compounds compoundPaceCosts,
	fuelWeight fuelWeightCost,
	saving savingCost,
	drivers driverDecisionModel,
	weather weatherCostModel,
) ([]DecisionVector, bool) {
	driverID := ""
	if drivers.enabled {
		if len(drivers.order) != 1 || len(input.EventRules.DriverLimits) != 0 ||
			drivers.order[0].baseLap != input.BaseLapSeconds.Value ||
			drivers.order[0].fuelPerLap != fuel.perLap || drivers.order[0].vePerLap != ve.perLap {
			return nil, false
		}
		driverID = drivers.order[0].id
	}
	if pace.source.Model != StintPaceModelManualLinear || pace.manualSlope != 0 ||
		compounds.enabled || fuelWeight.secondsPerLiter != 0 || len(saving.levels) != 1 ||
		weather.enabled || input.EventRules.MinPitStops != nil ||
		input.EventRules.MaxPitStops != nil || len(input.EventRules.RequiredWindows) != 0 ||
		len(input.EventRules.MandatoryCompounds) != 0 || len(input.EventRules.DriverLimits) != 0 {
		return nil, false
	}
	pitCost := input.resolvedPitCost()
	maxAvoidableService := input.FuelCapacityLiters.Value/pitCost.RefuelRateLPerS.Value +
		input.VECapacityPercent.Value/pitCost.VERatePPerS.Value + pitCost.TyreSeconds.Value
	if pitCost.TransitSeconds.Value <= maxAvoidableService {
		return nil, false
	}

	maxStint := input.RaceLaps
	for _, resource := range []serviceResource{fuel, ve} {
		if resource.perLap > 0 && resource.capacity/resource.perLap < maxStint {
			maxStint = resource.capacity / resource.perLap
		}
	}
	if life := input.tyreLifeLaps(); life > 0 && life < maxStint {
		maxStint = life
	}
	if maxStint < 1 {
		return nil, false
	}

	stintCount := (input.RaceLaps + maxStint - 1) / maxStint
	lengths := make([]int64, stintCount)
	remaining := input.RaceLaps
	for index := int64(0); index < stintCount; index++ {
		remainingStints := stintCount - index - 1
		laps := remaining - remainingStints*maxStint
		lengths[index] = laps
		remaining -= laps
	}

	decisions := make([]DecisionVector, 0, 2)
	canonical, ok := buildSimpleResourceDecision(input, fuel, ve, lengths, driverID)
	if !ok {
		return nil, false
	}
	decisions = append(decisions, canonical)
	if stintCount > 1 {
		balanced := make([]int64, stintCount)
		base, extra := input.RaceLaps/stintCount, input.RaceLaps%stintCount
		for index := range balanced {
			balanced[index] = base
			if int64(index) < extra {
				balanced[index]++
			}
		}
		alternative, feasible := buildSimpleResourceDecision(input, fuel, ve, balanced, driverID)
		if feasible && decisionKey(alternative) != decisionKey(canonical) {
			decisions = append(decisions, alternative)
		}
	}
	return decisions, true
}

func buildSimpleResourceDecision(input SolverInputV2, fuel, ve serviceResource, lengths []int64, driverID string) (DecisionVector, bool) {
	decision := DecisionVector{
		PitStops: make([]PitStopDecision, 0, len(lengths)-1),
		Stints:   make([]StintDecision, 0, len(lengths)),
	}
	fuelLevel, veLevel := fuel.capacity, ve.capacity
	lap := int64(0)
	for index, laps := range lengths {
		decision.Stints = append(decision.Stints, StintDecision{Index: index, Laps: laps, Driver: driverID, SavingLevel: SavingNone})
		fuelLevel -= laps * fuel.perLap
		veLevel -= laps * ve.perLap
		lap += laps
		if index == len(lengths)-1 {
			break
		}
		fuelAmount, ok := minimumServiceForNextStint(fuelLevel, fuel, lengths[index+1])
		if !ok {
			return DecisionVector{}, false
		}
		veAmount, ok := minimumServiceForNextStint(veLevel, ve, lengths[index+1])
		if !ok {
			return DecisionVector{}, false
		}
		decision.PitStops = append(decision.PitStops, PitStopDecision{
			Lap: lap, FuelLiters: serviceValue(fuelAmount), VEPercent: serviceValue(veAmount),
			Driver: driverID, SavingLevel: SavingNone, ServiceMode: input.resolvedPitCost().ServiceMode, ChangeTyres: true,
		})
		fuelLevel += fuelAmount
		veLevel += veAmount
	}
	return decision, true
}

func minimumServiceForNextStint(current int64, resource serviceResource, laps int64) (int64, bool) {
	if resource.capacity == 0 {
		return 0, true
	}
	needed := laps*resource.perLap - current
	if needed <= 0 {
		return 0, true
	}
	amount := ((needed + resource.step - 1) / resource.step) * resource.step
	return amount, amount <= resource.capacity-current
}

func nodeFromEvaluation(decision DecisionVector, evaluation ScenarioEvaluation) searchNode {
	return searchNode{
		lap: decisionLaps(decision), decision: cloneDecision(decision),
		green: evaluation.GreenSeconds, degradation: evaluation.DegradationSeconds,
		compound: evaluation.CompoundSeconds, fuelWeight: evaluation.FuelWeightSeconds,
		saving: evaluation.SavingSeconds, weather: evaluation.WeatherSeconds, pit: evaluation.PitSeconds,
	}
}

func decisionLaps(decision DecisionVector) int64 {
	var total int64
	for _, stint := range decision.Stints {
		total += stint.Laps
	}
	return total
}
