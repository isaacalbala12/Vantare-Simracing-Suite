// Package energy contains canonical energy values whose source units remain explicit in the catalog.
package energy

import "math"

// FuelAmount is the observed amount in liters.
type FuelAmount float64

type FuelCapacity float64

// Fuel keeps the dynamic amount/capacity invariant together while remaining
// comparable and suitable for schema.Field.
type Fuel struct {
	Amount   FuelAmount
	Capacity FuelCapacity
}

func (fuel Fuel) Valid() bool {
	amount, capacity := float64(fuel.Amount), float64(fuel.Capacity)
	return !math.IsNaN(amount) && !math.IsInf(amount, 0) &&
		!math.IsNaN(capacity) && !math.IsInf(capacity, 0) &&
		capacity > 0 && amount >= 0 && amount <= capacity
}
