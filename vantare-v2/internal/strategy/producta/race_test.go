package producta

import (
	"errors"
	"math"
	"testing"
)

func TestProjectRaceByLaps(t *testing.T) {
	projection, err := ProjectRace(RaceInput{Kind: RaceByLaps, Laps: 30, LapTimeSeconds: 120}, 0)
	if err != nil {
		t.Fatalf("project laps race: %v", err)
	}
	if projection.RaceLaps != 30 || projection.TotalLaps != 30 {
		t.Fatalf("unexpected lap projection: %#v", projection)
	}
}

func TestProjectTimedRaceAccountsForPitLoss(t *testing.T) {
	projection, err := ProjectRace(RaceInput{Kind: RaceByTime, DurationSeconds: 3600, LapTimeSeconds: 120}, 600)
	if err != nil {
		t.Fatalf("project timed race: %v", err)
	}
	if projection.RaceLaps != 25 {
		t.Fatalf("expected pit loss to reduce 30 laps to 25, got %#v", projection)
	}
	if projection.EffectiveRaceSeconds != 3000 {
		t.Fatalf("unexpected effective duration: %#v", projection)
	}
}

func TestProjectRaceAddsExtraLapAndFormation(t *testing.T) {
	projection, err := ProjectRace(RaceInput{
		Kind:            RaceByTime,
		DurationSeconds: 3600,
		ExtraLap:        true,
		FormationLaps:   1.5,
		LapTimeSeconds:  120,
	}, 0)
	if err != nil {
		t.Fatalf("project timed race: %v", err)
	}
	if projection.RaceLaps != 31 || projection.FormationLaps != 1.5 || projection.TotalLaps != 32.5 {
		t.Fatalf("unexpected extra/formation projection: %#v", projection)
	}
}

func TestProjectRaceRejectsInvalidInputs(t *testing.T) {
	for _, input := range []RaceInput{
		{Kind: RaceByTime, DurationSeconds: 60, LapTimeSeconds: 0},
		{Kind: RaceByTime, DurationSeconds: 60, LapTimeSeconds: math.NaN()},
	} {
		if _, err := ProjectRace(input, 0); err == nil {
			t.Fatalf("expected invalid lap time to fail: %#v", input)
		}
	}
	if _, err := ProjectRace(RaceInput{Kind: RaceByTime, DurationSeconds: 60, LapTimeSeconds: 60}, -1); err == nil {
		t.Fatal("expected negative pit loss to fail")
	}
}

func TestProjectTimedRaceWithStopsReachesStableStopCount(t *testing.T) {
	projection, err := ProjectTimedRaceWithStops(
		RaceInput{Kind: RaceByTime, DurationSeconds: 3600, LapTimeSeconds: 120},
		ResourceInput{Enabled: true, Capacity: 100, ConsumptionPerLap: 4},
		600,
	)
	if err != nil {
		t.Fatalf("project timed race with stops: %v", err)
	}
	if !projection.Converged || projection.Stops != 1 || projection.RaceLaps != 25 {
		t.Fatalf("unexpected converged projection: %#v", projection)
	}
	if projection.Iterations < 2 || projection.Iterations > 32 {
		t.Fatalf("unexpected iteration count: %#v", projection)
	}
}

func TestProjectTimedRaceWithStopsReportsNonConvergenceAtBound(t *testing.T) {
	projection, err := ProjectTimedRaceWithStops(
		RaceInput{Kind: RaceByTime, DurationSeconds: 6000, LapTimeSeconds: 100},
		ResourceInput{Enabled: true, Capacity: 100, StartAmount: 20, ConsumptionPerLap: 2},
		5500,
	)
	if !errors.Is(err, ErrNonConvergent) {
		t.Fatalf("expected non-convergence error, got %v", err)
	}
	if projection.Converged || projection.Iterations != 32 || projection.Diagnostic != "non_convergent" {
		t.Fatalf("unexpected non-convergence diagnostic: %#v", projection)
	}
}
