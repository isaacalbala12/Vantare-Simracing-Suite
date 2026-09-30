package solver

import (
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
)

// certifiedFreeServiceBoundDecisions closes a narrow case where an actual
// resource-feasible plan reaches the optimistic optimum that gives every pit
// free service. The replay is the upper bound; the dynamic program is the
// lower bound for every possible stint partition. Otherwise search continues.
func certifiedFreeServiceBoundDecisions(
	input SolverInputV2,
	fuel, ve serviceResource,
	pace stintPaceCost,
	compounds compoundPaceCosts,
	fuelWeight fuelWeightCost,
	saving savingCost,
	drivers driverDecisionModel,
	weather weatherCostModel,
	tyres tyreDecisionModel,
	envelope uncertaintyEnvelope,
	riskActive bool,
) ([]DecisionVector, bool) {
	if input.RaceDurationSeconds != nil || input.RaceLaps < 3 || input.RaceLaps > 64 ||
		input.InitialFuelLiters != nil || input.InitialVEPercent != nil ||
		pace.source.Model != StintPaceModelCombinedCurve || compounds.enabled ||
		fuelWeight.secondsPerLiter != 0 || weather.enabled || tyres.enabled ||
		fuel.capacity <= 0 || fuel.perLap <= 0 || ve.capacity <= 0 || ve.perLap <= 0 ||
		len(drivers.order) != 1 || len(saving.levels) != 1 ||
		len(input.DriverSequence) != 0 || input.EventRules.MinPitStops != nil ||
		input.EventRules.MaxPitStops != nil || len(input.EventRules.RequiredWindows) != 0 ||
		len(input.EventRules.MandatoryCompounds) != 0 || len(input.EventRules.DriverLimits) != 0 ||
		len(input.EventRules.AllowedCompoundsByClimate) != 0 {
		return nil, false
	}
	driver, level := drivers.order[0], saving.levels[0]
	if driver.fuelPerLap != fuel.perLap || driver.vePerLap != ve.perLap ||
		level.level != SavingNone || level.timeCostPerLap != 0 ||
		level.fuelSavedPerLap != 0 || level.veSavedPerLap != 0 {
		return nil, false
	}
	worstFuel, worstVE, err := envelope.full.serviceResources()
	if err != nil || worstFuel.capacity != fuel.capacity || worstVE.capacity != ve.capacity ||
		worstFuel.step != fuel.step || worstVE.step != ve.step ||
		worstFuel.perLap <= 0 || worstVE.perLap <= 0 {
		return nil, false
	}
	for _, resource := range []serviceResource{fuel, ve, worstFuel, worstVE} {
		if resource.perLap > math.MaxInt64/input.RaceLaps {
			return nil, false
		}
	}
	zeroPitInput, err := solverPitInputWithTyres(input, 0, 0, false)
	if err != nil {
		return nil, false
	}
	zeroPitCost, err := manual.CalculatePitStop(zeroPitInput)
	if err != nil {
		return nil, false
	}
	lengths, optimistic, ok := freeServicePartition(input.RaceLaps, pace, zeroPitCost.TotalSeconds.Value())
	if !ok || len(lengths) < 3 {
		return nil, false
	}
	laps, err := contract.NewLapCount(input.RaceLaps)
	if err != nil {
		return nil, false
	}
	worstFuelReserve, err := reserveUnitsForFuel(envelope.full.FuelReserve, laps, worstFuel.perLap, input.RaceLaps*worstFuel.perLap)
	if err != nil {
		return nil, false
	}
	worstVEReserve, err := reserveUnitsForVirtualEnergy(envelope.full.VirtualEnergyReserve, laps, worstVE.perLap, input.RaceLaps*worstVE.perLap)
	if err != nil {
		return nil, false
	}
	decision, ok := freeServiceDecision(input, lengths, driver.id, worstFuel, worstVE, worstFuelReserve, worstVEReserve)
	if !ok {
		return nil, false
	}
	replayed, err := ReplayDecisionV2(input, decision)
	if err != nil || !replayed.Feasible {
		return nil, false
	}
	_, worstFeasible, _, err := evaluateCandidateEnvelope(envelope, replayed.Decision, replayed.Evaluation)
	if err != nil || (riskActive && !worstFeasible) {
		return nil, false
	}
	lower := input.Formation.Seconds.Value + float64(input.RaceLaps)*driver.baseLap + optimistic
	if compareTotalSeconds(replayed.Evaluation.TotalSeconds, lower) != 0 {
		return nil, false
	}
	return []DecisionVector{replayed.Decision}, true
}

func freeServicePartition(laps int64, pace stintPaceCost, fixedPitSeconds float64) ([]int64, float64, bool) {
	if fixedPitSeconds < 0 || !finite(fixedPitSeconds) {
		return nil, 0, false
	}
	n := int(laps)
	stintCost := make([]float64, n+1)
	for length := 1; length <= n; length++ {
		stint, err := pace.stint(int64(length), 0)
		if err != nil || !finite(stint.DegradationSeconds) {
			return nil, 0, false
		}
		stintCost[length] = stint.DegradationSeconds
	}
	best := make([]float64, n+1)
	paths := make([][]int64, n+1)
	for end := 1; end <= n; end++ {
		for length := 1; length <= end; length++ {
			previous := end - length
			cost := best[previous] + stintCost[length]
			if previous != 0 {
				cost += fixedPitSeconds
			}
			candidate := append(append([]int64(nil), paths[previous]...), int64(length))
			if paths[end] == nil || freeServicePathBefore(cost, candidate, best[end], paths[end]) {
				best[end], paths[end] = cost, candidate
			}
		}
	}
	return paths[n], best[n], true
}

func freeServicePathBefore(cost float64, path []int64, previousCost float64, previous []int64) bool {
	// Keep the lower bound genuinely minimal; the solver's near-tie tolerance
	// is applied only after replay, never while building the bound.
	if cost != previousCost {
		return cost < previousCost
	}
	if len(path) != len(previous) {
		return len(path) < len(previous)
	}
	left, right := int64(0), int64(0)
	for index := 0; index < len(path)-1; index++ {
		left += path[index]
		right += previous[index]
		if left != right {
			return left < right
		}
	}
	return false
}

func freeServiceDecision(input SolverInputV2, lengths []int64, driverID string, fuel, ve serviceResource, fuelReserve, veReserve int64) (DecisionVector, bool) {
	decision := DecisionVector{Stints: make([]StintDecision, 0, len(lengths)), PitStops: make([]PitStopDecision, 0, len(lengths)-1)}
	fuelLevel, veLevel := fuel.capacity, ve.capacity
	lap := int64(0)
	for index, length := range lengths {
		if length > math.MaxInt64/fuel.perLap || length > math.MaxInt64/ve.perLap {
			return DecisionVector{}, false
		}
		fuelLevel -= length * fuel.perLap
		veLevel -= length * ve.perLap
		if fuelLevel < 0 || veLevel < 0 {
			return DecisionVector{}, false
		}
		decision.Stints = append(decision.Stints, StintDecision{Index: index, Laps: length, Driver: driverID, SavingLevel: SavingNone})
		lap += length
		if index == len(lengths)-1 {
			if fuelLevel < fuelReserve || veLevel < veReserve {
				return DecisionVector{}, false
			}
			break
		}
		next := lengths[index+1]
		last := index+1 == len(lengths)-1
		fuelAmount, ok := freeServiceAmount(fuel, fuelLevel, next, fuelReserve, last)
		if !ok {
			return DecisionVector{}, false
		}
		veAmount, ok := freeServiceAmount(ve, veLevel, next, veReserve, last)
		if !ok {
			return DecisionVector{}, false
		}
		fuelLevel += fuelAmount
		veLevel += veAmount
		decision.PitStops = append(decision.PitStops, PitStopDecision{
			Lap: lap, FuelLiters: serviceValue(fuelAmount), VEPercent: serviceValue(veAmount),
			Driver: driverID, SavingLevel: SavingNone, ServiceMode: input.resolvedPitCost().ServiceMode, ChangeTyres: true,
		})
	}
	return decision, true
}

func freeServiceAmount(resource serviceResource, level, nextLaps, reserve int64, last bool) (int64, bool) {
	if nextLaps > math.MaxInt64/resource.perLap {
		return 0, false
	}
	needed := nextLaps * resource.perLap
	if last {
		if reserve > math.MaxInt64-needed {
			return 0, false
		}
		needed += reserve
	}
	if needed <= level {
		return 0, true
	}
	missing := needed - level
	steps := missing / resource.step
	if missing%resource.step != 0 {
		steps++
	}
	if steps > math.MaxInt64/resource.step {
		return 0, false
	}
	amount := steps * resource.step
	return amount, amount <= resource.capacity-level
}
