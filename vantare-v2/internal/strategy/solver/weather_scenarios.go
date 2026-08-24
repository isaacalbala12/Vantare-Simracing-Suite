package solver

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	"github.com/vantare/overlays/v2/internal/strategy/weather"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	defaultHumidRainChance  = 20.0
	defaultWetRainChance    = 60.0
	thresholdSensitivityPP  = 5.0
	robustComparisonEpsilon = 1e-9
)

type weatherCostModel struct {
	enabled    bool
	timeline   []WeatherLapCondition
	parameters map[sp.ClimateBucket]weatherBucketCost
	projection *sp.StrategyInputProjectionV2
	allowed    map[sp.ClimateBucket]map[tyres.Compound]bool
}

type weatherBucketCost struct {
	paceDelta float64
	fuel      *int64
	ve        *int64
	compounds compoundPaceCosts
	source    WeatherBucketCostSource
}

func normalizedThresholds(value RainChanceThresholds) RainChanceThresholds {
	if value.HumidPercent == 0 && value.WetPercent == 0 {
		return RainChanceThresholds{HumidPercent: defaultHumidRainChance, WetPercent: defaultWetRainChance}
	}
	return value
}

func (thresholds RainChanceThresholds) validate() error {
	thresholds = normalizedThresholds(thresholds)
	if !finite(thresholds.HumidPercent) || !finite(thresholds.WetPercent) || thresholds.HumidPercent <= 0 || thresholds.HumidPercent >= thresholds.WetPercent || thresholds.WetPercent > 100 {
		return fmt.Errorf("thresholds must satisfy 0 < humidPercent < wetPercent <= 100")
	}
	return nil
}

func newWeatherCostModel(input SolverInputV2) (weatherCostModel, error) {
	if input.Weather == nil {
		return weatherCostModel{}, nil
	}
	if err := input.Weather.Scenario.Validate(); err != nil {
		return weatherCostModel{}, fmt.Errorf("scenario: %w", err)
	}
	thresholds := normalizedThresholds(input.Weather.Thresholds)
	if err := thresholds.validate(); err != nil {
		return weatherCostModel{}, err
	}
	model := weatherCostModel{
		enabled: true, projection: input.Projection,
		timeline:   weatherTimeline(input.Weather.Scenario, input.RaceLaps, thresholds),
		parameters: make(map[sp.ClimateBucket]weatherBucketCost, len(input.Weather.BucketParameters)),
		allowed:    make(map[sp.ClimateBucket]map[tyres.Compound]bool, len(input.EventRules.AllowedCompoundsByClimate)),
	}
	for index, parameter := range input.Weather.BucketParameters {
		if !validClimateBucket(parameter.Bucket) {
			return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].bucket is invalid", index)
		}
		if _, duplicate := model.parameters[parameter.Bucket]; duplicate {
			return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].bucket is duplicated", index)
		}
		if !finite(parameter.PaceDeltaSeconds) {
			return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].paceDeltaSeconds must be finite", index)
		}
		if parameter.Provenance.Kind != sp.ProvenanceManual && parameter.Provenance.Kind != sp.ProvenanceReference {
			return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].provenance must be manual or reference", index)
		}
		if err := parameter.Provenance.Validate(); err != nil {
			return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].provenance: %w", index, err)
		}
		if err := parameter.Confidence.Validate(); err != nil {
			return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].confidence: %w", index, err)
		}
		cost := weatherBucketCost{
			paceDelta: parameter.PaceDeltaSeconds,
			source: WeatherBucketCostSource{
				Bucket: parameter.Bucket, PaceDeltaSeconds: parameter.PaceDeltaSeconds,
				FuelPerLapLiters: parameter.FuelPerLapLiters, VEPerLapPercent: parameter.VEPerLapPercent,
				Provenance: parameter.Provenance, Confidence: parameter.Confidence,
			},
		}
		var err error
		if parameter.FuelPerLapLiters != nil {
			if projectionHasBucket(input.Projection, ResourceFuel, parameter.Bucket) {
				return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].fuel duplicates Projection authority", index)
			}
			value, valueErr := serviceUnits("weather fuelPerLapLiters", *parameter.FuelPerLapLiters)
			if valueErr != nil {
				return weatherCostModel{}, valueErr
			}
			cost.fuel = &value
		}
		if parameter.VEPerLapPercent != nil {
			if projectionHasBucket(input.Projection, ResourceVirtualEnergy, parameter.Bucket) {
				return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].ve duplicates Projection authority", index)
			}
			value, valueErr := serviceUnits("weather vePerLapPercent", *parameter.VEPerLapPercent)
			if valueErr != nil {
				return weatherCostModel{}, valueErr
			}
			cost.ve = &value
		}
		if len(parameter.CompoundPace) > 0 {
			copyInput := input
			copyInput.CompoundPace = parameter.CompoundPace
			copyInput.DegradationPerLap.Value = 0
			copyInput.Projection = nil
			cost.compounds, err = copyInput.compoundPaceCosts()
			if err != nil {
				return weatherCostModel{}, fmt.Errorf("bucketParameters[%d].compoundPace: %w", index, err)
			}
			for _, compound := range cost.compounds.order {
				if !containsCompound(input.CompoundPace, compound) {
					return weatherCostModel{}, fmt.Errorf("bucketParameters[%d] compound %q is not in global compoundPace", index, compound)
				}
			}
			cost.source.CompoundPace = cost.compounds.sources()
		}
		model.parameters[parameter.Bucket] = cost
	}
	for bucket, compounds := range input.EventRules.AllowedCompoundsByClimate {
		if !validClimateBucket(bucket) || len(compounds) == 0 {
			return weatherCostModel{}, fmt.Errorf("allowedCompoundsByClimate[%q] must declare a valid bucket and compounds", bucket)
		}
		allowed := make(map[tyres.Compound]bool, len(compounds))
		for _, compound := range compounds {
			if !compound.Valid() || allowed[compound] {
				return weatherCostModel{}, fmt.Errorf("allowedCompoundsByClimate[%q] contains invalid or duplicate compound", bucket)
			}
			allowed[compound] = true
		}
		model.allowed[bucket] = allowed
	}
	for _, condition := range model.timeline {
		if condition.Bucket == sp.ClimateBucketDry {
			continue
		}
		if _, configured := model.parameters[condition.Bucket]; !configured {
			return weatherCostModel{}, fmt.Errorf("bucketParameters must define encountered bucket %q", condition.Bucket)
		}
	}
	return model, nil
}

func (model weatherCostModel) sources() []WeatherBucketCostSource {
	buckets := make([]sp.ClimateBucket, 0, len(model.parameters))
	for bucket := range model.parameters {
		buckets = append(buckets, bucket)
	}
	sort.Slice(buckets, func(i, j int) bool { return buckets[i] < buckets[j] })
	result := make([]WeatherBucketCostSource, 0, len(buckets))
	for _, bucket := range buckets {
		result = append(result, model.parameters[bucket].source)
	}
	return result
}

func weatherTimeline(scenario weather.WeatherScenarioV1, raceLaps int64, thresholds RainChanceThresholds) []WeatherLapCondition {
	result := make([]WeatherLapCondition, raceLaps)
	thresholds = normalizedThresholds(thresholds)
	for lap := int64(1); lap <= raceLaps; lap++ {
		progress := 0.0
		if raceLaps > 1 {
			progress = float64(lap-1) / float64(raceLaps-1)
		}
		rain := interpolatedRainChance(scenario.Nodes, progress)
		bucket := sp.ClimateBucketDry
		switch {
		case rain >= thresholds.WetPercent:
			bucket = sp.ClimateBucketWet
		case rain >= thresholds.HumidPercent:
			bucket = sp.ClimateBucketHumid
		}
		result[lap-1] = WeatherLapCondition{Lap: lap, RainChance: rain, Bucket: bucket}
	}
	return result
}

func interpolatedRainChance(nodes [5]weather.WeatherNode, progress float64) float64 {
	if progress <= 0 {
		return nodes[0].RainChance
	}
	if progress >= 1 {
		return nodes[4].RainChance
	}
	position := progress * 4
	left := int(math.Floor(position))
	fraction := position - float64(left)
	return nodes[left].RainChance + (nodes[left+1].RainChance-nodes[left].RainChance)*fraction
}

func (model weatherCostModel) condition(lap int64) WeatherLapCondition {
	if !model.enabled || lap < 1 || lap > int64(len(model.timeline)) {
		return WeatherLapCondition{Lap: lap, Bucket: sp.ClimateBucketDry}
	}
	return model.timeline[lap-1]
}

func (model weatherCostModel) resourcePerLap(kind ResourceKind, lap int64, fallback int64) int64 {
	if !model.enabled {
		return fallback
	}
	bucket := model.condition(lap).Bucket
	if model.projection != nil {
		family := model.projection.FuelConsumption
		if kind == ResourceVirtualEnergy {
			family = model.projection.VirtualEnergyConsumption
		}
		if family.Presence == sp.PresenceValid {
			if value, ok := family.ByClimateBucket[bucket]; ok {
				units, err := serviceUnits("projection climate consumption", value)
				if err == nil {
					return units
				}
			}
		}
	}
	parameter := model.parameters[bucket]
	if kind == ResourceFuel && parameter.fuel != nil {
		return *parameter.fuel
	}
	if kind == ResourceVirtualEnergy && parameter.ve != nil {
		return *parameter.ve
	}
	return fallback
}

func (model weatherCostModel) usage(startLap, laps int64, driver driverCost, saving savingLevelCost) (int64, int64, error) {
	var fuel, ve int64
	for offset := int64(0); offset < laps; offset++ {
		lap := startLap + offset
		lapFuel := model.resourcePerLap(ResourceFuel, lap, driver.fuelPerLap) - saving.fuelSavedPerLap
		lapVE := model.resourcePerLap(ResourceVirtualEnergy, lap, driver.vePerLap) - saving.veSavedPerLap
		if lapFuel < 0 || lapVE < 0 {
			return 0, 0, fmt.Errorf("saving level %q exceeds consumption on lap %d", saving.level, lap)
		}
		fuel += lapFuel
		ve += lapVE
	}
	return fuel, ve, nil
}

func (model weatherCostModel) runnableLaps(remaining int64, node searchNode, fuel, ve serviceResource, tyreLife int64, driver driverCost, saving savingLevelCost) int64 {
	if !model.enabled {
		return runnableLaps(remaining, node, fuel.withPerLap(driver.fuelPerLap-saving.fuelSavedPerLap), ve.withPerLap(driver.vePerLap-saving.veSavedPerLap), tyreLife)
	}
	limit := remaining
	if tyreLife > 0 {
		age := node.tyreAge
		if node.tyre.compound.Valid() {
			age = fitmentAge(node.tyre.fitment, node.tyreUsage)
		}
		if left := tyreLife - age; left < limit {
			limit = left
		}
	}
	for laps := int64(1); laps <= limit; laps++ {
		fuelUsed, veUsed, err := model.usage(node.lap+1, laps, driver, saving)
		if err != nil || fuelUsed > node.fuel || veUsed > node.ve {
			return laps - 1
		}
	}
	return limit
}

func (model weatherCostModel) compoundAllowed(compound tyres.Compound, startLap, laps int64) (bool, WeatherLapCondition) {
	if !model.enabled || !compound.Valid() {
		return true, WeatherLapCondition{}
	}
	for lap := startLap; lap < startLap+laps; lap++ {
		condition := model.condition(lap)
		if allowed := model.allowed[condition.Bucket]; len(allowed) > 0 && !allowed[compound] {
			return false, condition
		}
	}
	return true, WeatherLapCondition{}
}

// weatherAdjustment devuelve solo el delta contra el modelo global; asi las
// rutas sin clima conservan byte a byte las formulas F4-1..6.
func (model weatherCostModel) weatherAdjustment(global compoundPaceCosts, compound tyres.Compound, startLap, laps int64) (float64, float64) {
	if !model.enabled {
		return 0, 0
	}
	var pace, degradation float64
	for offset := int64(0); offset < laps; offset++ {
		condition := model.condition(startLap + offset)
		parameter := model.parameters[condition.Bucket]
		pace += parameter.paceDelta
		if !global.enabled || !parameter.compounds.enabled {
			continue
		}
		weatherCost, weatherOK := parameter.compounds.byName[compound]
		globalCost, globalOK := global.byName[compound]
		if weatherOK && globalOK {
			pace += weatherCost.paceDelta - globalCost.paceDelta
			degradation += weatherCost.curve.deltaAt(offset+1) - globalCost.curve.deltaAt(offset+1)
		}
	}
	return pace, degradation
}

func projectionHasBucket(projection *sp.StrategyInputProjectionV2, kind ResourceKind, bucket sp.ClimateBucket) bool {
	if projection == nil {
		return false
	}
	family := projection.FuelConsumption
	if kind == ResourceVirtualEnergy {
		family = projection.VirtualEnergyConsumption
	}
	_, ok := family.ByClimateBucket[bucket]
	return family.Presence == sp.PresenceValid && ok
}

func validClimateBucket(bucket sp.ClimateBucket) bool {
	return bucket == sp.ClimateBucketDry || bucket == sp.ClimateBucketHumid || bucket == sp.ClimateBucketWet
}

func containsCompound(parameters []CompoundPaceParameter, compound tyres.Compound) bool {
	for _, parameter := range parameters {
		if parameter.Compound == compound {
			return true
		}
	}
	return false
}

type WeightedWeatherScenario struct {
	Scenario weather.WeatherScenarioV1 `json:"scenario"`
	Weight   float64                   `json:"weight"`
}

type WeatherScenarioSet struct {
	Scenarios        []WeightedWeatherScenario `json:"scenarios"`
	Thresholds       RainChanceThresholds      `json:"thresholds"`
	BucketParameters []WeatherBucketParameter  `json:"bucketParameters,omitempty"`
}

type WeatherScenarioPlan struct {
	ScenarioID string                `json:"scenarioId"`
	Weight     float64               `json:"weight"`
	Timeline   []WeatherLapCondition `json:"timeline"`
	Result     SolverResultV2        `json:"result"`
}

type ScenarioPlanEvaluation struct {
	ScenarioID string             `json:"scenarioId"`
	Feasible   bool               `json:"feasible"`
	Evaluation ScenarioEvaluation `json:"evaluation"`
}

type RobustRecommendation struct {
	Method                      string                   `json:"method"`
	Decision                    DecisionVector           `json:"decision"`
	MaxRegretSeconds            float64                  `json:"maxRegretSeconds"`
	WeightedExpectedLossSeconds float64                  `json:"weightedExpectedLossSeconds"`
	ByScenario                  []ScenarioPlanEvaluation `json:"byScenario"`
}

type WeatherThresholdSensitivity struct {
	Parameter          string  `json:"parameter"`
	DeltaPercentPoints float64 `json:"deltaPercentPoints"`
	ChangedLaps        int     `json:"changedLaps"`
	ImpactSeconds      float64 `json:"impactSeconds"`
	Feasible           bool    `json:"feasible"`
}

type WeatherScenarioResult struct {
	Plans                []WeatherScenarioPlan         `json:"plans"`
	Robust               RobustRecommendation          `json:"robust"`
	ThresholdSensitivity []WeatherThresholdSensitivity `json:"thresholdSensitivity"`
}

// decisionKey ignora punteros internos del breakdown y produce una identidad
// determinista del plan observable.
func decisionKey(decision DecisionVector) string {
	encoded, _ := json.Marshal(decision)
	return string(encoded)
}

func sortedUniqueCandidates(plans []WeatherScenarioPlan) []DecisionVector {
	byKey := make(map[string]DecisionVector)
	for _, plan := range plans {
		if plan.Result.Feasible {
			byKey[decisionKey(plan.Result.Best)] = plan.Result.Best
		}
		for _, candidate := range plan.Result.Candidates {
			byKey[decisionKey(candidate)] = candidate
		}
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]DecisionVector, 0, len(keys))
	for _, key := range keys {
		result = append(result, byKey[key])
	}
	return result
}

// SolveWeatherScenarios resuelve cada forecast y elige entre la union de sus
// candidatos por minimax regret. La perdida esperada ponderada desempata; no
// sustituye el criterio robusto ni oculta el coste del escenario peor.
func SolveWeatherScenarios(input SolverInputV2, set WeatherScenarioSet) (WeatherScenarioResult, error) {
	return SolveWeatherScenariosContext(context.Background(), input, set)
}

func SolveWeatherScenariosContext(ctx context.Context, input SolverInputV2, set WeatherScenarioSet) (WeatherScenarioResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if len(set.Scenarios) == 0 || len(set.Scenarios) > 16 {
		return WeatherScenarioResult{}, solveError(ErrorInvalidInput, "weatherScenarios", "must contain 1-16 scenarios")
	}
	thresholds := normalizedThresholds(set.Thresholds)
	if err := thresholds.validate(); err != nil {
		return WeatherScenarioResult{}, solveError(ErrorInvalidInput, "weatherScenarios.thresholds", err.Error())
	}
	weightTotal := 0.0
	seen := make(map[string]bool, len(set.Scenarios))
	for index, scenario := range set.Scenarios {
		if !finite(scenario.Weight) || scenario.Weight <= 0 {
			return WeatherScenarioResult{}, solveError(ErrorInvalidInput, fmt.Sprintf("weatherScenarios[%d].weight", index), "must be positive and finite")
		}
		if seen[scenario.Scenario.ScenarioID] {
			return WeatherScenarioResult{}, solveError(ErrorInvalidInput, fmt.Sprintf("weatherScenarios[%d].scenarioId", index), "is duplicated")
		}
		seen[scenario.Scenario.ScenarioID] = true
		weightTotal += scenario.Weight
	}

	result := WeatherScenarioResult{Plans: make([]WeatherScenarioPlan, 0, len(set.Scenarios))}
	inputs := make([]SolverInputV2, 0, len(set.Scenarios))
	for _, weighted := range set.Scenarios {
		scenarioInput := input
		scenarioInput.Weather = &WeatherPlanInput{
			Scenario: weighted.Scenario, Thresholds: thresholds,
			BucketParameters: append([]WeatherBucketParameter(nil), set.BucketParameters...),
		}
		plan, err := SolveV2Context(ctx, scenarioInput)
		if err != nil {
			return WeatherScenarioResult{}, err
		}
		if !plan.Feasible {
			return WeatherScenarioResult{}, solveError(ErrorInfeasible, "weatherScenarios."+weighted.Scenario.ScenarioID, "scenario has no feasible plan")
		}
		weight := weighted.Weight / weightTotal
		result.Plans = append(result.Plans, WeatherScenarioPlan{
			ScenarioID: weighted.Scenario.ScenarioID, Weight: weight,
			Timeline: append([]WeatherLapCondition(nil), plan.WeatherTimeline...), Result: plan,
		})
		inputs = append(inputs, scenarioInput)
	}

	candidates := sortedUniqueCandidates(result.Plans)
	bestIndex := -1
	bestMaxRegret := math.Inf(1)
	bestExpectedLoss := math.Inf(1)
	var bestEvaluations []ScenarioPlanEvaluation
	for index, candidate := range candidates {
		if err := ctx.Err(); err != nil {
			return WeatherScenarioResult{}, err
		}
		maxRegret, expectedLoss := 0.0, 0.0
		evaluations := make([]ScenarioPlanEvaluation, 0, len(inputs))
		feasibleEverywhere := true
		for scenarioIndex, scenarioInput := range inputs {
			evaluation, feasible, err := evaluateDecisionV2(scenarioInput, candidate)
			if err != nil {
				return WeatherScenarioResult{}, err
			}
			evaluations = append(evaluations, ScenarioPlanEvaluation{
				ScenarioID: result.Plans[scenarioIndex].ScenarioID, Feasible: feasible, Evaluation: evaluation,
			})
			if !feasible {
				feasibleEverywhere = false
				break
			}
			regret := evaluation.TotalSeconds - result.Plans[scenarioIndex].Result.Expected.TotalSeconds
			if regret < 0 && regret > -robustComparisonEpsilon {
				regret = 0
			}
			if regret > maxRegret {
				maxRegret = regret
			}
			expectedLoss += result.Plans[scenarioIndex].Weight * regret
		}
		if !feasibleEverywhere {
			continue
		}
		if maxRegret < bestMaxRegret-robustComparisonEpsilon || (math.Abs(maxRegret-bestMaxRegret) <= robustComparisonEpsilon && (expectedLoss < bestExpectedLoss-robustComparisonEpsilon || (math.Abs(expectedLoss-bestExpectedLoss) <= robustComparisonEpsilon && (bestIndex < 0 || decisionKey(candidate) < decisionKey(candidates[bestIndex]))))) {
			bestIndex, bestMaxRegret, bestExpectedLoss = index, maxRegret, expectedLoss
			bestEvaluations = evaluations
		}
	}
	if bestIndex < 0 {
		return WeatherScenarioResult{}, solveError(ErrorInfeasible, "weatherScenarios.robust", "no candidate is feasible in every scenario")
	}
	result.Robust = RobustRecommendation{
		Method: "minimax_regret", Decision: cloneDecision(candidates[bestIndex]),
		MaxRegretSeconds: bestMaxRegret, WeightedExpectedLossSeconds: bestExpectedLoss,
		ByScenario: bestEvaluations,
	}
	result.ThresholdSensitivity = thresholdSensitivities(input, set, thresholds, result.Robust.Decision, result.Plans)
	return result, nil
}

func evaluateDecisionV2(input SolverInputV2, decision DecisionVector) (ScenarioEvaluation, bool, error) {
	if err := input.Validate(); err != nil {
		return ScenarioEvaluation{}, false, solveError(ErrorInvalidInput, "input", err.Error())
	}
	if len(decision.Stints) == 0 || len(decision.PitStops)+1 != len(decision.Stints) {
		return ScenarioEvaluation{}, false, solveError(ErrorInvalidInput, "decision", "stints must equal pitStops+1")
	}
	fuel, ve, err := input.serviceResources()
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	pace, err := input.stintPaceCost()
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	compounds, err := input.compoundPaceCosts()
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	if compounds.enabled {
		pace = stintPaceCost{source: StintPaceCostSource{
			Model:      StintPaceModelCompoundParameters,
			Provenance: sp.Provenance{Kind: sp.ProvenanceUnknown},
			Confidence: sp.Confidence{ComputationVersion: "compound-parameters.v1"},
		}}.withHorizon(input.RaceLaps)
	}
	fuelWeight, err := input.fuelWeightCost()
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	saving, err := input.savingCost()
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	drivers, err := newDriverDecisionModel(input, saving)
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	weatherCost, err := newWeatherCostModel(input)
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	tires, err := newTyreDecisionModel(input, compounds)
	if err != nil {
		return ScenarioEvaluation{}, false, err
	}
	costs := lapCostModel{pace: pace, compounds: compounds, fuelWeight: fuelWeight, weather: weatherCost}
	node := searchNode{fuel: fuel.capacity, ve: ve.capacity, decision: DecisionVector{PitStops: []PitStopDecision{}, Stints: []StintDecision{}}}
	if compounds.enabled {
		first := decision.Stints[0]
		if first.TyreFitment == nil {
			return ScenarioEvaluation{}, false, nil
		}
		node.tyre = tyreChoice{compound: first.Compound, fitment: *first.TyreFitment}
	}
	for index, stintDecision := range decision.Stints {
		driver, ok := driverByID(drivers, stintDecision.Driver)
		if !ok {
			return ScenarioEvaluation{}, false, nil
		}
		level, ok := savingByID(saving, stintDecision.SavingLevel)
		if !ok {
			return ScenarioEvaluation{}, false, nil
		}
		if stintDecision.Laps <= 0 || node.lap+stintDecision.Laps > input.RaceLaps {
			return ScenarioEvaluation{}, false, nil
		}
		if allowed, _ := weatherCost.compoundAllowed(node.tyre.compound, node.lap+1, stintDecision.Laps); !allowed {
			return ScenarioEvaluation{}, false, nil
		}
		before := node
		next, err := appendStint(node, stintDecision.Laps, input, costs, level, driver)
		if err != nil {
			return ScenarioEvaluation{}, false, err
		}
		fuelUsed, veUsed, err := weatherCost.usage(node.lap+1, stintDecision.Laps, driver, level)
		if err != nil || fuelUsed > node.fuel || veUsed > node.ve {
			return ScenarioEvaluation{}, false, nil
		}
		next.lap += stintDecision.Laps
		next.fuel -= fuelUsed
		next.ve -= veUsed
		if allowed, _, _ := input.applyDriverConstraints(before, &next, driver); !allowed {
			return ScenarioEvaluation{}, false, nil
		}
		node = next
		if index == len(decision.PitStops) {
			break
		}
		stop := decision.PitStops[index]
		if stop.Lap != node.lap {
			return ScenarioEvaluation{}, false, nil
		}
		fuelAmount, fuelErr := serviceUnits("decision fuelLiters", stop.FuelLiters)
		veAmount, veErr := serviceUnits("decision vePercent", stop.VEPercent)
		if fuelErr != nil || veErr != nil || fuelAmount > fuel.capacity-node.fuel || veAmount > ve.capacity-node.ve {
			return ScenarioEvaluation{}, false, nil
		}
		option := pitTyreChoice{choice: node.tyre, change: stop.ChangeTyres}
		if stop.ChangeTyres && compounds.enabled {
			if stop.TyreFitment == nil {
				return ScenarioEvaluation{}, false, nil
			}
			option.choice = tyreChoice{compound: stop.Compound, fitment: *stop.TyreFitment}
		}
		node, err = appendPit(node, fuelAmount, veAmount, option, input)
		if err != nil {
			return ScenarioEvaluation{}, false, err
		}
		node.fuel += fuelAmount
		node.ve += veAmount
	}
	if node.lap != input.RaceLaps {
		return ScenarioEvaluation{}, false, nil
	}
	if allowed, _, _ := input.completedAllowed(node, tires); !allowed {
		return ScenarioEvaluation{}, false, nil
	}
	return evaluationForNode(node, input.Formation.Seconds.Value), true, nil
}

func driverByID(model driverDecisionModel, id string) (driverCost, bool) {
	for _, driver := range model.order {
		if driver.id == id {
			return driver, true
		}
	}
	return driverCost{}, false
}

func savingByID(cost savingCost, level SavingLevel) (savingLevelCost, bool) {
	for _, candidate := range cost.levels {
		if candidate.level == level {
			return candidate, true
		}
	}
	return savingLevelCost{}, false
}

func thresholdSensitivities(input SolverInputV2, set WeatherScenarioSet, thresholds RainChanceThresholds, decision DecisionVector, baseline []WeatherScenarioPlan) []WeatherThresholdSensitivity {
	result := make([]WeatherThresholdSensitivity, 0, 2)
	baselineExpected := 0.0
	for index, plan := range baseline {
		evaluation, feasible, _ := evaluateDecisionV2(withWeather(input, set.Scenarios[index].Scenario, thresholds, set.BucketParameters), decision)
		if feasible {
			baselineExpected += plan.Weight * evaluation.TotalSeconds
		}
	}
	for _, delta := range []float64{-thresholdSensitivityPP, thresholdSensitivityPP} {
		changed, expected := 0, 0.0
		feasibleEverywhere := true
		perturbed := thresholds
		perturbed.WetPercent += delta
		if perturbed.WetPercent <= perturbed.HumidPercent {
			continue
		}
		for index, weighted := range set.Scenarios {
			baseTimeline := weatherTimeline(weighted.Scenario, input.RaceLaps, thresholds)
			changedTimeline := weatherTimeline(weighted.Scenario, input.RaceLaps, perturbed)
			for lap := range baseTimeline {
				if baseTimeline[lap].Bucket != changedTimeline[lap].Bucket {
					changed++
				}
			}
			evaluation, feasible, _ := evaluateDecisionV2(withWeather(input, weighted.Scenario, perturbed, set.BucketParameters), decision)
			if !feasible {
				feasibleEverywhere = false
				continue
			}
			expected += baseline[index].Weight * evaluation.TotalSeconds
		}
		impact := 0.0
		if feasibleEverywhere {
			impact = expected - baselineExpected
		}
		result = append(result, WeatherThresholdSensitivity{
			Parameter: "wetRainChancePercent", DeltaPercentPoints: delta,
			ChangedLaps: changed, ImpactSeconds: impact, Feasible: feasibleEverywhere,
		})
	}
	return result
}

func withWeather(input SolverInputV2, scenario weather.WeatherScenarioV1, thresholds RainChanceThresholds, parameters []WeatherBucketParameter) SolverInputV2 {
	input.Weather = &WeatherPlanInput{Scenario: scenario, Thresholds: thresholds, BucketParameters: parameters}
	return input
}
