package producta

import (
	"math"
	"reflect"
	"testing"
)

func TestValidateTyrePlanAcceptsFourWheelsAndMixedCompounds(t *testing.T) {
	plan := TyrePlan{
		Inventory: TyreInventory{
			LimitedStock: true,
			Units: []TyreUnit{
				{ID: "soft-fl", SetID: "set-1", Compound: TyreSoft, Corner: WheelFL},
				{ID: "medium-fr", SetID: "set-1", Compound: TyreMedium, Corner: WheelFR},
				{ID: "hard-rl", SetID: "set-1", Compound: TyreHard, Corner: WheelRL},
				{ID: "wet-rr", SetID: "set-1", Compound: TyreWet, Corner: WheelRR},
			},
		},
		Allocations: []TyreAllocation{{Stint: 1, Wheels: map[Wheel]string{
			WheelFL: "soft-fl", WheelFR: "medium-fr", WheelRL: "hard-rl", WheelRR: "wet-rr",
		}}},
	}

	if err := ValidateTyrePlan(plan); err != nil {
		t.Fatalf("mixed compound plan should be valid: %v", err)
	}
}

func TestValidateTyrePlanRejectsUnitOnTwoWheels(t *testing.T) {
	plan := TyrePlan{
		Inventory: TyreInventory{Units: []TyreUnit{{ID: "soft-fl", Compound: TyreSoft, Corner: WheelFL}}},
		Allocations: []TyreAllocation{{Stint: 1, Wheels: map[Wheel]string{
			WheelFL: "soft-fl", WheelFR: "soft-fl",
		}}},
	}

	err := ValidateTyrePlan(plan)
	assertTyreError(t, err, "tyre_unit_reused_in_stint")
}

func TestValidateTyrePlanRejectsUsedUnitMovingCorner(t *testing.T) {
	plan := TyrePlan{
		Inventory: TyreInventory{Units: []TyreUnit{{ID: "soft-fl", Compound: TyreSoft, Corner: WheelFL, UsedCount: 1}}},
		Allocations: []TyreAllocation{
			{Stint: 1, Wheels: map[Wheel]string{WheelFL: "soft-fl"}},
			{Stint: 2, Wheels: map[Wheel]string{WheelFR: "soft-fl"}},
		},
	}

	err := ValidateTyrePlan(plan)
	assertTyreError(t, err, "tyre_corner_changed")
}

func TestValidateTyrePlanRejectsMissingStockAndInvalidCompound(t *testing.T) {
	plan := TyrePlan{
		Inventory:   TyreInventory{LimitedStock: true, Units: []TyreUnit{{ID: "unknown-compound", Compound: TyreCompound("slick"), Corner: WheelFL}}},
		Allocations: []TyreAllocation{{Stint: 1, Wheels: map[Wheel]string{WheelFL: "missing"}}},
	}

	err := ValidateTyrePlan(plan)
	assertTyreError(t, err, "tyre_compound_invalid")
	assertTyreError(t, err, "tyre_unit_missing")
}

func assertTyreError(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected tyre error %q", code)
	}
	if typed, ok := err.(TyreValidationError); ok && typed.Code == code {
		return
	}
	if typed, ok := err.(*TyreValidationError); ok && typed.Code == code {
		return
	}
	if typed, ok := err.(TyreValidationErrors); ok {
		for _, item := range typed.Errors {
			if item.Code == code {
				return
			}
		}
	}
	t.Fatalf("expected tyre error %q, got %v", code, err)
}

func TestCountTyreChangesSupportsPartialAndMixedServices(t *testing.T) {
	previous := TyreAllocation{Stint: 1, Wheels: map[Wheel]string{
		WheelFL: "soft-fl", WheelFR: "soft-fr", WheelRL: "soft-rl", WheelRR: "soft-rr",
	}}
	current := TyreAllocation{Stint: 2, Wheels: map[Wheel]string{
		WheelFL: "medium-fl", WheelFR: "soft-fr", WheelRL: "hard-rl", WheelRR: "soft-rr",
	}}
	if got := CountTyreChanges(previous, current); got != 2 {
		t.Fatalf("expected two changed wheels, got %d", got)
	}
}

func TestTyreChangeDurationUsesPresetForZeroToFourWheels(t *testing.T) {
	preset := TyreChangePreset{OneWheelSeconds: 4, TwoWheelSeconds: 7, ThreeWheelSeconds: 9, FourWheelSeconds: 12}
	for _, test := range []struct {
		count int
		want  float64
	}{
		{count: 0, want: 0},
		{count: 1, want: 4},
		{count: 2, want: 7},
		{count: 3, want: 9},
		{count: 4, want: 12},
	} {
		got, err := TyreChangeDuration(test.count, preset)
		if err != nil {
			t.Fatalf("change count %d: %v", test.count, err)
		}
		if got != test.want {
			t.Fatalf("change count %d: want %.2f, got %.2f", test.count, test.want, got)
		}
	}
}

func TestTyreChangeDurationTreatsMissingTimingAsPending(t *testing.T) {
	if _, err := TyreChangeDuration(2, TyreChangePreset{}); err != ErrTyreTimingPending {
		t.Fatalf("expected pending timing error, got %v", err)
	}
}

func TestPaceLossAtWearInterpolatesEditableCurve(t *testing.T) {
	curve := []WearCurvePoint{{Wear: 0, PaceLossSeconds: 0}, {Wear: 0.5, PaceLossSeconds: 1}, {Wear: 1, PaceLossSeconds: 3}}
	for _, test := range []struct {
		wear float64
		want float64
	}{
		{wear: 0.25, want: 0.5},
		{wear: 0.75, want: 2},
		{wear: -1, want: 0},
		{wear: 2, want: 3},
	} {
		got, err := PaceLossAtWear(curve, test.wear)
		if err != nil {
			t.Fatalf("pace loss at %.2f: %v", test.wear, err)
		}
		if math.Abs(got-test.want) > 1e-9 {
			t.Fatalf("wear %.2f: want %.2f, got %.2f", test.wear, test.want, got)
		}
	}
}

func TestProjectTyreWearUsesPerLapAndStintWear(t *testing.T) {
	projection, err := ProjectTyreWear(
		TyreUnit{ID: "soft-fl", Compound: TyreSoft, Corner: WheelFL, InitialTread: 1},
		TyreWearProfile{
			WearPerLap:         0.1,
			WearPerStint:       0.05,
			SafeThreshold:      0.7,
			BlowoutThreshold:   0,
			PaceLossAtFullWear: 4,
		},
		3,
		0,
	)
	if err != nil {
		t.Fatalf("project tyre wear: %v", err)
	}
	if math.Abs(projection.StartTread-1) > 1e-9 || math.Abs(projection.EndTread-0.65) > 1e-9 || projection.Risk != TyreRiskWarning || projection.Blowout {
		t.Fatalf("unexpected tyre wear projection: %#v", projection)
	}
	if projection.PaceLossSeconds <= 0 {
		t.Fatal("expected accumulated pace loss")
	}
}

func TestProjectTyreWearReportsBlowoutAndCriticalRisk(t *testing.T) {
	projection, err := ProjectTyreWear(
		TyreUnit{ID: "soft-fl", Compound: TyreSoft, Corner: WheelFL, InitialTread: 1},
		TyreWearProfile{WearPerLap: 0.6, SafeThreshold: 0.5, BlowoutThreshold: 0},
		2,
		0,
	)
	if err != nil {
		t.Fatalf("project tyre wear: %v", err)
	}
	if !projection.Blowout || projection.Risk != TyreRiskCritical {
		t.Fatalf("expected critical blowout: %#v", projection)
	}
}

func TestPaceLossAndTyreWearRejectInvalidCurvesAndInputs(t *testing.T) {
	if _, err := PaceLossAtWear([]WearCurvePoint{{Wear: 0.5}, {Wear: 0.4}}, 0.4); err == nil {
		t.Fatal("expected unordered curve to fail")
	}
	if _, err := ProjectTyreWear(TyreUnit{InitialTread: 1}, TyreWearProfile{WearPerLap: math.NaN()}, 1, 0); err == nil {
		t.Fatal("expected non-finite wear rate to fail")
	}
}

func TestTyreWearInvariantsAreDeterministicAndMonotonic(t *testing.T) {
	unit := TyreUnit{ID: "soft-fl", Compound: TyreSoft, Corner: WheelFL, InitialTread: 1}
	profile := TyreWearProfile{WearPerLap: 0.05, PaceLossAtFullWear: 4}
	low, err := ProjectTyreWear(unit, profile, 2, 0)
	if err != nil {
		t.Fatalf("low wear projection: %v", err)
	}
	high, err := ProjectTyreWear(unit, profile, 4, 0)
	if err != nil {
		t.Fatalf("high wear projection: %v", err)
	}
	repeat, err := ProjectTyreWear(unit, profile, 4, 0)
	if err != nil {
		t.Fatalf("repeat wear projection: %v", err)
	}
	if high.EndTread > low.EndTread || high.PaceLossSeconds < low.PaceLossSeconds {
		t.Fatalf("wear monotonicity violated: low=%#v high=%#v", low, high)
	}
	if !reflect.DeepEqual(high, repeat) {
		t.Fatalf("wear projection is not deterministic: %#v vs %#v", high, repeat)
	}
}
