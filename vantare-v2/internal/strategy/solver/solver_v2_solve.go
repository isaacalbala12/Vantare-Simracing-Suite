package solver

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	serviceScale        = int64(1_000_000)
	defaultFuelStep     = 1.0
	defaultVEStep       = 1.0
	timeTieRelative     = 1e-12
	maxServiceLevels    = int64(200)
	maxRejectedDetails  = 8
	maxRankedCandidates = 8
)

type serviceResource struct {
	capacity int64
	perLap   int64
	step     int64
}

type searchNode struct {
	lap                     int64
	fuel                    int64
	ve                      int64
	tyreAge                 int64
	tyre                    tyreChoice
	tyreUsage               map[tyres.TyreID]int64
	windowMask              uint64
	compoundMask            uint64
	currentDriver           string
	driverUsage             map[string]driverUsage
	continuousDriverSeconds float64
	green                   float64
	degradation             float64
	compound                float64
	weather                 float64
	fuelWeight              float64
	saving                  float64
	pit                     float64
	decision                DecisionVector
	worstFuel               int64
	worstVE                 int64
	worstTyreAge            int64
	worstTyreUsage          map[tyres.TyreID]int64
	worstFeasible           bool
}

func (node searchNode) total(formation float64) float64 {
	return formation + node.green + node.degradation + node.compound + node.weather + node.fuelWeight + node.saving + node.pit
}

type lapCostModel struct {
	pace       stintPaceCost
	compounds  compoundPaceCosts
	fuelWeight fuelWeightCost
	weather    weatherCostModel
}

// SolveV2 optimiza el vector F1.3 con coste de pit por cantidades de servicio.
// Recorre vueltas de parada arbitrarias y elimina solo estados dominados: a la
// misma vuelta, un estado mas barato con al menos los mismos recursos nunca
// puede producir una continuacion peor.
func SolveV2(input SolverInputV2) (SolverResultV2, error) {
	started := time.Now()
	if err := input.Validate(); err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "input", err.Error())
	}
	inputHash, err := hashSolverInputV2(input)
	if err != nil {
		return SolverResultV2{}, err
	}
	input, budgetDegradation := effectiveInputForBudget(input)
	fuel, ve, err := input.serviceResources()
	if err != nil {
		return SolverResultV2{}, err
	}
	binding := input.bindingConstraint()
	paceCost, err := input.stintPaceCost()
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "combinedStintPaceCurve", err.Error())
	}
	compoundPace, err := input.compoundPaceCosts()
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "compoundPace", err.Error())
	}
	if compoundPace.enabled {
		paceCost = stintPaceCost{source: StintPaceCostSource{
			Model:      StintPaceModelCompoundParameters,
			Provenance: sp.Provenance{Kind: sp.ProvenanceUnknown},
			Confidence: sp.Confidence{ComputationVersion: "compound-parameters.v1"},
		}}.withHorizon(input.RaceLaps)
	}
	tyreModel, err := newTyreDecisionModel(input, compoundPace)
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "tyreInventory", err.Error())
	}
	fuelWeight, err := input.fuelWeightCost()
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "fuelWeight", err.Error())
	}
	saving, err := input.savingCost()
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "savingCost", err.Error())
	}
	drivers, err := newDriverDecisionModel(input, saving)
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "driverProfiles", err.Error())
	}
	weatherCost, err := newWeatherCostModel(input)
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "weather", err.Error())
	}
	lapCosts := lapCostModel{pace: paceCost, compounds: compoundPace, fuelWeight: fuelWeight, weather: weatherCost}
	envelope := coherentWorstCase(input)
	worstFuel, worstVE, err := envelope.full.serviceResources()
	if err != nil {
		return SolverResultV2{}, err
	}
	worstSaving, err := envelope.full.savingCost()
	if err != nil {
		return SolverResultV2{}, err
	}
	worstDrivers, err := newDriverDecisionModel(envelope.full, worstSaving)
	if err != nil {
		return SolverResultV2{}, err
	}
	worstWeather, err := newWeatherCostModel(envelope.full)
	if err != nil {
		return SolverResultV2{}, err
	}
	riskActive := hardUncertaintyActive(input, envelope.full)
	result := SolverResultV2{
		ContractVersion:   SolverContractVersionV2,
		InputHash:         inputHash,
		ResolvedInputs:    input.resolvedScalarInputs(),
		StintPaceCost:     paceCost.source,
		FuelWeightCost:    fuelWeight.source,
		SavingCost:        saving.source,
		CompoundPaceCost:  compoundPace.sources(),
		DriverProfileCost: drivers.sources(),
		WeatherBucketCost: weatherCost.sources(),
		WeatherTimeline:   append([]WeatherLapCondition(nil), weatherCost.timeline...),
		Binding:           binding,
		Candidates:        []DecisionVector{},
		CandidateDetails:  []SolverCandidateV2{},
		Reasons:           []SolverReason{},
		Assumptions:       []SolverReason{fuelWeight.assumption(), saving.assumption()},
		Sensitivities:     []SolverSensitivity{},
		ComputeStats:      ComputeStats{Degradation: budgetDegradation},
	}
	if budgetDegradation.Applied {
		result.Assumptions = append(result.Assumptions, SolverReason{
			Code:    "compute_budget_degraded",
			Message: "el presupuesto p95 redujo de forma determinista los niveles de servicio evaluados",
		})
	}
	for _, source := range result.CompoundPaceCost {
		result.Assumptions = append(result.Assumptions, SolverReason{
			Code:    "compound_pace_source",
			Message: fmt.Sprintf("el compuesto %s usa parametros %s de %s", source.Compound, source.Provenance.Kind, source.Provenance.SourceID),
		})
	}

	initialChoices := tyreModel.initialChoices()
	initial := searchNode{
		fuel: fuel.capacity, ve: ve.capacity, worstFuel: worstFuel.capacity, worstVE: worstVE.capacity, worstFeasible: true,
		decision: DecisionVector{PitStops: []PitStopDecision{}, Stints: []StintDecision{}},
	}
	byLap := make([][]searchNode, input.RaceLaps+1)
	for _, choice := range initialChoices {
		node := initial
		node.tyre = choice
		byLap[0] = append(byLap[0], node)
	}
	completed := make([]searchNode, 0, maxRankedCandidates)
	completedWorstFeasible := make([]searchNode, 0, maxRankedCandidates)
	evaluated := 0
	pruned := 0
	budgetExhausted := false
	if len(initialChoices) == 0 {
		result.Reasons = append(result.Reasons, SolverReason{Code: "tyre_inventory_insufficient", Message: "el inventario fisico no puede formar ningun juego declarado"})
		result.addRejected(initial, input, "tyre_inventory_insufficient", "ningun compuesto declarado dispone de cuatro neumaticos compatibles")
		duration := time.Since(started)
		result.ComputeStats = ComputeStats{
			Duration:     duration,
			WithinBudget: duration <= time.Duration(input.Budget.P95Millis)*time.Millisecond,
			Degradation:  budgetDegradation,
		}
		return result, nil
	}

	for lap := int64(0); lap < input.RaceLaps && !budgetExhausted; lap++ {
		for _, node := range byLap[lap] {
			for _, driver := range drivers.order {
				for _, savingLevel := range saving.levels {
					worstDriver, _ := driverByID(worstDrivers, driver.id)
					worstSavingLevel, _ := savingByID(worstSaving, savingLevel.level)
					maxLaps := weatherCost.runnableLaps(input.RaceLaps-lap, node, fuel, ve, input.tyreLifeLaps(), driver, savingLevel)
					if maxLaps < 1 {
						result.addRejected(node, input, "resource_exhausted", "los recursos disponibles no cubren otra vuelta")
						continue
					}
					for stintLaps := int64(1); stintLaps <= maxLaps; stintLaps++ {
						evaluated++
						if input.Budget.MaxCandidates > 0 && evaluated > input.Budget.MaxCandidates {
							budgetExhausted = true
							break
						}
						if allowed, condition := weatherCost.compoundAllowed(node.tyre.compound, lap+1, stintLaps); !allowed {
							result.addRejected(node, input, "compound_not_allowed_for_climate", fmt.Sprintf("el compuesto %s no esta permitido en %s desde la vuelta %d", node.tyre.compound, condition.Bucket, condition.Lap))
							continue
						}
						afterStint, err := appendStint(node, stintLaps, input, lapCosts, savingLevel, driver)
						if err != nil {
							return SolverResultV2{}, err
						}
						afterStint.lap = lap + stintLaps
						fuelUsed, veUsed, err := weatherCost.usage(lap+1, stintLaps, driver, savingLevel)
						if err != nil {
							return SolverResultV2{}, solveError(ErrorInvalidInput, "weather", err.Error())
						}
						afterStint.fuel -= fuelUsed
						afterStint.ve -= veUsed
						worstFuelUsed, worstVEUsed, err := worstWeather.usage(lap+1, stintLaps, worstDriver, worstSavingLevel)
						if err != nil {
							return SolverResultV2{}, solveError(ErrorInvalidInput, "worstCase", err.Error())
						}
						afterStint.worstFuel -= worstFuelUsed
						afterStint.worstVE -= worstVEUsed
						if afterStint.worstFuel < 0 || afterStint.worstVE < 0 {
							afterStint.worstFeasible = false
						}
						applyWorstTyreStint(&afterStint, node, stintLaps, envelope.full.tyreLifeLaps())
						if allowed, code, message := input.applyDriverConstraints(node, &afterStint, driver); !allowed {
							result.addRejected(afterStint, input, code, message)
							continue
						}
						if afterStint.lap == input.RaceLaps {
							if allowed, code, message := input.completedAllowed(afterStint, tyreModel); allowed {
								completed = insertRanked(completed, afterStint, input.Formation.Seconds.Value)
								if afterStint.worstFeasible {
									completedWorstFeasible = insertRanked(completedWorstFeasible, afterStint, input.Formation.Seconds.Value)
								}
							} else {
								result.addRejected(afterStint, input, code, message)
							}
							continue
						}
						if index, closed := input.firstClosedWindow(afterStint.lap, afterStint.windowMask); closed {
							window := input.EventRules.RequiredWindows[index]
							result.addRejected(afterStint, input, "required_pit_window", fmt.Sprintf("ninguna parada ocurrio en la ventana obligatoria [%d,%d]", window.FromLap, window.ToLap))
							continue
						}
						if input.EventRules.MaxPitStops != nil && len(afterStint.decision.PitStops) >= *input.EventRules.MaxPitStops {
							result.addRejected(afterStint, input, "maximum_pit_stops", "el maximo de paradas impide anadir el servicio necesario")
							continue
						}

						fuelAmounts := serviceAmounts(afterStint.fuel, fuel)
						veAmounts := serviceAmounts(afterStint.ve, ve)
						for _, tyreOption := range tyreModel.nextChoices(afterStint.tyre) {
							for _, fuelAmount := range fuelAmounts {
								for _, veAmount := range veAmounts {
									evaluated++
									if input.Budget.MaxCandidates > 0 && evaluated > input.Budget.MaxCandidates {
										budgetExhausted = true
										break
									}
									next, err := appendPit(afterStint, fuelAmount, veAmount, tyreOption, input)
									if err != nil {
										return SolverResultV2{}, err
									}
									next.fuel += fuelAmount
									next.ve += veAmount
									next.worstFuel += fuelAmount
									next.worstVE += veAmount
									if tyreOption.change && !compoundPace.enabled {
										next.worstTyreAge = 0
									}
									var prunedNow int
									byLap[next.lap], prunedNow = insertNondominated(
										byLap[next.lap],
										next,
										input.Formation.Seconds.Value,
										input.hasStopCountRules(),
										fuelWeight.secondsPerLiter > 0,
										tyreModel.enabled,
										len(input.EventRules.RequiredWindows) > 0,
										len(input.EventRules.MandatoryCompounds) > 0,
										drivers.enabled,
										riskActive,
									)
									pruned += prunedNow
								}
								if budgetExhausted {
									break
								}
							}
							if budgetExhausted {
								break
							}
						}
						if budgetExhausted {
							break
						}
					}
					if budgetExhausted {
						break
					}
				}
				if budgetExhausted {
					break
				}
			}
			if budgetExhausted {
				break
			}
		}
	}

	duration := time.Since(started)
	result.ComputeStats = ComputeStats{
		EvaluatedCandidates: evaluated,
		PrunedStates:        pruned,
		Duration:            duration,
		WithinBudget:        !budgetExhausted && duration <= time.Duration(input.Budget.P95Millis)*time.Millisecond,
		Degradation:         budgetDegradation,
	}
	if budgetExhausted {
		result.Reasons = append(result.Reasons, SolverReason{Code: "candidate_budget_exhausted", Message: "el limite de candidatos termino la busqueda antes de demostrar el optimo"})
		result.addRejected(initial, input, "candidate_budget_exhausted", "la busqueda no cubrio todo el espacio de decision")
		return result, nil
	}
	if len(completed) == 0 {
		result.Reasons = append(result.Reasons, SolverReason{Code: "no_feasible_plan", Message: "ninguna combinacion discretizada de paradas y servicios completa la carrera"})
		if len(result.CandidateDetails) == 0 {
			result.addRejected(initial, input, "no_feasible_plan", "los recursos no permiten completar la carrera")
		}
		return result, nil
	}

	best := completed[0]
	rankedCompleted := mergeRankedCandidates(completed, completedWorstFeasible, input.Formation.Seconds.Value)
	result.Feasible = true
	result.Best = cloneDecision(best.decision)
	result.SavingPlan = savingPlanForDecision(result.Best)
	result.Expected = evaluationForNode(best, input.Formation.Seconds.Value)
	result.WorstCase = result.Expected
	perturbedDegradation := 0.0
	baseDegradation := 0.0
	parameter := "degradationPerLapSeconds"
	if compoundPace.enabled {
		baseDegradation = compoundPace.perturbedDegradation(best.decision, 0)
		perturbedDegradation = compoundPace.perturbedDegradation(best.decision, defaultCurveSensitivity)
		parameter = "compoundPaceCurve"
		result.Sensitivities = append(result.Sensitivities, compoundDeltaSensitivities(result.Best)...)
	} else {
		baseDegradation = decisionDegradation(best.decision, paceCost)
		perturbed := paceCost.perturbed(defaultCurveSensitivity)
		perturbedDegradation = decisionDegradation(best.decision, perturbed)
		if paceCost.source.Model == StintPaceModelCombinedCurve {
			parameter = "combinedStintPaceCurve"
		}
	}
	// La sensibilidad perturba la curva base, no elimina el delta de curva que
	// el bucket climatico selecciono vuelta a vuelta.
	perturbedDegradation += best.degradation - baseDegradation
	impact := perturbedDegradation - best.degradation
	result.WorstCase.DegradationSeconds = perturbedDegradation
	result.WorstCase.TotalSeconds += impact
	result.Sensitivities = append(result.Sensitivities, SolverSensitivity{
		Parameter: parameter, Delta: defaultCurveSensitivity, ImpactSeconds: impact,
	})
	result.Sensitivities = append(result.Sensitivities, drivers.sensitivities(result.Best)...)
	if fuelWeight.source.Presence == sp.PresenceValid {
		fuelWeightImpact := best.fuelWeight * defaultFuelWeightSensitivity
		result.WorstCase.FuelWeightSeconds += fuelWeightImpact
		result.WorstCase.TotalSeconds += fuelWeightImpact
		result.Sensitivities = append(result.Sensitivities, SolverSensitivity{
			Parameter:     "fuelWeightSecondsPerLiter",
			Delta:         defaultFuelWeightSensitivity,
			ImpactSeconds: fuelWeightImpact,
		})
	}
	if saving.source.Presence == sp.PresenceValid {
		savingImpact := best.saving * defaultSavingCostSensitivity
		result.WorstCase.SavingSeconds += savingImpact
		result.WorstCase.TotalSeconds += savingImpact
		result.Sensitivities = append(result.Sensitivities, SolverSensitivity{
			Parameter: "savingTimeCostPerLap", Delta: defaultSavingCostSensitivity, ImpactSeconds: savingImpact,
		})
	}
	feasibleDetails := make([]SolverCandidateV2, 0, len(rankedCompleted))
	for index, candidate := range rankedCompleted {
		decision := cloneDecision(candidate.decision)
		result.Candidates = append(result.Candidates, decision)
		reason := SolverReason{Code: "ranked_feasible", Message: fmt.Sprintf("candidato factible en posicion %d", index+1)}
		if index == 0 {
			reason = SolverReason{Code: "optimal_after_dominance_pruning", Message: "optimo exacto tras podar solo estados dominados"}
			if len(rankedCompleted) > 1 && compareTotalSeconds(candidate.total(input.Formation.Seconds.Value), rankedCompleted[1].total(input.Formation.Seconds.Value)) == 0 {
				reason = SolverReason{
					Code:    "optimal_after_time_tie_break",
					Message: "empate temporal dentro de tolerancia; ordenado por menos paradas, vueltas de parada, cantidades Fuel/VE e identidad canonica del plan",
				}
			}
		}
		expected := evaluationForNode(candidate, input.Formation.Seconds.Value)
		worst, worstFeasible, risks, err := evaluateCandidateEnvelope(envelope, decision, expected)
		if err != nil {
			return SolverResultV2{}, err
		}
		if len(risks) > 0 {
			reason = SolverReason{Code: "worst_case_hard_risk", Message: riskSummary(risks)}
		}
		feasibleDetails = append(feasibleDetails, SolverCandidateV2{
			Decision: decision, Evaluation: expected, WorstCase: worst,
			Feasible: true, WorstCaseFeasible: worstFeasible, Risks: risks,
			Reasons: []SolverReason{reason},
		})
	}
	result.Variants = deriveVariants(feasibleDetails)
	if fast, ok := variantByKind(result.Variants, SolverVariantFast); ok {
		result.WorstCase = fast.WorstCase
		result.Sensitivities = append(result.Sensitivities,
			consumptionSensitivities(input, fast.Expected, fast.WorstCase, fast.WorstCaseFeasible)...)
	}
	if sensitivity, ok := rainChanceSensitivity(input, result.Best, result.Expected); ok {
		result.Sensitivities = append(result.Sensitivities, sensitivity)
	}
	result.CandidateDetails = append(feasibleDetails, result.CandidateDetails...)
	return result, nil
}

func (input SolverInputV2) stopCountAllowed(stops int) (bool, string, string) {
	if input.EventRules.MinPitStops != nil && stops < *input.EventRules.MinPitStops {
		return false, "minimum_pit_stops", fmt.Sprintf("el plan hace %d paradas y el evento exige al menos %d", stops, *input.EventRules.MinPitStops)
	}
	if input.EventRules.MaxPitStops != nil && stops > *input.EventRules.MaxPitStops {
		return false, "maximum_pit_stops", fmt.Sprintf("el plan hace %d paradas y el evento permite como maximo %d", stops, *input.EventRules.MaxPitStops)
	}
	return true, "", ""
}

func (input SolverInputV2) completedAllowed(node searchNode, tyreModel tyreDecisionModel) (bool, string, string) {
	if allowed, code, message := input.stopCountAllowed(len(node.decision.PitStops)); !allowed {
		return false, code, message
	}
	if node.windowMask != input.fullWindowMask() {
		for index, window := range input.EventRules.RequiredWindows {
			if node.windowMask&(uint64(1)<<index) == 0 {
				return false, "required_pit_window", fmt.Sprintf("ninguna parada ocurrio en la ventana obligatoria [%d,%d]", window.FromLap, window.ToLap)
			}
		}
	}
	mandatory := tyreModel.mandatoryMask(input.EventRules.MandatoryCompounds)
	if node.compoundMask&mandatory != mandatory {
		for _, compound := range input.EventRules.MandatoryCompounds {
			if node.compoundMask&tyreModel.compoundBit(compound) == 0 {
				return false, "mandatory_compound", fmt.Sprintf("el plan no usa el compuesto obligatorio %s", compound)
			}
		}
	}
	for _, driverID := range input.sortedDriverLimitIDs() {
		limit := input.EventRules.DriverLimits[driverID]
		if limit.MinLaps != nil && node.driverUsage[driverID].laps < *limit.MinLaps {
			return false, "driver_minimum_laps", fmt.Sprintf("el piloto %s hace %d vueltas y debe hacer al menos %d", driverID, node.driverUsage[driverID].laps, *limit.MinLaps)
		}
	}
	return true, "", ""
}

func (input SolverInputV2) hasStopCountRules() bool {
	return input.EventRules.MinPitStops != nil || input.EventRules.MaxPitStops != nil
}

func (input SolverInputV2) serviceResources() (serviceResource, serviceResource, error) {
	fuelStep := input.Discretization.FuelLiters
	if fuelStep == 0 {
		fuelStep = defaultFuelStep
	}
	veStep := input.Discretization.VEPercent
	if veStep == 0 {
		veStep = defaultVEStep
	}
	allowProfileConsumption := len(input.DriverProfiles) > 0
	fuel, err := newServiceResource("fuel", input.FuelCapacityLiters.Value, input.resourcePerLap(ResourceFuel), fuelStep, allowProfileConsumption)
	if err != nil {
		return serviceResource{}, serviceResource{}, err
	}
	ve, err := newServiceResource("virtualEnergy", input.VECapacityPercent.Value, input.resourcePerLap(ResourceVirtualEnergy), veStep, allowProfileConsumption)
	if err != nil {
		return serviceResource{}, serviceResource{}, err
	}
	return fuel, ve, nil
}

func (resource serviceResource) withPerLap(perLap int64) serviceResource {
	resource.perLap = perLap
	return resource
}

func newServiceResource(field string, capacity, perLap, step float64, allowZeroPerLap bool) (serviceResource, error) {
	if capacity == 0 && perLap == 0 {
		return serviceResource{}, nil
	}
	capacityUnits, err := serviceUnits(field+".capacity", capacity)
	if err != nil {
		return serviceResource{}, err
	}
	perLapUnits, err := serviceUnits(field+".perLap", perLap)
	if err != nil {
		return serviceResource{}, err
	}
	stepUnits, err := serviceUnits(field+".step", step)
	if err != nil {
		return serviceResource{}, err
	}
	if capacityUnits <= 0 || (!allowZeroPerLap && perLapUnits <= 0) || stepUnits <= 0 {
		return serviceResource{}, solveError(ErrorInvalidInput, field, "capacity, consumption and step must be positive")
	}
	if capacityUnits/stepUnits > maxServiceLevels {
		return serviceResource{}, solveError(ErrorInvalidInput, field+".step", "discretization exceeds 200 service levels")
	}
	return serviceResource{capacity: capacityUnits, perLap: perLapUnits, step: stepUnits}, nil
}

func serviceUnits(field string, value float64) (int64, error) {
	scaled := value * float64(serviceScale)
	if math.IsNaN(scaled) || math.IsInf(scaled, 0) || scaled < 0 || scaled > float64(math.MaxInt64) {
		return 0, solveError(ErrorInvalidInput, field, "value is outside the supported service precision")
	}
	return int64(math.Round(scaled)), nil
}

func runnableLaps(remaining int64, node searchNode, fuel, ve serviceResource, tyreLife int64) int64 {
	limit := remaining
	if fuel.perLap > 0 && node.fuel/fuel.perLap < limit {
		limit = node.fuel / fuel.perLap
	}
	if ve.perLap > 0 && node.ve/ve.perLap < limit {
		limit = node.ve / ve.perLap
	}
	if tyreLife > 0 {
		tyreAge := node.tyreAge
		if node.tyre.compound.Valid() {
			tyreAge = fitmentAge(node.tyre.fitment, node.tyreUsage)
		}
		tyreRemaining := tyreLife - tyreAge
		if tyreRemaining < limit {
			limit = tyreRemaining
		}
	}
	return limit
}

func serviceAmounts(current int64, resource serviceResource) []int64 {
	if resource.capacity == 0 {
		return []int64{0}
	}
	room := resource.capacity - current
	result := make([]int64, 0, room/resource.step+1)
	for amount := int64(0); amount <= room; amount += resource.step {
		result = append(result, amount)
	}
	return result
}

func appendStint(node searchNode, laps int64, input SolverInputV2, costs lapCostModel, saving savingLevelCost, driver driverCost) (searchNode, error) {
	next := cloneNode(node)
	stint, compoundSeconds, err := costs.stint(node.tyre.compound, laps, driver.baseLap)
	if err != nil {
		return searchNode{}, err
	}
	next.green += stint.GreenSeconds
	next.degradation += stint.DegradationSeconds
	next.compound += compoundSeconds
	weatherSeconds, weatherDegradation := costs.weather.weatherAdjustment(costs.compounds, node.tyre.compound, node.lap+1, laps)
	next.weather += weatherSeconds
	next.degradation += weatherDegradation
	if costs.compounds.enabled {
		if next.tyreUsage == nil {
			next.tyreUsage = make(map[tyres.TyreID]int64, 4)
		}
		for _, id := range fitmentIDs(node.tyre.fitment) {
			next.tyreUsage[id] += laps
		}
	} else {
		next.tyreAge += laps
	}
	if costs.weather.enabled {
		fuelLevel := node.fuel
		for offset := int64(0); offset < laps; offset++ {
			next.fuelWeight += serviceValue(fuelLevel) * costs.fuelWeight.secondsPerLiter
			fuelLevel -= costs.weather.resourcePerLap(ResourceFuel, node.lap+offset+1, driver.fuelPerLap) - saving.fuelSavedPerLap
		}
	} else {
		effectiveFuelPerLap := driver.fuelPerLap - saving.fuelSavedPerLap
		next.fuelWeight += costs.fuelWeight.stint(node.fuel, effectiveFuelPerLap, laps)
	}
	savingSeconds := saving.timeCostPerLap * float64(laps)
	next.saving += savingSeconds
	decision := StintDecision{
		Index: len(next.decision.Stints), Laps: laps, SavingLevel: saving.level,
		Driver:          driver.id,
		FuelSavedPerLap: serviceValue(saving.fuelSavedPerLap), VESavedPerLap: serviceValue(saving.veSavedPerLap),
		TimeCostPerLap: saving.timeCostPerLap, SavingCostSeconds: savingSeconds,
	}
	if costs.compounds.enabled {
		decision.Compound = node.tyre.compound
		decision.TyreFitment = fitmentPointer(node.tyre.fitment)
		next.compoundMask |= costs.compoundsBit(node.tyre.compound)
	}
	next.decision.Stints = append(next.decision.Stints, decision)
	if len(next.decision.PitStops) > 0 {
		next.decision.PitStops[len(next.decision.PitStops)-1].SavingLevel = saving.level
		next.decision.PitStops[len(next.decision.PitStops)-1].Driver = driver.id
	}
	return next, nil
}

func (costs lapCostModel) stint(compound TyreCompound, laps int64, baseLapSeconds float64) (StintPlan, float64, error) {
	if costs.compounds.enabled {
		return costs.compounds.stint(compound, laps, baseLapSeconds)
	}
	stint, err := costs.pace.stint(laps, baseLapSeconds)
	return stint, 0, err
}

func (costs lapCostModel) compoundsBit(compound TyreCompound) uint64 {
	for index, configured := range costs.compounds.order {
		if configured == compound {
			return uint64(1) << index
		}
	}
	return 0
}

func decisionDegradation(decision DecisionVector, paceCost stintPaceCost) float64 {
	total := 0.0
	for _, stint := range decision.Stints {
		if int64(len(paceCost.cumulative)) > stint.Laps {
			total += paceCost.cumulative[stint.Laps]
			continue
		}
		for lap := int64(1); lap <= stint.Laps; lap++ {
			total += paceCost.deltaAt(lap)
		}
	}
	return total
}

func appendPit(node searchNode, fuelAmount, veAmount int64, tyreOption pitTyreChoice, input SolverInputV2) (searchNode, error) {
	next := cloneNode(node)
	pitInput, err := solverPitInputWithTyres(input, fuelAmount, veAmount, tyreOption.change)
	if err != nil {
		return searchNode{}, err
	}
	breakdown, err := manual.CalculatePitStop(pitInput)
	if err != nil {
		return searchNode{}, solveError(ErrorInvalidInput, "pitCost", err.Error())
	}
	next.pit += breakdown.TotalSeconds.Value()
	next.tyre = tyreOption.choice
	if tyreOption.change {
		next.tyreAge = 0
	}
	next.windowMask |= input.windowMaskAtLap(node.lap)
	inputCopy, breakdownCopy := pitInput, breakdown
	decision := PitStopDecision{
		Lap: node.lap, FuelLiters: serviceValue(fuelAmount), VEPercent: serviceValue(veAmount),
		SavingLevel: SavingNone, ServiceMode: input.resolvedPitCost().ServiceMode,
		PitCostInput: &inputCopy, PitBreakdown: &breakdownCopy, ChangeTyres: tyreOption.change,
	}
	if input.TyreInventory != nil {
		decision.Compound = tyreOption.choice.compound
		decision.TyreFitment = fitmentPointer(tyreOption.choice.fitment)
	}
	next.decision.PitStops = append(next.decision.PitStops, decision)
	return next, nil
}

func solverPitInput(input SolverInputV2, fuelAmount, veAmount int64) (manual.PitStopInput, error) {
	return solverPitInputWithTyres(input, fuelAmount, veAmount, true)
}

func solverPitInputWithTyres(input SolverInputV2, fuelAmount, veAmount int64, changeTyres bool) (manual.PitStopInput, error) {
	pitCost := input.resolvedPitCost()
	evidence := manual.Evidence{
		Provenance: contract.Provenance{Kind: contract.ProvenanceDerived, SourceID: "strategy.solver.v2"},
		Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "deterministic candidate service cost"},
	}
	sourced := func(value float64) (manual.Sourced[contract.DurationSeconds], error) {
		duration, err := contract.NewDurationSeconds(value)
		if err != nil {
			return manual.Sourced[contract.DurationSeconds]{}, err
		}
		return manual.Sourced[contract.DurationSeconds]{Value: duration, Evidence: evidence}, nil
	}
	zero, err := sourced(0)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	transit, err := sourced(pitCost.TransitSeconds.Value)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	refuel, err := sourced(serviceValue(fuelAmount) / pitCost.RefuelRateLPerS.Value)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	virtualEnergy, err := sourced(serviceValue(veAmount) / pitCost.VERatePPerS.Value)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	tyreSeconds := 0.0
	if changeTyres {
		tyreSeconds = pitCost.TyreSeconds.Value
	}
	tyres, err := sourced(tyreSeconds)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	return manual.PitStopInput{
		Entry: zero, Transit: transit, Exit: zero, Refuel: refuel, VirtualEnergy: &virtualEnergy, Tyres: tyres,
		ServiceMode: pitCost.ServiceMode, ModeSelection: evidence,
	}, nil
}

func serviceValue(units int64) float64 { return float64(units) / float64(serviceScale) }

func insertNondominated(
	nodes []searchNode,
	candidate searchNode,
	formation float64,
	stopRulesActive bool,
	fuelWeightActive bool,
	tyresActive bool,
	windowsActive bool,
	mandatoryCompoundsActive bool,
	driversActive bool,
	riskActive bool,
) ([]searchNode, int) {
	for _, existing := range nodes {
		if dominates(existing, candidate, formation, stopRulesActive, fuelWeightActive, tyresActive, windowsActive, mandatoryCompoundsActive, driversActive, riskActive) {
			return nodes, 1
		}
	}
	kept := nodes[:0]
	pruned := 0
	for _, existing := range nodes {
		if !dominates(candidate, existing, formation, stopRulesActive, fuelWeightActive, tyresActive, windowsActive, mandatoryCompoundsActive, driversActive, riskActive) {
			kept = append(kept, existing)
		} else {
			pruned++
		}
	}
	return append(kept, candidate), pruned
}

func dominates(
	left, right searchNode,
	formation float64,
	stopRulesActive, fuelWeightActive, tyresActive, windowsActive, mandatoryCompoundsActive, driversActive, riskActive bool,
) bool {
	leftStops, rightStops := len(left.decision.PitStops), len(right.decision.PitStops)
	if stopRulesActive && leftStops != rightStops {
		return false
	}
	if !stopRulesActive && leftStops > rightStops {
		return false
	}
	if fuelWeightActive && left.fuel != right.fuel {
		return false
	}
	if tyresActive && (left.tyre != right.tyre || !sameTyreUsage(left.tyreUsage, right.tyreUsage)) {
		return false
	}
	if windowsActive && left.windowMask != right.windowMask {
		return false
	}
	if mandatoryCompoundsActive && left.compoundMask != right.compoundMask {
		return false
	}
	if driversActive && (left.currentDriver != right.currentDriver || left.continuousDriverSeconds != right.continuousDriverSeconds || !sameDriverUsage(left.driverUsage, right.driverUsage)) {
		return false
	}
	if riskActive {
		if left.worstFeasible != right.worstFeasible {
			if !left.worstFeasible {
				return false
			}
		}
		if left.worstFeasible && (left.worstFuel < right.worstFuel || left.worstVE < right.worstVE || left.worstTyreAge > right.worstTyreAge || !sameTyreUsage(left.worstTyreUsage, right.worstTyreUsage)) {
			return false
		}
	}
	return left.fuel >= right.fuel && left.ve >= right.ve && compareNodes(left, right, formation) <= 0
}

func betterNode(left, right searchNode, formation float64) bool {
	return compareNodes(left, right, formation) < 0
}

func compareNodes(left, right searchNode, formation float64) int {
	leftTotal, rightTotal := left.total(formation), right.total(formation)
	if order := compareTotalSeconds(leftTotal, rightTotal); order != 0 {
		return order
	}
	if len(left.decision.PitStops) != len(right.decision.PitStops) {
		if len(left.decision.PitStops) < len(right.decision.PitStops) {
			return -1
		}
		return 1
	}
	for index := range left.decision.PitStops {
		l, r := left.decision.PitStops[index], right.decision.PitStops[index]
		if l.Lap != r.Lap {
			if l.Lap < r.Lap {
				return -1
			}
			return 1
		}
		if l.FuelLiters != r.FuelLiters {
			if l.FuelLiters < r.FuelLiters {
				return -1
			}
			return 1
		}
		if l.VEPercent != r.VEPercent {
			if l.VEPercent < r.VEPercent {
				return -1
			}
			return 1
		}
	}
	leftKey, rightKey := decisionKey(left.decision), decisionKey(right.decision)
	if leftKey < rightKey {
		return -1
	}
	if leftKey > rightKey {
		return 1
	}
	return 0
}

func compareTotalSeconds(left, right float64) int {
	scale := math.Max(1, math.Max(math.Abs(left), math.Abs(right)))
	tolerance := timeTieRelative * scale
	if left < right-tolerance {
		return -1
	}
	if left > right+tolerance {
		return 1
	}
	return 0
}

func insertRanked(nodes []searchNode, candidate searchNode, formation float64) []searchNode {
	index := len(nodes)
	for current, existing := range nodes {
		if betterNode(candidate, existing, formation) {
			index = current
			break
		}
	}
	nodes = append(nodes, searchNode{})
	copy(nodes[index+1:], nodes[index:])
	nodes[index] = candidate
	if len(nodes) > maxRankedCandidates {
		nodes = nodes[:maxRankedCandidates]
	}
	return nodes
}

func mergeRankedCandidates(expected, worstFeasible []searchNode, formation float64) []searchNode {
	result := append([]searchNode(nil), expected...)
	seen := make(map[string]bool, len(result)+len(worstFeasible))
	for _, node := range result {
		seen[decisionKey(node.decision)] = true
	}
	for _, node := range worstFeasible {
		key := decisionKey(node.decision)
		if seen[key] {
			continue
		}
		seen[key] = true
		index := len(result)
		for current, existing := range result {
			if betterNode(node, existing, formation) {
				index = current
				break
			}
		}
		result = append(result, searchNode{})
		copy(result[index+1:], result[index:])
		result[index] = node
	}
	return result
}

func cloneNode(node searchNode) searchNode {
	clone := node
	clone.decision = cloneDecision(node.decision)
	if node.tyreUsage != nil {
		clone.tyreUsage = make(map[tyres.TyreID]int64, len(node.tyreUsage))
		for id, laps := range node.tyreUsage {
			clone.tyreUsage[id] = laps
		}
	}
	if node.worstTyreUsage != nil {
		clone.worstTyreUsage = make(map[tyres.TyreID]int64, len(node.worstTyreUsage))
		for id, laps := range node.worstTyreUsage {
			clone.worstTyreUsage[id] = laps
		}
	}
	if node.driverUsage != nil {
		clone.driverUsage = make(map[string]driverUsage, len(node.driverUsage))
		for id, usage := range node.driverUsage {
			clone.driverUsage[id] = usage
		}
	}
	return clone
}

func fitmentAge(fitment tyres.Fitment, usage map[tyres.TyreID]int64) int64 {
	age := int64(0)
	for _, id := range fitmentIDs(fitment) {
		if usage[id] > age {
			age = usage[id]
		}
	}
	return age
}

func sameTyreUsage(left, right map[tyres.TyreID]int64) bool {
	if len(left) != len(right) {
		return false
	}
	for id, laps := range left {
		if right[id] != laps {
			return false
		}
	}
	return true
}

func cloneDecision(decision DecisionVector) DecisionVector {
	clone := DecisionVector{
		PitStops: append([]PitStopDecision(nil), decision.PitStops...),
		Stints:   append([]StintDecision(nil), decision.Stints...),
	}
	return clone
}

func evaluationForNode(node searchNode, formation float64) ScenarioEvaluation {
	return ScenarioEvaluation{
		TotalSeconds: node.total(formation), GreenSeconds: node.green, DegradationSeconds: node.degradation,
		CompoundSeconds: node.compound, FuelWeightSeconds: node.fuelWeight, SavingSeconds: node.saving,
		WeatherSeconds: node.weather,
		PitSeconds:     node.pit, FormationSeconds: formation,
	}
}

func (result *SolverResultV2) addRejected(node searchNode, input SolverInputV2, code, message string) {
	if len(result.CandidateDetails) >= maxRejectedDetails {
		return
	}
	result.CandidateDetails = append(result.CandidateDetails, SolverCandidateV2{
		Decision: cloneDecision(node.decision), Evaluation: evaluationForNode(node, input.Formation.Seconds.Value), Feasible: false,
		Reasons: []SolverReason{{Code: code, Message: message}},
	})
}

func (input SolverInputV2) bindingConstraint() BindingConstraint {
	type limit struct {
		kind string
		laps int64
	}
	limits := make([]limit, 0, 3)
	if perLap := input.resourcePerLap(ResourceFuel); perLap > 0 {
		limits = append(limits, limit{kind: string(ResourceFuel), laps: int64(math.Floor(input.FuelCapacityLiters.Value / perLap))})
	}
	if perLap := input.resourcePerLap(ResourceVirtualEnergy); perLap > 0 {
		limits = append(limits, limit{kind: string(ResourceVirtualEnergy), laps: int64(math.Floor(input.VECapacityPercent.Value / perLap))})
	}
	if input.tyreLifeLaps() > 0 {
		limits = append(limits, limit{kind: string(ResourceTyreLife), laps: input.tyreLifeLaps()})
	}
	if len(limits) == 0 {
		return BindingConstraint{Kind: string(ResourceNone), Message: "ningun recurso limita la longitud del stint"}
	}
	best := limits[0]
	for _, current := range limits[1:] {
		if current.laps < best.laps {
			best = current
		}
	}
	return BindingConstraint{Kind: best.kind, Laps: best.laps, Message: fmt.Sprintf("%s limita el stint a %d vueltas", best.kind, best.laps)}
}

func hashSolverInputV2(input SolverInputV2) (string, error) {
	document, err := json.Marshal(input)
	if err != nil {
		return "", solveError(ErrorInvalidInput, "input", "cannot encode deterministic input hash")
	}
	digest := sha256.Sum256(document)
	return hex.EncodeToString(digest[:]), nil
}
