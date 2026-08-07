package solver

import (
	"math"
	"testing"
)

func compareInput() Input {
	return Input{
		RaceLaps:                 78,
		BaseLapSeconds:           100,
		DegradationPerLapSeconds: 0.08,
		PitLossSeconds:           22,
		Fuel:                     fuel(100, 5), // 20 laps
	}
}

func variantOf(t *testing.T, comparison Comparison, kind VariantKind) Variant {
	t.Helper()
	for _, variant := range comparison.Variants {
		if variant.Kind == kind {
			return variant
		}
	}
	t.Fatalf("comparison has no %s variant", kind)
	return Variant{}
}

func TestCompareOffersTheThreeQuestions(t *testing.T) {
	comparison, err := Compare(compareInput(), DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	for _, kind := range []VariantKind{VariantFast, VariantRobust, VariantConservative} {
		variant := variantOf(t, comparison, kind)
		if len(variant.Reasons) == 0 {
			t.Fatalf("%s carries no explanation", kind)
		}
		if !variant.Candidate.Feasible {
			t.Fatalf("%s must be a runnable plan", kind)
		}
	}
}

func TestFastestIsNeverSlowerThanTheOthers(t *testing.T) {
	comparison, err := Compare(compareInput(), DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	fast := variantOf(t, comparison, VariantFast)
	if fast.DeltaToFastestSeconds != 0 {
		t.Fatalf("the fast plan is the reference, so it gives up nothing: %v", fast.DeltaToFastestSeconds)
	}
	for _, variant := range comparison.Variants {
		if variant.Candidate.TotalSeconds < fast.Candidate.TotalSeconds {
			t.Fatalf("%s is quicker than the fast plan", variant.Kind)
		}
		if variant.DeltaToFastestSeconds < 0 {
			t.Fatalf("%s reports a negative delta", variant.Kind)
		}
	}
}

func TestConservativeCostsTimeAndBuysMargin(t *testing.T) {
	comparison, err := Compare(compareInput(), DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	fast := variantOf(t, comparison, VariantFast)
	conservative := variantOf(t, comparison, VariantConservative)

	if conservative.Candidate.Stops <= fast.Candidate.Stops {
		t.Fatalf("the conservative plan must stop more often: %d vs %d",
			conservative.Candidate.Stops, fast.Candidate.Stops)
	}
	if conservative.DeltaToFastestSeconds <= 0 {
		t.Fatal("the extra stop has to cost something, and that cost must be stated")
	}
	if conservative.MarginLaps <= fast.MarginLaps {
		t.Fatalf("the conservative plan must leave more room: %d vs %d",
			conservative.MarginLaps, fast.MarginLaps)
	}
}

func TestTotalsAreRangesNotSingleFigures(t *testing.T) {
	comparison, err := Compare(compareInput(), DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	for _, variant := range comparison.Variants {
		total := variant.Total
		if !(total.OptimisticSeconds < total.ExpectedSeconds && total.ExpectedSeconds < total.PessimisticSeconds) {
			t.Fatalf("%s: a range must widen either side of the expectation: %+v", variant.Kind, total)
		}
		if total.SpreadSeconds() <= 0 {
			t.Fatalf("%s: a degrading car cannot have a zero-width estimate", variant.Kind)
		}
		if math.Abs(total.ExpectedSeconds-variant.Candidate.TotalSeconds) > epsilon {
			t.Fatalf("%s: the expected total must match the plan's own total", variant.Kind)
		}
	}
}

func TestZeroSensitivityCollapsesTheRange(t *testing.T) {
	comparison, err := Compare(compareInput(), Sensitivity{})
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	fast := variantOf(t, comparison, VariantFast)
	if fast.Total.SpreadSeconds() != 0 {
		t.Fatalf("with no uncertainty declared there is no spread: %+v", fast.Total)
	}
}

func TestRiskFollowsTheMarginLeft(t *testing.T) {
	// A race whose optimum sits exactly on the fuel limit has no room at all.
	onTheLimit := Input{
		RaceLaps:       40,
		BaseLapSeconds: 100,
		PitLossSeconds: 22,
		Fuel:           fuel(100, 5), // exactly 20 laps, so 40 laps is two full stints
	}
	comparison, err := Compare(onTheLimit, DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	fast := variantOf(t, comparison, VariantFast)
	if fast.MarginLaps != 0 {
		t.Fatalf("expected the fast plan to sit on the limit, margin %d", fast.MarginLaps)
	}
	if fast.Risk != RiskHigh {
		t.Fatalf("no margin is high risk, got %s", fast.Risk)
	}
	if fast.SurvivesPessimistic {
		t.Fatal("a plan on the limit cannot survive higher consumption")
	}

	conservative := variantOf(t, comparison, VariantConservative)
	if conservative.Risk == RiskHigh {
		t.Fatalf("the conservative plan should not be high risk: margin %d", conservative.MarginLaps)
	}
}

func TestRobustSurvivesConsumptionRunningOver(t *testing.T) {
	onTheLimit := Input{
		RaceLaps:       40,
		BaseLapSeconds: 100,
		PitLossSeconds: 22,
		Fuel:           fuel(100, 5),
	}
	comparison, err := Compare(onTheLimit, DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	robust := variantOf(t, comparison, VariantRobust)
	if !robust.SurvivesPessimistic {
		t.Fatalf("the robust plan must survive the pessimistic case: %+v", robust)
	}
	fast := variantOf(t, comparison, VariantFast)
	if robust.Candidate.Stops <= fast.Candidate.Stops {
		t.Fatal("robustness had to be bought here, so it needs an extra stop")
	}
}

func TestAPlanBeatenOnBothCountsIsMarkedDominated(t *testing.T) {
	comparison, err := Compare(compareInput(), DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	for _, variant := range comparison.Variants {
		if !variant.Dominated {
			continue
		}
		better := variantOf(t, comparison, variant.DominatedBy)
		if better.Candidate.TotalSeconds > variant.Candidate.TotalSeconds {
			t.Fatalf("%s is marked dominated by a slower plan", variant.Kind)
		}
		if better.MarginLaps < variant.MarginLaps {
			t.Fatalf("%s is marked dominated by a plan with less margin", variant.Kind)
		}
	}
	// A slower plan that buys margin is a trade, never a dominated one.
	conservative := variantOf(t, comparison, VariantConservative)
	fast := variantOf(t, comparison, VariantFast)
	if conservative.MarginLaps > fast.MarginLaps && conservative.Dominated {
		t.Fatal("a plan that buys margin is not dominated just because it is slower")
	}
}

func TestRankingIsStableAndDeterministic(t *testing.T) {
	input := compareInput()
	first, err := Compare(input, DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	for attempt := 0; attempt < 30; attempt++ {
		again, err := Compare(input, DefaultSensitivity())
		if err != nil {
			t.Fatalf("Compare repeat: %v", err)
		}
		if len(again.Variants) != len(first.Variants) {
			t.Fatal("the comparison changed size between runs")
		}
		for index, variant := range again.Variants {
			if variant.Kind != first.Variants[index].Kind {
				t.Fatalf("position %d changed from %s to %s",
					index, first.Variants[index].Kind, variant.Kind)
			}
			if variant.Candidate.TotalSeconds != first.Variants[index].Total.ExpectedSeconds {
				t.Fatalf("position %d changed its total between runs", index)
			}
		}
	}
}

func TestRankingBreaksTiesWithoutReordering(t *testing.T) {
	// With no degradation and no pit loss every stop count costs the same, so
	// every variant ties and only the tie-break decides the order.
	tied := Input{RaceLaps: 20, BaseLapSeconds: 90, Fuel: fuel(100, 10)}
	comparison, err := Compare(tied, DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	for index := 1; index < len(comparison.Variants); index++ {
		previous, current := comparison.Variants[index-1], comparison.Variants[index]
		if current.Candidate.TotalSeconds < previous.Candidate.TotalSeconds {
			t.Fatalf("position %d is quicker than the one before it", index)
		}
		if current.Candidate.TotalSeconds == previous.Candidate.TotalSeconds &&
			current.MarginLaps > previous.MarginLaps {
			t.Fatalf("on a tie the plan with more margin must come first: %+v then %+v",
				previous.Kind, current.Kind)
		}
	}
}

func TestComparisonStatesItsAssumptions(t *testing.T) {
	comparison, err := Compare(compareInput(), DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	wanted := map[string]bool{
		"sensitivity_envelope":       false,
		"variants_are_not_a_ranking": false,
		"separate_resources":         false,
	}
	for _, assumption := range comparison.Assumptions {
		if _, tracked := wanted[assumption.Code]; tracked {
			wanted[assumption.Code] = true
		}
	}
	for code, present := range wanted {
		if !present {
			t.Fatalf("the comparison never states %q", code)
		}
	}
}

func TestCompareRejectsAnImpossibleEnvelope(t *testing.T) {
	for _, sensitivity := range []Sensitivity{
		{DegradationFactor: -0.1},
		{ConsumptionFactor: 1},
		{DegradationFactor: math.NaN()},
	} {
		if _, err := Compare(compareInput(), sensitivity); err == nil {
			t.Fatalf("%+v: expected an error", sensitivity)
		} else if !HasErrorCode(err, ErrorInvalidInput) {
			t.Fatalf("%+v: expected invalid_input, got %v", sensitivity, err)
		}
	}
}

func TestCompareMarksVariantsThatAreTheSamePlan(t *testing.T) {
	// A race with room to spare: the quickest plan is already robust.
	roomy := Input{
		RaceLaps:                 30,
		BaseLapSeconds:           100,
		DegradationPerLapSeconds: 0.01,
		PitLossSeconds:           25,
		Fuel:                     fuel(200, 4), // 50 laps, far more than needed
	}
	comparison, err := Compare(roomy, DefaultSensitivity())
	if err != nil {
		t.Fatalf("Compare: %v", err)
	}
	fast := variantOf(t, comparison, VariantFast)
	robust := variantOf(t, comparison, VariantRobust)
	if fast.Candidate.Stops != robust.Candidate.Stops {
		t.Fatalf("with room to spare the quickest plan is already robust: %d vs %d",
			fast.Candidate.Stops, robust.Candidate.Stops)
	}
	var saysSo bool
	for _, reason := range robust.Reasons {
		if reason.Code == "same_as_fast" || reason.Code == "already_robust" {
			saysSo = true
		}
	}
	if !saysSo {
		t.Fatalf("the duplicate must be called out: %+v", robust.Reasons)
	}
}

func FuzzCompareKeepsItsInvariants(f *testing.F) {
	f.Add(int64(78), 100.0, 0.08, 22.0, 100.0, 5.0, 0.2, 0.05)
	f.Add(int64(5), 60.0, 0.0, 10.0, 50.0, 10.0, 0.0, 0.0)

	f.Fuzz(func(t *testing.T, raceLaps int64, baseLap, degradation, pitLoss, capacity, perLap, degFactor, consFactor float64) {
		input := Input{
			RaceLaps:                 raceLaps,
			BaseLapSeconds:           baseLap,
			DegradationPerLapSeconds: degradation,
			PitLossSeconds:           pitLoss,
		}
		if perLap > 0 {
			input.Fuel = fuel(capacity, perLap)
		}
		comparison, err := Compare(input, Sensitivity{DegradationFactor: degFactor, ConsumptionFactor: consFactor})
		if err != nil {
			return
		}
		if len(comparison.Variants) == 0 {
			t.Fatal("a successful comparison must offer at least one plan")
		}
		for index, variant := range comparison.Variants {
			if !variant.Candidate.Feasible {
				t.Fatalf("%s is not runnable", variant.Kind)
			}
			if variant.DeltaToFastestSeconds < -epsilon {
				t.Fatalf("%s claims to beat the fastest", variant.Kind)
			}
			if variant.Total.OptimisticSeconds > variant.Total.PessimisticSeconds+epsilon {
				t.Fatalf("%s has an inverted range: %+v", variant.Kind, variant.Total)
			}
			if index > 0 {
				previous := comparison.Variants[index-1]
				if variant.Candidate.TotalSeconds < previous.Candidate.TotalSeconds-epsilon {
					t.Fatalf("position %d is out of order", index)
				}
			}
			if variant.Dominated && variant.DominatedBy == "" {
				t.Fatalf("%s is dominated by nothing in particular", variant.Kind)
			}
		}
	})
}
