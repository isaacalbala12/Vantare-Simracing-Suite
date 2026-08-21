package solver

import (
	"math"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
)

func baseInputV2() SolverInputV2 {
	return SolverInputV2{
		ContractVersion: SolverContractVersionV2,
		RaceLaps:        5,
		BaseLapSeconds:  90,
		PitCost: PitCostModel{
			TransitSeconds: 10, RefuelRateLPerS: 1, VERatePPerS: 2, TyreSeconds: 2,
			ServiceMode: manual.PitServiceParallel,
		},
		Formation:          Formation{Seconds: 3, Presence: "valid"},
		Budget:             ComputeBudget{P95Millis: 10_000},
		FuelCapacityLiters: 2,
		FuelPerLapLiters:   1,
		Discretization:     ServiceDiscretization{FuelLiters: 1, VEPercent: 1},
	}
}

// exhaustiveV2Best enumera sin poda exactamente las vueltas de parada y los
// multiplos discretizados de Fuel/VE que SolveV2 puede escoger. Solo usa casos
// enteros pequenos porque su crecimiento es deliberadamente exponencial.
func exhaustiveV2Best(t *testing.T, input SolverInputV2) float64 {
	t.Helper()
	fuel, ve, err := input.serviceResources()
	if err != nil {
		t.Fatalf("serviceResources: %v", err)
	}
	best := math.Inf(1)
	var walk func(lap, fuelLeft, veLeft int64, stops int, total float64)
	walk = func(lap, fuelLeft, veLeft int64, stops int, total float64) {
		node := searchNode{lap: lap, fuel: fuelLeft, ve: veLeft}
		maxLaps := runnableLaps(input.RaceLaps-lap, node, fuel, ve, input.TyreLifeLaps)
		for stintLaps := int64(1); stintLaps <= maxLaps; stintLaps++ {
			stint, err := planStint(stintLaps, input.BaseLapSeconds, input.DegradationPerLap)
			if err != nil {
				t.Fatalf("planStint: %v", err)
			}
			nextLap := lap + stintLaps
			nextFuel := fuelLeft - fuel.perLap*stintLaps
			nextVE := veLeft - ve.perLap*stintLaps
			nextTotal := total + stint.TotalSeconds
			if nextLap == input.RaceLaps {
				if allowed, _, _ := input.stopCountAllowed(stops); allowed && nextTotal < best {
					best = nextTotal
				}
				continue
			}
			for _, fuelAmount := range serviceAmounts(nextFuel, fuel) {
				for _, veAmount := range serviceAmounts(nextVE, ve) {
					pitInput, err := solverPitInput(input, fuelAmount, veAmount)
					if err != nil {
						t.Fatalf("solverPitInput: %v", err)
					}
					pit, err := manual.CalculatePitStop(pitInput)
					if err != nil {
						t.Fatalf("CalculatePitStop: %v", err)
					}
					if input.EventRules.MaxPitStops == nil || stops < *input.EventRules.MaxPitStops {
						walk(nextLap, nextFuel+fuelAmount, nextVE+veAmount, stops+1, nextTotal+pit.TotalSeconds.Value())
					}
				}
			}
		}
	}
	walk(0, fuel.capacity, ve.capacity, 0, input.Formation.Seconds)
	return best
}

func TestSolveV2MatchesExhaustiveStopsAndServiceQuantities(t *testing.T) {
	for _, raceLaps := range []int64{2, 3, 4, 5, 6} {
		for _, degradation := range []float64{0, 0.5} {
			for _, mode := range []manual.PitServiceMode{manual.PitServiceParallel, manual.PitServiceSequential} {
				input := baseInputV2()
				input.RaceLaps = raceLaps
				input.DegradationPerLap = degradation
				input.PitCost.ServiceMode = mode
				input.VECapacityPercent = 2
				input.VEPerLapPercent = 1

				got, err := SolveV2(input)
				if err != nil {
					t.Fatalf("SolveV2(laps=%d degradation=%v mode=%s): %v", raceLaps, degradation, mode, err)
				}
				want := exhaustiveV2Best(t, input)
				if !got.Feasible || math.Abs(got.Expected.TotalSeconds-want) > epsilon {
					t.Fatalf("laps=%d degradation=%v mode=%s: solver=%v feasible=%v exhaustive=%v", raceLaps, degradation, mode, got.Expected.TotalSeconds, got.Feasible, want)
				}
			}
		}
	}
}

func TestSolveV2ExposesPerStopBreakdownAndBinding(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.VECapacityPercent = 2
	input.VEPerLapPercent = 1
	input.PitCost.VERatePPerS = 2

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if len(result.Best.PitStops) != 1 {
		t.Fatalf("pit stops = %+v", result.Best.PitStops)
	}
	stop := result.Best.PitStops[0]
	if stop.Lap != 2 || stop.FuelLiters != 2 || stop.VEPercent != 2 {
		t.Fatalf("service decision = %+v", stop)
	}
	if stop.PitBreakdown == nil || stop.PitBreakdown.TravelSeconds.Value() != 10 || stop.PitBreakdown.CoreServiceSeconds.Value() != 2 || stop.PitBreakdown.OverlapSavedSeconds.Value() != 3 || stop.PitBreakdown.TotalSeconds.Value() != 12 {
		t.Fatalf("pit breakdown = %+v", stop.PitBreakdown)
	}
	if result.Binding.Kind != string(ResourceFuel) || result.Binding.Laps != 2 {
		t.Fatalf("binding = %+v", result.Binding)
	}
	if result.Expected.PitSeconds != 12 || result.Expected.FormationSeconds != 3 || result.Expected.TotalSeconds != 375 {
		t.Fatalf("evaluation = %+v", result.Expected)
	}
}

func TestSolveV2KeepsInfeasibleCandidateReason(t *testing.T) {
	input := baseInputV2()
	input.FuelCapacityLiters = 0.5
	input.Discretization.FuelLiters = 0.5

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if result.Feasible || len(result.Reasons) == 0 || len(result.CandidateDetails) == 0 {
		t.Fatalf("infeasible result lost its reasons: %+v", result)
	}
	if result.CandidateDetails[0].Feasible || len(result.CandidateDetails[0].Reasons) == 0 {
		t.Fatalf("infeasible candidate = %+v", result.CandidateDetails[0])
	}
}

func TestSolveV2AppliesPitStopCountRulesWithoutHidingRejections(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 2
	input.FuelCapacityLiters = 2
	minimum := 1
	maximum := 1
	input.EventRules.MinPitStops = &minimum
	input.EventRules.MaxPitStops = &maximum

	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || len(result.Best.PitStops) != 1 {
		t.Fatalf("event-constrained best = %+v", result)
	}
	var sawMinimumRejection bool
	for _, candidate := range result.CandidateDetails {
		for _, reason := range candidate.Reasons {
			if reason.Code == "minimum_pit_stops" {
				sawMinimumRejection = true
			}
		}
	}
	if !sawMinimumRejection {
		t.Fatalf("no-stop candidate was hidden: %+v", result.CandidateDetails)
	}
}

func TestSolveV2RankingIsDeterministic(t *testing.T) {
	input := baseInputV2()
	first, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	for attempt := 0; attempt < 25; attempt++ {
		again, err := SolveV2(input)
		if err != nil {
			t.Fatalf("SolveV2 repeat: %v", err)
		}
		if first.InputHash != again.InputHash || !reflect.DeepEqual(first.Best, again.Best) || !reflect.DeepEqual(first.Candidates, again.Candidates) || !reflect.DeepEqual(first.CandidateDetails, again.CandidateDetails) {
			t.Fatalf("ranking changed on attempt %d", attempt)
		}
	}
}

func TestV2DominancePreservesStopCountStateRequiredByEventRules(t *testing.T) {
	equalWithMoreStops := searchNode{
		fuel: 2 * serviceScale, ve: 2 * serviceScale, green: 10,
		decision: DecisionVector{PitStops: []PitStopDecision{{Lap: 1}, {Lap: 2}}},
	}
	equalWithFewerStops := searchNode{
		fuel: 2 * serviceScale, ve: 2 * serviceScale, green: 10,
		decision: DecisionVector{PitStops: []PitStopDecision{{Lap: 2}}},
	}
	if dominates(equalWithMoreStops, equalWithFewerStops, 0, true) {
		t.Fatal("a state with no remaining stop allowance cannot dominate one that can still pit")
	}
	if dominates(equalWithMoreStops, equalWithFewerStops, 0, false) {
		t.Fatal("a cheaper tie path with more stops cannot erase the fewer-stop tie breaker")
	}
}
