package solver

import (
	"math"
	"math/rand"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
)

func TestSimpleResourceDecisionsMatchesRandomizedExhaustiveOracle(t *testing.T) {
	random := rand.New(rand.NewSource(825))
	const cases = 300
	shortcutCases := 0

	for index := 0; index < cases; index++ {
		input := baseInputV2()
		input.RaceLaps = int64(2 + random.Intn(5))
		input.FuelCapacityLiters.Value = float64(1 + random.Intn(4))
		input.FuelPerLapLiters.Value = float64(1 + random.Intn(int(input.FuelCapacityLiters.Value)))
		input.VECapacityPercent.Value = float64(1 + random.Intn(4))
		input.VEPerLapPercent.Value = float64(1 + random.Intn(int(input.VECapacityPercent.Value)))
		if random.Intn(3) == 0 {
			input.TyreLifeLaps.Value = 0
		} else {
			input.TyreLifeLaps.Value = float64(1 + random.Intn(int(input.RaceLaps)))
		}
		input.PitCost.RefuelRateLPerS.Value = []float64{0.5, 1, 2}[random.Intn(3)]
		input.PitCost.VERatePPerS.Value = []float64{0.5, 1, 2}[random.Intn(3)]
		input.PitCost.TyreSeconds.Value = float64(random.Intn(5))
		input.PitCost.ServiceMode = []manual.PitServiceMode{manual.PitServiceParallel, manual.PitServiceSequential}[random.Intn(2)]
		if index%2 == 0 {
			input.FuelReserve = reserveLapsInput(0.8)
		}
		threshold := input.FuelCapacityLiters.Value/input.PitCost.RefuelRateLPerS.Value +
			input.VECapacityPercent.Value/input.PitCost.VERatePPerS.Value + input.PitCost.TyreSeconds.Value
		offset := []float64{-0.5, 0, 0.5, 2}[index%4]
		input.PitCost.TransitSeconds.Value = math.Max(0, threshold+offset)

		_, shortcut := preparedSimpleResourceDecisions(t, input)
		if offset <= 0 && shortcut {
			t.Fatalf("case=%d shortcut active at transit=%v threshold=%v input=%+v", index, input.PitCost.TransitSeconds.Value, threshold, input)
		}
		reserveCanFitTerminalLap := input.FuelReserve.Kind == "" || input.FuelCapacityLiters.Value >= input.FuelPerLapLiters.Value*(1+input.FuelReserve.Laps.Value)
		if offset > 0 && reserveCanFitTerminalLap && !shortcut {
			t.Fatalf("case=%d shortcut inactive at transit=%v threshold=%v input=%+v", index, input.PitCost.TransitSeconds.Value, threshold, input)
		}
		if shortcut {
			shortcutCases++
		}

		got, err := SolveV2(input)
		if err != nil {
			t.Fatalf("case=%d SolveV2: %v input=%+v", index, err, input)
		}
		want := exhaustiveV2BestNode(t, input)
		assertSimpleResourceParity(t, index, input, got, want)
	}
	if shortcutCases < 100 {
		t.Fatalf("shortcut exercised only %d/%d cases", shortcutCases, cases)
	}
}

func TestSimpleResourceDecisionsStaysActiveWithFractionalReserve(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 139
	input.FuelCapacityLiters.Value = 90
	input.FuelPerLapLiters.Value = 2.75
	input.Discretization.FuelLiters = 2.75
	input.PitCost.TransitSeconds.Value = 64
	input.PitCost.RefuelRateLPerS.Value = 1e12
	input.PitCost.TyreSeconds.Value = 0
	if decisions, active := preparedSimpleResourceDecisions(t, input); !active || len(decisions) == 0 {
		t.Fatalf("baseline shortcut active=%v decisions=%d", active, len(decisions))
	}
	input.FuelReserve = reserveLapsInput(0.8)

	decisions, active := preparedSimpleResourceDecisions(t, input)
	if !active || len(decisions) == 0 {
		t.Fatalf("shortcut active=%v decisions=%d", active, len(decisions))
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || !result.Reserve.Satisfied || result.ComputeStats.Iterations != 0 ||
		len(result.CandidateDetails) == 0 || len(result.CandidateDetails[0].Reasons) == 0 ||
		result.CandidateDetails[0].Reasons[0].Code != "optimal_after_scalar_resource_bound" {
		t.Fatalf("shortcut result = %+v", result)
	}
}

func TestSimpleResourceDecisionsRejectsEveryLiveDimension(t *testing.T) {
	base := baseInputV2()
	base.PitCost.TransitSeconds.Value = 100

	tests := []struct {
		name   string
		mutate func(*SolverInputV2, *stintPaceCost, *compoundPaceCosts, *fuelWeightCost, *savingCost, *driverDecisionModel, *weatherCostModel)
	}{
		{name: "compound", mutate: func(_ *SolverInputV2, _ *stintPaceCost, value *compoundPaceCosts, _ *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			value.enabled = true
		}},
		{name: "fuel weight", mutate: func(_ *SolverInputV2, _ *stintPaceCost, _ *compoundPaceCosts, value *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			value.secondsPerLiter = 0.01
		}},
		{name: "pace slope", mutate: func(_ *SolverInputV2, value *stintPaceCost, _ *compoundPaceCosts, _ *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			value.manualSlope = 0.01
		}},
		{name: "saving", mutate: func(_ *SolverInputV2, _ *stintPaceCost, _ *compoundPaceCosts, _ *fuelWeightCost, value *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			value.levels = append(value.levels, savingLevelCost{level: SavingLow})
		}},
		{name: "weather", mutate: func(_ *SolverInputV2, _ *stintPaceCost, _ *compoundPaceCosts, _ *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, value *weatherCostModel) {
			value.enabled = true
		}},
		{name: "pit window", mutate: func(input *SolverInputV2, _ *stintPaceCost, _ *compoundPaceCosts, _ *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			input.EventRules.RequiredWindows = []PitWindow{{FromLap: 1, ToLap: 2}}
		}},
		{name: "minimum stops", mutate: func(input *SolverInputV2, _ *stintPaceCost, _ *compoundPaceCosts, _ *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			value := 1
			input.EventRules.MinPitStops = &value
		}},
		{name: "maximum stops", mutate: func(input *SolverInputV2, _ *stintPaceCost, _ *compoundPaceCosts, _ *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			value := 2
			input.EventRules.MaxPitStops = &value
		}},
		{name: "driver limits", mutate: func(input *SolverInputV2, _ *stintPaceCost, _ *compoundPaceCosts, _ *fuelWeightCost, _ *savingCost, _ *driverDecisionModel, _ *weatherCostModel) {
			maximum := 1000.0
			input.EventRules.DriverLimits = map[string]DriverLimit{"driver-1": {MaxTotalTimeSeconds: &maximum}}
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := base
			fuel, ve, pace, compounds, weight, saving, drivers, weather := preparedSimpleResourceModels(t, input)
			test.mutate(&input, &pace, &compounds, &weight, &saving, &drivers, &weather)
			if _, ok := simpleResourceDecisions(input, fuel, ve, pace, compounds, weight, saving, drivers, weather); ok {
				t.Fatal("shortcut accepted a live dimension")
			}
		})
	}
}

func TestSimpleResourceDecisionsHonorsExplicitCandidateBudget(t *testing.T) {
	input := baseInputV2()
	input.PitCost.TransitSeconds.Value = 100
	input.Budget.MaxCandidates = 1
	if _, active := preparedSimpleResourceDecisions(t, input); active {
		t.Fatal("shortcut exceeded the caller candidate budget")
	}
}

func preparedSimpleResourceDecisions(t *testing.T, input SolverInputV2) ([]DecisionVector, bool) {
	t.Helper()
	fuel, ve, pace, compounds, weight, saving, drivers, weather := preparedSimpleResourceModels(t, input)
	return simpleResourceDecisions(input, fuel, ve, pace, compounds, weight, saving, drivers, weather)
}

func preparedSimpleResourceModels(t *testing.T, input SolverInputV2) (serviceResource, serviceResource, stintPaceCost, compoundPaceCosts, fuelWeightCost, savingCost, driverDecisionModel, weatherCostModel) {
	t.Helper()
	fuel, ve, err := input.serviceResources()
	if err != nil {
		t.Fatal(err)
	}
	pace, err := input.stintPaceCost()
	if err != nil {
		t.Fatal(err)
	}
	compounds, err := input.compoundPaceCosts()
	if err != nil {
		t.Fatal(err)
	}
	weight, err := input.fuelWeightCost()
	if err != nil {
		t.Fatal(err)
	}
	saving, err := input.savingCost()
	if err != nil {
		t.Fatal(err)
	}
	drivers, err := newDriverDecisionModel(input, saving)
	if err != nil {
		t.Fatal(err)
	}
	weather, err := newWeatherCostModel(input)
	if err != nil {
		t.Fatal(err)
	}
	return fuel, ve, pace, compounds, weight, saving, drivers, weather
}

func assertSimpleResourceParity(t *testing.T, index int, input SolverInputV2, got SolverResultV2, want searchNode) {
	t.Helper()
	if math.IsInf(want.total(input.Formation.Seconds.Value), 1) {
		if got.Feasible {
			t.Fatalf("case=%d got feasible plan for infeasible oracle input=%+v decision=%+v", index, input, got.Best)
		}
		return
	}
	if !got.Feasible || math.Abs(got.Expected.TotalSeconds-want.total(input.Formation.Seconds.Value)) > epsilon {
		t.Fatalf("case=%d total mismatch got=%v want=%v input=%+v gotDecision=%+v wantDecision=%+v", index, got.Expected.TotalSeconds, want.total(input.Formation.Seconds.Value), input, got.Best, want.decision)
	}
	if len(got.Best.PitStops) != len(want.decision.PitStops) {
		t.Fatalf("case=%d stop count mismatch got=%+v want=%+v input=%+v", index, got.Best.PitStops, want.decision.PitStops, input)
	}
	for stop := range got.Best.PitStops {
		left, right := got.Best.PitStops[stop], want.decision.PitStops[stop]
		if left.Lap != right.Lap || left.FuelLiters != right.FuelLiters || left.VEPercent != right.VEPercent {
			t.Fatalf("case=%d stop=%d mismatch got=%+v want=%+v input=%+v", index, stop, left, right, input)
		}
	}
}
