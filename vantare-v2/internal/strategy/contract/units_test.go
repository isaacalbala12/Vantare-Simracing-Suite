package contract

import (
	"errors"
	"math"
	"testing"
	"testing/quick"
)

func TestFuelAndVirtualEnergyUseSeparateOperations(t *testing.T) {
	fuel, err := NewFuelLiters(42.5)
	if err != nil {
		t.Fatalf("NewFuelLiters: %v", err)
	}
	reserve, err := NewFuelLiters(3.25)
	if err != nil {
		t.Fatalf("NewFuelLiters reserve: %v", err)
	}
	totalFuel, err := AddFuel(fuel, reserve)
	if err != nil {
		t.Fatalf("AddFuel: %v", err)
	}
	if got, want := totalFuel.Value(), 45.75; got != want {
		t.Fatalf("fuel total = %v, want %v", got, want)
	}

	energy, err := NewVirtualEnergyPercent(71.5)
	if err != nil {
		t.Fatalf("NewVirtualEnergyPercent: %v", err)
	}
	margin, err := NewVirtualEnergyPercent(4.5)
	if err != nil {
		t.Fatalf("NewVirtualEnergyPercent margin: %v", err)
	}
	totalEnergy, err := AddVirtualEnergy(energy, margin)
	if err != nil {
		t.Fatalf("AddVirtualEnergy: %v", err)
	}
	if got, want := totalEnergy.Value(), 76.0; got != want {
		t.Fatalf("virtual energy total = %v, want %v", got, want)
	}
}

func TestUnitValidationRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name string
		call func() error
	}{
		{name: "negative fuel", call: func() error { _, err := NewFuelLiters(-0.1); return err }},
		{name: "fuel infinity", call: func() error { _, err := NewFuelLiters(math.Inf(1)); return err }},
		{name: "virtual energy below zero", call: func() error { _, err := NewVirtualEnergyPercent(-1); return err }},
		{name: "virtual energy above 100", call: func() error { _, err := NewVirtualEnergyPercent(100.1); return err }},
		{name: "duration below zero", call: func() error { _, err := NewDurationSeconds(-1); return err }},
		{name: "negative laps", call: func() error { _, err := NewLapCount(-1); return err }},
		{name: "negative distance", call: func() error { _, err := NewDistanceMeters(-1); return err }},
		{name: "tyre wear above 100", call: func() error { _, err := NewTyreRemainingPercent(101); return err }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.call()
			if err == nil {
				t.Fatal("expected validation error")
			}
			var contractErr *ContractError
			if !errors.As(err, &contractErr) || contractErr.Code != ErrorInvalidUnit {
				t.Fatalf("error = %v, want ContractError(%s)", err, ErrorInvalidUnit)
			}
		})
	}
}

func TestLapCountUsesTheSharedJavaScriptSafeIntegerDomain(t *testing.T) {
	const maxSafeInteger int64 = 9_007_199_254_740_991
	if got, err := NewLapCount(maxSafeInteger); err != nil || got.Value() != maxSafeInteger {
		t.Fatalf("NewLapCount(max safe) = %v, %v", got, err)
	}
	if _, err := NewLapCount(maxSafeInteger + 1); !HasErrorCode(err, ErrorInvalidUnit) {
		t.Fatalf("NewLapCount(max safe + 1) error = %v, want %s", err, ErrorInvalidUnit)
	}
}

func TestFuelAdditionPreservesNonNegativeFiniteValues(t *testing.T) {
	property := func(a, b uint16) bool {
		left, err := NewFuelLiters(float64(a) / 10)
		if err != nil {
			return false
		}
		right, err := NewFuelLiters(float64(b) / 10)
		if err != nil {
			return false
		}
		total, err := AddFuel(left, right)
		return err == nil && total.Value() == left.Value()+right.Value()
	}
	if err := quick.Check(property, &quick.Config{MaxCount: 1_000}); err != nil {
		t.Fatal(err)
	}
}

func TestVirtualEnergyAdditionNeverExceedsPercentRange(t *testing.T) {
	property := func(a, b uint8) bool {
		left, _ := NewVirtualEnergyPercent(float64(a) / 2.55)
		right, _ := NewVirtualEnergyPercent(float64(b) / 2.55)
		total, err := AddVirtualEnergy(left, right)
		if left.Value()+right.Value() > 100 {
			return err != nil
		}
		return err == nil && total.Value() == left.Value()+right.Value()
	}
	if err := quick.Check(property, &quick.Config{MaxCount: 1_000}); err != nil {
		t.Fatal(err)
	}
}
