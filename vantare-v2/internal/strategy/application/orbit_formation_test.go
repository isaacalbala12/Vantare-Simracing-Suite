package application

import (
	"encoding/json"
	"math"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
)

func TestOrbitFormationIsSeparateFromCompetitiveDriving(t *testing.T) {
	baselineInput := finalEvaluationInput()
	baselineInput.Event.RaceKind = string(manual.RaceByLaps)
	baselineInput.Event.DurationMinutes = 0
	baselineInput.Event.TargetLaps = lapHorizon(4)
	baseline, err := calculateOrbit(baselineInput)
	if err != nil {
		t.Fatal(err)
	}

	input := baselineInput
	input.Event.FormationSeconds = resourceValue(30)
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans[input.ActiveVariantID]
	want := baseline.Plans[input.ActiveVariantID]
	if plan.FormationSeconds == nil || *plan.FormationSeconds != 30 {
		t.Fatalf("formation seconds = %v, want 30", plan.FormationSeconds)
	}
	if plan.TotalSeconds-want.TotalSeconds != 30 || plan.DrivingSeconds != want.DrivingSeconds {
		t.Fatalf("formation leaked into driving: got=%+v baseline=%+v", plan, want)
	}
	if plan.Stints[0].StartSeconds != 30 || plan.Stints[0].EndSeconds-plan.Stints[0].StartSeconds != plan.DrivingSeconds {
		t.Fatalf("stint clock includes formation: %+v", plan.Stints[0])
	}
	if plan.Distribution[0].Seconds != want.Distribution[0].Seconds {
		t.Fatalf("driver received formation: got=%+v baseline=%+v", plan.Distribution, want.Distribution)
	}
	if plan.StartFuelLiters != want.StartFuelLiters || plan.FinishFuelLiters != want.FinishFuelLiters {
		t.Fatalf("formation changed fuel: got=%+v baseline=%+v", plan, want)
	}
}

func TestOrbitTimedFormationUsesCompetitiveBudget(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.DurationMinutes = 10
	input.Event.TankLiters = 9
	input.Event.FormationSeconds = resourceValue(130)
	maximumStops := 0
	input.Event.Rules = &solver.EventRules{MaxPitStops: &maximumStops}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans[input.ActiveVariantID]
	if plan.TotalLaps != 8 || plan.FinalLapStartSeconds != 550 || plan.TotalSeconds != 610 {
		t.Fatalf("timed formation horizon = %+v, want 8 laps / 550 s / 610 s", plan)
	}
}

func TestOrbitFormationComposesWithExplicitPitCost(t *testing.T) {
	input := finalEvaluationInput()
	input.Event.RaceKind = string(manual.RaceByLaps)
	input.Event.DurationMinutes = 0
	input.Event.TargetLaps = lapHorizon(4)
	input.Event.TankLiters = 2
	input.Event.FormationSeconds = resourceValue(30)
	input.Event.PitServices = &OrbitCalculationPitServices{
		TransitSeconds: resourceValue(20), RefuelRateLPerS: resourceValue(2), VERatePPerS: resourceValue(2), TyreSeconds: resourceValue(0), ServiceMode: "parallel",
	}
	result, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	plan := result.Plans[input.ActiveVariantID]
	if plan.Stops == 0 || plan.TotalSeconds != plan.DrivingSeconds+plan.PitSeconds+*plan.FormationSeconds {
		t.Fatalf("time components do not compose once: %+v", plan)
	}
	if plan.Stints[len(plan.Stints)-1].EndSeconds != plan.TotalSeconds {
		t.Fatalf("stint clock does not reach total: %+v", plan)
	}
	distributed := 0.0
	for _, driver := range plan.Distribution {
		distributed += driver.Seconds
	}
	if math.Abs(distributed-plan.DrivingSeconds) > 1e-9 {
		t.Fatalf("distributed seconds = %v, driving = %v", distributed, plan.DrivingSeconds)
	}
}

func TestOrbitFormationValidatesAndPreservesAbsence(t *testing.T) {
	legacy, err := calculateOrbit(finalEvaluationInput())
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) == "" || strings.Contains(string(payload), `"formationSeconds"`) {
		t.Fatalf("legacy result published formationSeconds: %s", payload)
	}

	zero := finalEvaluationInput()
	zero.Event.FormationSeconds = resourceValue(0)
	zeroResult, err := calculateOrbit(zero)
	if err != nil {
		t.Fatal(err)
	}
	if got := zeroResult.Plans[zero.ActiveVariantID].FormationSeconds; got == nil || *got != 0 {
		t.Fatalf("explicit zero formation lost: %v", got)
	}

	for _, value := range []float64{-1, math.Inf(1)} {
		invalid := finalEvaluationInput()
		invalid.Event.FormationSeconds = resourceValue(value)
		if _, err := calculateOrbit(invalid); err == nil {
			t.Fatalf("invalid formation %v accepted", value)
		}
	}
	exhausted := finalEvaluationInput()
	exhausted.Event.FormationSeconds = resourceValue(exhausted.Event.DurationMinutes * 60)
	if _, err := calculateOrbit(exhausted); err == nil {
		t.Fatal("formation consuming the timed race accepted")
	}
}
