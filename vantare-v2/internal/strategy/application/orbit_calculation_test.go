package application

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	"github.com/vantare/overlays/v2/internal/strategy/weather"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func isa825OrbitInput() OrbitCalculationInput {
	projection := &strategyprojection.StrategyInputProjectionV2{
		ContractVersion:    strategyprojection.ContractVersionStrategyInputProjectionV2,
		GeneratedAt:        time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC),
		ComputationVersion: "strategy-projection.v2",
		SourceSessions:     []string{"lmu:spa-logitech-g-challenge-2"},
		CombinationID:      "lmu:0ea5d4d4614dde44e598009558f8470c1c19046d08b762e36a7ddd8b33785a4a",
		FuelConsumption: strategyprojection.ResourceConsumptionFamily{
			Presence: strategyprojection.PresenceValid, MeanPerLap: 3.538011074066162,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "aggregate:lmu:0ea5d4d4614dde44e598009558f8470c1c19046d08b762e36a7ddd8b33785a4a"},
			Confidence: strategyprojection.Confidence{SampleSize: 4, ComputationVersion: "consumption-pace.v1"},
		},
		VirtualEnergyConsumption: strategyprojection.ResourceConsumptionFamily{
			Presence: strategyprojection.PresenceValid, MeanPerLap: 4.86563777923584,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "aggregate:lmu:0ea5d4d4614dde44e598009558f8470c1c19046d08b762e36a7ddd8b33785a4a"},
			Confidence: strategyprojection.Confidence{SampleSize: 4, ComputationVersion: "consumption-pace.v1"},
		},
		CombinedStintPaceCurve: strategyprojection.CombinedStintPaceCurve{
			Presence:        strategyprojection.PresenceMissing,
			Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceUnknown},
			Confidence:      strategyprojection.Confidence{SampleSize: 0, ComputationVersion: "strategy-projection.v2"},
			Identifiability: strategyprojection.IdentifiabilityCombinedOnly,
			Reason:          "missing_combined_stint_pace_curve",
			Points:          []strategyprojection.PacePoint{},
		},
		TyreDegradation: strategyprojection.TyreDegradationFamily{
			Presence: strategyprojection.PresenceValid, LifeLapsEstimate: func() *int { value := 51; return &value }(),
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "aggregate:lmu:0ea5d4d4614dde44e598009558f8470c1c19046d08b762e36a7ddd8b33785a4a"},
			Confidence: strategyprojection.Confidence{SampleSize: 4, ComputationVersion: "derived-curves.v1"},
		},
		Pit: strategyprojection.PitFamily{Presence: strategyprojection.PresenceUnknown},
		SavingCost: strategyprojection.SavingCostFamily{
			Presence:   strategyprojection.PresenceMissing,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "aggregate:lmu:0ea5d4d4614dde44e598009558f8470c1c19046d08b762e36a7ddd8b33785a4a"},
			Confidence: strategyprojection.Confidence{SampleSize: 0, ComputationVersion: "derived-curves.v1"},
			Reason:     "missing_fuel_mixture_levels", ManualNote: "missing_fuel_mixture_levels",
		},
		ClimateBuckets: strategyprojection.ClimateBucketsFamily{
			Presence:   strategyprojection.PresenceValid,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "aggregate:lmu:spa-logitech-g-challenge-2"},
			Confidence: strategyprojection.Confidence{SampleSize: 4, ComputationVersion: "strategy-projection.v2"},
			Buckets: []strategyprojection.ClimateBucketPoint{{
				Bucket: strategyprojection.ClimateBucketDry, SampleSize: 4,
			}},
		},
	}
	return OrbitCalculationInput{
		Event: OrbitCalculationEvent{DurationMinutes: 30, PitLossSeconds: 60, TankLiters: 90},
		Drivers: []OrbitCalculationDriver{{
			ID: "Logitech G Challenge #2:LGC", Name: "Logitech G Challenge #2:LGC",
			Dry: OrbitCalculationPace{PaceSeconds: 105, FuelLitersPerLap: 2.8},
			Eco: OrbitCalculationPace{PaceSeconds: 106.1, FuelLitersPerLap: 2.6},
			Wet: OrbitCalculationPace{PaceSeconds: 113, FuelLitersPerLap: 2.45},
		}},
		Variants: []OrbitCalculationVariant{{
			ID: "strategy-1", Mode: "dry", Order: []string{"Logitech G Challenge #2:LGC"}, Overrides: map[int]OrbitCalculationOverride{},
		}},
		ActiveVariantID: "strategy-1",
		PlanningInputs:  &strategydocument.PlanningInputs{Projection: projection, Overrides: map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{}},
	}
}

func TestCalculateOrbitRealMissingDerivedFamilyTerminates(t *testing.T) {
	t.Parallel()
	input := isa825OrbitInput()

	type outcome struct {
		result OrbitCalculationResult
		err    error
	}
	done := make(chan outcome, 1)
	go func() {
		result, err := calculateOrbit(input)
		done <- outcome{result: result, err: err}
	}()
	select {
	case got := <-done:
		if got.err != nil {
			t.Fatal(got.err)
		}
		plan := got.result.Plans["strategy-1"]
		if plan.TotalLaps != 18 || plan.Stops != 0 || len(plan.Stints) != 1 {
			t.Fatalf("plan = %+v", plan)
		}
		solved, err := solver.SolveV2(orbitSolverInput(18, input.Event, 105, 2.8, input.PlanningInputs))
		if err != nil {
			t.Fatal(err)
		}
		if solved.ComputeStats.EvaluatedCandidates != 1 || solved.ComputeStats.Iterations != 0 ||
			len(solved.CandidateDetails) == 0 || len(solved.CandidateDetails[0].Reasons) == 0 ||
			solved.CandidateDetails[0].Reasons[0].Code != "optimal_after_scalar_resource_bound" {
			t.Fatalf("ISA-825 did not use the exact scalar shortcut: stats=%+v candidates=%+v", solved.ComputeStats, solved.CandidateDetails)
		}
	case <-time.After(time.Second):
		stack := make([]byte, 1<<20)
		stack = stack[:runtime.Stack(stack, true)]
		t.Fatalf("calculate_orbit did not terminate in 1s\n%s", stack)
	}
}

func TestCalculateOrbitBackendDeadlineIsTyped(t *testing.T) {
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	_, err := NewService[json.RawMessage](nil).CalculateOrbit(ctx, CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "isa-825-timeout", Operation: OperationCalculateOrbit},
		Input:         isa825OrbitInput(),
	})
	var applicationErr *ApplicationError
	if !errors.As(err, &applicationErr) || applicationErr.Code != ErrorCalculationTimeout || !errors.Is(err, ErrCalculationTimeout) {
		t.Fatalf("error = %#v", err)
	}
}

func TestOrbitMissingOrEmptyDerivedFamiliesDegradeWithCause(t *testing.T) {
	for _, test := range []struct {
		name       string
		mutate     func(*strategyprojection.StrategyInputProjectionV2)
		wantReason string
	}{
		{name: "missing", wantReason: "missing_combined_stint_pace_curve"},
		{name: "empty valid curve and saving", wantReason: "empty_combined_stint_pace_curve", mutate: func(projection *strategyprojection.StrategyInputProjectionV2) {
			projection.CombinedStintPaceCurve.Presence = strategyprojection.PresenceValid
			projection.CombinedStintPaceCurve.Provenance = strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "aggregate:isa-825"}
			projection.CombinedStintPaceCurve.Confidence = strategyprojection.Confidence{SampleSize: 4, ComputationVersion: "strategy-projection.v2"}
			projection.CombinedStintPaceCurve.Reason = ""
			projection.SavingCost.Presence = strategyprojection.PresenceValid
			projection.SavingCost.Reason = ""
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := isa825OrbitInput()
			if test.mutate != nil {
				test.mutate(input.PlanningInputs.Projection)
			}
			result, err := solver.SolveV2(orbitSolverInput(18, input.Event, 105, 2.8, input.PlanningInputs))
			if err != nil {
				t.Fatal(err)
			}
			if !result.Feasible || result.StintPaceCost.Model != solver.StintPaceModelManualLinear {
				t.Fatalf("result = %+v", result)
			}
			joined := ""
			for _, assumption := range result.Assumptions {
				joined += assumption.Code + ":" + assumption.Message + "\n"
			}
			if !strings.Contains(joined, test.wantReason) || !strings.Contains(joined, "saving_cost_degraded") {
				t.Fatalf("assumptions = %s", joined)
			}
		})
	}
}

func TestCalculateOrbitWeatherChangesPlanAndPublishesRobustMetrics(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	scenario := func(id string, rain [5]float64, weight float64) strategydocument.WeightedWeatherScenario {
		progress := [5]weather.WeatherNodeProgress{weather.NodeStart, weather.Node25, weather.Node50, weather.Node75, weather.NodeFinish}
		nodes := [5]weather.WeatherNode{}
		for index := range nodes {
			nodes[index] = weather.WeatherNode{Progress: progress[index], RainChance: rain[index], Sky: weather.SkyOvercast, AirTempC: 18, TrackTempC: 22}
		}
		return strategydocument.WeightedWeatherScenario{Weight: weight, Scenario: weather.WeatherScenarioV1{
			ContractVersion: weather.ContractVersionWeatherScenarioV1,
			ScenarioID:      id, CombinationID: "manual:event-1", GeneratedAt: now, Nodes: nodes,
			Provenance: weather.CaptureProvenance{Source: "manual", CapturedAt: now, FreshUntil: now.Add(time.Nanosecond), SessionType: "manual", SignalFreshness: "manual"},
		}}
	}
	result, err := calculateOrbit(OrbitCalculationInput{
		Event: OrbitCalculationEvent{DurationMinutes: 10, TankLiters: 6, PitLossSeconds: 10},
		Drivers: []OrbitCalculationDriver{{
			ID: "driver-1", Name: "Driver",
			Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 1},
			Wet: OrbitCalculationPace{PaceSeconds: 66, FuelLitersPerLap: 1},
		}},
		Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"driver-1"}, Overrides: map[int]OrbitCalculationOverride{}}},
		ActiveVariantID: "s1",
		WeatherScenarios: []strategydocument.WeightedWeatherScenario{
			scenario("dry", [5]float64{}, 0.4),
			scenario("rain-node-50", [5]float64{0, 0, 100, 100, 100}, 0.6),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Weather == nil || len(result.Weather.Plans) != 2 {
		t.Fatalf("weather result = %+v", result.Weather)
	}
	dry, rain := result.Weather.Plans[0], result.Weather.Plans[1]
	if dry.TotalSeconds == rain.TotalSeconds && reflect.DeepEqual(dry.Stints, rain.Stints) {
		t.Fatalf("rain at NODE_50 did not change the displayed plan: dry=%+v rain=%+v", dry, rain)
	}
	if result.Weather.Robust.Method != "minimax_regret" || result.Weather.Robust.MaxRegretSeconds < 0 || result.Weather.Robust.WeightedExpectedLossSeconds < 0 {
		t.Fatalf("robust metrics = %+v", result.Weather.Robust)
	}
	firstWetLap := int64(0)
	for _, condition := range rain.Timeline {
		if condition.Bucket == "wet" {
			firstWetLap = condition.Lap
			break
		}
	}
	if firstWetLap == 0 {
		t.Fatalf("rain timeline did not publish an applied wet lap: %+v", rain.Timeline)
	}
}

func TestCalculateOrbitUsesGoEngineForGoldenPlan(t *testing.T) {
	t.Parallel()
	service := NewService[json.RawMessage](nil)
	result, err := service.CalculateOrbit(context.Background(), CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "orbit-golden", Operation: OperationCalculateOrbit},
		Input: OrbitCalculationInput{
			Event: OrbitCalculationEvent{DurationMinutes: 240, TankLiters: 90, PitLossSeconds: 64},
			Drivers: []OrbitCalculationDriver{
				{ID: "isaac", Name: "Isaac Albala", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
				{ID: "sol", Name: "Sol Martin", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
				{ID: "diego", Name: "Diego Ferrer", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
				{ID: "marta", Name: "Marta Ruiz", Dry: OrbitCalculationPace{PaceSeconds: 104, FuelLitersPerLap: 2.75}},
			},
			Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"isaac", "sol", "diego", "marta"}, Overrides: map[int]OrbitCalculationOverride{}}},
			ActiveVariantID: "s1",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	plan := result.OrbitCalculation.Plans["s1"]
	if plan.TotalLaps != 139 || plan.Stops != 4 || len(plan.Stints) != 5 {
		t.Fatalf("plan = %#v", plan)
	}
	// SolveV2 minimiza cinco stints bajo el limite de 32 vueltas. El replay
	// numerico de ambos repartos se fija debajo: aun sin peso Fuel, el stint
	// final largo deja menos fuel sin usar y produce 13,75e-12 s de diferencia
	// ideal, muy dentro de la tolerancia temporal; gana por la primera vuelta de
	// parada canonica (11 antes que 28), no por ese ruido.
	want := []int64{11, 32, 32, 32, 32}
	for index := range want {
		if plan.Stints[index].Laps != want[index] {
			t.Fatalf("stint %d laps = %d, want %d", index, plan.Stints[index].Laps, want[index])
		}
	}
	if plan.TotalSeconds != 139*104+4*64 {
		t.Fatalf("total seconds = %v", plan.TotalSeconds)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "frontend", "src", "hub", "strategy-orbit", "testdata", "orbit-go-golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden OrbitCalculationResult
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*result.OrbitCalculation, golden) {
		t.Fatalf("Go result differs from shared frontend golden\ngot: %#v\nwant: %#v", *result.OrbitCalculation, golden)
	}
}

func TestOrbitGoldenPartitionsUseTheSameSolveV2CostModel(t *testing.T) {
	event := OrbitCalculationEvent{DurationMinutes: 240, TankLiters: 90, PitLossSeconds: 64}
	input := orbitSolverInput(139, event, 104, 2.75, nil)
	balanced := replayOrbitPartition(t, input, []int64{28, 28, 28, 28, 27})
	shortFirst := replayOrbitPartition(t, input, []int64{11, 32, 32, 32, 32})
	solved, err := solver.SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2(golden): %v", err)
	}

	if balanced.Evaluation.GreenSeconds != 14_456 || shortFirst.Evaluation.GreenSeconds != 14_456 {
		t.Fatalf("green seconds balanced=%.12f short-first=%.12f, want 14456", balanced.Evaluation.GreenSeconds, shortFirst.Evaluation.GreenSeconds)
	}
	if balanced.Evaluation.FuelWeightSeconds != 0 || shortFirst.Evaluation.FuelWeightSeconds != 0 {
		t.Fatalf("golden must not invent fuel weight: balanced=%.12f short-first=%.12f", balanced.Evaluation.FuelWeightSeconds, shortFirst.Evaluation.FuelWeightSeconds)
	}
	// Ambos planes salen cuatro veces con el deposito lleno. El total repostado
	// depende del fuel que queda al final, no de asumir que la carga inicial es
	// exactamente la longitud del primer stint: 308 L frente a 294,25 L.
	if got := replayedFuelLiters(balanced); got != 308 {
		t.Fatalf("balanced refuel = %.12f L, want 308", got)
	}
	if got := replayedFuelLiters(shortFirst); got != 294.25 {
		t.Fatalf("short-first refuel = %.12f L, want 294.25", got)
	}
	timeTolerance := 1e-12 * math.Max(1, math.Max(math.Abs(balanced.Evaluation.TotalSeconds), math.Abs(shortFirst.Evaluation.TotalSeconds)))
	if delta := math.Abs(shortFirst.Evaluation.TotalSeconds - balanced.Evaluation.TotalSeconds); delta > timeTolerance {
		t.Fatalf("partitions differ by %.15f s, outside tie tolerance %.15f s", delta, timeTolerance)
	}
	if !reflect.DeepEqual(solved.Best.Stints, shortFirst.Decision.Stints) || math.Abs(solved.Expected.TotalSeconds-shortFirst.Evaluation.TotalSeconds) > 1e-12 {
		t.Fatalf("solver best=%+v total=%.15f, want replayed short-first=%+v total=%.15f", solved.Best.Stints, solved.Expected.TotalSeconds, shortFirst.Decision.Stints, shortFirst.Evaluation.TotalSeconds)
	}
	if delta := balanced.Evaluation.TotalSeconds - shortFirst.Evaluation.TotalSeconds; math.Abs(delta-13.75/orbitLegacyAllInServiceRate) > 2e-12 {
		t.Fatalf("total delta = %.15f s, want %.15f s", delta, 13.75/orbitLegacyAllInServiceRate)
	}
	if len(solved.CandidateDetails) == 0 || len(solved.CandidateDetails[0].Reasons) == 0 || solved.CandidateDetails[0].Reasons[0].Code != "optimal_after_time_tie_break" {
		t.Fatalf("solver did not expose the time tie-break: %+v", solved.CandidateDetails)
	}
	t.Logf("golden: balanced=%.15f s (308 L), short-first=%.15f s (294.25 L), delta=%.15f s", balanced.Evaluation.TotalSeconds, shortFirst.Evaluation.TotalSeconds, balanced.Evaluation.TotalSeconds-shortFirst.Evaluation.TotalSeconds)

	// Contrafactual con peso configurado: al arrancar cada stint lleno, el
	// termino es n*90 - 2,75*n*(n-1)/2. La suma de cuadrados mayor reduce el
	// fuel medio; 6902,75 L*vuelta < 7386,75 L*vuelta por 484 L*vuelta.
	input.FuelWeight = &solver.FuelWeightParameter{
		Presence:        strategyprojection.PresenceValid,
		SecondsPerLiter: 1,
		Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: "test:orbit-fuel-weight"},
		Confidence:      strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-golden-proof.v1"},
	}
	balancedWeighted := replayOrbitPartition(t, input, []int64{28, 28, 28, 28, 27})
	shortFirstWeighted := replayOrbitPartition(t, input, []int64{11, 32, 32, 32, 32})
	if balancedWeighted.Evaluation.FuelWeightSeconds != 7386.75 || shortFirstWeighted.Evaluation.FuelWeightSeconds != 6902.75 {
		t.Fatalf("fuel-weight seconds balanced=%.2f short-first=%.2f", balancedWeighted.Evaluation.FuelWeightSeconds, shortFirstWeighted.Evaluation.FuelWeightSeconds)
	}
	if delta := balancedWeighted.Evaluation.TotalSeconds - shortFirstWeighted.Evaluation.TotalSeconds; math.Abs(delta-484) > 1e-9 {
		t.Fatalf("weighted total delta = %.12f s, want 484 s", delta)
	}
	t.Logf("fuel weight 1 s/L: balanced=%.2f L-lap, short-first=%.2f L-lap, delta=%.2f s", balancedWeighted.Evaluation.FuelWeightSeconds, shortFirstWeighted.Evaluation.FuelWeightSeconds, balancedWeighted.Evaluation.TotalSeconds-shortFirstWeighted.Evaluation.TotalSeconds)
}

func replayOrbitPartition(t *testing.T, input solver.SolverInputV2, laps []int64) solver.ReplayResultV1 {
	t.Helper()
	decision := solver.DecisionVector{
		Stints:   make([]solver.StintDecision, len(laps)),
		PitStops: make([]solver.PitStopDecision, len(laps)-1),
	}
	lap := int64(0)
	for index, count := range laps {
		decision.Stints[index] = solver.StintDecision{Index: index, Laps: count, SavingLevel: solver.SavingNone}
		lap += count
		if index < len(decision.PitStops) {
			decision.PitStops[index] = solver.PitStopDecision{
				Lap:         lap,
				FuelLiters:  float64(count) * input.FuelPerLapLiters.Value,
				ServiceMode: input.PitCost.ServiceMode,
			}
		}
	}
	replayed, err := solver.ReplayDecisionV2(input, decision)
	if err != nil {
		t.Fatalf("ReplayDecisionV2(%v): %v", laps, err)
	}
	if !replayed.Feasible {
		t.Fatalf("partition %v is infeasible: %+v", laps, replayed.Reasons)
	}
	return replayed
}

func replayedFuelLiters(replayed solver.ReplayResultV1) float64 {
	total := 0.0
	for _, stop := range replayed.Decision.PitStops {
		total += stop.FuelLiters
	}
	return total
}

func TestCalculateOrbitDerivedOverrideRevertKeepsProjectionAndChangesPlan(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "telemetryanalysis", "strategyprojection", "testdata", "strategyinputprojection_v2_new.json"))
	if err != nil {
		t.Fatal(err)
	}
	var projection strategyprojection.StrategyInputProjectionV2
	if err := json.Unmarshal(raw, &projection); err != nil {
		t.Fatal(err)
	}
	input := OrbitCalculationInput{
		Event:           OrbitCalculationEvent{DurationMinutes: 10, TankLiters: 10, PitLossSeconds: 30},
		Drivers:         []OrbitCalculationDriver{{ID: "driver-1", Name: "Driver", Dry: OrbitCalculationPace{PaceSeconds: 60, FuelLitersPerLap: 2}}},
		Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"driver-1"}, Overrides: map[int]OrbitCalculationOverride{}}},
		ActiveVariantID: "s1",
		PlanningInputs:  &strategydocument.PlanningInputs{Projection: &projection, Overrides: map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{}},
	}
	derived, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	input.PlanningInputs.Overrides[strategydocument.PlanningInputFuelPerLap] = strategydocument.NumericInputOverride{
		Value: 5, Presence: strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: "orbit:event-1"},
		Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-input.v1"},
	}
	overridden, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	if input.PlanningInputs.Projection.FuelConsumption.MeanPerLap != 3.047 {
		t.Fatal("manual override destroyed the derived projection")
	}
	overriddenSolver, err := solver.SolveV2(orbitSolverInput(10, input.Event, 60, 2, input.PlanningInputs))
	if err != nil {
		t.Fatalf("SolveV2(overridden adapter): %v", err)
	}
	if got := overriddenSolver.ResolvedInputs.FuelPerLapLiters; got.Value != 5 || got.Role != solver.ScalarRoleUserOverride || got.Provenance.SourceID != "orbit:event-1" {
		t.Fatalf("override did not reach SolveV2 intact: %+v", got)
	}
	delete(input.PlanningInputs.Overrides, strategydocument.PlanningInputFuelPerLap)
	reverted, err := calculateOrbit(input)
	if err != nil {
		t.Fatal(err)
	}
	if derived.Plans["s1"].MaxLaps == overridden.Plans["s1"].MaxLaps || reverted.Plans["s1"].MaxLaps != derived.Plans["s1"].MaxLaps {
		t.Fatalf("max laps derived=%d override=%d reverted=%d", derived.Plans["s1"].MaxLaps, overridden.Plans["s1"].MaxLaps, reverted.Plans["s1"].MaxLaps)
	}
	revertedSolver, err := solver.SolveV2(orbitSolverInput(10, input.Event, 60, 2, input.PlanningInputs))
	if err != nil {
		t.Fatalf("SolveV2(reverted adapter): %v", err)
	}
	if got := revertedSolver.ResolvedInputs.FuelPerLapLiters; got.Value != projection.FuelConsumption.MeanPerLap || got.Provenance.SourceID != projection.FuelConsumption.Provenance.SourceID {
		t.Fatalf("revert did not restore derived source: %+v", got)
	}
}

func TestCalculateOrbitRejectsDanglingDriverAsTypedError(t *testing.T) {
	t.Parallel()
	service := NewService[json.RawMessage](nil)
	_, err := service.CalculateOrbit(context.Background(), CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "orbit-dangling", Operation: OperationCalculateOrbit},
		Input: OrbitCalculationInput{
			Event:           OrbitCalculationEvent{DurationMinutes: 60, TankLiters: 90, PitLossSeconds: 60},
			Drivers:         []OrbitCalculationDriver{{ID: "driver-1", Dry: OrbitCalculationPace{PaceSeconds: 100, FuelLitersPerLap: 2}}},
			Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"driver-1", "deleted"}}},
			ActiveVariantID: "s1",
		},
	})
	var applicationErr *ApplicationError
	if !errors.As(err, &applicationErr) || applicationErr.Code != ErrorCalculationInvalid || applicationErr.Field != "input.variants.0.order.1" {
		t.Fatalf("error = %#v", err)
	}
}

func TestOrbitSavingOverridesReachSolveV2AsUserAuthority(t *testing.T) {
	override := func(value float64, field string) strategydocument.NumericInputOverride {
		return strategydocument.NumericInputOverride{
			Value: value, Presence: strategyprojection.PresenceValid,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: "orbit:event-1:" + field},
			Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-input.v1"},
		}
	}
	planning := &strategydocument.PlanningInputs{Overrides: map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{
		strategydocument.PlanningInputSavingFuel:     override(0.2, "saving_fuel_per_lap"),
		strategydocument.PlanningInputSavingTimeCost: override(0.1, "saving_time_cost_per_lap"),
	}}

	parameter := orbitSavingCost(planning)
	if parameter == nil || parameter.Role != solver.ScalarRoleUserOverride || parameter.Provenance.SourceID != "orbit:event-1:saving_fuel_per_lap" ||
		len(parameter.Levels) != 1 || parameter.Levels[0].FuelSavedPerLap != 0.2 || parameter.Levels[0].TimeCostPerLap != 0.1 {
		t.Fatalf("saving override adapter = %+v", parameter)
	}
}

func TestJSONBridgeDispatchesOrbitCalculation(t *testing.T) {
	t.Parallel()
	command := CalculateOrbitCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "orbit-wire", Operation: OperationCalculateOrbit},
		Input: OrbitCalculationInput{
			Event: OrbitCalculationEvent{DurationMinutes: 20, TankLiters: 70, PitLossSeconds: 60},
			Drivers: []OrbitCalculationDriver{{
				ID: "driver-1", Name: "Driver", Dry: OrbitCalculationPace{PaceSeconds: 120, FuelLitersPerLap: 2},
			}},
			Variants:        []OrbitCalculationVariant{{ID: "s1", Mode: "dry", Order: []string{"driver-1"}, Overrides: map[int]OrbitCalculationOverride{}}},
			ActiveVariantID: "s1",
		},
	}
	document, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := NewJSONBridge(NewService[json.RawMessage](nil)).Execute(context.Background(), document)
	if err != nil {
		t.Fatal(err)
	}
	var result Result[json.RawMessage]
	if err := json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	if result.CommandID != "orbit-wire" || result.OrbitCalculation == nil || result.OrbitCalculation.Plans["s1"].TotalLaps != 10 {
		t.Fatalf("result = %#v", result)
	}
}
