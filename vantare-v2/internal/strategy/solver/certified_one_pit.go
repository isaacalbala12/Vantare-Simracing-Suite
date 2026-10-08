package solver

import (
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
)

// certifiedOnePitDecisions is a narrow exact certificate for a fixed-lap race
// with one uniform driver and no resource-dependent pace. It considers every
// one-pit lap, then bounds every plan with two or more pits by giving it free
// service and the best possible partition of the same pace curve. If the best
// one-pit plan beats even that optimistic bound, the full search is unnecessary.
func certifiedOnePitDecisions(
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
	if input.RaceDurationSeconds != nil || input.RaceLaps < 2 || input.RaceLaps > 64 ||
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
	if err != nil {
		return nil, false
	}
	worstSaving, err := envelope.full.savingCost()
	if err != nil {
		return nil, false
	}
	worstDrivers, err := newDriverDecisionModel(envelope.full, worstSaving)
	if err != nil || len(worstDrivers.order) != 1 || worstDrivers.order[0].fuelPerLap != worstFuel.perLap ||
		worstDrivers.order[0].vePerLap != worstVE.perLap {
		return nil, false
	}
	for _, resource := range []serviceResource{fuel, ve, worstFuel, worstVE} {
		if resource.perLap > math.MaxInt64/input.RaceLaps {
			return nil, false
		}
	}
	laps, err := contract.NewLapCount(input.RaceLaps)
	if err != nil {
		return nil, false
	}
	fuelReserve, err := reserveUnitsForFuel(input.FuelReserve, laps, fuel.perLap, input.RaceLaps*fuel.perLap)
	if err != nil {
		return nil, false
	}
	veReserve, err := reserveUnitsForVirtualEnergy(input.VirtualEnergyReserve, laps, ve.perLap, input.RaceLaps*ve.perLap)
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
	fuelAmount, ok := onePitRequiredAmount(input.RaceLaps, fuel, fuelReserve, worstFuel, worstFuelReserve)
	if !ok {
		return nil, false
	}
	veAmount, ok := onePitRequiredAmount(input.RaceLaps, ve, veReserve, worstVE, worstVEReserve)
	if !ok {
		return nil, false
	}

	var decisions []DecisionVector
	var best searchNode
	bestFound := false
	for split := int64(1); split < input.RaceLaps; split++ {
		decision := DecisionVector{
			Stints: []StintDecision{
				{Index: 0, Laps: split, Driver: driver.id, SavingLevel: SavingNone},
				{Index: 1, Laps: input.RaceLaps - split, Driver: driver.id, SavingLevel: SavingNone},
			},
			PitStops: []PitStopDecision{{
				Lap: split, FuelLiters: serviceValue(fuelAmount), VEPercent: serviceValue(veAmount),
				Driver: driver.id, SavingLevel: SavingNone,
				ServiceMode: input.resolvedPitCost().ServiceMode, ChangeTyres: true,
			}},
		}
		replayed, replayErr := ReplayDecisionV2(input, decision)
		if replayErr != nil || !replayed.Feasible {
			continue
		}
		_, worstFeasible, _, envelopeErr := evaluateCandidateEnvelope(envelope, replayed.Decision, replayed.Evaluation)
		if envelopeErr != nil || (riskActive && !worstFeasible) {
			continue
		}
		decisions = append(decisions, replayed.Decision)
		candidate := nodeFromEvaluation(replayed.Decision, replayed.Evaluation)
		if !bestFound || betterNode(candidate, best, input.Formation.Seconds.Value) {
			best, bestFound = candidate, true
		}
	}
	if len(decisions) == 0 {
		return nil, false
	}

	// A zero-pit plan may still win; include it when feasible. The multi-pit
	// lower bound remains valid regardless of its resource feasibility.
	noPit := DecisionVector{Stints: []StintDecision{{Index: 0, Laps: input.RaceLaps, Driver: driver.id, SavingLevel: SavingNone}}}
	if replayed, replayErr := ReplayDecisionV2(input, noPit); replayErr == nil && replayed.Feasible {
		_, worstFeasible, _, envelopeErr := evaluateCandidateEnvelope(envelope, replayed.Decision, replayed.Evaluation)
		if envelopeErr == nil && (!riskActive || worstFeasible) {
			decisions = append(decisions, replayed.Decision)
			candidate := nodeFromEvaluation(replayed.Decision, replayed.Evaluation)
			if !bestFound || betterNode(candidate, best, input.Formation.Seconds.Value) {
				best, bestFound = candidate, true
			}
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
	lower, ok := multiPitLowerBound(input.RaceLaps, pace, zeroPitCost.TotalSeconds.Value())
	if !ok {
		return nil, false
	}
	bound := input.Formation.Seconds.Value + float64(input.RaceLaps)*driver.baseLap + lower
	if compareTotalSeconds(best.total(input.Formation.Seconds.Value), bound) >= 0 {
		return nil, false
	}
	return decisions, true
}

func onePitRequiredAmount(laps int64, expected serviceResource, expectedReserve int64, worst serviceResource, worstReserve int64) (int64, bool) {
	required := func(resource serviceResource, reserve int64) (int64, bool) {
		if resource.perLap > math.MaxInt64/laps {
			return 0, false
		}
		used := laps * resource.perLap
		if reserve > math.MaxInt64-used {
			return 0, false
		}
		if used+reserve <= resource.capacity {
			return 0, true
		}
		return used + reserve - resource.capacity, true
	}
	expectedNeeded, ok := required(expected, expectedReserve)
	if !ok {
		return 0, false
	}
	worstNeeded, ok := required(worst, worstReserve)
	if !ok {
		return 0, false
	}
	needed := max(expectedNeeded, worstNeeded)
	steps := needed / expected.step
	if needed%expected.step != 0 {
		steps++
	}
	if steps > math.MaxInt64/expected.step {
		return 0, false
	}
	amount := steps * expected.step
	return amount, amount <= expected.capacity && amount <= worst.capacity
}

// Ignore resource feasibility and every variable service cost: this can only
// make a multi-pit plan appear faster than it really is.
func multiPitLowerBound(laps int64, pace stintPaceCost, fixedPitSeconds float64) (float64, bool) {
	if laps < 3 || fixedPitSeconds < 0 {
		return math.Inf(1), true
	}
	n := int(laps)
	stintCost := make([]float64, n+1)
	for length := 1; length <= n; length++ {
		stint, err := pace.stint(int64(length), 0)
		if err != nil || math.IsNaN(stint.DegradationSeconds) || math.IsInf(stint.DegradationSeconds, 0) {
			return 0, false
		}
		stintCost[length] = stint.DegradationSeconds
	}
	previous := make([]float64, n+1)
	for index := 1; index <= n; index++ {
		previous[index] = math.Inf(1)
	}
	best := math.Inf(1)
	for stints := 1; stints <= n; stints++ {
		next := make([]float64, n+1)
		for index := range next {
			next[index] = math.Inf(1)
		}
		for used := 0; used < n; used++ {
			if math.IsInf(previous[used], 1) {
				continue
			}
			for length := 1; used+length <= n; length++ {
				cost := previous[used] + stintCost[length]
				if cost < next[used+length] {
					next[used+length] = cost
				}
			}
		}
		if stints >= 3 && next[n]+float64(stints-1)*fixedPitSeconds < best {
			best = next[n] + float64(stints-1)*fixedPitSeconds
		}
		previous = next
	}
	return best, true
}
