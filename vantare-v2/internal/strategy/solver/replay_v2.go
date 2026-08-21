package solver

import (
	"fmt"
	"math"
)

const ReplayContractVersionV1 = "strategy.solver.replay.v1"

// ReplayResultV1 evaluates one fixed decision with the same cost and
// constraint models used by SolveV2. An invalid document returns an error;
// a well-formed plan that breaks race constraints returns Feasible=false.
type ReplayResultV1 struct {
	ContractVersion string             `json:"contractVersion"`
	Decision        DecisionVector     `json:"decision"`
	Evaluation      ScenarioEvaluation `json:"evaluation"`
	Feasible        bool               `json:"feasible"`
	Reasons         []SolverReason     `json:"reasons,omitempty"`
}

// ReplayDecisionV2 evaluates a fixed plan without searching or changing its
// pit laps, service quantities, compounds, drivers or saving levels.
func ReplayDecisionV2(input SolverInputV2, decision DecisionVector) (ReplayResultV1, error) {
	if err := input.Validate(); err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "input", err.Error())
	}
	if err := validateReplayShape(input, decision); err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "decision", err.Error())
	}

	fuel, ve, err := input.serviceResources()
	if err != nil {
		return ReplayResultV1{}, err
	}
	pace, err := input.stintPaceCost()
	if err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "combinedStintPaceCurve", err.Error())
	}
	compounds, err := input.compoundPaceCosts()
	if err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "compoundPace", err.Error())
	}
	if compounds.enabled {
		pace = stintPaceCost{}.withHorizon(input.RaceLaps)
	}
	tyreModel, err := newTyreDecisionModel(input, compounds)
	if err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "tyreInventory", err.Error())
	}
	fuelWeight, err := input.fuelWeightCost()
	if err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "fuelWeight", err.Error())
	}
	saving, err := input.savingCost()
	if err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "savingCost", err.Error())
	}
	drivers, err := newDriverDecisionModel(input, saving)
	if err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "driverProfiles", err.Error())
	}
	weather, err := newWeatherCostModel(input)
	if err != nil {
		return ReplayResultV1{}, solveError(ErrorInvalidInput, "weather", err.Error())
	}
	costs := lapCostModel{pace: pace, compounds: compounds, fuelWeight: fuelWeight, weather: weather}

	initialTyre, ok := replayInitialTyre(tyreModel, decision.Stints[0])
	if !ok {
		return infeasibleReplay(decision, input.Formation.Seconds, searchNode{}, "tyre_inventory_insufficient", "el compuesto o juego inicial observado no existe en el inventario"), nil
	}
	node := searchNode{
		fuel: fuel.capacity, ve: ve.capacity, tyre: initialTyre,
		decision: DecisionVector{PitStops: []PitStopDecision{}, Stints: []StintDecision{}},
	}

	for index, requestedStint := range decision.Stints {
		driverID := requestedStint.Driver
		if driverID == "" && len(drivers.order) == 1 {
			driverID = drivers.order[0].id
		}
		driver, found := driverByID(drivers, driverID)
		if !found {
			return ReplayResultV1{}, solveError(ErrorInvalidInput, fmt.Sprintf("decision.stints[%d].driver", index), "driver is not configured")
		}
		level := requestedStint.SavingLevel
		if level == "" {
			level = SavingNone
		}
		savingLevel, found := savingByID(saving, level)
		if !found {
			return ReplayResultV1{}, solveError(ErrorInvalidInput, fmt.Sprintf("decision.stints[%d].savingLevel", index), "saving level is not configured")
		}
		if allowed, condition := weather.compoundAllowed(node.tyre.compound, node.lap+1, requestedStint.Laps); !allowed {
			return infeasibleReplay(decision, input.Formation.Seconds, node, "compound_not_allowed_for_climate", fmt.Sprintf("el compuesto %s no esta permitido en %s desde la vuelta %d", node.tyre.compound, condition.Bucket, condition.Lap)), nil
		}
		if weather.runnableLaps(input.RaceLaps-node.lap, node, fuel, ve, input.TyreLifeLaps, driver, savingLevel) < requestedStint.Laps {
			return infeasibleReplay(decision, input.Formation.Seconds, node, "resource_exhausted", "el stint fijo supera los recursos o la vida de neumatico disponibles"), nil
		}

		before := node
		node, err = appendStint(node, requestedStint.Laps, input, costs, savingLevel, driver)
		if err != nil {
			return ReplayResultV1{}, err
		}
		node.lap = before.lap + requestedStint.Laps
		fuelUsed, veUsed, err := weather.usage(before.lap+1, requestedStint.Laps, driver, savingLevel)
		if err != nil {
			return ReplayResultV1{}, solveError(ErrorInvalidInput, "weather", err.Error())
		}
		node.fuel -= fuelUsed
		node.ve -= veUsed
		if allowed, code, message := input.applyDriverConstraints(before, &node, driver); !allowed {
			return infeasibleReplay(decision, input.Formation.Seconds, node, code, message), nil
		}

		if index == len(decision.Stints)-1 {
			if allowed, code, message := input.completedAllowed(node, tyreModel); !allowed {
				return infeasibleReplay(decision, input.Formation.Seconds, node, code, message), nil
			}
			continue
		}

		requestedPit := decision.PitStops[index]
		fuelAmount, err := replayServiceAmount("fuelLiters", requestedPit.FuelLiters, node.fuel, fuel.capacity)
		if err != nil {
			return ReplayResultV1{}, solveError(ErrorInvalidInput, fmt.Sprintf("decision.pitStops[%d].fuelLiters", index), err.Error())
		}
		veAmount, err := replayServiceAmount("vePercent", requestedPit.VEPercent, node.ve, ve.capacity)
		if err != nil {
			return ReplayResultV1{}, solveError(ErrorInvalidInput, fmt.Sprintf("decision.pitStops[%d].vePercent", index), err.Error())
		}
		tyreOption, ok := replayNextTyre(tyreModel, node.tyre, decision.Stints[index+1], requestedPit.ChangeTyres)
		if !ok {
			return infeasibleReplay(decision, input.Formation.Seconds, node, "tyre_choice_invalid", "el cambio de neumaticos fijo no puede reproducirse con el inventario"), nil
		}
		node, err = appendPit(node, fuelAmount, veAmount, tyreOption, input)
		if err != nil {
			return ReplayResultV1{}, err
		}
		node.fuel += fuelAmount
		node.ve += veAmount
	}

	return ReplayResultV1{
		ContractVersion: ReplayContractVersionV1,
		Decision:        cloneDecision(node.decision),
		Evaluation:      evaluationForNode(node, input.Formation.Seconds),
		Feasible:        true,
		Reasons:         []SolverReason{},
	}, nil
}

func validateReplayShape(input SolverInputV2, decision DecisionVector) error {
	if len(decision.Stints) == 0 || len(decision.PitStops) != len(decision.Stints)-1 {
		return fmt.Errorf("stints must contain exactly one more item than pitStops")
	}
	lap := int64(0)
	for index, stint := range decision.Stints {
		if stint.Laps <= 0 {
			return fmt.Errorf("stints[%d].laps must be positive", index)
		}
		lap += stint.Laps
		if index < len(decision.PitStops) && decision.PitStops[index].Lap != lap {
			return fmt.Errorf("pitStops[%d].lap must equal the preceding stint boundary", index)
		}
	}
	if lap != input.RaceLaps {
		return fmt.Errorf("stint laps total %d, want raceLaps %d", lap, input.RaceLaps)
	}
	return nil
}

func replayInitialTyre(model tyreDecisionModel, stint StintDecision) (tyreChoice, bool) {
	if !model.enabled {
		return tyreChoice{}, true
	}
	return replayTyreChoice(model, stint, tyreChoice{}, false)
}

func replayNextTyre(model tyreDecisionModel, current tyreChoice, stint StintDecision, change bool) (pitTyreChoice, bool) {
	if !model.enabled {
		return pitTyreChoice{change: change}, true
	}
	if !change {
		if stint.Compound != current.compound || stint.TyreFitment != nil && *stint.TyreFitment != current.fitment {
			return pitTyreChoice{}, false
		}
		return pitTyreChoice{choice: current}, true
	}
	choice, ok := replayTyreChoice(model, stint, current, true)
	return pitTyreChoice{choice: choice, change: true}, ok
}

func replayTyreChoice(model tyreDecisionModel, stint StintDecision, current tyreChoice, requireDifferent bool) (tyreChoice, bool) {
	for _, fitment := range model.fitments[stint.Compound] {
		if requireDifferent && fitment == current.fitment {
			continue
		}
		if stint.TyreFitment != nil && fitment != *stint.TyreFitment {
			continue
		}
		return tyreChoice{compound: stint.Compound, fitment: fitment}, true
	}
	return tyreChoice{}, false
}

func replayServiceAmount(field string, value float64, current, capacity int64) (int64, error) {
	if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, fmt.Errorf("%s must be finite and non-negative", field)
	}
	amount, err := serviceUnits(field, value)
	if err != nil {
		return 0, err
	}
	if amount > capacity-current {
		return 0, fmt.Errorf("%s exceeds the available capacity", field)
	}
	return amount, nil
}

func infeasibleReplay(decision DecisionVector, formation float64, node searchNode, code, message string) ReplayResultV1 {
	return ReplayResultV1{
		ContractVersion: ReplayContractVersionV1,
		Decision:        cloneDecision(decision),
		Evaluation:      evaluationForNode(node, formation),
		Feasible:        false,
		Reasons:         []SolverReason{{Code: code, Message: message}},
	}
}
