package manual

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

func TestCalculateManualPlanExplainsFuelEnergyPitAndStints(t *testing.T) {
	input := manualPlanFixture(t, []int64{17, 22, 19, 20})
	result, err := CalculateManualPlan(input)
	if err != nil {
		t.Fatal(err)
	}

	assertClose(t, result.Fuel.TotalNeed.Value(), 374.4)
	assertClose(t, result.Fuel.Saving.Amount.Value(), 74.4)
	assertClose(t, result.Fuel.Saving.PerLap.Value(), 74.4/78)
	if result.Fuel.StopsRequired != 3 || result.Fuel.Saving.TargetStops != 2 || !result.Fuel.Saving.Feasible {
		t.Fatalf("unexpected Fuel result: %#v", result.Fuel)
	}

	assertClose(t, result.VirtualEnergy.TotalNeed.Value(), 156)
	assertClose(t, result.VirtualEnergy.Saving.Amount.Value(), 56)
	assertClose(t, result.VirtualEnergy.Saving.PerLap.Value(), 56.0/78)
	if result.VirtualEnergy.StopsRequired != 1 || result.VirtualEnergy.Saving.TargetStops != 0 || !result.VirtualEnergy.Saving.Feasible {
		t.Fatalf("unexpected Virtual Energy result: %#v", result.VirtualEnergy)
	}

	if result.PitStopCount != 3 {
		t.Fatalf("pit stop count = %d, want 3", result.PitStopCount)
	}
	assertClose(t, result.PitLossPerStopSeconds.Value(), 22.4)
	assertClose(t, result.TotalPitLossSeconds.Value(), 67.2)
	assertClose(t, result.RepairSeconds.Value(), 5)
	assertClose(t, result.PenaltySeconds.Value(), 10)
	assertClose(t, result.TotalPitSeconds.Value(), 82.2)

	if len(result.Stints) != 4 {
		t.Fatalf("stints = %d, want 4", len(result.Stints))
	}
	assertClose(t, result.Stints[0].FuelNeed.Value(), 81.6)
	assertClose(t, result.Stints[0].VirtualEnergyNeed.Value(), 34)
	assertClose(t, result.Stints[0].AverageLapSeconds.Value(), 138.4)
	assertClose(t, result.Stints[0].TyreWearPercent, 11.05)
	assertClose(t, result.Stints[0].FuelSavingAmount.Value(), result.Fuel.Saving.PerLap.Value()*17)
	assertClose(t, result.Stints[0].VirtualEnergySavingAmount.Value(), result.VirtualEnergy.Saving.PerLap.Value()*17)
}

func TestCalculateManualPlanCountsOnlyTransitionsBetweenStintsAsPitStops(t *testing.T) {
	input := manualPlanFixture(t, []int64{1})
	input.Repair = sourcedDuration(t, 0, input.Repair.Evidence)
	input.Penalty = sourcedDuration(t, 0, input.Penalty.Evidence)
	result, err := CalculateManualPlan(input)
	if err != nil {
		t.Fatal(err)
	}
	if result.PitStopCount != 0 {
		t.Fatalf("pit stop count = %d, want 0", result.PitStopCount)
	}
	assertClose(t, result.PitLossPerStopSeconds.Value(), 22.4)
	assertClose(t, result.TotalPitLossSeconds.Value(), 0)
	assertClose(t, result.TotalPitSeconds.Value(), 0)
}

func TestCalculateManualPlanUsesPerLapValuesAndRejectsInvalidShapes(t *testing.T) {
	input := manualPlanFixture(t, []int64{2})
	input.Laps[1].FuelPerLap = sourcedFuel(t, 6, input.Laps[1].FuelPerLap.Evidence)
	input.Laps[1].AverageLap = sourcedDuration(t, 142, input.Laps[1].AverageLap.Evidence)
	result, err := CalculateManualPlan(input)
	if err != nil {
		t.Fatal(err)
	}
	assertClose(t, result.Fuel.RaceNeed.Value(), 10.8)
	assertClose(t, result.Stints[0].AverageLapSeconds.Value(), 140.2)

	input.Stints[0] = 3
	if _, err := CalculateManualPlan(input); !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("lap mismatch error = %v", err)
	}
}

func TestCalculateManualPlanRejectsOutOfRangeWearAndNonFiniteInput(t *testing.T) {
	input := manualPlanFixture(t, []int64{1})
	input.Laps[0].TyreWearPercent.Value = 101
	if _, err := CalculateManualPlan(input); !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("wear error = %v", err)
	}

	input = manualPlanFixture(t, []int64{1})
	input.PitLossPerStop.Value = contract.DurationSeconds(math.NaN())
	if _, err := CalculateManualPlan(input); !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("pit error = %v", err)
	}
}

func TestCalculateManualPlanRejectsPitLossOverflow(t *testing.T) {
	input := manualPlanFixture(t, []int64{1, 1})
	input.PitLossPerStop = sourcedDuration(t, float64(contract.ManifestV1().MaxSafeInteger), input.PitLossPerStop.Evidence)
	input.Repair = sourcedDuration(t, 0, input.Repair.Evidence)
	input.Penalty = sourcedDuration(t, 0, input.Penalty.Evidence)
	if _, err := CalculateManualPlan(input); err != nil {
		t.Fatalf("one stop at the safe maximum should be valid: %v", err)
	}

	input = manualPlanFixture(t, []int64{1, 1, 1})
	input.PitLossPerStop = sourcedDuration(t, float64(contract.ManifestV1().MaxSafeInteger), input.PitLossPerStop.Evidence)
	if _, err := CalculateManualPlan(input); !HasErrorCode(err, ErrorOverflow) {
		t.Fatalf("pit-loss overflow error = %v", err)
	}
}

func manualPlanFixture(t testing.TB, stintLaps []int64) ManualPlanInput {
	t.Helper()
	manual := evidence(contract.ProvenanceManual, "strategy-editor", contract.ConfidenceHigh, "manual input")
	total := int64(0)
	stints := make([]contract.LapCount, len(stintLaps))
	for index, count := range stintLaps {
		value, err := contract.NewLapCount(count)
		if err != nil {
			t.Fatal(err)
		}
		stints[index] = value
		total += count
	}
	laps := make([]ManualLapInput, total)
	for index := range laps {
		laps[index] = ManualLapInput{
			FuelPerLap:          sourcedFuel(t, 4.8, manual),
			VirtualEnergyPerLap: sourcedEnergy(t, 2, manual),
			AverageLap:          sourcedDuration(t, 138.4, manual),
			TyreWearPercent:     Sourced[float64]{Value: 0.65, Evidence: manual},
		}
	}
	return ManualPlanInput{
		Stints:                      stints,
		Laps:                        laps,
		FuelCapacity:                sourcedFuel(t, 100, manual),
		FuelUsableCapacity:          sourcedFuel(t, 100, manual),
		FuelStartAmount:             sourcedFuel(t, 100, manual),
		FuelFormation:               sourcedFuel(t, 0, manual),
		FuelReserve:                 sourcedFuel(t, 0, manual),
		VirtualEnergyCapacity:       sourcedEnergy(t, 100, manual),
		VirtualEnergyUsableCapacity: sourcedEnergy(t, 100, manual),
		VirtualEnergyStartAmount:    sourcedEnergy(t, 100, manual),
		VirtualEnergyFormation:      sourcedEnergy(t, 0, manual),
		VirtualEnergyReserve:        sourcedEnergy(t, 0, manual),
		PitLossPerStop:              sourcedDuration(t, 22.4, manual),
		Repair:                      sourcedDuration(t, 5, manual),
		Penalty:                     sourcedDuration(t, 10, manual),
	}
}

func assertClose(t testing.TB, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-9 {
		t.Fatalf("got %.12f, want %.12f", got, want)
	}
}
