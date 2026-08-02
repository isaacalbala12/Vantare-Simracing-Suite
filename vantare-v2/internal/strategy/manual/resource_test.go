package manual

import (
	"errors"
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

func TestCalculateFuelIncludesFormationReserveRefillsAndSaving(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "confirmed fuel inputs")
	input := FuelInput{
		Capacity:             sourcedFuel(t, 100, manual),
		UsableCapacity:       sourcedFuel(t, 100, manual),
		StartAmount:          sourcedFuel(t, 100, manual),
		ConsumptionPerLap:    sourcedFuel(t, 4, manual),
		FormationConsumption: sourcedFuel(t, 2, manual),
		Reserve: FuelReserveInput{
			Kind:      ReserveLaps,
			Laps:      sourcedLaps(t, 1, manual),
			Selection: manual,
		},
	}

	got, err := CalculateFuel(input, mustLaps(t, 25))
	if err != nil {
		t.Fatalf("CalculateFuel: %v", err)
	}
	if got.RaceNeed.Value() != 100 || got.FormationNeed.Value() != 2 || got.ReserveAmount.Value() != 4 || got.TotalNeed.Value() != 106 {
		t.Fatalf("unexpected needs: %#v", got)
	}
	if got.StopsRequired != 1 || len(got.RefillAmounts) != 1 || got.RefillAmounts[0].Value() != 6 {
		t.Fatalf("unexpected refills: %#v", got)
	}
	if !got.Saving.Available || !got.Saving.Feasible || got.Saving.TargetStops != 0 || got.Saving.Amount.Value() != 6 || got.Saving.PerLap.Value() != 0.24 || got.Saving.PercentOfConsumption != 6 {
		t.Fatalf("unexpected fuel saving: %#v", got.Saving)
	}
	if len(got.Assumptions) != 7 {
		t.Fatalf("all fuel assumptions must be visible, got %d", len(got.Assumptions))
	}
}

func TestCalculateFuelUsesStartAmountWhenRemovingAStop(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "confirmed fuel inputs")
	input := FuelInput{
		Capacity:             sourcedFuel(t, 100, manual),
		UsableCapacity:       sourcedFuel(t, 100, manual),
		StartAmount:          sourcedFuel(t, 20, manual),
		ConsumptionPerLap:    sourcedFuel(t, 4, manual),
		FormationConsumption: sourcedFuel(t, 0, manual),
		Reserve:              FuelReserveInput{Kind: ReserveNone, Selection: manual},
	}
	got, err := CalculateFuel(input, mustLaps(t, 30))
	if err != nil {
		t.Fatalf("CalculateFuel: %v", err)
	}
	if got.StopsRequired != 1 || got.Saving.Amount.Value() != 100 {
		t.Fatalf("saving must use start + capacity*(target stops), got %#v", got.Saving)
	}
	if !got.Saving.Feasible || math.Abs(got.Saving.PercentOfConsumption-83.33333333333334) > 1e-12 {
		t.Fatalf("saving must remain mathematically explicit, got %#v", got.Saving)
	}
}

func TestCalculateVirtualEnergyKeepsSeparateUnitAndRechargeAmounts(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceMedium, "estimated energy inputs")
	input := VirtualEnergyInput{
		Capacity:             sourcedEnergy(t, 100, manual),
		UsableCapacity:       sourcedEnergy(t, 80, manual),
		StartAmount:          sourcedEnergy(t, 60, manual),
		ConsumptionPerLap:    sourcedEnergy(t, 2, manual),
		FormationConsumption: sourcedEnergy(t, 1, manual),
		Reserve: VirtualEnergyReserveInput{
			Kind:      ReserveLaps,
			Laps:      sourcedLaps(t, 2, manual),
			Selection: manual,
		},
	}
	got, err := CalculateVirtualEnergy(input, mustLaps(t, 50))
	if err != nil {
		t.Fatalf("CalculateVirtualEnergy: %v", err)
	}
	if got.TotalNeed.Value() != 105 || got.AdditionalRequired.Value() != 45 || got.StopsRequired != 1 || len(got.RechargeAmounts) != 1 || got.RechargeAmounts[0].Value() != 45 {
		t.Fatalf("unexpected virtual energy result: %#v", got)
	}
	var _ EnergyPoints = got.TotalNeed
	var _ contract.FuelLiters = FuelResult{}.TotalNeed
	if len(got.Assumptions) != 7 {
		t.Fatalf("all VE assumptions must be visible, got %d", len(got.Assumptions))
	}
}

func TestResourceReserveKindsAndLimits(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "confirmed inputs")
	base := FuelInput{
		Capacity:             sourcedFuel(t, 100, manual),
		UsableCapacity:       sourcedFuel(t, 90, manual),
		StartAmount:          sourcedFuel(t, 20, manual),
		ConsumptionPerLap:    sourcedFuel(t, 4, manual),
		FormationConsumption: sourcedFuel(t, 2, manual),
	}
	tests := []struct {
		name    string
		reserve FuelReserveInput
		want    float64
	}{
		{name: "none", reserve: FuelReserveInput{Kind: ReserveNone, Selection: manual}, want: 0},
		{name: "amount", reserve: FuelReserveInput{Kind: ReserveAmount, Amount: sourcedFuel(t, 6, manual), Selection: manual}, want: 6},
		{name: "laps", reserve: FuelReserveInput{Kind: ReserveLaps, Laps: sourcedLaps(t, 2, manual), Selection: manual}, want: 8},
		{name: "percent", reserve: FuelReserveInput{Kind: ReservePercent, Percent: Sourced[float64]{Value: 10, Evidence: manual}, Selection: manual}, want: 12.2},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			input := base
			input.Reserve = test.reserve
			got, err := CalculateFuel(input, mustLaps(t, 30))
			if err != nil {
				t.Fatalf("CalculateFuel: %v", err)
			}
			if math.Abs(got.ReserveAmount.Value()-test.want) > 1e-12 {
				t.Fatalf("reserve=%v want=%v", got.ReserveAmount.Value(), test.want)
			}
		})
	}
}

func TestResourceRejectsCapacityAndOverflowErrors(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "confirmed inputs")
	base := FuelInput{
		Capacity:             sourcedFuel(t, 100, manual),
		UsableCapacity:       sourcedFuel(t, 100, manual),
		StartAmount:          sourcedFuel(t, 100, manual),
		ConsumptionPerLap:    sourcedFuel(t, 4, manual),
		FormationConsumption: sourcedFuel(t, 0, manual),
		Reserve:              FuelReserveInput{Kind: ReserveNone, Selection: manual},
	}

	bad := base
	bad.StartAmount = sourcedFuel(t, 101, manual)
	_, err := CalculateFuel(bad, mustLaps(t, 1))
	var calculationErr *CalculationError
	if !errors.As(err, &calculationErr) || calculationErr.Code != ErrorInvalidInput {
		t.Fatalf("start above capacity: got %v", err)
	}

	bad = base
	bad.UsableCapacity = sourcedFuel(t, 0, manual)
	bad.StartAmount = sourcedFuel(t, 0, manual)
	_, err = CalculateFuel(bad, mustLaps(t, 1))
	if !errors.As(err, &calculationErr) || calculationErr.Code != ErrorInsufficientCapacity {
		t.Fatalf("zero service capacity: got %v", err)
	}

	bad = base
	bad.ConsumptionPerLap = Sourced[contract.FuelLiters]{Value: contract.FuelLiters(math.Inf(1)), Evidence: manual}
	if _, err := CalculateFuel(bad, mustLaps(t, 1)); err == nil {
		t.Fatal("infinite consumption must fail")
	}

	bad.ConsumptionPerLap = Sourced[contract.FuelLiters]{Value: contract.FuelLiters(math.MaxFloat64), Evidence: manual}
	_, err = CalculateFuel(bad, mustLaps(t, 2))
	if !errors.As(err, &calculationErr) || calculationErr.Code != ErrorOverflow {
		t.Fatalf("finite multiplication overflow: got %v", err)
	}

	if _, err := CalculateFuel(base, contract.LapCount(-1)); err == nil {
		t.Fatal("invalid lap cast must fail at the calculation boundary")
	}
}

func sourcedFuel(t testing.TB, value float64, source Evidence) Sourced[contract.FuelLiters] {
	t.Helper()
	quantity, err := contract.NewFuelLiters(value)
	if err != nil {
		t.Fatalf("fuel fixture: %v", err)
	}
	return Sourced[contract.FuelLiters]{Value: quantity, Evidence: source}
}

func sourcedEnergy(t testing.TB, value float64, source Evidence) Sourced[contract.VirtualEnergyPercent] {
	t.Helper()
	quantity, err := contract.NewVirtualEnergyPercent(value)
	if err != nil {
		t.Fatalf("energy fixture: %v", err)
	}
	return Sourced[contract.VirtualEnergyPercent]{Value: quantity, Evidence: source}
}

func mustLaps(t testing.TB, value int64) contract.LapCount {
	t.Helper()
	quantity, err := contract.NewLapCount(value)
	if err != nil {
		t.Fatalf("lap fixture: %v", err)
	}
	return quantity
}
