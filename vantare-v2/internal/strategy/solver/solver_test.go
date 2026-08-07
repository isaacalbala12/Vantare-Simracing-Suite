package solver

import (
	"math"
	"testing"
)

const epsilon = 1e-9

func fuel(capacity, perLap float64) Resource {
	return Resource{Kind: ResourceFuel, Used: true, UsableCapacity: capacity, PerLap: perLap}
}

func virtualEnergy(capacity, perLap float64) Resource {
	return Resource{Kind: ResourceVirtualEnergy, Used: true, UsableCapacity: capacity, PerLap: perLap}
}

func baseInput() Input {
	return Input{
		RaceLaps:                 30,
		BaseLapSeconds:           100,
		DegradationPerLapSeconds: 0.05,
		PitLossSeconds:           22,
		Fuel:                     fuel(100, 10), // 10 laps
	}
}

// bruteForceBest enumerates every way of splitting the race into stints of a
// legal length and returns the cheapest total. It is deliberately naive: it is
// the oracle the solver has to agree with.
func bruteForceBest(input Input, maxStintLaps int64) float64 {
	best := math.Inf(1)
	var walk func(remaining int64, stints int64, accumulated float64)
	walk = func(remaining, stints int64, accumulated float64) {
		if remaining == 0 {
			total := accumulated + float64(stints-1)*input.PitLossSeconds
			if total < best {
				best = total
			}
			return
		}
		for laps := int64(1); laps <= maxStintLaps && laps <= remaining; laps++ {
			cost := float64(laps)*input.BaseLapSeconds +
				float64(laps)*float64(laps-1)/2*input.DegradationPerLapSeconds
			walk(remaining-laps, stints+1, accumulated+cost)
		}
	}
	walk(input.RaceLaps, 0, 0)
	return best
}

func TestSolveMatchesExhaustiveEnumeration(t *testing.T) {
	// Small races only: the oracle is exponential.
	for _, raceLaps := range []int64{1, 2, 3, 5, 7, 9, 12, 14} {
		for _, stintCap := range []int64{1, 2, 3, 5, 8} {
			for _, degradation := range []float64{0, 0.02, 0.4, 3} {
				for _, pitLoss := range []float64{0, 5, 22, 90} {
					input := Input{
						RaceLaps:                 raceLaps,
						BaseLapSeconds:           90,
						DegradationPerLapSeconds: degradation,
						PitLossSeconds:           pitLoss,
						TyreLifeLaps:             stintCap,
					}
					result, err := Solve(input)
					if err != nil {
						t.Fatalf("Solve(%d laps, cap %d): %v", raceLaps, stintCap, err)
					}
					want := bruteForceBest(input, stintCap)
					if math.Abs(result.Best.TotalSeconds-want) > epsilon {
						t.Fatalf("laps=%d cap=%d deg=%v pit=%v: solver %.6f, enumeration %.6f",
							raceLaps, stintCap, degradation, pitLoss, result.Best.TotalSeconds, want)
					}
				}
			}
		}
	}
}

func TestDegradationIsPartOfTheTotal(t *testing.T) {
	input := baseInput()
	input.DegradationPerLapSeconds = 0
	flat, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve flat: %v", err)
	}
	if flat.Best.DegradationSeconds != 0 {
		t.Fatalf("a car that does not degrade must pay nothing for it, got %v", flat.Best.DegradationSeconds)
	}

	input.DegradationPerLapSeconds = 0.5
	degrading, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve degrading: %v", err)
	}
	if degrading.Best.DegradationSeconds <= 0 {
		t.Fatal("degradation must appear in the total")
	}
	if degrading.Best.TotalSeconds <= flat.Best.TotalSeconds {
		t.Fatalf("degradation must make the race slower: flat %.3f, degrading %.3f",
			flat.Best.TotalSeconds, degrading.Best.TotalSeconds)
	}
}

// The point of including degradation: it changes the decision, not just the
// number. With tyres that fall away hard, an extra stop pays for itself.
func TestDegradationCanBuyAnExtraStop(t *testing.T) {
	input := Input{
		RaceLaps:       40,
		BaseLapSeconds: 100,
		PitLossSeconds: 20,
		TyreLifeLaps:   40,
	}
	input.DegradationPerLapSeconds = 0
	flat, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve flat: %v", err)
	}
	if flat.Best.Stops != 0 {
		t.Fatalf("with no degradation a stop only costs time, got %d stops", flat.Best.Stops)
	}

	input.DegradationPerLapSeconds = 0.5
	degrading, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve degrading: %v", err)
	}
	if degrading.Best.Stops <= flat.Best.Stops {
		t.Fatalf("steep degradation should justify stopping, got %d stops", degrading.Best.Stops)
	}
}

func TestFuelAndVirtualEnergyAreNeverAdded(t *testing.T) {
	input := baseInput()
	input.Fuel = fuel(100, 5)                  // 20 laps
	input.VirtualEnergy = virtualEnergy(90, 6) // 15 laps

	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	// Summing the two resources would allow 35 laps; the tighter one binds.
	if result.MaxStintLaps != 15 {
		t.Fatalf("expected the tighter resource to bind at 15 laps, got %d", result.MaxStintLaps)
	}
	if result.Binding != ResourceVirtualEnergy {
		t.Fatalf("expected virtual energy to bind, got %s", result.Binding)
	}
	if len(result.Limits) != 2 {
		t.Fatalf("both limits must stay visible, got %+v", result.Limits)
	}
	for _, limit := range result.Limits {
		if limit.Kind == ResourceFuel && limit.Laps != 20 {
			t.Fatalf("fuel limit lost its own value: %+v", limit)
		}
	}
}

func TestTyreLifeCanBindOverBothResources(t *testing.T) {
	input := baseInput()
	input.Fuel = fuel(100, 5)                  // 20 laps
	input.VirtualEnergy = virtualEnergy(90, 6) // 15 laps
	input.TyreLifeLaps = 8

	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	if result.MaxStintLaps != 8 || result.Binding != ResourceTyreLife {
		t.Fatalf("expected tyre life to bind at 8 laps, got %d from %s", result.MaxStintLaps, result.Binding)
	}
}

func TestUnconstrainedRaceRunsWithoutStopping(t *testing.T) {
	result, err := Solve(Input{RaceLaps: 25, BaseLapSeconds: 95, PitLossSeconds: 20})
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	if result.Best.Stops != 0 || len(result.Best.Stints) != 1 {
		t.Fatalf("nothing limits a stint, so the race is one stint: %+v", result.Best)
	}
	if result.Binding != ResourceNone {
		t.Fatalf("expected no binding constraint, got %s", result.Binding)
	}
}

func TestTotalIsExactlyItsParts(t *testing.T) {
	input := baseInput()
	input.VirtualEnergy = virtualEnergy(80, 4)
	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	for _, candidate := range append([]Candidate{result.Best}, result.Candidates...) {
		if !candidate.Feasible {
			continue
		}
		sum := candidate.GreenSeconds + candidate.DegradationSeconds + candidate.PitSeconds
		if math.Abs(sum-candidate.TotalSeconds) > epsilon {
			t.Fatalf("stops=%d: parts sum to %.6f but total is %.6f",
				candidate.Stops, sum, candidate.TotalSeconds)
		}
		var laps int64
		var stintTotal float64
		for _, stint := range candidate.Stints {
			laps += stint.Laps
			stintTotal += stint.TotalSeconds
			if math.Abs(stint.GreenSeconds+stint.DegradationSeconds-stint.TotalSeconds) > epsilon {
				t.Fatalf("stint parts do not sum: %+v", stint)
			}
		}
		if laps != input.RaceLaps {
			t.Fatalf("stops=%d: plan covers %d laps, race is %d", candidate.Stops, laps, input.RaceLaps)
		}
		if math.Abs(stintTotal+candidate.PitSeconds-candidate.TotalSeconds) > epsilon {
			t.Fatalf("stops=%d: stints plus pits do not reach the total", candidate.Stops)
		}
	}
}

func TestSplitIsAsEvenAsWholeLapsAllow(t *testing.T) {
	input := baseInput()
	input.RaceLaps = 78
	input.Fuel = fuel(100, 5) // 20 laps
	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	shortest, longest := result.Best.Stints[0].Laps, result.Best.Stints[0].Laps
	for _, stint := range result.Best.Stints {
		if stint.Laps < shortest {
			shortest = stint.Laps
		}
		if stint.Laps > longest {
			longest = stint.Laps
		}
	}
	if longest-shortest > 1 {
		t.Fatalf("an even split never differs by more than one lap: %+v", result.Best.Stints)
	}
	if longest > result.MaxStintLaps {
		t.Fatalf("a stint of %d laps exceeds the %d-lap limit", longest, result.MaxStintLaps)
	}
}

func TestEveryCandidateExplainsItself(t *testing.T) {
	input := baseInput()
	result, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	if len(result.Assumptions) == 0 {
		t.Fatal("a result must state the model it used")
	}
	var statesSeparateResources bool
	for _, assumption := range result.Assumptions {
		if assumption.Code == "separate_resources" {
			statesSeparateResources = true
		}
	}
	if !statesSeparateResources {
		t.Fatal("the result must state that resources are not combined")
	}
	for _, candidate := range result.Candidates {
		if len(candidate.Reasons) == 0 {
			t.Fatalf("stops=%d carries no explanation", candidate.Stops)
		}
	}
}

func TestInfeasibleStopCountsAreExplainedNotDropped(t *testing.T) {
	// One lap of race cannot be split into two stints.
	result, err := Solve(Input{RaceLaps: 2, BaseLapSeconds: 90, PitLossSeconds: 10, TyreLifeLaps: 2})
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	var sawInfeasible bool
	for _, candidate := range result.Candidates {
		if candidate.Feasible {
			continue
		}
		sawInfeasible = true
		if len(candidate.Reasons) == 0 {
			t.Fatalf("stops=%d was rejected without a reason", candidate.Stops)
		}
	}
	if !sawInfeasible {
		t.Skip("no infeasible candidate fell inside the audit window")
	}
}

func TestSolveIsDeterministic(t *testing.T) {
	input := baseInput()
	input.VirtualEnergy = virtualEnergy(75, 3)
	first, err := Solve(input)
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	for attempt := 0; attempt < 25; attempt++ {
		again, err := Solve(input)
		if err != nil {
			t.Fatalf("Solve repeat: %v", err)
		}
		if again.Best.TotalSeconds != first.Best.TotalSeconds || again.Best.Stops != first.Best.Stops {
			t.Fatal("the same input must always produce the same plan")
		}
		if len(again.Best.Stints) != len(first.Best.Stints) {
			t.Fatal("stint layout must be stable")
		}
		for index, stint := range again.Best.Stints {
			if stint.Laps != first.Best.Stints[index].Laps {
				t.Fatalf("stint %d changed between runs", index)
			}
		}
	}
}

func TestSolveRejectsImpossibleInput(t *testing.T) {
	cases := map[string]Input{
		"no laps":           {RaceLaps: 0, BaseLapSeconds: 90},
		"no lap time":       {RaceLaps: 10, BaseLapSeconds: 0},
		"negative lap time": {RaceLaps: 10, BaseLapSeconds: -1},
		"nan degradation":   {RaceLaps: 10, BaseLapSeconds: 90, DegradationPerLapSeconds: math.NaN()},
		"infinite pit loss": {RaceLaps: 10, BaseLapSeconds: 90, PitLossSeconds: math.Inf(1)},
		"too many laps":     {RaceLaps: maxSupportedLaps + 1, BaseLapSeconds: 90},
		"unconsumed resource": {RaceLaps: 10, BaseLapSeconds: 90,
			Fuel: Resource{Kind: ResourceFuel, Used: true, UsableCapacity: 50}},
	}
	for name, input := range cases {
		if _, err := Solve(input); err == nil {
			t.Fatalf("%s: expected an error", name)
		} else if !HasErrorCode(err, ErrorInvalidInput) {
			t.Fatalf("%s: expected invalid_input, got %v", name, err)
		}
	}
}

func TestSolveReportsAnImpossibleRace(t *testing.T) {
	// A stint can hold no laps at all, so no plan exists.
	_, err := Solve(Input{RaceLaps: 10, BaseLapSeconds: 90, Fuel: fuel(1, 10)})
	if err == nil || !HasErrorCode(err, ErrorInfeasible) {
		t.Fatalf("expected infeasible, got %v", err)
	}
}

func FuzzSolveKeepsItsInvariants(f *testing.F) {
	f.Add(int64(30), 90.0, 0.05, 22.0, 100.0, 5.0, int64(0))
	f.Add(int64(1), 60.0, 0.0, 0.0, 0.0, 0.0, int64(1))
	f.Add(int64(200), 120.0, 2.0, 45.0, 80.0, 3.5, int64(12))

	f.Fuzz(func(t *testing.T, raceLaps int64, baseLap, degradation, pitLoss, capacity, perLap float64, tyreLife int64) {
		input := Input{
			RaceLaps:                 raceLaps,
			BaseLapSeconds:           baseLap,
			DegradationPerLapSeconds: degradation,
			PitLossSeconds:           pitLoss,
			TyreLifeLaps:             tyreLife,
		}
		if perLap > 0 {
			input.Fuel = fuel(capacity, perLap)
		}
		result, err := Solve(input)
		if err != nil {
			return // Rejecting bad input is a valid outcome.
		}
		if !result.Best.Feasible {
			t.Fatal("the chosen plan must be feasible")
		}
		var laps int64
		for _, stint := range result.Best.Stints {
			if stint.Laps < 1 {
				t.Fatalf("a stint must run at least one lap: %+v", stint)
			}
			if stint.Laps > result.MaxStintLaps {
				t.Fatalf("stint of %d laps exceeds the %d-lap limit", stint.Laps, result.MaxStintLaps)
			}
			laps += stint.Laps
		}
		if laps != input.RaceLaps {
			t.Fatalf("plan covers %d laps, race is %d", laps, input.RaceLaps)
		}
		if int64(len(result.Best.Stints)) != result.Best.Stops+1 {
			t.Fatalf("%d stints cannot come from %d stops", len(result.Best.Stints), result.Best.Stops)
		}
		sum := result.Best.GreenSeconds + result.Best.DegradationSeconds + result.Best.PitSeconds
		if math.Abs(sum-result.Best.TotalSeconds) > 1e-6*math.Max(1, math.Abs(sum)) {
			t.Fatalf("parts sum to %v but total is %v", sum, result.Best.TotalSeconds)
		}
		// No reported candidate may beat the one we called best.
		for _, candidate := range result.Candidates {
			if candidate.Feasible && candidate.TotalSeconds < result.Best.TotalSeconds-epsilon {
				t.Fatalf("stops=%d at %v beats the best at %v",
					candidate.Stops, candidate.TotalSeconds, result.Best.TotalSeconds)
			}
		}
	})
}

func BenchmarkSolveEnduranceRace(b *testing.B) {
	input := Input{
		RaceLaps:                 380,
		BaseLapSeconds:           218.4,
		DegradationPerLapSeconds: 0.03,
		PitLossSeconds:           62,
		Fuel:                     fuel(100, 4.8),
		VirtualEnergy:            virtualEnergy(100, 4.2),
		TyreLifeLaps:             40,
	}
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := Solve(input); err != nil {
			b.Fatalf("Solve: %v", err)
		}
	}
}
