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
)

const (
	serviceScale        = int64(1_000_000)
	defaultFuelStep     = 1.0
	defaultVEStep       = 1.0
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
	lap         int64
	fuel        int64
	ve          int64
	green       float64
	degradation float64
	pit         float64
	decision    DecisionVector
}

func (node searchNode) total(formation float64) float64 {
	return formation + node.green + node.degradation + node.pit
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
	fuel, ve, err := input.serviceResources()
	if err != nil {
		return SolverResultV2{}, err
	}
	inputHash, err := hashSolverInputV2(input)
	if err != nil {
		return SolverResultV2{}, err
	}
	binding := input.bindingConstraint()
	paceCost, err := input.stintPaceCost()
	if err != nil {
		return SolverResultV2{}, solveError(ErrorInvalidInput, "combinedStintPaceCurve", err.Error())
	}
	result := SolverResultV2{
		ContractVersion:  SolverContractVersionV2,
		InputHash:        inputHash,
		StintPaceCost:    paceCost.source,
		Binding:          binding,
		Candidates:       []DecisionVector{},
		CandidateDetails: []SolverCandidateV2{},
		Reasons:          []SolverReason{},
		Sensitivities:    []SolverSensitivity{},
	}

	initial := searchNode{fuel: fuel.capacity, ve: ve.capacity, decision: DecisionVector{PitStops: []PitStopDecision{}, Stints: []StintDecision{}}}
	byLap := make([][]searchNode, input.RaceLaps+1)
	byLap[0] = []searchNode{initial}
	completed := make([]searchNode, 0, maxRankedCandidates)
	evaluated := 0
	budgetExhausted := false

	for lap := int64(0); lap < input.RaceLaps && !budgetExhausted; lap++ {
		for _, node := range byLap[lap] {
			maxLaps := runnableLaps(input.RaceLaps-lap, node, fuel, ve, input.TyreLifeLaps)
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
				afterStint, err := appendStint(node, stintLaps, input, paceCost)
				if err != nil {
					return SolverResultV2{}, err
				}
				afterStint.lap = lap + stintLaps
				afterStint.fuel -= fuel.perLap * stintLaps
				afterStint.ve -= ve.perLap * stintLaps
				if afterStint.lap == input.RaceLaps {
					if allowed, code, message := input.stopCountAllowed(len(afterStint.decision.PitStops)); allowed {
						completed = insertRanked(completed, afterStint, input.Formation.Seconds)
					} else {
						result.addRejected(afterStint, input, code, message)
					}
					continue
				}
				if input.EventRules.MaxPitStops != nil && len(afterStint.decision.PitStops) >= *input.EventRules.MaxPitStops {
					result.addRejected(afterStint, input, "maximum_pit_stops", "el maximo de paradas impide anadir el servicio necesario")
					continue
				}

				fuelAmounts := serviceAmounts(afterStint.fuel, fuel)
				veAmounts := serviceAmounts(afterStint.ve, ve)
				for _, fuelAmount := range fuelAmounts {
					for _, veAmount := range veAmounts {
						evaluated++
						if input.Budget.MaxCandidates > 0 && evaluated > input.Budget.MaxCandidates {
							budgetExhausted = true
							break
						}
						next, err := appendPit(afterStint, fuelAmount, veAmount, input)
						if err != nil {
							return SolverResultV2{}, err
						}
						next.fuel += fuelAmount
						next.ve += veAmount
						byLap[next.lap] = insertNondominated(byLap[next.lap], next, input.Formation.Seconds, input.hasStopCountRules())
					}
					if budgetExhausted {
						break
					}
				}
			}
		}
	}

	duration := time.Since(started)
	result.ComputeStats = ComputeStats{
		EvaluatedCandidates: evaluated,
		Duration:            duration,
		WithinBudget:        !budgetExhausted && duration <= time.Duration(input.Budget.P95Millis)*time.Millisecond,
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
	result.Feasible = true
	result.Best = cloneDecision(best.decision)
	result.Expected = evaluationForNode(best, input.Formation.Seconds)
	result.WorstCase = result.Expected
	perturbed := paceCost.perturbed(defaultCurveSensitivity)
	perturbedDegradation := decisionDegradation(best.decision, perturbed)
	impact := perturbedDegradation - best.degradation
	result.WorstCase.DegradationSeconds = perturbedDegradation
	result.WorstCase.TotalSeconds += impact
	parameter := "degradationPerLapSeconds"
	if paceCost.source.Model == StintPaceModelCombinedCurve {
		parameter = "combinedStintPaceCurve"
	}
	result.Sensitivities = append(result.Sensitivities, SolverSensitivity{
		Parameter: parameter, Delta: defaultCurveSensitivity, ImpactSeconds: impact,
	})
	feasibleDetails := make([]SolverCandidateV2, 0, len(completed))
	for index, candidate := range completed {
		decision := cloneDecision(candidate.decision)
		result.Candidates = append(result.Candidates, decision)
		reason := SolverReason{Code: "ranked_feasible", Message: fmt.Sprintf("candidato factible en posicion %d", index+1)}
		if index == 0 {
			reason = SolverReason{Code: "optimal_after_dominance_pruning", Message: "optimo exacto tras podar solo estados dominados"}
		}
		feasibleDetails = append(feasibleDetails, SolverCandidateV2{
			Decision: decision, Evaluation: evaluationForNode(candidate, input.Formation.Seconds), Feasible: true,
			Reasons: []SolverReason{reason},
		})
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
	fuel, err := newServiceResource("fuel", input.FuelCapacityLiters, input.resourcePerLap(ResourceFuel), fuelStep)
	if err != nil {
		return serviceResource{}, serviceResource{}, err
	}
	ve, err := newServiceResource("virtualEnergy", input.VECapacityPercent, input.resourcePerLap(ResourceVirtualEnergy), veStep)
	if err != nil {
		return serviceResource{}, serviceResource{}, err
	}
	return fuel, ve, nil
}

func newServiceResource(field string, capacity, perLap, step float64) (serviceResource, error) {
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
	if capacityUnits <= 0 || perLapUnits <= 0 || stepUnits <= 0 {
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
	if tyreLife > 0 && tyreLife < limit {
		limit = tyreLife
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

func appendStint(node searchNode, laps int64, input SolverInputV2, paceCost stintPaceCost) (searchNode, error) {
	next := cloneNode(node)
	stint, err := paceCost.stint(laps, input.BaseLapSeconds)
	if err != nil {
		return searchNode{}, err
	}
	next.green += stint.GreenSeconds
	next.degradation += stint.DegradationSeconds
	next.decision.Stints = append(next.decision.Stints, StintDecision{Index: len(next.decision.Stints), Laps: laps, SavingLevel: SavingNone})
	return next, nil
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

func appendPit(node searchNode, fuelAmount, veAmount int64, input SolverInputV2) (searchNode, error) {
	next := cloneNode(node)
	pitInput, err := solverPitInput(input, fuelAmount, veAmount)
	if err != nil {
		return searchNode{}, err
	}
	breakdown, err := manual.CalculatePitStop(pitInput)
	if err != nil {
		return searchNode{}, solveError(ErrorInvalidInput, "pitCost", err.Error())
	}
	next.pit += breakdown.TotalSeconds.Value()
	inputCopy, breakdownCopy := pitInput, breakdown
	next.decision.PitStops = append(next.decision.PitStops, PitStopDecision{
		Lap: node.lap, FuelLiters: serviceValue(fuelAmount), VEPercent: serviceValue(veAmount),
		SavingLevel: SavingNone, ServiceMode: input.PitCost.ServiceMode,
		PitCostInput: &inputCopy, PitBreakdown: &breakdownCopy,
	})
	return next, nil
}

func solverPitInput(input SolverInputV2, fuelAmount, veAmount int64) (manual.PitStopInput, error) {
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
	transit, err := sourced(input.PitCost.TransitSeconds)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	refuel, err := sourced(serviceValue(fuelAmount) / input.PitCost.RefuelRateLPerS)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	virtualEnergy, err := sourced(serviceValue(veAmount) / input.PitCost.VERatePPerS)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	tyres, err := sourced(input.PitCost.TyreSeconds)
	if err != nil {
		return manual.PitStopInput{}, err
	}
	return manual.PitStopInput{
		Entry: zero, Transit: transit, Exit: zero, Refuel: refuel, VirtualEnergy: &virtualEnergy, Tyres: tyres,
		ServiceMode: input.PitCost.ServiceMode, ModeSelection: evidence,
	}, nil
}

func serviceValue(units int64) float64 { return float64(units) / float64(serviceScale) }

func insertNondominated(nodes []searchNode, candidate searchNode, formation float64, stopRulesActive bool) []searchNode {
	for _, existing := range nodes {
		if dominates(existing, candidate, formation, stopRulesActive) {
			return nodes
		}
	}
	kept := nodes[:0]
	for _, existing := range nodes {
		if !dominates(candidate, existing, formation, stopRulesActive) {
			kept = append(kept, existing)
		}
	}
	return append(kept, candidate)
}

func dominates(left, right searchNode, formation float64, stopRulesActive bool) bool {
	leftStops, rightStops := len(left.decision.PitStops), len(right.decision.PitStops)
	if stopRulesActive && leftStops != rightStops {
		return false
	}
	if !stopRulesActive && leftStops > rightStops {
		return false
	}
	return left.fuel >= right.fuel && left.ve >= right.ve && left.total(formation) <= right.total(formation)
}

func betterNode(left, right searchNode, formation float64) bool {
	leftTotal, rightTotal := left.total(formation), right.total(formation)
	if leftTotal != rightTotal {
		return leftTotal < rightTotal
	}
	if len(left.decision.PitStops) != len(right.decision.PitStops) {
		return len(left.decision.PitStops) < len(right.decision.PitStops)
	}
	for index := range left.decision.PitStops {
		l, r := left.decision.PitStops[index], right.decision.PitStops[index]
		if l.Lap != r.Lap {
			return l.Lap < r.Lap
		}
		if l.FuelLiters != r.FuelLiters {
			return l.FuelLiters < r.FuelLiters
		}
		if l.VEPercent != r.VEPercent {
			return l.VEPercent < r.VEPercent
		}
	}
	return false
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

func cloneNode(node searchNode) searchNode {
	clone := node
	clone.decision = cloneDecision(node.decision)
	return clone
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
		PitSeconds: node.pit, FormationSeconds: formation,
	}
}

func (result *SolverResultV2) addRejected(node searchNode, input SolverInputV2, code, message string) {
	if len(result.CandidateDetails) >= maxRejectedDetails {
		return
	}
	result.CandidateDetails = append(result.CandidateDetails, SolverCandidateV2{
		Decision: cloneDecision(node.decision), Evaluation: evaluationForNode(node, input.Formation.Seconds), Feasible: false,
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
		limits = append(limits, limit{kind: string(ResourceFuel), laps: int64(math.Floor(input.FuelCapacityLiters / perLap))})
	}
	if perLap := input.resourcePerLap(ResourceVirtualEnergy); perLap > 0 {
		limits = append(limits, limit{kind: string(ResourceVirtualEnergy), laps: int64(math.Floor(input.VECapacityPercent / perLap))})
	}
	if input.TyreLifeLaps > 0 {
		limits = append(limits, limit{kind: string(ResourceTyreLife), laps: input.TyreLifeLaps})
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
