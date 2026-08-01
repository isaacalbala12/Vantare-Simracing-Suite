package energy

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestFuelStateValidatesDynamicCapacityInvariant(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		fuel  Fuel
		valid bool
	}{
		{name: "empty tank is legitimate", fuel: Fuel{Amount: 0, Capacity: 100}, valid: true},
		{name: "full tank", fuel: Fuel{Amount: 100, Capacity: 100}, valid: true},
		{name: "negative amount", fuel: Fuel{Amount: -1, Capacity: 100}},
		{name: "over capacity", fuel: Fuel{Amount: 101, Capacity: 100}},
		{name: "zero capacity", fuel: Fuel{}},
		{name: "non finite amount", fuel: Fuel{Amount: FuelAmount(math.NaN()), Capacity: 100}},
		{name: "non finite capacity", fuel: Fuel{Amount: 1, Capacity: FuelCapacity(math.Inf(1))}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.fuel.Valid(); got != tt.valid {
				t.Fatalf("Valid() = %v, want %v", got, tt.valid)
			}
		})
	}
}

func TestFuelTypesPreserveLegitimateZero(t *testing.T) {
	t.Parallel()

	field, err := schema.NewField(Fuel{Amount: 0, Capacity: 100}, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	got, present := field.Value()
	if !present || got.Amount != 0 || got.Capacity != 100 {
		t.Fatalf("Value() = (%+v,%v), want zero amount present", got, present)
	}
}
