package producta

import (
	"math"
	"testing"
)

func TestProjectResourceIncludesFormationReserveAndPartialStart(t *testing.T) {
	input := ResourceInput{
		Enabled:           true,
		Capacity:          100,
		UsableCapacity:    90,
		StartAmount:       20,
		ConsumptionPerLap: 4,
		FormationAmount:   2,
		FormationLaps:     1.5,
		Margin:            MarginInput{Kind: "laps", Value: 2},
	}

	projection, err := ProjectResource(input, 30)
	if err != nil {
		t.Fatalf("project resource: %v", err)
	}
	if projection.TotalNeed != 136 || projection.ReserveAmount != 8 || projection.AvailableLaps != 5 {
		t.Fatalf("unexpected resource projection: %#v", projection)
	}
	if projection.AdditionalAmount != 116 || projection.StopsRequired != 2 {
		t.Fatalf("unexpected service requirement: %#v", projection)
	}
}

func TestProjectResourceSupportsReserveUnits(t *testing.T) {
	base := ResourceInput{Enabled: true, Capacity: 100, ConsumptionPerLap: 4}
	for _, test := range []struct {
		name       string
		margin     MarginInput
		wantAmount float64
	}{
		{name: "amount", margin: MarginInput{Kind: "amount", Value: 6}, wantAmount: 6},
		{name: "laps", margin: MarginInput{Kind: "laps", Value: 2}, wantAmount: 8},
		{name: "percent", margin: MarginInput{Kind: "percent", Value: 10}, wantAmount: 12},
	} {
		t.Run(test.name, func(t *testing.T) {
			base.Margin = test.margin
			projection, err := ProjectResource(base, 30)
			if err != nil {
				t.Fatalf("project resource: %v", err)
			}
			if projection.ReserveAmount != test.wantAmount {
				t.Fatalf("unexpected reserve: want %.2f, got %.2f", test.wantAmount, projection.ReserveAmount)
			}
		})
	}
}

func TestProjectResourceTreatsZeroConsumptionAsUnused(t *testing.T) {
	projection, err := ProjectResource(ResourceInput{Enabled: true, Capacity: 100, StartAmount: 50}, 30)
	if err != nil {
		t.Fatalf("zero-consumption resource: %v", err)
	}
	if projection.Used || projection.TotalNeed != 0 || projection.StopsRequired != 0 {
		t.Fatalf("zero consumption should disable resource use: %#v", projection)
	}
}

func TestSavingForOneLessStopReturnsAmountPerLapAndPercent(t *testing.T) {
	saving, err := SavingForOneLessStop(30, 120, 100, 1)
	if err != nil {
		t.Fatalf("saving for one less stop: %v", err)
	}
	if math.Abs(saving.Amount-20) > 1e-9 || math.Abs(saving.PerLap-20.0/30.0) > 1e-9 || math.Abs(saving.Percent-(20.0/120.0)*100) > 1e-9 {
		t.Fatalf("unexpected saving: %#v", saving)
	}
}

func TestResourceProjectionRejectsInvalidInputs(t *testing.T) {
	if _, err := ProjectResource(ResourceInput{Enabled: true, ConsumptionPerLap: math.NaN()}, 10); err == nil {
		t.Fatal("expected non-finite consumption to fail")
	}
	if _, err := SavingForOneLessStop(0, 10, 100, 1); err == nil {
		t.Fatal("expected zero laps to fail")
	}
}
