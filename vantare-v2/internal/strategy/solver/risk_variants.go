package solver

import (
	"fmt"
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	balancedWorstCaseSlowdown     = 0.05
	conservativeWorstCaseSlowdown = 0.02
	fastWorstCaseSlowdown         = 1.00
)

type uncertaintyEnvelope struct {
	full SolverInputV2
	cost SolverInputV2
}

func hardUncertaintyActive(expected, worst SolverInputV2) bool {
	return expected.resourcePerLap(ResourceFuel) != worst.resourcePerLap(ResourceFuel) ||
		expected.resourcePerLap(ResourceVirtualEnergy) != worst.resourcePerLap(ResourceVirtualEnergy) ||
		expected.TyreLifeLaps != worst.TyreLifeLaps
}

func applyWorstTyreStint(after *searchNode, before searchNode, laps, life int64) {
	if before.tyre.compound.Valid() {
		age := fitmentAge(before.tyre.fitment, before.worstTyreUsage)
		if life > 0 && age+laps > life {
			after.worstFeasible = false
		}
		if after.worstTyreUsage == nil {
			after.worstTyreUsage = make(map[tyres.TyreID]int64, 4)
		}
		for _, id := range fitmentIDs(before.tyre.fitment) {
			after.worstTyreUsage[id] += laps
		}
		return
	}
	if life > 0 && before.worstTyreAge+laps > life {
		after.worstFeasible = false
	}
	after.worstTyreAge += laps
}

// coherentWorstCase lleva simultaneamente cada rango disponible a su extremo
// desfavorable. Es un solo escenario determinista, no un producto cartesiano.
func coherentWorstCase(input SolverInputV2) uncertaintyEnvelope {
	full := cloneSolverInput(input)
	cost := cloneSolverInput(input)
	if full.Projection != nil {
		perturbProjection(full.Projection, true)
		perturbProjection(cost.Projection, false)
		if lower := full.Projection.TyreDegradation.LifeLapsRangeLower; lower != nil && *lower > 0 {
			full.TyreLifeLaps = int64(math.Floor(*lower))
		}
	}
	perturbDeclaredCosts(&full)
	perturbDeclaredCosts(&cost)
	return uncertaintyEnvelope{full: full, cost: cost}
}

func cloneSolverInput(input SolverInputV2) SolverInputV2 {
	clone := input
	clone.CompoundPace = append([]CompoundPaceParameter(nil), input.CompoundPace...)
	for index := range clone.CompoundPace {
		clone.CompoundPace[index].Curve = append([]CompoundPacePoint(nil), input.CompoundPace[index].Curve...)
	}
	clone.DriverProfiles = append([]DriverProfileInput(nil), input.DriverProfiles...)
	if input.SavingCost != nil {
		value := *input.SavingCost
		value.Levels = append([]SavingLevelOption(nil), input.SavingCost.Levels...)
		clone.SavingCost = &value
	}
	if input.FuelWeight != nil {
		value := *input.FuelWeight
		clone.FuelWeight = &value
	}
	if input.Projection != nil {
		projection := *input.Projection
		projection.CombinedStintPaceCurve.Points = append([]sp.PacePoint(nil), input.Projection.CombinedStintPaceCurve.Points...)
		projection.FuelConsumption.ByClimateBucket = cloneClimateValues(input.Projection.FuelConsumption.ByClimateBucket)
		projection.VirtualEnergyConsumption.ByClimateBucket = cloneClimateValues(input.Projection.VirtualEnergyConsumption.ByClimateBucket)
		clone.Projection = &projection
	}
	return clone
}

func cloneClimateValues(values map[sp.ClimateBucket]float64) map[sp.ClimateBucket]float64 {
	if values == nil {
		return nil
	}
	clone := make(map[sp.ClimateBucket]float64, len(values))
	for bucket, value := range values {
		clone[bucket] = value
	}
	return clone
}

func perturbProjection(projection *sp.StrategyInputProjectionV2, includeResources bool) {
	if includeResources {
		perturbConsumption(&projection.FuelConsumption)
		perturbConsumption(&projection.VirtualEnergyConsumption)
		if lower := projection.TyreDegradation.LifeLapsRangeLower; lower != nil && *lower > 0 {
			life := int(math.Floor(*lower))
			projection.TyreDegradation.LifeLapsEstimate = &life
		}
	}
	curve := &projection.CombinedStintPaceCurve
	if curve.Presence == sp.PresenceValid {
		for index := range curve.Points {
			if upper := curve.Points[index].RangeUpper; upper != nil && *upper > curve.Points[index].DeltaSeconds {
				curve.Points[index].DeltaSeconds = *upper
			}
		}
	}
}

func perturbConsumption(family *sp.ResourceConsumptionFamily) {
	if family.Presence != sp.PresenceValid || family.RangeUpper <= family.MeanPerLap || family.MeanPerLap <= 0 {
		return
	}
	factor := family.RangeUpper / family.MeanPerLap
	family.MeanPerLap = family.RangeUpper
	for bucket, value := range family.ByClimateBucket {
		family.ByClimateBucket[bucket] = value * factor
	}
}

func perturbDeclaredCosts(input *SolverInputV2) {
	if input.FuelWeight != nil && input.FuelWeight.Confidence.RangeUpper != nil {
		input.FuelWeight.SecondsPerLiter = math.Max(input.FuelWeight.SecondsPerLiter, *input.FuelWeight.Confidence.RangeUpper)
	}
	if input.SavingCost != nil && input.SavingCost.Confidence.RangeUpper != nil {
		upper := *input.SavingCost.Confidence.RangeUpper
		for index := range input.SavingCost.Levels {
			input.SavingCost.Levels[index].TimeCostPerLap = math.Max(input.SavingCost.Levels[index].TimeCostPerLap, upper)
		}
	}
	for index := range input.CompoundPace {
		if upper := input.CompoundPace[index].Confidence.RangeUpper; upper != nil {
			input.CompoundPace[index].PaceDeltaSeconds = math.Max(input.CompoundPace[index].PaceDeltaSeconds, *upper)
		}
	}
}

func evaluateCandidateEnvelope(envelope uncertaintyEnvelope, decision DecisionVector) (ScenarioEvaluation, bool, []SolverRisk, error) {
	worst, _, err := evaluateDecisionV2(envelope.cost, decision)
	if err != nil {
		return ScenarioEvaluation{}, false, nil, err
	}
	_, feasible, err := evaluateDecisionV2(envelope.full, decision)
	if err != nil {
		return ScenarioEvaluation{}, false, nil, err
	}
	risks, err := hardResourceRisks(envelope.full, decision)
	if err != nil {
		return ScenarioEvaluation{}, false, nil, err
	}
	if len(risks) > 0 {
		feasible = false
	}
	if !feasible {
		if len(risks) == 0 {
			risks = append(risks, SolverRisk{Code: "worst_case_constraint_violation", Message: "el caso malo viola una restriccion dura"})
		}
	}
	return worst, feasible, risks, nil
}

func hardResourceRisks(input SolverInputV2, decision DecisionVector) ([]SolverRisk, error) {
	fuel, ve, err := input.serviceResources()
	if err != nil {
		return nil, err
	}
	saving, err := input.savingCost()
	if err != nil {
		return nil, err
	}
	drivers, err := newDriverDecisionModel(input, saving)
	if err != nil {
		return nil, err
	}
	weatherCost, err := newWeatherCostModel(input)
	if err != nil {
		return nil, err
	}
	fuelLeft, veLeft := fuel.capacity, ve.capacity
	tireAge := int64(0)
	tireUsage := make(map[string]int64)
	risks := make([]SolverRisk, 0, 3)
	seen := make(map[string]bool, 3)
	for index, stint := range decision.Stints {
		driver, ok := driverByID(drivers, stint.Driver)
		if !ok {
			continue
		}
		level, ok := savingByID(saving, stint.SavingLevel)
		if !ok {
			continue
		}
		fuelUsed, veUsed, err := weatherCost.usage(stintStartLap(decision, index), stint.Laps, driver, level)
		if err != nil {
			return nil, err
		}
		if fuelUsed > fuelLeft && !seen["fuel"] {
			risks = append(risks, SolverRisk{Code: "worst_case_fuel_shortfall", Message: "el consumo del caso malo agota el Fuel antes de terminar un stint"})
			seen["fuel"] = true
		}
		if veUsed > veLeft && !seen["ve"] {
			risks = append(risks, SolverRisk{Code: "worst_case_virtual_energy_shortfall", Message: "el consumo del caso malo agota la Virtual Energy antes de terminar un stint"})
			seen["ve"] = true
		}
		fuelLeft -= fuelUsed
		veLeft -= veUsed
		age := tireAge
		if stint.TyreFitment != nil {
			age = fitmentRiskAge(*stint.TyreFitment, tireUsage)
		}
		if input.TyreLifeLaps > 0 && age+stint.Laps > input.TyreLifeLaps && !seen["tire"] {
			risks = append(risks, SolverRisk{Code: "worst_case_tyre_life_exceeded", Message: "la vida de neumatico del caso malo no cubre un stint"})
			seen["tire"] = true
		}
		if stint.TyreFitment == nil {
			tireAge += stint.Laps
		} else {
			for _, id := range fitmentIDs(*stint.TyreFitment) {
				tireUsage[string(id)] += stint.Laps
			}
		}
		if index < len(decision.PitStops) {
			stop := decision.PitStops[index]
			fuelAmount, _ := serviceUnits("fuel", stop.FuelLiters)
			veAmount, _ := serviceUnits("ve", stop.VEPercent)
			fuelLeft += fuelAmount
			veLeft += veAmount
			if stop.ChangeTyres && stop.TyreFitment == nil {
				tireAge = 0
			}
		}
	}
	return risks, nil
}

func stintStartLap(decision DecisionVector, stintIndex int) int64 {
	start := int64(1)
	for index := 0; index < stintIndex; index++ {
		start += decision.Stints[index].Laps
	}
	return start
}

func fitmentRiskAge(fitment tyres.Fitment, usage map[string]int64) int64 {
	var age int64
	for _, id := range fitmentIDs(fitment) {
		if usage[string(id)] > age {
			age = usage[string(id)]
		}
	}
	return age
}

func deriveVariants(candidates []SolverCandidateV2) []SolverVariantV2 {
	policies := []struct {
		kind      SolverVariantKind
		tolerance WorstCaseTolerance
	}{
		{SolverVariantFast, WorstCaseTolerance{AllowHardRisk: true, MaxExpectedSlowdownRatio: fastWorstCaseSlowdown}},
		{SolverVariantBalanced, WorstCaseTolerance{MaxExpectedSlowdownRatio: balancedWorstCaseSlowdown}},
		{SolverVariantConservative, WorstCaseTolerance{MaxExpectedSlowdownRatio: conservativeWorstCaseSlowdown}},
	}
	variants := make([]SolverVariantV2, 0, len(policies))
	for _, policy := range policies {
		for _, candidate := range candidates {
			if !policy.tolerance.AllowHardRisk && !candidate.WorstCaseFeasible {
				continue
			}
			slowdown := 0.0
			if candidate.Evaluation.TotalSeconds > 0 {
				slowdown = (candidate.WorstCase.TotalSeconds - candidate.Evaluation.TotalSeconds) / candidate.Evaluation.TotalSeconds
			}
			if slowdown > policy.tolerance.MaxExpectedSlowdownRatio {
				continue
			}
			variants = append(variants, SolverVariantV2{
				Kind: policy.kind, Tolerance: policy.tolerance, Decision: cloneDecision(candidate.Decision),
				Expected: candidate.Evaluation, WorstCase: candidate.WorstCase,
				WorstCaseFeasible: candidate.WorstCaseFeasible, Risks: append([]SolverRisk(nil), candidate.Risks...),
			})
			break
		}
	}
	return variants
}

func consumptionSensitivities(input SolverInputV2, expected, worst ScenarioEvaluation, feasible bool) []SolverSensitivity {
	if input.Projection == nil {
		return nil
	}
	result := make([]SolverSensitivity, 0, 2)
	for _, item := range []struct {
		name   string
		family sp.ResourceConsumptionFamily
	}{
		{"fuelConsumptionPerLap", input.Projection.FuelConsumption},
		{"virtualEnergyConsumptionPerLap", input.Projection.VirtualEnergyConsumption},
	} {
		if item.family.Presence != sp.PresenceValid || item.family.RangeUpper <= item.family.MeanPerLap {
			continue
		}
		ok := feasible
		result = append(result, SolverSensitivity{
			Parameter: item.name, Delta: item.family.RangeUpper - item.family.MeanPerLap,
			ImpactSeconds: worst.TotalSeconds - expected.TotalSeconds, Feasible: &ok,
		})
	}
	return result
}

func variantByKind(variants []SolverVariantV2, kind SolverVariantKind) (SolverVariantV2, bool) {
	for _, variant := range variants {
		if variant.Kind == kind {
			return variant, true
		}
	}
	return SolverVariantV2{}, false
}

func riskSummary(risks []SolverRisk) string {
	if len(risks) == 0 {
		return "sin riesgo duro en el caso malo"
	}
	return fmt.Sprintf("%d riesgo(s) duro(s) en el caso malo", len(risks))
}
