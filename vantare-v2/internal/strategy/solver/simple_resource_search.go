package solver

import (
	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
)

const maxSimpleResourceSearchNodes = 100_000

// simpleResourceDecisions cierra el caso escalar sin dimensiones que puedan
// beneficiarse de abrir un stint adicional. En ese espacio, el optimo probado
// usa el minimo numero de stints: el coste de transito de una parada adicional
// es mayor que todo el servicio que podria ahorrar. Dentro de ese numero minimo
// se enumeran sin poda las longitudes y cantidades discretizadas, porque en
// servicio paralelo cargar recurso adicional puede quedar oculto bajo otro.
// Si el espacio reducido supera su cota explicita, se desactiva el atajo.
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
	reserveStints, ok := minimumStintsForReserve(input, fuel, ve)
	if !ok {
		return nil, false
	}
	if reserveStints > stintCount {
		stintCount = reserveStints
	}
	if stintCount > input.RaceLaps {
		return nil, false
	}
	if ve.capacity == 0 && fuel.capacity > 0 && pitCost.TyreSeconds.Value == 0 {
		decision, exact := simpleSingleFuelDecision(input, fuel, maxStint, stintCount, driverID)
		if exact {
			return []DecisionVector{decision}, true
		}
	}
	searchLimit := maxSimpleResourceSearchNodes
	if input.Budget.MaxCandidates > 0 && input.Budget.MaxCandidates < searchLimit {
		searchLimit = input.Budget.MaxCandidates
	}
	decisions, bounded := enumerateSimpleResourceDecisions(input, fuel, ve, maxStint, stintCount, driverID, searchLimit)
	return decisions, bounded && len(decisions) > 0
}

func simpleSingleFuelDecision(input SolverInputV2, fuel serviceResource, maxStint, stintCount int64, driverID string) (DecisionVector, bool) {
	raceLaps, err := contract.NewLapCount(input.RaceLaps)
	if err != nil {
		return DecisionVector{}, false
	}
	reserveAmount := 0.0
	if input.FuelReserve.Kind != "" {
		reserveAmount, err = manual.CalculateFuelReserveAmount(input.FuelReserve, raceLaps, serviceValue(fuel.perLap), 0)
		if err != nil {
			return DecisionVector{}, false
		}
	}
	reserveUnits, err := serviceUnits("fuelReserve", reserveAmount)
	if err != nil || reserveUnits > fuel.capacity {
		return DecisionVector{}, false
	}
	finalMaxStint := maxStint
	if fuel.perLap > 0 && (fuel.capacity-reserveUnits)/fuel.perLap < finalMaxStint {
		finalMaxStint = (fuel.capacity - reserveUnits) / fuel.perLap
	}
	if finalMaxStint < 1 {
		return DecisionVector{}, false
	}

	laps := make([]int64, stintCount)
	remaining := input.RaceLaps
	for index := int64(0); index < stintCount; index++ {
		stintsAfter := stintCount - index - 1
		maximumAfter := finalMaxStint
		if stintsAfter > 0 {
			maximumAfter += (stintsAfter - 1) * maxStint
		} else {
			maximumAfter = 0
		}
		count := remaining - maximumAfter
		if count < 1 {
			count = 1
		}
		maximum := maxStint
		if index == stintCount-1 {
			maximum = finalMaxStint
		}
		if count > maximum {
			return DecisionVector{}, false
		}
		laps[index] = count
		remaining -= count
	}
	if remaining != 0 {
		return DecisionVector{}, false
	}

	decision := DecisionVector{PitStops: make([]PitStopDecision, 0, stintCount-1), Stints: make([]StintDecision, 0, stintCount)}
	level := fuel.capacity
	lap := int64(0)
	for index, count := range laps {
		level -= count * fuel.perLap
		if level < 0 {
			return DecisionVector{}, false
		}
		decision.Stints = append(decision.Stints, StintDecision{Index: index, Laps: count, Driver: driverID, SavingLevel: SavingNone})
		lap += count
		if index == len(laps)-1 {
			if level < reserveUnits {
				return DecisionVector{}, false
			}
			continue
		}
		required := laps[index+1] * fuel.perLap
		if index+1 == len(laps)-1 {
			required += reserveUnits
		}
		amount := required - level
		if amount < 0 {
			amount = 0
		}
		if remainder := amount % fuel.step; remainder != 0 {
			amount += fuel.step - remainder
		}
		if amount > fuel.capacity-level {
			return DecisionVector{}, false
		}
		decision.PitStops = append(decision.PitStops, PitStopDecision{
			Lap: lap, FuelLiters: serviceValue(amount), Driver: driverID, SavingLevel: SavingNone,
			ServiceMode: input.resolvedPitCost().ServiceMode, ChangeTyres: true,
		})
		level += amount
	}
	return decision, true
}

func enumerateSimpleResourceDecisions(
	input SolverInputV2,
	fuel, ve serviceResource,
	maxStint, stintCount int64,
	driverID string,
	searchLimit int,
) ([]DecisionVector, bool) {
	decisions := make([]DecisionVector, 0, 16)
	visited := 0
	bounded := true
	initial := DecisionVector{
		PitStops: make([]PitStopDecision, 0, stintCount-1),
		Stints:   make([]StintDecision, 0, stintCount),
	}
	var walk func(DecisionVector, int64, int64, int64, int64, int64)
	walk = func(decision DecisionVector, remaining, stintsLeft, lap, fuelLevel, veLevel int64) {
		if !bounded {
			return
		}
		minimum := remaining - (stintsLeft-1)*maxStint
		if minimum < 1 {
			minimum = 1
		}
		maximum := maxStint
		if lastPossible := remaining - (stintsLeft - 1); lastPossible < maximum {
			maximum = lastPossible
		}
		for laps := minimum; laps <= maximum; laps++ {
			visited++
			if visited > searchLimit {
				bounded = false
				return
			}
			fuelAfter := fuelLevel - laps*fuel.perLap
			veAfter := veLevel - laps*ve.perLap
			if fuelAfter < 0 || veAfter < 0 {
				continue
			}
			next := cloneDecision(decision)
			next.Stints = append(next.Stints, StintDecision{
				Index: len(next.Stints), Laps: laps, Driver: driverID, SavingLevel: SavingNone,
			})
			nextLap := lap + laps
			if stintsLeft == 1 {
				decisions = append(decisions, next)
				continue
			}
			for _, fuelAmount := range serviceAmounts(fuelAfter, fuel) {
				for _, veAmount := range serviceAmounts(veAfter, ve) {
					visited++
					if visited > searchLimit {
						bounded = false
						return
					}
					withPit := cloneDecision(next)
					withPit.PitStops = append(withPit.PitStops, PitStopDecision{
						Lap: nextLap, FuelLiters: serviceValue(fuelAmount), VEPercent: serviceValue(veAmount),
						Driver: driverID, SavingLevel: SavingNone, ServiceMode: input.resolvedPitCost().ServiceMode, ChangeTyres: true,
					})
					walk(withPit, remaining-laps, stintsLeft-1, nextLap, fuelAfter+fuelAmount, veAfter+veAmount)
				}
			}
		}
	}
	walk(initial, input.RaceLaps, stintCount, 0, fuel.capacity, ve.capacity)
	if !bounded {
		return nil, false
	}
	return decisions, true
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
