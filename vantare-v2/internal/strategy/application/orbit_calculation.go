package application

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// CalculateOrbit performs the historical Orbit use case through the Go
// authorities. It is read-only, so repositoryVersion is only correlated back
// to the caller and no snapshot is required.
const orbitCalculationDeadline = 8 * time.Second

const (
	orbitDefaultReserveLaps     = 0.8
	orbitDefaultReserveSourceID = "product-decision:isa-832"
)

func (service *Service[T]) CalculateOrbit(ctx context.Context, command CalculateOrbitCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationCalculateOrbit); err != nil {
		return Result[T]{}, err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, orbitCalculationDeadline)
	defer cancel()
	calculated, err := calculateOrbitContext(ctx, command.Input)
	if err != nil {
		return Result[T]{}, err
	}
	return Result[T]{
		ProtocolVersion:   ProtocolVersionV1,
		CommandID:         command.CommandID,
		RepositoryVersion: command.ExpectedRepositoryVersion,
		OrbitCalculation:  &calculated,
	}, nil
}

func calculateOrbit(input OrbitCalculationInput) (OrbitCalculationResult, error) {
	return calculateOrbitContext(context.Background(), input)
}

func calculateOrbitContext(ctx context.Context, input OrbitCalculationInput) (OrbitCalculationResult, error) {
	if len(input.Drivers) == 0 {
		return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.drivers", ErrCalculationInvalid)
	}
	if len(input.Variants) == 0 {
		return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.variants", ErrCalculationInvalid)
	}
	drivers := make(map[string]OrbitCalculationDriver, len(input.Drivers))
	for index, driver := range input.Drivers {
		if strings.TrimSpace(driver.ID) == "" {
			return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.drivers.%d.id", index), ErrCalculationInvalid)
		}
		if _, duplicate := drivers[driver.ID]; duplicate {
			return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.drivers.%d.id", index), ErrCalculationInvalid)
		}
		drivers[driver.ID] = driver
	}

	result := OrbitCalculationResult{
		Plans:       make(map[string]OrbitCalculationPlan, len(input.Variants)),
		Comparisons: make(map[string]OrbitCalculationComparison),
	}
	input.Event.TankLiters = effectivePlanningValue(input.PlanningInputs, strategydocument.PlanningInputTank, input.Event.TankLiters)
	if input.Event.PitServices == nil {
		input.Event.PitLossSeconds = effectivePlanningValue(input.PlanningInputs, strategydocument.PlanningInputPitLoss, input.Event.PitLossSeconds)
	}
	if err := validateOrbitEventResources(input.Event); err != nil {
		return OrbitCalculationResult{}, err
	}
	variants := make(map[string]OrbitCalculationVariant, len(input.Variants))
	for index, variant := range input.Variants {
		if strings.TrimSpace(variant.ID) == "" {
			return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.id", index), ErrCalculationInvalid)
		}
		if _, duplicate := variants[variant.ID]; duplicate {
			return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.id", index), ErrCalculationInvalid)
		}
		plan, err := calculateOrbitPlan(ctx, input.Event, drivers, variant, index, input.PlanningInputs)
		if err != nil {
			return OrbitCalculationResult{}, err
		}
		variants[variant.ID] = variant
		result.Plans[variant.ID] = plan
	}

	active, ok := result.Plans[input.ActiveVariantID]
	if !ok {
		return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.activeVariantId", ErrCalculationInvalid)
	}
	for _, variant := range input.Variants {
		if variant.ID == input.ActiveVariantID {
			continue
		}
		result.Comparisons[variant.ID] = compareOrbitPlans(
			input.ActiveVariantID,
			active,
			variant.ID,
			result.Plans[variant.ID],
			input.Event,
			input.Drivers,
		)
	}
	if len(input.WeatherScenarios) > 0 {
		weatherResult, err := calculateOrbitWeather(ctx, input, drivers, variants[input.ActiveVariantID], active.TotalLaps)
		if err != nil {
			return OrbitCalculationResult{}, err
		}
		result.Weather = &weatherResult
	}
	return result, nil
}

func calculateOrbitWeather(ctx context.Context, input OrbitCalculationInput, drivers map[string]OrbitCalculationDriver, variant OrbitCalculationVariant, comparisonLaps int64) (OrbitWeatherResult, error) {
	if len(variant.Order) == 0 {
		return OrbitWeatherResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.activeVariantId", ErrCalculationInvalid)
	}
	dryPaceTotal, dryFuelTotal, wetPaceTotal, wetFuelTotal := 0.0, 0.0, 0.0, 0.0
	for _, driverID := range variant.Order {
		driver := drivers[driverID]
		dry, err := orbitPace(driver, "dry")
		if err != nil {
			return OrbitWeatherResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.weatherScenarios", err)
		}
		wet, err := orbitPace(driver, "wet")
		if err != nil {
			return OrbitWeatherResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.weatherScenarios", err)
		}
		dryPaceTotal += dry.PaceSeconds
		dryFuelTotal += dry.FuelLitersPerLap
		wetPaceTotal += wet.PaceSeconds
		wetFuelTotal += wet.FuelLitersPerLap
	}
	count := float64(len(variant.Order))
	dryPace, dryFuel := dryPaceTotal/count, dryFuelTotal/count
	wetPace, wetFuel := wetPaceTotal/count, wetFuelTotal/count
	effectivePace := effectivePlanningValue(input.PlanningInputs, strategydocument.PlanningInputPace, dryPace)
	effectiveFuel := effectivePlanningValue(input.PlanningInputs, strategydocument.PlanningInputFuelPerLap, dryFuel)

	parameters := []solver.WeatherBucketParameter{
		orbitWeatherBucketParameter(strategyprojection.ClimateBucketHumid, 0, dryFuel, input.PlanningInputs),
		orbitWeatherBucketParameter(strategyprojection.ClimateBucketWet, wetPace-dryPace, wetFuel, input.PlanningInputs),
	}
	weighted := make([]solver.WeightedWeatherScenario, len(input.WeatherScenarios))
	for index, scenario := range input.WeatherScenarios {
		weighted[index] = solver.WeightedWeatherScenario{Scenario: scenario.Scenario, Weight: scenario.Weight}
	}
	solverInput, err := orbitVariantSolverInput(comparisonLaps, input.Event, drivers, variant, "dry", effectivePace, effectiveFuel, input.PlanningInputs)
	if err != nil {
		return OrbitWeatherResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.activeVariantId", err)
	}
	solved, err := solver.SolveWeatherScenariosContext(
		ctx,
		solverInput,
		solver.WeatherScenarioSet{Scenarios: weighted, BucketParameters: parameters},
	)
	if err != nil {
		return OrbitWeatherResult{}, mapOrbitCalculationError(err, "input.weatherScenarios")
	}
	result := OrbitWeatherResult{ComparisonBasis: "fixed_distance", ComparisonLaps: comparisonLaps, Plans: make([]OrbitWeatherScenarioPlan, 0, len(solved.Plans))}
	for _, plan := range solved.Plans {
		result.Plans = append(result.Plans, OrbitWeatherScenarioPlan{
			ScenarioID: plan.ScenarioID, Weight: plan.Weight, TotalSeconds: plan.Result.Expected.TotalSeconds,
			Stops: len(plan.Result.Best.PitStops), Stints: orbitWeatherStints(plan.Result.Best.Stints), Timeline: orbitWeatherTimeline(plan.Timeline),
			ReserveLaps:             plan.Result.Reserve.EffectiveLaps,
			ReserveRequiredLaps:     requestedReserveLaps(plan.Result.Reserve),
			ReserveSatisfied:        plan.Result.Reserve.Satisfied,
			ReserveLimitingResource: string(plan.Result.Reserve.LimitingResource),
		})
	}
	result.Robust = OrbitWeatherRobustRecommendation{
		Method: solved.Robust.Method, MaxRegretSeconds: solved.Robust.MaxRegretSeconds,
		WeightedExpectedLossSeconds: solved.Robust.WeightedExpectedLossSeconds, Stints: orbitWeatherStints(solved.Robust.Decision.Stints),
	}
	return result, nil
}

func orbitWeatherBucketParameter(bucket strategyprojection.ClimateBucket, paceDelta, fuel float64, planning *strategydocument.PlanningInputs) solver.WeatherBucketParameter {
	parameter := solver.WeatherBucketParameter{
		Bucket: bucket, PaceDeltaSeconds: paceDelta,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: "strategy.orbit.weather." + string(bucket)},
		Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-weather.v1"},
	}
	if !orbitHasDerivedWeatherFuel(planning, bucket) {
		parameter.FuelPerLapLiters = &fuel
	}
	return parameter
}

func orbitHasDerivedWeatherFuel(planning *strategydocument.PlanningInputs, bucket strategyprojection.ClimateBucket) bool {
	if planning == nil || planning.Projection == nil || planning.Projection.FuelConsumption.Presence != strategyprojection.PresenceValid {
		return false
	}
	value, ok := planning.Projection.FuelConsumption.ByClimateBucket[bucket]
	return ok && value > 0
}

func orbitWeatherStints(stints []solver.StintDecision) []OrbitWeatherStint {
	result := make([]OrbitWeatherStint, 0, len(stints))
	for _, stint := range stints {
		result = append(result, OrbitWeatherStint{Index: stint.Index, Laps: stint.Laps, Compound: string(stint.Compound)})
	}
	return result
}

func orbitWeatherTimeline(timeline []solver.WeatherLapCondition) []OrbitWeatherLapCondition {
	result := make([]OrbitWeatherLapCondition, 0, len(timeline))
	for _, condition := range timeline {
		result = append(result, OrbitWeatherLapCondition{Lap: condition.Lap, RainChance: condition.RainChance, Bucket: string(condition.Bucket)})
	}
	return result
}

func calculateOrbitPlan(ctx context.Context, event OrbitCalculationEvent, drivers map[string]OrbitCalculationDriver, variant OrbitCalculationVariant, variantIndex int, planning *strategydocument.PlanningInputs) (OrbitCalculationPlan, error) {
	if len(variant.Order) == 0 {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.order", variantIndex), ErrCalculationInvalid)
	}
	fixedDriverOrder, err := orbitFixedDriverOrder(variant)
	if err != nil {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.driverOrderMode", variantIndex), fmt.Errorf("%v: %w", err, ErrCalculationInvalid))
	}
	if !fixedDriverOrder && (len(variant.Overrides) > 0 || len(variant.PitOverrides) > 0) {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.overrides", variantIndex), ErrCalculationInvalid)
	}
	paceTotal, fuelTotal := 0.0, 0.0
	for orderIndex, driverID := range variant.Order {
		driver, ok := drivers[driverID]
		if !ok {
			return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.order.%d", variantIndex, orderIndex), ErrCalculationInvalid)
		}
		pace, err := effectiveOrbitPace(driver, variant.Mode, planning)
		if err != nil {
			return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.mode", variantIndex), err)
		}
		paceTotal += pace.PaceSeconds
		fuelTotal += pace.FuelLitersPerLap
	}
	averagePace := paceTotal / float64(len(variant.Order))
	averageFuel := fuelTotal / float64(len(variant.Order))

	tracing := manual.Evidence{
		Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "strategy.orbit"},
		Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "validated Orbit input"},
	}
	averageLap, err := contract.NewDurationSeconds(averagePace)
	if err != nil {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.order", variantIndex), err)
	}
	zeroDuration, _ := contract.NewDurationSeconds(0)
	zeroLaps, _ := contract.NewLapCount(0)
	raceInput := manual.RaceInput{
		AverageLap:    manual.Sourced[contract.DurationSeconds]{Value: averageLap, Evidence: tracing},
		FormationLaps: manual.Sourced[contract.LapCount]{Value: zeroLaps, Evidence: tracing},
		PitLoss:       manual.Sourced[contract.DurationSeconds]{Value: zeroDuration, Evidence: tracing},
		Selection:     tracing,
	}

	if event.RaceKind == string(manual.RaceByLaps) {
		if event.TargetLaps == nil {
			return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.targetLaps", ErrCalculationInvalid)
		}
		if event.DurationMinutes != 0 {
			return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.durationMinutes", ErrCalculationInvalid)
		}
		targetLaps, err := contract.NewLapCount(*event.TargetLaps)
		if err != nil {
			return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.targetLaps", err)
		}
		raceInput.Kind = manual.RaceByLaps
		raceInput.TargetLaps = manual.Sourced[contract.LapCount]{Value: targetLaps, Evidence: tracing}
		race, err := manual.CalculateRace(raceInput)
		if err != nil {
			return OrbitCalculationPlan{}, mapOrbitCalculationError(err, "input.event")
		}
		return calculateOrbitLapPlan(ctx, event, drivers, variant, variantIndex, planning, race.CompetitiveLaps.Value(), averagePace, averageFuel)
	}
	if event.RaceKind != "" && event.RaceKind != string(manual.RaceByTime) {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.raceKind", ErrCalculationInvalid)
	}
	if event.TargetLaps != nil {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.targetLaps", ErrCalculationInvalid)
	}
	duration, err := contract.NewDurationSeconds(event.DurationMinutes * 60)
	if err != nil {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.durationMinutes", err)
	}
	raceInput.Kind = manual.RaceByTime
	raceInput.Duration = manual.Sourced[contract.DurationSeconds]{Value: duration, Evidence: tracing}
	raceInput.TimedFinish = manual.TimedFinishCurrentLap
	formationSeconds := 0.0
	if event.FormationSeconds != nil {
		formationSeconds = *event.FormationSeconds
	}
	if !fixedDriverOrder {
		return calculateOrbitLapPlan(ctx, event, drivers, variant, variantIndex, planning, solver.MaxRaceLapsV2, averagePace, averageFuel)
	}
	estimateInput := raceInput
	estimateInput.Duration.Value, err = contract.NewDurationSeconds(duration.Value() - formationSeconds)
	if err != nil {
		return OrbitCalculationPlan{}, mapOrbitCalculationError(err, "input.event.formationSeconds")
	}
	race, err := manual.CalculateRace(estimateInput)
	if err != nil {
		return OrbitCalculationPlan{}, mapOrbitCalculationError(err, "input.event")
	}

	return resolveOrbitTimedHorizon(ctx, raceInput, race.CompetitiveLaps.Value(), formationSeconds, variantIndex, func(laps int64) (OrbitCalculationPlan, error) {
		return calculateOrbitLapPlan(ctx, event, drivers, variant, variantIndex, planning, laps, averagePace, averageFuel)
	})
}

func calculateOrbitLapPlan(ctx context.Context, event OrbitCalculationEvent, drivers map[string]OrbitCalculationDriver, variant OrbitCalculationVariant, variantIndex int, planning *strategydocument.PlanningInputs, raceLaps int64, averagePace, averageFuel float64) (OrbitCalculationPlan, error) {
	solverInput, err := orbitVariantSolverInput(raceLaps, event, drivers, variant, variant.Mode, averagePace, averageFuel, planning)
	if err != nil {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.order", variantIndex), err)
	}
	if event.RaceKind != string(manual.RaceByLaps) && variant.DriverOrderMode == "free" {
		durationSeconds := event.DurationMinutes * 60
		solverInput.RaceDurationSeconds = &durationSeconds
	}
	optimised, err := solver.SolveV2Context(ctx, solverInput)
	if err != nil {
		return OrbitCalculationPlan{}, mapOrbitCalculationError(err, fmt.Sprintf("input.variants.%d", variantIndex))
	}
	if !optimised.Feasible {
		code, cause := ErrorCalculationInfeasible, ErrCalculationInfeasible
		for _, reason := range optimised.Reasons {
			if reason.Code == "candidate_budget_exhausted" || reason.Code == "iteration_budget_exhausted" {
				code, cause = ErrorCalculationOverflow, ErrCalculationOverflow
				break
			}
			if reason.Code == "reserve_not_met" {
				cause = fmt.Errorf("%s: %s: %w", reason.Code, reason.Message, cause)
			}
		}
		return OrbitCalculationPlan{}, calculationApplicationError(code, fmt.Sprintf("input.variants.%d", variantIndex), cause)
	}
	if solverInput.RaceDurationSeconds != nil {
		raceLaps = orbitDecisionLaps(optimised.Best)
	}

	stintCount := len(optimised.Best.Stints)
	if variant.DriverOrderMode != "free" && stintCount < len(variant.Order) {
		stintCount = len(variant.Order)
	}
	var laps []int64
	if stintCount == len(optimised.Best.Stints) && !hasOrbitLapOverrides(variant.Overrides) {
		laps = make([]int64, 0, stintCount)
		for _, stint := range optimised.Best.Stints {
			laps = append(laps, stint.Laps)
		}
	} else {
		laps = distributeOrbitLaps(raceLaps, stintCount, variant.Overrides)
	}
	if len(laps) == 0 {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.overrides", variantIndex), ErrCalculationInvalid)
	}
	if event.TyreInventory != nil && !orbitMatchesSolvedStints(laps, optimised.Best.Stints) {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.overrides", variantIndex), ErrCalculationInvalid)
	}

	plan := OrbitCalculationPlan{
		Stints:       make([]OrbitCalculationStint, 0, len(laps)),
		TotalLaps:    raceLaps,
		Stops:        int64(len(laps) - 1),
		MaxLaps:      orbitMaximumStintLaps(optimised, raceLaps),
		AverageFuel:  optimised.ResolvedInputs.FuelPerLapLiters.Value,
		AveragePace:  optimised.ResolvedInputs.BaseLapSeconds.Value,
		Distribution: make([]OrbitCalculationDistribution, 0, len(drivers)),
		StopDetails:  make([]OrbitCalculationStop, 0, len(laps)-1),
	}
	lap := int64(0)
	byDriver := make(map[string]*OrbitCalculationDistribution)
	for index, count := range laps {
		driverID := variant.Order[index%len(variant.Order)]
		var saving solver.StintDecision
		if index < len(optimised.Best.Stints) && optimised.Best.Stints[index].Laps == count {
			saving = optimised.Best.Stints[index]
			if saving.Driver != "" {
				driverID = saving.Driver
			}
		}
		driverPace, err := effectiveOrbitPace(drivers[driverID], variant.Mode, planning)
		if err != nil {
			return OrbitCalculationPlan{}, err
		}
		_, manualOverride := variant.Overrides[index]
		lastLap := lap + count
		pitWindowLap := lastLap - 3
		if pitWindowLap < lap+1 {
			pitWindowLap = lap + 1
		}
		stint := OrbitCalculationStint{
			Index:             index,
			DriverID:          driverID,
			Laps:              count,
			Pace:              driverPace.PaceSeconds,
			FirstLap:          lap + 1,
			LastLap:           lastLap,
			PitWindowLap:      pitWindowLap,
			PitWindowSeconds:  float64(pitWindowLap-(lap+1)) * driverPace.PaceSeconds,
			Manual:            manualOverride,
			SavingLevel:       string(saving.SavingLevel),
			FuelSavedPerLap:   saving.FuelSavedPerLap,
			SavingCostSeconds: saving.SavingCostSeconds,
			Compound:          saving.Compound,
			TyreFitment:       saving.TyreFitment,
		}
		if saving.SavingLevel != "" && saving.SavingLevel != solver.SavingNone {
			plan.SavingApplied = true
		}
		plan.Stints = append(plan.Stints, stint)
		distribution := byDriver[driverID]
		if distribution == nil {
			distribution = &OrbitCalculationDistribution{DriverID: driverID}
			byDriver[driverID] = distribution
		}
		distribution.Laps += count
		lap = lastLap
		if index < len(laps)-1 {
			plan.StopDetails = append(plan.StopDetails, OrbitCalculationStop{Index: index, Lap: lastLap})
		}
	}
	for _, driverID := range variant.Order {
		if distribution := byDriver[driverID]; distribution != nil {
			plan.Distribution = append(plan.Distribution, *distribution)
			delete(byDriver, driverID)
		}
	}
	if err := evaluateFinalOrbitPlan(&plan, solverInput, optimised, drivers, variant, planning); err != nil {
		if errors.Is(err, ErrCalculationInfeasible) {
			return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInfeasible, fmt.Sprintf("input.variants.%d", variantIndex), err)
		}
		return OrbitCalculationPlan{}, mapOrbitCalculationError(err, fmt.Sprintf("input.variants.%d", variantIndex))
	}
	return plan, nil
}

func orbitDecisionLaps(decision solver.DecisionVector) int64 {
	var laps int64
	for _, stint := range decision.Stints {
		laps += stint.Laps
	}
	return laps
}

const orbitLegacyAllInServiceRate = 1e12

func orbitSolverInput(
	raceLaps int64,
	event OrbitCalculationEvent,
	averagePace, averageFuel float64,
	paceBucket strategyprojection.ClimateBucket,
	planning *strategydocument.PlanningInputs,
) solver.SolverInputV2 {
	formation := solver.Formation{Seconds: solver.NewFallbackScalar(0, "strategy.orbit.no-formation"), Presence: string(strategyprojection.PresenceValid)}
	if event.FormationSeconds != nil {
		formation.Seconds = orbitExplicitScalar(*event.FormationSeconds, "strategy.orbit.formation")
	}
	input := solver.SolverInputV2{
		ContractVersion:      solver.SolverContractVersionV2,
		RaceLaps:             raceLaps,
		BaseLapSeconds:       orbitScalarInput(planning, strategydocument.PlanningInputPace, averagePace, "strategy.orbit.base-pace"),
		BaseLapClimateBucket: paceBucket,
		Projection:           orbitProjection(planning),
		PitCost:              orbitPitCost(event, planning),
		Formation:            formation,
		Budget:               solver.ComputeBudget{P95Millis: 10_000},
		FuelCapacityLiters:   orbitScalarInput(planning, strategydocument.PlanningInputTank, event.TankLiters, "strategy.orbit.tank"),
		VECapacityPercent:    orbitVECapacity(planning),
		TyreLifeLaps:         orbitScalarInput(planning, strategydocument.PlanningInputTyreLife, 0, "strategy.orbit.tyre-life-not-configured"),
		FuelPerLapLiters:     orbitScalarInput(planning, strategydocument.PlanningInputFuelPerLap, averageFuel, "strategy.orbit.fuel-per-lap"),
		VEPerLapPercent:      orbitScalarInput(planning, strategydocument.PlanningInputVEPerLap, 0, "strategy.orbit.virtual-energy-not-configured"),
		FuelReserve:          orbitFuelReserve(event, planning),
		VirtualEnergyReserve: orbitVirtualEnergyReserve(event, planning),
		DegradationPerLap:    orbitScalarInput(planning, strategydocument.PlanningInputDegradation, 0, "strategy.orbit.degradation-not-configured"),
		SavingCost:           orbitSavingCost(planning),
		// Orbit expresa consumo por vuelta, no litros arbitrarios de servicio.
		// Explorar multiplos de una vuelta conserva todas sus decisiones posibles
		// y evita introducir precision que la pantalla no puede editar.
		Discretization: solver.ServiceDiscretization{FuelLiters: orbitFuelServiceStep(averageFuel, planning), VEPercent: 1},
		TyreInventory:  event.TyreInventory,
		CompoundPace:   event.CompoundPace,
	}
	if event.Rules != nil {
		input.EventRules = *event.Rules
	}
	if event.InitialFuelLiters != nil {
		value := orbitExplicitScalar(*event.InitialFuelLiters, "strategy.orbit.initial-fuel")
		input.InitialFuelLiters = &value
	}
	if event.VirtualEnergy != nil {
		if event.VirtualEnergy.Applicability == "not_applicable" {
			input.Projection = orbitProjectionWithoutVirtualEnergy(planning)
			input.VECapacityPercent = orbitExplicitScalar(0, "strategy.orbit.virtual-energy-not-applicable")
			input.VEPerLapPercent = orbitExplicitScalar(0, "strategy.orbit.virtual-energy-not-applicable")
		} else {
			input.VECapacityPercent = orbitExplicitScalar(*event.VirtualEnergy.CapacityPercent, "strategy.orbit.virtual-energy-capacity")
			if event.VirtualEnergy.InitialPercent != nil {
				value := orbitExplicitScalar(*event.VirtualEnergy.InitialPercent, "strategy.orbit.initial-virtual-energy")
				input.InitialVEPercent = &value
			}
		}
	}
	return input
}

func orbitVariantSolverInput(
	raceLaps int64,
	event OrbitCalculationEvent,
	drivers map[string]OrbitCalculationDriver,
	variant OrbitCalculationVariant,
	profileMode string,
	averagePace, averageFuel float64,
	planning *strategydocument.PlanningInputs,
) (solver.SolverInputV2, error) {
	fixedDriverOrder, err := orbitFixedDriverOrder(variant)
	if err != nil {
		return solver.SolverInputV2{}, err
	}
	input := orbitSolverInput(raceLaps, event, averagePace, averageFuel, orbitClimateBucket(profileMode), planning)
	hasDriverLimits := event.Rules != nil && len(event.Rules.DriverLimits) > 0
	if len(variant.Order) == 1 && !hasDriverLimits {
		return input, nil
	}
	vePerLap := input.ResolveScalarInputs().VEPerLapPercent.Value
	input.DriverProfiles = make([]solver.DriverProfileInput, 0, len(variant.Order))
	seen := make(map[string]bool, len(variant.Order))
	for _, driverID := range variant.Order {
		if seen[driverID] {
			continue
		}
		driver, ok := drivers[driverID]
		if !ok {
			return solver.SolverInputV2{}, fmt.Errorf("driver %q is not configured", driverID)
		}
		pace, err := effectiveOrbitPace(driver, profileMode, planning)
		if err != nil {
			return solver.SolverInputV2{}, err
		}
		input.DriverProfiles = append(input.DriverProfiles, orbitDriverProfile(
			driverID, pace, vePerLap,
			strategyprojection.Provenance{Kind: strategyprojection.ProvenanceReference, SourceID: "strategy.orbit.driver-configuration:" + driverID},
		))
		seen[driverID] = true
	}
	if fixedDriverOrder && len(variant.Order) > 1 {
		input.DriverSequence = append([]string(nil), variant.Order...)
	}
	return input, nil
}

func orbitFixedDriverOrder(variant OrbitCalculationVariant) (bool, error) {
	switch variant.DriverOrderMode {
	case "", "fixed":
		return true, nil
	case "free":
		seen := make(map[string]bool, len(variant.Order))
		for _, driverID := range variant.Order {
			if seen[driverID] {
				return false, fmt.Errorf("free driver order contains duplicate driver %q", driverID)
			}
			seen[driverID] = true
		}
		return false, nil
	default:
		return false, fmt.Errorf("unknown driverOrderMode %q", variant.DriverOrderMode)
	}
}

func orbitMatchesSolvedStints(laps []int64, solved []solver.StintDecision) bool {
	if len(laps) != len(solved) {
		return false
	}
	for index := range laps {
		if laps[index] != solved[index].Laps {
			return false
		}
	}
	return true
}

func orbitFuelServiceStep(fuelPerLap float64, planning *strategydocument.PlanningInputs) float64 {
	step := fuelPerLap
	if saving := orbitSavingCost(planning); saving != nil {
		for _, level := range saving.Levels {
			if level.FuelSavedPerLap > 0 && level.FuelSavedPerLap < step {
				step = level.FuelSavedPerLap
			}
		}
	}
	return step
}

func orbitFuelReserve(event OrbitCalculationEvent, planning *strategydocument.PlanningInputs) manual.FuelReserveInput {
	if event.FuelReserveLiters != nil {
		// validateOrbitEventResources already checked this value.
		amount, _ := contract.NewFuelLiters(*event.FuelReserveLiters)
		evidence := orbitExplicitEvidence("strategy.orbit.fuel-reserve")
		return manual.FuelReserveInput{Kind: manual.ReserveAmount, Amount: manual.Sourced[contract.FuelLiters]{Value: amount, Evidence: evidence}, Selection: evidence}
	}
	laps, evidence := orbitReserveLaps(planning)
	return manual.FuelReserveInput{Kind: manual.ReserveLaps, Laps: manual.Sourced[float64]{Value: laps, Evidence: evidence}, Selection: evidence}
}

func orbitVirtualEnergyReserve(event OrbitCalculationEvent, planning *strategydocument.PlanningInputs) manual.VirtualEnergyReserveInput {
	if event.VirtualEnergy != nil {
		evidence := orbitExplicitEvidence("strategy.orbit.virtual-energy-reserve")
		if event.VirtualEnergy.Applicability == "not_applicable" {
			return manual.VirtualEnergyReserveInput{Kind: manual.ReserveNone, Selection: evidence}
		}
		// validateOrbitEventResources already checked this value.
		amount, _ := contract.NewVirtualEnergyPercent(*event.VirtualEnergy.ReservePercent)
		return manual.VirtualEnergyReserveInput{Kind: manual.ReserveAmount, Amount: manual.Sourced[contract.VirtualEnergyPercent]{Value: amount, Evidence: evidence}, Selection: evidence}
	}
	laps, evidence := orbitReserveLaps(planning)
	return manual.VirtualEnergyReserveInput{Kind: manual.ReserveLaps, Laps: manual.Sourced[float64]{Value: laps, Evidence: evidence}, Selection: evidence}
}

func orbitReserveLaps(planning *strategydocument.PlanningInputs) (float64, manual.Evidence) {
	value := orbitDefaultReserveLaps
	sourceID := orbitDefaultReserveSourceID
	basis := "Isaac product decision 2026-08-25"
	if planning != nil {
		if override, ok := planning.Overrides[strategydocument.PlanningInputReserveLaps]; ok && override.Presence == strategyprojection.PresenceValid {
			value = override.Value
			sourceID = override.Provenance.SourceID
			basis = "validated event reserve input"
		}
	}
	evidence := manual.Evidence{
		Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: sourceID},
		Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: basis},
	}
	return value, evidence
}

func requestedReserveLaps(status solver.ReserveStatus) float64 {
	requested := status.Fuel.RequestedLaps
	if status.VirtualEnergy.RequestedLaps > requested {
		requested = status.VirtualEnergy.RequestedLaps
	}
	return requested
}

func orbitClimateBucket(mode string) strategyprojection.ClimateBucket {
	if mode == "wet" {
		return strategyprojection.ClimateBucketWet
	}
	return strategyprojection.ClimateBucketDry
}

func orbitSavingCost(planning *strategydocument.PlanningInputs) *solver.SavingCostParameter {
	if planning == nil {
		return nil
	}
	fuel, fuelSet := planning.Overrides[strategydocument.PlanningInputSavingFuel]
	timeCost, timeSet := planning.Overrides[strategydocument.PlanningInputSavingTimeCost]
	if !fuelSet && !timeSet {
		return nil
	}
	source := fuel
	if !fuelSet {
		source = timeCost
	}
	return &solver.SavingCostParameter{
		Presence:   source.Presence,
		Provenance: source.Provenance,
		Confidence: source.Confidence,
		Role:       solver.ScalarRoleUserOverride,
		Levels: []solver.SavingLevelOption{{
			Level:           solver.SavingLow,
			FuelSavedPerLap: fuel.Value,
			TimeCostPerLap:  timeCost.Value,
		}},
	}
}

func orbitVECapacity(planning *strategydocument.PlanningInputs) solver.ScalarInput {
	configured := false
	if planning != nil {
		if override, ok := planning.Overrides[strategydocument.PlanningInputVEPerLap]; ok && override.Presence == strategyprojection.PresenceValid && override.Value > 0 {
			configured = true
		}
		if planning.Projection != nil {
			family := planning.Projection.VirtualEnergyConsumption
			configured = configured || family.Presence == strategyprojection.PresenceValid && family.MeanPerLap > 0
		}
	}
	if !configured {
		return solver.NewFallbackScalar(0, "strategy.orbit.virtual-energy-not-configured")
	}
	return solver.NewSourcedScalar(
		100,
		strategyprojection.Provenance{Kind: strategyprojection.ProvenanceReference, SourceID: "strategy.orbit.ve-percent-scale"},
		strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-adapter.v2"},
		solver.ScalarRoleFallback,
	)
}

func orbitExplicitEvidence(sourceID string) manual.Evidence {
	return manual.Evidence{
		Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: sourceID},
		Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "validated explicit event resource"},
	}
}

func orbitExplicitScalar(value float64, sourceID string) solver.ScalarInput {
	return solver.NewSourcedScalar(
		value,
		strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: sourceID},
		strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-adapter.v3"},
		solver.ScalarRoleUserOverride,
	)
}

func orbitProjectionWithoutVirtualEnergy(planning *strategydocument.PlanningInputs) *strategyprojection.StrategyInputProjectionV2 {
	projection := orbitProjection(planning)
	if projection == nil {
		return nil
	}
	clone := *projection
	clone.VirtualEnergyConsumption.Presence = strategyprojection.PresenceMissing
	clone.VirtualEnergyConsumption.Reason = "virtual_energy_not_applicable"
	return &clone
}

func validateOrbitEventResources(event OrbitCalculationEvent) error {
	if event.FormationSeconds != nil {
		if _, err := contract.NewDurationSeconds(*event.FormationSeconds); err != nil {
			return calculationApplicationError(ErrorCalculationInvalid, "input.event.formationSeconds", err)
		}
		if event.RaceKind != string(manual.RaceByLaps) && *event.FormationSeconds >= event.DurationMinutes*60 {
			return calculationApplicationError(ErrorCalculationInvalid, "input.event.formationSeconds", ErrCalculationInvalid)
		}
	}
	if services := event.PitServices; services != nil {
		if services.TransitSeconds == nil || services.RefuelRateLPerS == nil || services.VERatePPerS == nil || services.TyreSeconds == nil {
			return calculationApplicationError(ErrorCalculationInvalid, "input.event.pitServices", ErrCalculationInvalid)
		}
		if err := orbitPitCost(event, nil).Validate(); err != nil {
			return calculationApplicationError(ErrorCalculationInvalid, "input.event.pitServices", err)
		}
	}
	if event.InitialFuelLiters != nil {
		initial, err := contract.NewFuelLiters(*event.InitialFuelLiters)
		if err != nil || initial.Value() > event.TankLiters {
			return calculationApplicationError(ErrorCalculationInvalid, "input.event.initialFuelLiters", ErrCalculationInvalid)
		}
	}
	if event.FuelReserveLiters != nil {
		if _, err := contract.NewFuelLiters(*event.FuelReserveLiters); err != nil {
			return calculationApplicationError(ErrorCalculationInvalid, "input.event.fuelReserveLiters", err)
		}
	}
	if event.VirtualEnergy == nil {
		return nil
	}
	energy := event.VirtualEnergy
	if energy.Applicability == "not_applicable" {
		return nil
	}
	if energy.Applicability != "applicable" {
		return calculationApplicationError(ErrorCalculationInvalid, "input.event.virtualEnergy.applicability", ErrCalculationInvalid)
	}
	if energy.CapacityPercent == nil {
		return calculationApplicationError(ErrorCalculationInvalid, "input.event.virtualEnergy.capacityPercent", ErrCalculationInvalid)
	}
	if energy.ReservePercent == nil {
		return calculationApplicationError(ErrorCalculationInvalid, "input.event.virtualEnergy.reservePercent", ErrCalculationInvalid)
	}
	capacity, err := contract.NewVirtualEnergyPercent(*energy.CapacityPercent)
	if err != nil || capacity.Value() == 0 {
		return calculationApplicationError(ErrorCalculationInvalid, "input.event.virtualEnergy.capacityPercent", ErrCalculationInvalid)
	}
	reserve, err := contract.NewVirtualEnergyPercent(*energy.ReservePercent)
	if err != nil || reserve.Value() > capacity.Value() {
		return calculationApplicationError(ErrorCalculationInvalid, "input.event.virtualEnergy.reservePercent", ErrCalculationInvalid)
	}
	if energy.InitialPercent != nil {
		initial, err := contract.NewVirtualEnergyPercent(*energy.InitialPercent)
		if err != nil || initial.Value() > capacity.Value() {
			return calculationApplicationError(ErrorCalculationInvalid, "input.event.virtualEnergy.initialPercent", ErrCalculationInvalid)
		}
	}
	return nil
}

func orbitPitCost(event OrbitCalculationEvent, planning *strategydocument.PlanningInputs) solver.PitCostModel {
	if services := event.PitServices; services != nil {
		return solver.PitCostModel{
			TransitSeconds:  orbitExplicitScalar(*services.TransitSeconds, "strategy.orbit.pit-transit"),
			RefuelRateLPerS: orbitExplicitScalar(*services.RefuelRateLPerS, "strategy.orbit.refuel-rate"),
			VERatePPerS:     orbitExplicitScalar(*services.VERatePPerS, "strategy.orbit.virtual-energy-rate"),
			TyreSeconds:     orbitExplicitScalar(*services.TyreSeconds, "strategy.orbit.tyre-service"),
			ServiceMode:     manual.PitServiceMode(services.ServiceMode),
		}
	}
	return solver.PitCostModel{
		TransitSeconds:  orbitScalarInput(planning, strategydocument.PlanningInputPitLoss, event.PitLossSeconds, "strategy.orbit.legacy-all-in-pit"),
		RefuelRateLPerS: solver.NewFallbackScalar(orbitLegacyAllInServiceRate, "strategy.orbit.legacy-all-in-pit"),
		VERatePPerS:     solver.NewFallbackScalar(orbitLegacyAllInServiceRate, "strategy.orbit.legacy-all-in-pit"),
		TyreSeconds:     solver.NewFallbackScalar(0, "strategy.orbit.legacy-all-in-pit"),
		ServiceMode:     manual.PitServiceParallel,
	}
}

func orbitProjection(planning *strategydocument.PlanningInputs) *strategyprojection.StrategyInputProjectionV2 {
	if planning == nil {
		return nil
	}
	return planning.Projection
}

func orbitScalarInput(planning *strategydocument.PlanningInputs, field strategydocument.PlanningInputField, fallback float64, sourceID string) solver.ScalarInput {
	if planning != nil {
		if override, ok := planning.Overrides[field]; ok && override.Presence == strategyprojection.PresenceValid {
			role := solver.ScalarRoleFallback
			if override.Provenance.Kind == strategyprojection.ProvenanceManual || override.Provenance.Kind == strategyprojection.ProvenanceCorrected {
				role = solver.ScalarRoleUserOverride
			}
			return solver.NewSourcedScalar(override.Value, override.Provenance, override.Confidence, role)
		}
	}
	return solver.NewFallbackScalar(fallback, sourceID)
}

func orbitMaximumStintLaps(result solver.SolverResultV2, raceLaps int64) int64 {
	if result.Binding.Laps > 0 {
		return result.Binding.Laps
	}
	return raceLaps
}

func hasOrbitLapOverrides(overrides map[int]OrbitCalculationOverride) bool {
	for _, override := range overrides {
		if override.Laps != nil && *override.Laps > 0 {
			return true
		}
	}
	return false
}

func distributeOrbitLaps(total int64, stints int, overrides map[int]OrbitCalculationOverride) []int64 {
	if total <= 0 || stints <= 0 {
		return nil
	}
	result := make([]int64, stints)
	fixed, free := int64(0), stints
	for index, override := range overrides {
		if index < 0 || index >= stints || override.Laps == nil || *override.Laps <= 0 {
			continue
		}
		result[index] = *override.Laps
		fixed += *override.Laps
		free--
	}
	remaining := total - fixed
	if remaining < 0 || free == 0 && remaining != 0 {
		return nil
	}
	if free == 0 {
		return result
	}
	base, extra := remaining/int64(free), remaining%int64(free)
	for index := range result {
		if result[index] > 0 {
			continue
		}
		result[index] = base
		if extra > 0 {
			result[index]++
			extra--
		}
		if result[index] <= 0 {
			return nil
		}
	}
	return result
}

func orbitPace(driver OrbitCalculationDriver, mode string) (OrbitCalculationPace, error) {
	switch mode {
	case "dry":
		return driver.Dry, nil
	case "wet":
		return driver.Wet, nil
	case "eco":
		return driver.Eco, nil
	default:
		return OrbitCalculationPace{}, ErrCalculationInvalid
	}
}

func effectiveOrbitPace(driver OrbitCalculationDriver, mode string, planning *strategydocument.PlanningInputs) (OrbitCalculationPace, error) {
	pace, err := orbitPace(driver, mode)
	if err != nil {
		return OrbitCalculationPace{}, err
	}
	pace.PaceSeconds = effectivePlanningValueForBucket(
		planning, strategydocument.PlanningInputPace, pace.PaceSeconds, orbitClimateBucket(mode),
	)
	if math.IsNaN(pace.PaceSeconds) || math.IsInf(pace.PaceSeconds, 0) || pace.PaceSeconds <= 0 ||
		math.IsNaN(driver.PaceDeltaSeconds) || math.IsInf(driver.PaceDeltaSeconds, 0) || pace.PaceSeconds+driver.PaceDeltaSeconds <= 0 {
		return OrbitCalculationPace{}, ErrCalculationInvalid
	}
	pace.PaceSeconds += driver.PaceDeltaSeconds
	pace.FuelLitersPerLap = effectivePlanningValue(planning, strategydocument.PlanningInputFuelPerLap, pace.FuelLitersPerLap)
	return pace, nil
}

func effectivePlanningValue(planning *strategydocument.PlanningInputs, field strategydocument.PlanningInputField, fallback float64) float64 {
	return effectivePlanningValueForBucket(planning, field, fallback, strategyprojection.ClimateBucketDry)
}

func effectivePlanningValueForBucket(
	planning *strategydocument.PlanningInputs,
	field strategydocument.PlanningInputField,
	fallback float64,
	bucket strategyprojection.ClimateBucket,
) float64 {
	if planning == nil {
		return fallback
	}
	if override, ok := planning.Overrides[field]; ok && override.Presence == strategyprojection.PresenceValid {
		return override.Value
	}
	if planning.Projection == nil {
		return fallback
	}
	switch field {
	case strategydocument.PlanningInputPace:
		family, ok := planning.Projection.RepresentativePaceByClimateBucket[bucket]
		if ok && family.Presence == strategyprojection.PresenceValid && family.MedianLapSeconds > 0 {
			return family.MedianLapSeconds
		}
	case strategydocument.PlanningInputFuelPerLap:
		family := planning.Projection.FuelConsumption
		if family.Presence == strategyprojection.PresenceValid && family.MeanPerLap > 0 {
			return family.MeanPerLap
		}
	case strategydocument.PlanningInputVEPerLap:
		family := planning.Projection.VirtualEnergyConsumption
		if family.Presence == strategyprojection.PresenceValid && family.MeanPerLap > 0 {
			return family.MeanPerLap
		}
	case strategydocument.PlanningInputTyreLife:
		family := planning.Projection.TyreDegradation
		if family.Presence == strategyprojection.PresenceValid && family.LifeLapsEstimate != nil {
			return float64(*family.LifeLapsEstimate)
		}
	}
	return fallback
}

func compareOrbitPlans(activeID string, active OrbitCalculationPlan, otherID string, other OrbitCalculationPlan, event OrbitCalculationEvent, drivers []OrbitCalculationDriver) OrbitCalculationComparison {
	winnerID, loserID := activeID, otherID
	winnerLaps, loserLaps := active.TotalLaps, other.TotalLaps
	if other.TotalLaps > active.TotalLaps {
		winnerID, loserID = otherID, activeID
		winnerLaps, loserLaps = other.TotalLaps, active.TotalLaps
	}
	savedStops := active.Stops - other.Stops
	savedSeconds := float64(savedStops) * event.PitLossSeconds
	if event.PitServices != nil {
		savedSeconds = active.PitSeconds - other.PitSeconds
	}
	costSeconds := (other.AveragePace - active.AveragePace) * float64(other.TotalLaps)
	doubles := make([]string, 0)
	for _, driver := range drivers {
		count := 0
		for _, stint := range active.Stints {
			if stint.DriverID == driver.ID {
				count++
			}
		}
		if count > 1 {
			name := strings.Fields(driver.Name)
			if len(name) > 0 {
				doubles = append(doubles, name[0])
			}
		}
	}
	return OrbitCalculationComparison{
		WinnerID: winnerID, LoserID: loserID, WinnerLaps: winnerLaps, LoserLaps: loserLaps,
		Difference: winnerLaps - loserLaps, SavedStops: savedStops, SavedSecs: savedSeconds,
		CostSecs: costSeconds, TotalDeltaSeconds: other.TotalSeconds - active.TotalSeconds,
		Pays: savedSeconds > costSeconds, SameStops: savedStops <= 0,
		Stints: len(active.Stints), DriverCount: len(drivers), Doubles: doubles,
	}
}

func mapOrbitCalculationError(err error, field string) error {
	if errors.Is(err, context.Canceled) {
		return calculationApplicationError(ErrorCalculationCancelled, field, errors.Join(ErrCalculationCancelled, err))
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return calculationApplicationError(ErrorCalculationTimeout, field, errors.Join(ErrCalculationTimeout, err))
	}
	var manualErr *manual.CalculationError
	if errors.As(err, &manualErr) {
		code := ErrorCalculationInvalid
		cause := ErrCalculationInvalid
		switch manualErr.Code {
		case manual.ErrorOverflow:
			code, cause = ErrorCalculationOverflow, ErrCalculationOverflow
		case manual.ErrorInsufficientCapacity:
			code, cause = ErrorCalculationInfeasible, ErrCalculationInfeasible
		}
		return calculationApplicationError(code, field+"."+manualErr.Field, errors.Join(cause, err))
	}
	var solverErr *solver.SolveError
	if errors.As(err, &solverErr) {
		code := ErrorCalculationInvalid
		cause := ErrCalculationInvalid
		switch solverErr.Code {
		case solver.ErrorOverflow:
			code, cause = ErrorCalculationOverflow, ErrCalculationOverflow
		case solver.ErrorInfeasible:
			code, cause = ErrorCalculationInfeasible, ErrCalculationInfeasible
		}
		return calculationApplicationError(code, field+"."+solverErr.Field, errors.Join(cause, err))
	}
	return calculationApplicationError(ErrorCalculationInvalid, field, errors.Join(ErrCalculationInvalid, err))
}

func calculationApplicationError(code ErrorCode, field string, cause error) error {
	return applicationError(code, field, cause)
}
