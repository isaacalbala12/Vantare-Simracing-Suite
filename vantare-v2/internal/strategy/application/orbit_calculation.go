package application

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// CalculateOrbit performs the historical Orbit use case through the Go
// authorities. It is read-only, so repositoryVersion is only correlated back
// to the caller and no snapshot is required.
func (service *Service[T]) CalculateOrbit(_ context.Context, command CalculateOrbitCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationCalculateOrbit); err != nil {
		return Result[T]{}, err
	}
	calculated, err := calculateOrbit(command.Input)
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
	input.Event.PitLossSeconds = effectivePlanningValue(input.PlanningInputs, strategydocument.PlanningInputPitLoss, input.Event.PitLossSeconds)
	variants := make(map[string]OrbitCalculationVariant, len(input.Variants))
	for index, variant := range input.Variants {
		if strings.TrimSpace(variant.ID) == "" {
			return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.id", index), ErrCalculationInvalid)
		}
		if _, duplicate := variants[variant.ID]; duplicate {
			return OrbitCalculationResult{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.id", index), ErrCalculationInvalid)
		}
		plan, err := calculateOrbitPlan(input.Event, drivers, variant, index, input.PlanningInputs)
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
			input.Event.PitLossSeconds,
			input.Drivers,
		)
	}
	if len(input.WeatherScenarios) > 0 {
		weatherResult, err := calculateOrbitWeather(input, drivers, variants[input.ActiveVariantID])
		if err != nil {
			return OrbitCalculationResult{}, err
		}
		result.Weather = &weatherResult
	}
	return result, nil
}

func calculateOrbitWeather(input OrbitCalculationInput, drivers map[string]OrbitCalculationDriver, variant OrbitCalculationVariant) (OrbitWeatherResult, error) {
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

	tracing := manual.Evidence{
		Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "strategy.orbit.weather"},
		Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "validated Orbit weather input"},
	}
	duration, err := contract.NewDurationSeconds(input.Event.DurationMinutes * 60)
	if err != nil {
		return OrbitWeatherResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.durationMinutes", err)
	}
	averageLap, err := contract.NewDurationSeconds(effectivePace)
	if err != nil {
		return OrbitWeatherResult{}, calculationApplicationError(ErrorCalculationInvalid, "input.weatherScenarios", err)
	}
	zeroDuration, _ := contract.NewDurationSeconds(0)
	zeroLaps, _ := contract.NewLapCount(0)
	race, err := manual.CalculateRace(manual.RaceInput{
		Kind: manual.RaceByTime, Duration: manual.Sourced[contract.DurationSeconds]{Value: duration, Evidence: tracing},
		AverageLap:    manual.Sourced[contract.DurationSeconds]{Value: averageLap, Evidence: tracing},
		FormationLaps: manual.Sourced[contract.LapCount]{Value: zeroLaps, Evidence: tracing},
		PitLoss:       manual.Sourced[contract.DurationSeconds]{Value: zeroDuration, Evidence: tracing}, TimedFinish: manual.TimedFinishCurrentLap, Selection: tracing,
	})
	if err != nil {
		return OrbitWeatherResult{}, mapOrbitCalculationError(err, "input.event")
	}

	parameters := []solver.WeatherBucketParameter{
		orbitWeatherBucketParameter(strategyprojection.ClimateBucketHumid, 0, dryFuel, input.PlanningInputs),
		orbitWeatherBucketParameter(strategyprojection.ClimateBucketWet, wetPace-dryPace, wetFuel, input.PlanningInputs),
	}
	weighted := make([]solver.WeightedWeatherScenario, len(input.WeatherScenarios))
	for index, scenario := range input.WeatherScenarios {
		weighted[index] = solver.WeightedWeatherScenario{Scenario: scenario.Scenario, Weight: scenario.Weight}
	}
	solved, err := solver.SolveWeatherScenarios(
		orbitSolverInput(race.CompetitiveLaps.Value(), input.Event, effectivePace, effectiveFuel, input.PlanningInputs),
		solver.WeatherScenarioSet{Scenarios: weighted, BucketParameters: parameters},
	)
	if err != nil {
		return OrbitWeatherResult{}, mapOrbitCalculationError(err, "input.weatherScenarios")
	}
	result := OrbitWeatherResult{Plans: make([]OrbitWeatherScenarioPlan, 0, len(solved.Plans))}
	for _, plan := range solved.Plans {
		result.Plans = append(result.Plans, OrbitWeatherScenarioPlan{
			ScenarioID: plan.ScenarioID, Weight: plan.Weight, TotalSeconds: plan.Result.Expected.TotalSeconds,
			Stops: len(plan.Result.Best.PitStops), Stints: orbitWeatherStints(plan.Result.Best.Stints), Timeline: orbitWeatherTimeline(plan.Timeline),
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

func calculateOrbitPlan(event OrbitCalculationEvent, drivers map[string]OrbitCalculationDriver, variant OrbitCalculationVariant, variantIndex int, planning *strategydocument.PlanningInputs) (OrbitCalculationPlan, error) {
	if len(variant.Order) == 0 {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.order", variantIndex), ErrCalculationInvalid)
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
	duration, err := contract.NewDurationSeconds(event.DurationMinutes * 60)
	if err != nil {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, "input.event.durationMinutes", err)
	}
	averageLap, err := contract.NewDurationSeconds(averagePace)
	if err != nil {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.order", variantIndex), err)
	}
	zeroDuration, _ := contract.NewDurationSeconds(0)
	zeroLaps, _ := contract.NewLapCount(0)
	race, err := manual.CalculateRace(manual.RaceInput{
		Kind:          manual.RaceByTime,
		Duration:      manual.Sourced[contract.DurationSeconds]{Value: duration, Evidence: tracing},
		AverageLap:    manual.Sourced[contract.DurationSeconds]{Value: averageLap, Evidence: tracing},
		FormationLaps: manual.Sourced[contract.LapCount]{Value: zeroLaps, Evidence: tracing},
		PitLoss:       manual.Sourced[contract.DurationSeconds]{Value: zeroDuration, Evidence: tracing},
		TimedFinish:   manual.TimedFinishCurrentLap,
		Selection:     tracing,
	})
	if err != nil {
		return OrbitCalculationPlan{}, mapOrbitCalculationError(err, "input.event")
	}

	optimised, err := solver.SolveV2(orbitSolverInput(race.CompetitiveLaps.Value(), event, averagePace, averageFuel, planning))
	if err != nil {
		return OrbitCalculationPlan{}, mapOrbitCalculationError(err, fmt.Sprintf("input.variants.%d", variantIndex))
	}

	stintCount := len(optimised.Best.Stints)
	if stintCount < len(variant.Order) {
		stintCount = len(variant.Order)
	}
	var laps []int64
	if stintCount == len(optimised.Best.Stints) && !hasOrbitLapOverrides(variant.Overrides) {
		laps = make([]int64, 0, stintCount)
		for _, stint := range optimised.Best.Stints {
			laps = append(laps, stint.Laps)
		}
	} else {
		laps = distributeOrbitLaps(race.CompetitiveLaps.Value(), stintCount, variant.Overrides)
	}
	if len(laps) == 0 {
		return OrbitCalculationPlan{}, calculationApplicationError(ErrorCalculationInvalid, fmt.Sprintf("input.variants.%d.overrides", variantIndex), ErrCalculationInvalid)
	}

	plan := OrbitCalculationPlan{
		Stints:       make([]OrbitCalculationStint, 0, len(laps)),
		TotalLaps:    race.CompetitiveLaps.Value(),
		Stops:        int64(len(laps) - 1),
		MaxLaps:      orbitMaximumStintLaps(optimised, race.CompetitiveLaps.Value()),
		AverageFuel:  optimised.ResolvedInputs.FuelPerLapLiters.Value,
		AveragePace:  optimised.ResolvedInputs.BaseLapSeconds.Value,
		Distribution: make([]OrbitCalculationDistribution, 0, len(drivers)),
	}
	clock, lap := 0.0, int64(0)
	byDriver := make(map[string]*OrbitCalculationDistribution)
	for index, count := range laps {
		driverID := variant.Order[index%len(variant.Order)]
		driverPace, _ := effectiveOrbitPace(drivers[driverID], variant.Mode, planning)
		wantedFuel := float64(count) * driverPace.FuelLitersPerLap
		override, manualOverride := variant.Overrides[index]
		if override.Fuel != nil && *override.Fuel > 0 {
			wantedFuel = *override.Fuel
		}
		start := clock
		clock += float64(count) * driverPace.PaceSeconds
		lastLap := lap + count
		pitWindowLap := lastLap - 3
		if pitWindowLap < lap+1 {
			pitWindowLap = lap + 1
		}
		stint := OrbitCalculationStint{
			Index:            index,
			DriverID:         driverID,
			Laps:             count,
			Fuel:             math.Min(wantedFuel, event.TankLiters),
			Pace:             driverPace.PaceSeconds,
			StartSeconds:     start,
			EndSeconds:       clock,
			FirstLap:         lap + 1,
			LastLap:          lastLap,
			PitWindowLap:     pitWindowLap,
			PitWindowSeconds: start + float64(pitWindowLap-(lap+1))*driverPace.PaceSeconds,
			OverCapacity:     wantedFuel > event.TankLiters+0.01,
			Manual:           manualOverride,
		}
		plan.Stints = append(plan.Stints, stint)
		distribution := byDriver[driverID]
		if distribution == nil {
			distribution = &OrbitCalculationDistribution{DriverID: driverID}
			byDriver[driverID] = distribution
		}
		distribution.Laps += count
		distribution.Seconds += stint.EndSeconds - stint.StartSeconds
		lap = lastLap
		if index < len(laps)-1 {
			clock += event.PitLossSeconds
		}
	}
	plan.TotalSeconds = clock
	for _, driverID := range variant.Order {
		if distribution := byDriver[driverID]; distribution != nil {
			plan.Distribution = append(plan.Distribution, *distribution)
			delete(byDriver, driverID)
		}
	}
	return plan, nil
}

const orbitLegacyAllInServiceRate = 1e12

func orbitSolverInput(raceLaps int64, event OrbitCalculationEvent, averagePace, averageFuel float64, planning *strategydocument.PlanningInputs) solver.SolverInputV2 {
	input := solver.SolverInputV2{
		ContractVersion: solver.SolverContractVersionV2,
		RaceLaps:        raceLaps,
		BaseLapSeconds:  orbitScalarInput(planning, strategydocument.PlanningInputPace, averagePace, "strategy.orbit.base-pace"),
		Projection:      orbitProjection(planning),
		PitCost: solver.PitCostModel{
			TransitSeconds:  orbitScalarInput(planning, strategydocument.PlanningInputPitLoss, event.PitLossSeconds, "strategy.orbit.legacy-all-in-pit"),
			RefuelRateLPerS: solver.NewFallbackScalar(orbitLegacyAllInServiceRate, "strategy.orbit.legacy-all-in-pit"),
			VERatePPerS:     solver.NewFallbackScalar(orbitLegacyAllInServiceRate, "strategy.orbit.legacy-all-in-pit"),
			TyreSeconds:     solver.NewFallbackScalar(0, "strategy.orbit.legacy-all-in-pit"),
			ServiceMode:     manual.PitServiceParallel,
		},
		Formation:          solver.Formation{Seconds: solver.NewFallbackScalar(0, "strategy.orbit.no-formation"), Presence: string(strategyprojection.PresenceValid)},
		Budget:             solver.ComputeBudget{P95Millis: 10_000},
		FuelCapacityLiters: orbitScalarInput(planning, strategydocument.PlanningInputTank, event.TankLiters, "strategy.orbit.tank"),
		VECapacityPercent:  orbitVECapacity(planning),
		TyreLifeLaps:       orbitScalarInput(planning, strategydocument.PlanningInputTyreLife, 0, "strategy.orbit.tyre-life-not-configured"),
		FuelPerLapLiters:   orbitScalarInput(planning, strategydocument.PlanningInputFuelPerLap, averageFuel, "strategy.orbit.fuel-per-lap"),
		VEPerLapPercent:    orbitScalarInput(planning, strategydocument.PlanningInputVEPerLap, 0, "strategy.orbit.virtual-energy-not-configured"),
		DegradationPerLap:  orbitScalarInput(planning, strategydocument.PlanningInputDegradation, 0, "strategy.orbit.degradation-not-configured"),
		SavingCost:         orbitSavingCost(planning),
		// Orbit expresa consumo por vuelta, no litros arbitrarios de servicio.
		// Explorar multiplos de una vuelta conserva todas sus decisiones posibles
		// y evita introducir precision que la pantalla no puede editar.
		Discretization: solver.ServiceDiscretization{FuelLiters: averageFuel, VEPercent: 1},
	}
	return input
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
	pace.PaceSeconds = effectivePlanningValue(planning, strategydocument.PlanningInputPace, pace.PaceSeconds)
	pace.FuelLitersPerLap = effectivePlanningValue(planning, strategydocument.PlanningInputFuelPerLap, pace.FuelLitersPerLap)
	return pace, nil
}

func effectivePlanningValue(planning *strategydocument.PlanningInputs, field strategydocument.PlanningInputField, fallback float64) float64 {
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
		family, ok := planning.Projection.RepresentativePaceByClimateBucket[strategyprojection.ClimateBucketDry]
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

func compareOrbitPlans(activeID string, active OrbitCalculationPlan, otherID string, other OrbitCalculationPlan, pitLoss float64, drivers []OrbitCalculationDriver) OrbitCalculationComparison {
	winnerID, loserID := activeID, otherID
	winnerLaps, loserLaps := active.TotalLaps, other.TotalLaps
	if other.TotalLaps > active.TotalLaps {
		winnerID, loserID = otherID, activeID
		winnerLaps, loserLaps = other.TotalLaps, active.TotalLaps
	}
	savedStops := active.Stops - other.Stops
	savedSeconds := float64(savedStops) * pitLoss
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
		CostSecs: costSeconds, Pays: savedSeconds > costSeconds, SameStops: savedStops <= 0,
		Stints: len(active.Stints), DriverCount: len(drivers), Doubles: doubles,
	}
}

func mapOrbitCalculationError(err error, field string) error {
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
