package contract

import (
	"encoding/json"
	"math"
)

// Strategy quantities intentionally use distinct types. Fuel and Virtual
// Energy are separate LMU resources and cannot share arithmetic operations.
type FuelLiters float64
type VirtualEnergyPercent float64
type DurationSeconds float64
type LapCount int64
type DistanceMeters float64
type TyreRemainingPercent float64

func NewFuelLiters(value float64) (FuelLiters, error) {
	if err := validateNonNegativeFinite(value, "fuelLiters"); err != nil {
		return 0, err
	}
	return FuelLiters(value), nil
}

func (value FuelLiters) Value() float64 { return float64(value) }

func (value FuelLiters) MarshalJSON() ([]byte, error) {
	if err := validateNonNegativeFinite(value.Value(), "fuelLiters"); err != nil {
		return nil, err
	}
	return json.Marshal(value.Value())
}

func AddFuel(left, right FuelLiters) (FuelLiters, error) {
	return NewFuelLiters(left.Value() + right.Value())
}

func (value *FuelLiters) UnmarshalJSON(data []byte) error {
	parsed, err := decodeFloat(data, "fuelLiters")
	if err != nil {
		return err
	}
	validated, err := NewFuelLiters(parsed)
	if err != nil {
		return err
	}
	*value = validated
	return nil
}

func NewVirtualEnergyPercent(value float64) (VirtualEnergyPercent, error) {
	if err := validatePercent(value, "virtualEnergyPercent"); err != nil {
		return 0, err
	}
	return VirtualEnergyPercent(value), nil
}

func (value VirtualEnergyPercent) Value() float64 { return float64(value) }

func (value VirtualEnergyPercent) MarshalJSON() ([]byte, error) {
	if err := validatePercent(value.Value(), "virtualEnergyPercent"); err != nil {
		return nil, err
	}
	return json.Marshal(value.Value())
}

func AddVirtualEnergy(left, right VirtualEnergyPercent) (VirtualEnergyPercent, error) {
	return NewVirtualEnergyPercent(left.Value() + right.Value())
}

func (value *VirtualEnergyPercent) UnmarshalJSON(data []byte) error {
	parsed, err := decodeFloat(data, "virtualEnergyPercent")
	if err != nil {
		return err
	}
	validated, err := NewVirtualEnergyPercent(parsed)
	if err != nil {
		return err
	}
	*value = validated
	return nil
}

func NewDurationSeconds(value float64) (DurationSeconds, error) {
	if err := validateNonNegativeFinite(value, "durationSeconds"); err != nil {
		return 0, err
	}
	return DurationSeconds(value), nil
}

func (value DurationSeconds) Value() float64 { return float64(value) }

func (value DurationSeconds) MarshalJSON() ([]byte, error) {
	if err := validateNonNegativeFinite(value.Value(), "durationSeconds"); err != nil {
		return nil, err
	}
	return json.Marshal(value.Value())
}

func (value *DurationSeconds) UnmarshalJSON(data []byte) error {
	parsed, err := decodeFloat(data, "durationSeconds")
	if err != nil {
		return err
	}
	validated, err := NewDurationSeconds(parsed)
	if err != nil {
		return err
	}
	*value = validated
	return nil
}

func NewLapCount(value int64) (LapCount, error) {
	if value < 0 || value > maxSafeJSONInteger {
		return 0, contractError(ErrorInvalidUnit, "lapCount", "must be a non-negative shared safe integer")
	}
	return LapCount(value), nil
}

func (value LapCount) Value() int64 { return int64(value) }

func (value LapCount) MarshalJSON() ([]byte, error) {
	if value.Value() < 0 || value.Value() > maxSafeJSONInteger {
		return nil, contractError(ErrorInvalidUnit, "lapCount", "must be a non-negative shared safe integer")
	}
	return json.Marshal(value.Value())
}

func (value *LapCount) UnmarshalJSON(data []byte) error {
	var parsed int64
	if err := json.Unmarshal(data, &parsed); err != nil {
		return wrapContractError(ErrorInvalidUnit, "lapCount", "must be an integer", err)
	}
	validated, err := NewLapCount(parsed)
	if err != nil {
		return err
	}
	*value = validated
	return nil
}

func NewDistanceMeters(value float64) (DistanceMeters, error) {
	if err := validateNonNegativeFinite(value, "distanceMeters"); err != nil {
		return 0, err
	}
	return DistanceMeters(value), nil
}

func (value DistanceMeters) Value() float64 { return float64(value) }

func (value DistanceMeters) MarshalJSON() ([]byte, error) {
	if err := validateNonNegativeFinite(value.Value(), "distanceMeters"); err != nil {
		return nil, err
	}
	return json.Marshal(value.Value())
}

func (value *DistanceMeters) UnmarshalJSON(data []byte) error {
	parsed, err := decodeFloat(data, "distanceMeters")
	if err != nil {
		return err
	}
	validated, err := NewDistanceMeters(parsed)
	if err != nil {
		return err
	}
	*value = validated
	return nil
}

func NewTyreRemainingPercent(value float64) (TyreRemainingPercent, error) {
	if err := validatePercent(value, "tyreRemainingPercent"); err != nil {
		return 0, err
	}
	return TyreRemainingPercent(value), nil
}

func (value TyreRemainingPercent) Value() float64 { return float64(value) }

func (value TyreRemainingPercent) MarshalJSON() ([]byte, error) {
	if err := validatePercent(value.Value(), "tyreRemainingPercent"); err != nil {
		return nil, err
	}
	return json.Marshal(value.Value())
}

func (value *TyreRemainingPercent) UnmarshalJSON(data []byte) error {
	parsed, err := decodeFloat(data, "tyreRemainingPercent")
	if err != nil {
		return err
	}
	validated, err := NewTyreRemainingPercent(parsed)
	if err != nil {
		return err
	}
	*value = validated
	return nil
}

func decodeFloat(data []byte, field string) (float64, error) {
	var parsed float64
	if err := json.Unmarshal(data, &parsed); err != nil {
		return 0, wrapContractError(ErrorInvalidUnit, field, "must be a number", err)
	}
	return parsed, nil
}

func validateNonNegativeFinite(value float64, field string) error {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return contractError(ErrorInvalidUnit, field, "must be a finite number equal to or greater than zero")
	}
	return nil
}

func validatePercent(value float64, field string) error {
	if err := validateNonNegativeFinite(value, field); err != nil {
		return err
	}
	if value > 100 {
		return contractError(ErrorInvalidUnit, field, "must be between zero and 100")
	}
	return nil
}
