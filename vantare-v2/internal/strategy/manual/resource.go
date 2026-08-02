package manual

import (
	"encoding/json"
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type ReserveKind string

const (
	ReserveNone    ReserveKind = "none"
	ReserveAmount  ReserveKind = "amount"
	ReserveLaps    ReserveKind = "laps"
	ReservePercent ReserveKind = "percent"
)

type FuelReserveInput struct {
	Kind      ReserveKind                  `json:"kind"`
	Amount    Sourced[contract.FuelLiters] `json:"amount"`
	Laps      Sourced[contract.LapCount]   `json:"laps"`
	Percent   Sourced[float64]             `json:"percent"`
	Selection Evidence                     `json:"selection"`
}

type VirtualEnergyReserveInput struct {
	Kind      ReserveKind                            `json:"kind"`
	Amount    Sourced[contract.VirtualEnergyPercent] `json:"amount"`
	Laps      Sourced[contract.LapCount]             `json:"laps"`
	Percent   Sourced[float64]                       `json:"percent"`
	Selection Evidence                               `json:"selection"`
}

type FuelInput struct {
	Capacity             Sourced[contract.FuelLiters] `json:"capacity"`
	UsableCapacity       Sourced[contract.FuelLiters] `json:"usableCapacity"`
	StartAmount          Sourced[contract.FuelLiters] `json:"startAmount"`
	ConsumptionPerLap    Sourced[contract.FuelLiters] `json:"consumptionPerLap"`
	FormationConsumption Sourced[contract.FuelLiters] `json:"formationConsumption"`
	Reserve              FuelReserveInput             `json:"reserve"`
}

type VirtualEnergyInput struct {
	Capacity             Sourced[contract.VirtualEnergyPercent] `json:"capacity"`
	UsableCapacity       Sourced[contract.VirtualEnergyPercent] `json:"usableCapacity"`
	StartAmount          Sourced[contract.VirtualEnergyPercent] `json:"startAmount"`
	ConsumptionPerLap    Sourced[contract.VirtualEnergyPercent] `json:"consumptionPerLap"`
	FormationConsumption Sourced[contract.VirtualEnergyPercent] `json:"formationConsumption"`
	Reserve              VirtualEnergyReserveInput              `json:"reserve"`
}

type FuelSaving struct {
	Available            bool                `json:"available"`
	Feasible             bool                `json:"feasible"`
	TargetStops          int64               `json:"targetStops"`
	Amount               contract.FuelLiters `json:"amount"`
	PerLap               contract.FuelLiters `json:"perLap"`
	PercentOfConsumption float64             `json:"percentOfConsumption"`
}

type FuelResult struct {
	Used                     bool                  `json:"used"`
	RaceNeed                 contract.FuelLiters   `json:"raceNeed"`
	FormationNeed            contract.FuelLiters   `json:"formationNeed"`
	ReserveAmount            contract.FuelLiters   `json:"reserveAmount"`
	TotalNeed                contract.FuelLiters   `json:"totalNeed"`
	StartAmount              contract.FuelLiters   `json:"startAmount"`
	AdditionalRequired       contract.FuelLiters   `json:"additionalRequired"`
	UsableCapacity           contract.FuelLiters   `json:"usableCapacity"`
	AvailableCompetitiveLaps float64               `json:"availableCompetitiveLaps"`
	StopsRequired            int64                 `json:"stopsRequired"`
	RefillAmounts            []contract.FuelLiters `json:"refillAmounts"`
	Saving                   FuelSaving            `json:"saving"`
	Assumptions              []Assumption          `json:"assumptions"`
}

// EnergyPoints is cumulative Virtual Energy consumption. Unlike a current
// state percentage, a race total may legitimately exceed 100 percentage
// points. It remains a distinct type from FuelLiters.
type EnergyPoints float64

func NewEnergyPoints(value float64) (EnergyPoints, error) {
	if err := validateFinite("virtualEnergyPoints", value); err != nil {
		return 0, err
	}
	return EnergyPoints(value), nil
}

func (value EnergyPoints) Value() float64 { return float64(value) }

func (value EnergyPoints) MarshalJSON() ([]byte, error) {
	if err := validateFinite("virtualEnergyPoints", value.Value()); err != nil {
		return nil, err
	}
	return json.Marshal(value.Value())
}

type VirtualEnergyResult struct {
	Used                     bool           `json:"used"`
	RaceNeed                 EnergyPoints   `json:"raceNeed"`
	FormationNeed            EnergyPoints   `json:"formationNeed"`
	ReserveAmount            EnergyPoints   `json:"reserveAmount"`
	TotalNeed                EnergyPoints   `json:"totalNeed"`
	StartAmount              EnergyPoints   `json:"startAmount"`
	AdditionalRequired       EnergyPoints   `json:"additionalRequired"`
	UsableCapacity           EnergyPoints   `json:"usableCapacity"`
	AvailableCompetitiveLaps float64        `json:"availableCompetitiveLaps"`
	StopsRequired            int64          `json:"stopsRequired"`
	RechargeAmounts          []EnergyPoints `json:"rechargeAmounts"`
	Assumptions              []Assumption   `json:"assumptions"`
}

type resourceValues struct {
	capacity, usableCapacity, start, consumptionPerLap, formation, reserve float64
}

type resourceResult struct {
	raceNeed, formationNeed, reserve, totalNeed, additional, availableLaps float64
	stops                                                                  int64
	serviceAmounts                                                         []float64
}

func CalculateFuel(input FuelInput, raceLaps contract.LapCount) (FuelResult, error) {
	if _, err := contract.NewLapCount(raceLaps.Value()); err != nil {
		return FuelResult{}, wrapCalculationError(ErrorInvalidInput, "fuel.raceLaps", "invalid lap count", err)
	}
	fields := []struct {
		name  string
		value Sourced[contract.FuelLiters]
	}{
		{name: "fuel.capacity", value: input.Capacity},
		{name: "fuel.usableCapacity", value: input.UsableCapacity},
		{name: "fuel.startAmount", value: input.StartAmount},
		{name: "fuel.consumptionPerLap", value: input.ConsumptionPerLap},
		{name: "fuel.formationConsumption", value: input.FormationConsumption},
	}
	for _, field := range fields {
		if err := validateSourcedFuel(field.name, field.value); err != nil {
			return FuelResult{}, err
		}
	}
	reserve, reserveAssumptions, err := calculateFuelReserve(input.Reserve, raceLaps, input.ConsumptionPerLap.Value.Value(), input.FormationConsumption.Value.Value())
	if err != nil {
		return FuelResult{}, err
	}
	calculated, err := calculateResource("fuel", resourceValues{
		capacity:          input.Capacity.Value.Value(),
		usableCapacity:    input.UsableCapacity.Value.Value(),
		start:             input.StartAmount.Value.Value(),
		consumptionPerLap: input.ConsumptionPerLap.Value.Value(),
		formation:         input.FormationConsumption.Value.Value(),
		reserve:           reserve,
	}, raceLaps)
	if err != nil {
		return FuelResult{}, err
	}

	result := FuelResult{
		Used:                     calculated.totalNeed > 0,
		StartAmount:              input.StartAmount.Value,
		UsableCapacity:           input.UsableCapacity.Value,
		AvailableCompetitiveLaps: calculated.availableLaps,
		StopsRequired:            calculated.stops,
		RefillAmounts:            make([]contract.FuelLiters, 0, len(calculated.serviceAmounts)),
		Assumptions:              make([]Assumption, 0, 7),
	}
	result.RaceNeed, err = fuel("fuel.raceNeed", calculated.raceNeed)
	if err != nil {
		return FuelResult{}, err
	}
	result.FormationNeed, err = fuel("fuel.formationNeed", calculated.formationNeed)
	if err != nil {
		return FuelResult{}, err
	}
	result.ReserveAmount, err = fuel("fuel.reserveAmount", calculated.reserve)
	if err != nil {
		return FuelResult{}, err
	}
	result.TotalNeed, err = fuel("fuel.totalNeed", calculated.totalNeed)
	if err != nil {
		return FuelResult{}, err
	}
	result.AdditionalRequired, err = fuel("fuel.additionalRequired", calculated.additional)
	if err != nil {
		return FuelResult{}, err
	}
	for _, amount := range calculated.serviceAmounts {
		value, err := fuel("fuel.refillAmounts", amount)
		if err != nil {
			return FuelResult{}, err
		}
		result.RefillAmounts = append(result.RefillAmounts, value)
	}
	for _, field := range fields {
		result.Assumptions = append(result.Assumptions, assumption(field.name, "fuel_liters", field.value.Value.Value(), field.value.Evidence))
	}
	result.Assumptions = append(result.Assumptions, reserveAssumptions...)
	result.Saving, err = calculateFuelSaving(calculated, input.StartAmount.Value.Value(), input.UsableCapacity.Value.Value(), input.ConsumptionPerLap.Value.Value(), raceLaps.Value())
	if err != nil {
		return FuelResult{}, err
	}
	return result, nil
}

func CalculateVirtualEnergy(input VirtualEnergyInput, raceLaps contract.LapCount) (VirtualEnergyResult, error) {
	if _, err := contract.NewLapCount(raceLaps.Value()); err != nil {
		return VirtualEnergyResult{}, wrapCalculationError(ErrorInvalidInput, "virtualEnergy.raceLaps", "invalid lap count", err)
	}
	fields := []struct {
		name  string
		value Sourced[contract.VirtualEnergyPercent]
	}{
		{name: "virtualEnergy.capacity", value: input.Capacity},
		{name: "virtualEnergy.usableCapacity", value: input.UsableCapacity},
		{name: "virtualEnergy.startAmount", value: input.StartAmount},
		{name: "virtualEnergy.consumptionPerLap", value: input.ConsumptionPerLap},
		{name: "virtualEnergy.formationConsumption", value: input.FormationConsumption},
	}
	for _, field := range fields {
		if err := validateSourcedEnergy(field.name, field.value); err != nil {
			return VirtualEnergyResult{}, err
		}
	}
	reserve, reserveAssumptions, err := calculateEnergyReserve(input.Reserve, raceLaps, input.ConsumptionPerLap.Value.Value(), input.FormationConsumption.Value.Value())
	if err != nil {
		return VirtualEnergyResult{}, err
	}
	calculated, err := calculateResource("virtualEnergy", resourceValues{
		capacity:          input.Capacity.Value.Value(),
		usableCapacity:    input.UsableCapacity.Value.Value(),
		start:             input.StartAmount.Value.Value(),
		consumptionPerLap: input.ConsumptionPerLap.Value.Value(),
		formation:         input.FormationConsumption.Value.Value(),
		reserve:           reserve,
	}, raceLaps)
	if err != nil {
		return VirtualEnergyResult{}, err
	}

	result := VirtualEnergyResult{
		Used:                     calculated.totalNeed > 0,
		AvailableCompetitiveLaps: calculated.availableLaps,
		StopsRequired:            calculated.stops,
		RechargeAmounts:          make([]EnergyPoints, 0, len(calculated.serviceAmounts)),
		Assumptions:              make([]Assumption, 0, 7),
	}
	values := []struct {
		field string
		value float64
		set   func(EnergyPoints)
	}{
		{field: "virtualEnergy.raceNeed", value: calculated.raceNeed, set: func(value EnergyPoints) { result.RaceNeed = value }},
		{field: "virtualEnergy.formationNeed", value: calculated.formationNeed, set: func(value EnergyPoints) { result.FormationNeed = value }},
		{field: "virtualEnergy.reserveAmount", value: calculated.reserve, set: func(value EnergyPoints) { result.ReserveAmount = value }},
		{field: "virtualEnergy.totalNeed", value: calculated.totalNeed, set: func(value EnergyPoints) { result.TotalNeed = value }},
		{field: "virtualEnergy.startAmount", value: input.StartAmount.Value.Value(), set: func(value EnergyPoints) { result.StartAmount = value }},
		{field: "virtualEnergy.additionalRequired", value: calculated.additional, set: func(value EnergyPoints) { result.AdditionalRequired = value }},
		{field: "virtualEnergy.usableCapacity", value: input.UsableCapacity.Value.Value(), set: func(value EnergyPoints) { result.UsableCapacity = value }},
	}
	for _, item := range values {
		value, err := NewEnergyPoints(item.value)
		if err != nil {
			return VirtualEnergyResult{}, wrapCalculationError(ErrorOverflow, item.field, "energy result overflowed", err)
		}
		item.set(value)
	}
	for _, amount := range calculated.serviceAmounts {
		value, err := NewEnergyPoints(amount)
		if err != nil {
			return VirtualEnergyResult{}, err
		}
		result.RechargeAmounts = append(result.RechargeAmounts, value)
	}
	for _, field := range fields {
		result.Assumptions = append(result.Assumptions, assumption(field.name, "virtual_energy_percent", field.value.Value.Value(), field.value.Evidence))
	}
	result.Assumptions = append(result.Assumptions, reserveAssumptions...)
	return result, nil
}

func calculateResource(prefix string, input resourceValues, raceLaps contract.LapCount) (resourceResult, error) {
	if input.usableCapacity > input.capacity {
		return resourceResult{}, calculationError(ErrorInvalidInput, prefix+".usableCapacity", "cannot exceed physical capacity")
	}
	if input.start > input.capacity {
		return resourceResult{}, calculationError(ErrorInvalidInput, prefix+".startAmount", "cannot exceed physical capacity")
	}
	raceNeed, err := checkedMultiply(prefix+".raceNeed", float64(raceLaps.Value()), input.consumptionPerLap)
	if err != nil {
		return resourceResult{}, err
	}
	total, err := checkedAdd(prefix+".totalNeed", raceNeed, input.formation, input.reserve)
	if err != nil {
		return resourceResult{}, err
	}
	additional := math.Max(total-input.start, 0)
	result := resourceResult{raceNeed: raceNeed, formationNeed: input.formation, reserve: input.reserve, totalNeed: total, additional: additional}
	if input.consumptionPerLap > 0 {
		availableForRace := math.Max(input.start-input.formation-input.reserve, 0)
		result.availableLaps = availableForRace / input.consumptionPerLap
	}
	if additional == 0 {
		return result, nil
	}
	if input.usableCapacity <= 0 {
		return resourceResult{}, calculationError(ErrorInsufficientCapacity, prefix+".usableCapacity", "additional resource is required but service capacity is zero")
	}
	maxServices := contract.ManifestV1().CanonicalLimits.MaxContainerItems
	result.serviceAmounts = make([]float64, 0, min(maxServices, 4))
	available := input.start
	for available < total {
		if len(result.serviceAmounts) >= maxServices {
			return resourceResult{}, calculationError(ErrorOverflow, prefix+".stopsRequired", "service list exceeds the shared container limit")
		}
		remaining := total - available
		amount := math.Min(remaining, input.usableCapacity)
		next, err := checkedAdd(prefix+".serviceAmounts", available, amount)
		if err != nil {
			return resourceResult{}, err
		}
		if next <= available {
			return resourceResult{}, calculationError(ErrorOverflow, prefix+".serviceAmounts", "service allocation cannot make representable progress")
		}
		if next < total && amount < input.usableCapacity {
			// The subtraction can round down by one representable value. Bump only
			// the final partial service, never beyond per-service capacity, so the
			// public allocation cannot be smaller than the stated need.
			conservative := math.Nextafter(amount, math.Inf(1))
			if conservative <= input.usableCapacity {
				amount = conservative
				next, err = checkedAdd(prefix+".serviceAmounts", available, amount)
				if err != nil {
					return resourceResult{}, err
				}
			}
		}
		result.serviceAmounts = append(result.serviceAmounts, amount)
		available = next
	}
	result.stops = int64(len(result.serviceAmounts))
	return result, nil
}

func calculateFuelSaving(resource resourceResult, start, capacity, consumption float64, raceLaps int64) (FuelSaving, error) {
	result := FuelSaving{}
	if resource.stops <= 0 || raceLaps <= 0 || consumption <= 0 {
		return result, nil
	}
	result.Available = true
	result.TargetStops = resource.stops - 1
	serviceAvailable, err := checkedMultiply("fuel.saving.targetAvailable", capacity, float64(result.TargetStops))
	if err != nil {
		return FuelSaving{}, err
	}
	targetAvailable, err := checkedAdd("fuel.saving.targetAvailable", start, serviceAvailable)
	if err != nil {
		return FuelSaving{}, err
	}
	amount := math.Max(resource.totalNeed-targetAvailable, 0)
	perLap := amount / float64(raceLaps)
	result.Amount, err = fuel("fuel.saving.amount", amount)
	if err != nil {
		return FuelSaving{}, err
	}
	result.PerLap, err = fuel("fuel.saving.perLap", perLap)
	if err != nil {
		return FuelSaving{}, err
	}
	result.PercentOfConsumption = perLap / consumption * 100
	if math.IsNaN(result.PercentOfConsumption) || math.IsInf(result.PercentOfConsumption, 0) {
		return FuelSaving{}, calculationError(ErrorOverflow, "fuel.saving.percentOfConsumption", "saving percentage overflowed")
	}
	result.Feasible = amount > 0 && perLap < consumption
	return result, nil
}

func calculateFuelReserve(input FuelReserveInput, raceLaps contract.LapCount, consumption, formation float64) (float64, []Assumption, error) {
	if err := validateEvidence("fuel.reserve.selection", input.Selection); err != nil {
		return 0, nil, err
	}
	assumptions := []Assumption{assumption("fuel.reserve.kind", "reserve_kind", input.Kind, input.Selection)}
	switch input.Kind {
	case ReserveNone:
		return 0, assumptions, nil
	case ReserveAmount:
		if err := validateSourcedFuel("fuel.reserve.amount", input.Amount); err != nil {
			return 0, nil, err
		}
		return input.Amount.Value.Value(), append(assumptions, assumption("fuel.reserve.amount", "fuel_liters", input.Amount.Value.Value(), input.Amount.Evidence)), nil
	case ReserveLaps:
		if err := validateSourcedLaps("fuel.reserve.laps", input.Laps); err != nil {
			return 0, nil, err
		}
		value, err := checkedMultiply("fuel.reserve.laps", float64(input.Laps.Value.Value()), consumption)
		return value, append(assumptions, assumption("fuel.reserve.laps", "lap_count", input.Laps.Value.Value(), input.Laps.Evidence)), err
	case ReservePercent:
		if err := validateSourcedPercent("fuel.reserve.percent", input.Percent); err != nil {
			return 0, nil, err
		}
		raceNeed, err := checkedMultiply("fuel.reserve.percent", float64(raceLaps.Value()), consumption)
		if err != nil {
			return 0, nil, err
		}
		base, err := checkedAdd("fuel.reserve.percent", raceNeed, formation)
		if err != nil {
			return 0, nil, err
		}
		value, err := checkedMultiply("fuel.reserve.percent", base, input.Percent.Value/100)
		return value, append(assumptions, assumption("fuel.reserve.percent", "percent", input.Percent.Value, input.Percent.Evidence)), err
	default:
		return 0, nil, calculationError(ErrorInvalidInput, "fuel.reserve.kind", "unsupported reserve kind")
	}
}

func calculateEnergyReserve(input VirtualEnergyReserveInput, raceLaps contract.LapCount, consumption, formation float64) (float64, []Assumption, error) {
	if err := validateEvidence("virtualEnergy.reserve.selection", input.Selection); err != nil {
		return 0, nil, err
	}
	assumptions := []Assumption{assumption("virtualEnergy.reserve.kind", "reserve_kind", input.Kind, input.Selection)}
	switch input.Kind {
	case ReserveNone:
		return 0, assumptions, nil
	case ReserveAmount:
		if err := validateSourcedEnergy("virtualEnergy.reserve.amount", input.Amount); err != nil {
			return 0, nil, err
		}
		return input.Amount.Value.Value(), append(assumptions, assumption("virtualEnergy.reserve.amount", "virtual_energy_percent", input.Amount.Value.Value(), input.Amount.Evidence)), nil
	case ReserveLaps:
		if err := validateSourcedLaps("virtualEnergy.reserve.laps", input.Laps); err != nil {
			return 0, nil, err
		}
		value, err := checkedMultiply("virtualEnergy.reserve.laps", float64(input.Laps.Value.Value()), consumption)
		return value, append(assumptions, assumption("virtualEnergy.reserve.laps", "lap_count", input.Laps.Value.Value(), input.Laps.Evidence)), err
	case ReservePercent:
		if err := validateSourcedPercent("virtualEnergy.reserve.percent", input.Percent); err != nil {
			return 0, nil, err
		}
		raceNeed, err := checkedMultiply("virtualEnergy.reserve.percent", float64(raceLaps.Value()), consumption)
		if err != nil {
			return 0, nil, err
		}
		base, err := checkedAdd("virtualEnergy.reserve.percent", raceNeed, formation)
		if err != nil {
			return 0, nil, err
		}
		value, err := checkedMultiply("virtualEnergy.reserve.percent", base, input.Percent.Value/100)
		return value, append(assumptions, assumption("virtualEnergy.reserve.percent", "percent", input.Percent.Value, input.Percent.Evidence)), err
	default:
		return 0, nil, calculationError(ErrorInvalidInput, "virtualEnergy.reserve.kind", "unsupported reserve kind")
	}
}

func validateSourcedFuel(field string, value Sourced[contract.FuelLiters]) error {
	if err := validateEvidence(field, value.Evidence); err != nil {
		return err
	}
	_, err := contract.NewFuelLiters(value.Value.Value())
	if err != nil {
		return wrapCalculationError(ErrorInvalidInput, field, "invalid fuel quantity", err)
	}
	return nil
}

func validateSourcedEnergy(field string, value Sourced[contract.VirtualEnergyPercent]) error {
	if err := validateEvidence(field, value.Evidence); err != nil {
		return err
	}
	_, err := contract.NewVirtualEnergyPercent(value.Value.Value())
	if err != nil {
		return wrapCalculationError(ErrorInvalidInput, field, "invalid virtual energy quantity", err)
	}
	return nil
}

func validateSourcedPercent(field string, value Sourced[float64]) error {
	if err := validateEvidence(field, value.Evidence); err != nil {
		return err
	}
	if err := validateFinite(field, value.Value); err != nil {
		return err
	}
	if value.Value > 100 {
		return calculationError(ErrorInvalidInput, field, "must be between zero and 100")
	}
	return nil
}

func fuel(field string, value float64) (contract.FuelLiters, error) {
	result, err := contract.NewFuelLiters(value)
	if err != nil {
		return 0, wrapCalculationError(ErrorOverflow, field, "fuel result is outside the contract", err)
	}
	return result, nil
}
