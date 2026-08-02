package manual

import (
	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type ManualLapInput struct {
	FuelPerLap          Sourced[contract.FuelLiters]           `json:"fuelPerLap"`
	VirtualEnergyPerLap Sourced[contract.VirtualEnergyPercent] `json:"virtualEnergyPerLap"`
	AverageLap          Sourced[contract.DurationSeconds]      `json:"averageLap"`
	TyreWearPercent     Sourced[float64]                       `json:"tyreWearPercent"`
}

type ManualPlanInput struct {
	Stints []contract.LapCount `json:"stints"`
	Laps   []ManualLapInput    `json:"laps"`

	FuelCapacity       Sourced[contract.FuelLiters] `json:"fuelCapacity"`
	FuelUsableCapacity Sourced[contract.FuelLiters] `json:"fuelUsableCapacity"`
	FuelStartAmount    Sourced[contract.FuelLiters] `json:"fuelStartAmount"`
	FuelFormation      Sourced[contract.FuelLiters] `json:"fuelFormation"`
	FuelReserve        Sourced[contract.FuelLiters] `json:"fuelReserve"`

	VirtualEnergyCapacity       Sourced[contract.VirtualEnergyPercent] `json:"virtualEnergyCapacity"`
	VirtualEnergyUsableCapacity Sourced[contract.VirtualEnergyPercent] `json:"virtualEnergyUsableCapacity"`
	VirtualEnergyStartAmount    Sourced[contract.VirtualEnergyPercent] `json:"virtualEnergyStartAmount"`
	VirtualEnergyFormation      Sourced[contract.VirtualEnergyPercent] `json:"virtualEnergyFormation"`
	VirtualEnergyReserve        Sourced[contract.VirtualEnergyPercent] `json:"virtualEnergyReserve"`

	PitLossPerStop Sourced[contract.DurationSeconds] `json:"pitLossPerStop"`
	Repair         Sourced[contract.DurationSeconds] `json:"repair"`
	Penalty        Sourced[contract.DurationSeconds] `json:"penalty"`
}

type ManualStintResult struct {
	LapCount                  contract.LapCount        `json:"lapCount"`
	FuelNeed                  contract.FuelLiters      `json:"fuelNeed"`
	VirtualEnergyNeed         EnergyPoints             `json:"virtualEnergyNeed"`
	AverageLapSeconds         contract.DurationSeconds `json:"averageLapSeconds"`
	TyreWearPercent           float64                  `json:"tyreWearPercent"`
	FuelSavingAmount          contract.FuelLiters      `json:"fuelSavingAmount"`
	VirtualEnergySavingAmount EnergyPoints             `json:"virtualEnergySavingAmount"`
}

type ManualPlanResult struct {
	Fuel                   FuelResult               `json:"fuel"`
	VirtualEnergy          VirtualEnergyResult      `json:"virtualEnergy"`
	PitStopCount           int64                    `json:"pitStopCount"`
	PitLossPerStopSeconds  contract.DurationSeconds `json:"pitLossPerStopSeconds"`
	TotalPitLossSeconds    contract.DurationSeconds `json:"totalPitLossSeconds"`
	RepairSeconds          contract.DurationSeconds `json:"repairSeconds"`
	PenaltySeconds         contract.DurationSeconds `json:"penaltySeconds"`
	TotalPitSeconds        contract.DurationSeconds `json:"totalPitSeconds"`
	AverageLapSeconds      contract.DurationSeconds `json:"averageLapSeconds"`
	AverageTyreWearPercent float64                  `json:"averageTyreWearPercent"`
	Stints                 []ManualStintResult      `json:"stints"`
}

func CalculateManualPlan(input ManualPlanInput) (ManualPlanResult, error) {
	if len(input.Stints) == 0 || len(input.Laps) == 0 {
		return ManualPlanResult{}, calculationError(ErrorInvalidInput, "manualPlan.laps", "at least one stint and lap are required")
	}
	var totalLaps int64
	for _, stint := range input.Stints {
		if err := validateSourcedLaps("manualPlan.stints", Sourced[contract.LapCount]{Value: stint, Evidence: derivedEvidence()}); err != nil || stint.Value() <= 0 {
			return ManualPlanResult{}, calculationError(ErrorInvalidInput, "manualPlan.stints", "stint lap counts must be positive")
		}
		if totalLaps > int64(contract.ManifestV1().MaxSafeInteger)-stint.Value() {
			return ManualPlanResult{}, calculationError(ErrorOverflow, "manualPlan.stints", "lap total exceeds the shared safe integer")
		}
		totalLaps += stint.Value()
	}
	if int64(len(input.Laps)) != totalLaps {
		return ManualPlanResult{}, calculationError(ErrorInvalidInput, "manualPlan.laps", "lap rows must match the stint lap total")
	}
	raceLaps, err := contract.NewLapCount(totalLaps)
	if err != nil {
		return ManualPlanResult{}, wrapCalculationError(ErrorInvalidInput, "manualPlan.laps", "invalid lap total", err)
	}

	for _, field := range []struct {
		name  string
		value Sourced[contract.FuelLiters]
	}{
		{"manualPlan.fuelCapacity", input.FuelCapacity},
		{"manualPlan.fuelUsableCapacity", input.FuelUsableCapacity},
		{"manualPlan.fuelStartAmount", input.FuelStartAmount},
		{"manualPlan.fuelFormation", input.FuelFormation},
		{"manualPlan.fuelReserve", input.FuelReserve},
	} {
		if err := validateSourcedFuel(field.name, field.value); err != nil {
			return ManualPlanResult{}, err
		}
	}
	for _, field := range []struct {
		name  string
		value Sourced[contract.VirtualEnergyPercent]
	}{
		{"manualPlan.virtualEnergyCapacity", input.VirtualEnergyCapacity},
		{"manualPlan.virtualEnergyUsableCapacity", input.VirtualEnergyUsableCapacity},
		{"manualPlan.virtualEnergyStartAmount", input.VirtualEnergyStartAmount},
		{"manualPlan.virtualEnergyFormation", input.VirtualEnergyFormation},
		{"manualPlan.virtualEnergyReserve", input.VirtualEnergyReserve},
	} {
		if err := validateSourcedEnergy(field.name, field.value); err != nil {
			return ManualPlanResult{}, err
		}
	}
	for _, field := range []struct {
		name  string
		value Sourced[contract.DurationSeconds]
	}{
		{"manualPlan.pitLossPerStop", input.PitLossPerStop},
		{"manualPlan.repair", input.Repair},
		{"manualPlan.penalty", input.Penalty},
	} {
		if err := validateSourcedDuration(field.name, field.value); err != nil {
			return ManualPlanResult{}, err
		}
	}

	fuelTotal, energyTotal, paceTotal, wearTotal := 0.0, 0.0, 0.0, 0.0
	for _, lap := range input.Laps {
		if err := validateSourcedFuel("manualPlan.laps.fuelPerLap", lap.FuelPerLap); err != nil {
			return ManualPlanResult{}, err
		}
		if err := validateSourcedEnergy("manualPlan.laps.virtualEnergyPerLap", lap.VirtualEnergyPerLap); err != nil {
			return ManualPlanResult{}, err
		}
		if err := validateSourcedDuration("manualPlan.laps.averageLap", lap.AverageLap); err != nil || lap.AverageLap.Value.Value() <= 0 {
			return ManualPlanResult{}, calculationError(ErrorInvalidInput, "manualPlan.laps.averageLap", "lap pace must be positive")
		}
		if err := validateEvidence("manualPlan.laps.tyreWearPercent", lap.TyreWearPercent.Evidence); err != nil {
			return ManualPlanResult{}, err
		}
		if err := validateFinite("manualPlan.laps.tyreWearPercent", lap.TyreWearPercent.Value); err != nil || lap.TyreWearPercent.Value > 100 {
			return ManualPlanResult{}, calculationError(ErrorInvalidInput, "manualPlan.laps.tyreWearPercent", "wear must be between zero and 100 percent")
		}
		fuelTotal, err = checkedAdd("manualPlan.fuelTotal", fuelTotal, lap.FuelPerLap.Value.Value())
		if err != nil {
			return ManualPlanResult{}, err
		}
		energyTotal, err = checkedAdd("manualPlan.energyTotal", energyTotal, lap.VirtualEnergyPerLap.Value.Value())
		if err != nil {
			return ManualPlanResult{}, err
		}
		paceTotal, err = checkedAdd("manualPlan.paceTotal", paceTotal, lap.AverageLap.Value.Value())
		if err != nil {
			return ManualPlanResult{}, err
		}
		wearTotal, err = checkedAdd("manualPlan.wearTotal", wearTotal, lap.TyreWearPercent.Value)
		if err != nil {
			return ManualPlanResult{}, err
		}
	}
	averageFuel := fuelTotal / float64(totalLaps)
	averageEnergy := energyTotal / float64(totalLaps)
	averagePace := paceTotal / float64(totalLaps)
	averageWear := wearTotal / float64(totalLaps)
	derived := derivedEvidence()

	fuelConsumption, err := contract.NewFuelLiters(averageFuel)
	if err != nil {
		return ManualPlanResult{}, err
	}
	fuelResult, err := CalculateFuel(FuelInput{
		Capacity: input.FuelCapacity, UsableCapacity: input.FuelUsableCapacity,
		StartAmount:          input.FuelStartAmount,
		ConsumptionPerLap:    Sourced[contract.FuelLiters]{Value: fuelConsumption, Evidence: derived},
		FormationConsumption: input.FuelFormation,
		Reserve:              FuelReserveInput{Kind: ReserveAmount, Amount: input.FuelReserve, Selection: input.FuelReserve.Evidence},
	}, raceLaps)
	if err != nil {
		return ManualPlanResult{}, err
	}
	energyConsumption, err := contract.NewVirtualEnergyPercent(averageEnergy)
	if err != nil {
		return ManualPlanResult{}, err
	}
	energyResult, err := CalculateVirtualEnergy(VirtualEnergyInput{
		Capacity: input.VirtualEnergyCapacity, UsableCapacity: input.VirtualEnergyUsableCapacity,
		StartAmount:          input.VirtualEnergyStartAmount,
		ConsumptionPerLap:    Sourced[contract.VirtualEnergyPercent]{Value: energyConsumption, Evidence: derived},
		FormationConsumption: input.VirtualEnergyFormation,
		Reserve:              VirtualEnergyReserveInput{Kind: ReserveAmount, Amount: input.VirtualEnergyReserve, Selection: input.VirtualEnergyReserve.Evidence},
	}, raceLaps)
	if err != nil {
		return ManualPlanResult{}, err
	}

	pitStopCount := int64(len(input.Stints) - 1)
	totalPitLoss, err := checkedMultiply("manualPlan.totalPitLossSeconds", input.PitLossPerStop.Value.Value(), float64(pitStopCount))
	if err != nil {
		return ManualPlanResult{}, err
	}
	if totalPitLoss > float64(contract.ManifestV1().MaxSafeInteger) {
		return ManualPlanResult{}, calculationError(ErrorOverflow, "manualPlan.totalPitLossSeconds", "pit loss exceeds the shared safe number range")
	}
	totalPit, err := checkedAdd("manualPlan.totalPitSeconds", totalPitLoss, input.Repair.Value.Value(), input.Penalty.Value.Value())
	if err != nil {
		return ManualPlanResult{}, err
	}
	if totalPit > float64(contract.ManifestV1().MaxSafeInteger) {
		return ManualPlanResult{}, calculationError(ErrorOverflow, "manualPlan.totalPitSeconds", "pit time exceeds the shared safe number range")
	}
	result := ManualPlanResult{
		Fuel: fuelResult, VirtualEnergy: energyResult,
		PitStopCount: pitStopCount, PitLossPerStopSeconds: input.PitLossPerStop.Value,
		RepairSeconds: input.Repair.Value, PenaltySeconds: input.Penalty.Value,
		AverageTyreWearPercent: averageWear,
		Stints:                 make([]ManualStintResult, 0, len(input.Stints)),
	}
	result.TotalPitSeconds, err = duration("manualPlan.totalPitSeconds", totalPit)
	if err != nil {
		return ManualPlanResult{}, err
	}
	result.TotalPitLossSeconds, err = duration("manualPlan.totalPitLossSeconds", totalPitLoss)
	if err != nil {
		return ManualPlanResult{}, err
	}
	result.AverageLapSeconds, err = duration("manualPlan.averageLapSeconds", averagePace)
	if err != nil {
		return ManualPlanResult{}, err
	}

	offset := 0
	for _, stintLaps := range input.Stints {
		count := int(stintLaps.Value())
		end := offset + count
		fuel, energy, pace, wear := 0.0, 0.0, 0.0, 0.0
		for _, lap := range input.Laps[offset:end] {
			fuel += lap.FuelPerLap.Value.Value()
			energy += lap.VirtualEnergyPerLap.Value.Value()
			pace += lap.AverageLap.Value.Value()
			wear += lap.TyreWearPercent.Value
		}
		stint := ManualStintResult{LapCount: stintLaps, TyreWearPercent: wear}
		stint.FuelNeed, err = contract.NewFuelLiters(fuel)
		if err != nil {
			return ManualPlanResult{}, err
		}
		stint.VirtualEnergyNeed, err = NewEnergyPoints(energy)
		if err != nil {
			return ManualPlanResult{}, err
		}
		stint.AverageLapSeconds, err = duration("manualPlan.stint.averageLapSeconds", pace/float64(count))
		if err != nil {
			return ManualPlanResult{}, err
		}
		stint.FuelSavingAmount, err = contract.NewFuelLiters(fuelResult.Saving.PerLap.Value() * float64(count))
		if err != nil {
			return ManualPlanResult{}, err
		}
		stint.VirtualEnergySavingAmount, err = NewEnergyPoints(energyResult.Saving.PerLap.Value() * float64(count))
		if err != nil {
			return ManualPlanResult{}, err
		}
		result.Stints = append(result.Stints, stint)
		offset = end
	}
	return result, nil
}

func derivedEvidence() Evidence {
	return Evidence{
		Provenance: contract.Provenance{Kind: contract.ProvenanceDerived, SourceID: "strategy.manual.lap-table"},
		Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "deterministic aggregation of validated manual lap inputs"},
	}
}
