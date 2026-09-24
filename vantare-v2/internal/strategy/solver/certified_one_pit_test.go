package solver

import (
	"math/rand"
	"testing"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestCombinedCurveOnePitCertificatePreservesExactPlan(t *testing.T) {
	input := baseInputV2()
	input.FuelCapacityLiters.Value = 3
	input.VECapacityPercent.Value = 3
	input.VEPerLapPercent.Value = 1
	input.PitCost.TransitSeconds.Value = 40
	input.PitCost.RefuelRateLPerS.Value = 100
	input.PitCost.VERatePPerS.Value = 100
	input.PitCost.TyreSeconds.Value = 0
	input.Projection = curveProjection([]sp.PacePoint{
		pacePoint(1, 0, 2), pacePoint(2, -0.5, 2), pacePoint(3, -1, 2),
	}, 2, -1, 0)
	input.Budget.MaxIterations = 1

	got, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Feasible || len(got.Best.PitStops) != 1 || got.ComputeStats.Iterations != 0 {
		t.Fatalf("one-pit certificate did not close the exact search: feasible=%v stops=%d iterations=%d reasons=%v", got.Feasible, len(got.Best.PitStops), got.ComputeStats.Iterations, got.Reasons)
	}
	want := exhaustiveV2BestNode(t, input)
	if compareTotalSeconds(got.Expected.TotalSeconds, want.total(input.Formation.Seconds.Value)) != 0 || decisionKey(got.Best) != decisionKey(want.decision) {
		t.Fatalf("certified plan diverged from exhaustive oracle: got=%+v want=%+v", got.Best, want.decision)
	}
}

func TestCombinedCurveOnePitCertificateMatchesExhaustiveCases(t *testing.T) {
	random := rand.New(rand.NewSource(1367))
	certified := 0
	for index := 0; index < 24; index++ {
		input := baseInputV2()
		input.RaceLaps = int64(4 + random.Intn(2))
		input.FuelCapacityLiters.Value = float64(2 + random.Intn(2))
		input.VECapacityPercent.Value = float64(2 + random.Intn(2))
		input.VEPerLapPercent.Value = 1
		input.PitCost.TransitSeconds.Value = 40
		input.PitCost.RefuelRateLPerS.Value = 100
		input.PitCost.VERatePPerS.Value = 100
		input.PitCost.TyreSeconds.Value = float64(random.Intn(5))
		if index%3 == 0 {
			input.FuelReserve = reserveLapsInput(0.5)
		}
		delta := float64(random.Intn(5)-2) / 2
		input.Projection = curveProjection([]sp.PacePoint{
			pacePoint(1, 0, 2), pacePoint(2, delta, 2), pacePoint(3, delta, 2),
		}, 2, -2, 2)

		got, err := SolveV2(input)
		if err != nil {
			t.Fatalf("case=%d solve: %v", index, err)
		}
		if got.Feasible && got.ComputeStats.Iterations == 0 {
			certified++
		}
		want := exhaustiveV2BestNode(t, input)
		assertSimpleResourceParity(t, index, input, got, want)
	}
	if certified < 8 {
		t.Fatalf("certificate exercised only %d/24 cases", certified)
	}
}

func TestCombinedCurveOnePitCertificateDeclinesWhenExtraStopCanWin(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.FuelCapacityLiters.Value = 2
	input.VECapacityPercent.Value = 2
	input.VEPerLapPercent.Value = 1
	input.PitCost.TransitSeconds.Value = 1
	input.PitCost.RefuelRateLPerS.Value = 100
	input.PitCost.VERatePPerS.Value = 100
	input.PitCost.TyreSeconds.Value = 0
	input.Projection = curveProjection([]sp.PacePoint{
		pacePoint(1, 0, 2), pacePoint(2, 100, 2), pacePoint(3, 200, 2),
	}, 2, 0, 200)

	got, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	want := exhaustiveV2BestNode(t, input)
	assertSimpleResourceParity(t, 0, input, got, want)
	if !got.Feasible || len(got.Best.PitStops) < 2 || got.ComputeStats.Iterations == 0 {
		t.Fatalf("extra-stop case was incorrectly certified: stops=%d iterations=%d", len(got.Best.PitStops), got.ComputeStats.Iterations)
	}
}
