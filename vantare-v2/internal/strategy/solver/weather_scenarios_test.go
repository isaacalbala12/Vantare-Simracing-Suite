package solver

import (
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	"github.com/vantare/overlays/v2/internal/strategy/weather"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func weatherScenario(id string, chances [5]float64) weather.WeatherScenarioV1 {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	progress := [5]weather.WeatherNodeProgress{weather.NodeStart, weather.Node25, weather.Node50, weather.Node75, weather.NodeFinish}
	nodes := [5]weather.WeatherNode{}
	for index := range nodes {
		nodes[index] = weather.WeatherNode{
			Progress: progress[index], RainChance: chances[index], Sky: weather.SkyOvercast,
			AirTempC: 20, TrackTempC: 24,
		}
	}
	return weather.WeatherScenarioV1{
		ContractVersion: weather.ContractVersionWeatherScenarioV1,
		ScenarioID:      id, CombinationID: "spa-lmgt3", GeneratedAt: now, Nodes: nodes,
		Provenance: weather.CaptureProvenance{
			Source: "core.rest", CapturedAt: now, FreshUntil: now.Add(time.Minute),
			SessionType: "RACE", SignalFreshness: "fresh",
		},
	}
}

func bucketParameter(bucket sp.ClimateBucket, paceDelta float64, compounds ...CompoundPaceParameter) WeatherBucketParameter {
	return WeatherBucketParameter{
		Bucket: bucket, PaceDeltaSeconds: paceDelta, CompoundPace: compounds,
		Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "event.weather." + string(bucket)},
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "weather-manual.v1"},
	}
}

func weatherCompoundParameters(bucket sp.ClimateBucket, hardDelta, wetDelta float64) WeatherBucketParameter {
	return bucketParameter(
		bucket,
		0,
		compoundParameter(tyres.CompoundHard, hardDelta, 0, sp.ProvenanceManual),
		compoundParameter(tyres.CompoundWet, wetDelta, 0, sp.ProvenanceManual),
	)
}

func weatherBusinessInput(t *testing.T) (SolverInputV2, []WeatherBucketParameter) {
	t.Helper()
	input := baseInputV2()
	input.RaceLaps = 8
	input.Formation.Seconds = 0
	input.FuelCapacityLiters = 0
	input.FuelPerLapLiters = 0
	input.TyreLifeLaps = 8
	input.PitCost = PitCostModel{
		TransitSeconds: 2, RefuelRateLPerS: 100, VERatePPerS: 100,
		TyreSeconds: 2, ServiceMode: manual.PitServiceParallel,
	}
	input.TyreInventory = physicalInventory(t, tyres.CompoundHard, tyres.CompoundWet)
	input.CompoundPace = []CompoundPaceParameter{
		compoundParameter(tyres.CompoundHard, 0, 0, sp.ProvenanceManual),
		compoundParameter(tyres.CompoundWet, 0, 0, sp.ProvenanceManual),
	}
	parameters := []WeatherBucketParameter{
		weatherCompoundParameters(sp.ClimateBucketDry, 0, 7),
		weatherCompoundParameters(sp.ClimateBucketHumid, 1, 3),
		weatherCompoundParameters(sp.ClimateBucketWet, 7, 0),
	}
	return input, parameters
}

func TestWeatherTimelineInterpolatesFiveNodesAndThresholdsPerLap(t *testing.T) {
	scenario := weatherScenario("timeline", [5]float64{0, 10, 50, 90, 100})
	timeline := weatherTimeline(scenario, 9, RainChanceThresholds{HumidPercent: 20, WetPercent: 60})
	wantBuckets := []sp.ClimateBucket{
		sp.ClimateBucketDry, sp.ClimateBucketDry,
		sp.ClimateBucketDry, sp.ClimateBucketHumid, sp.ClimateBucketHumid,
		sp.ClimateBucketWet, sp.ClimateBucketWet, sp.ClimateBucketWet, sp.ClimateBucketWet,
	}
	if len(timeline) != len(wantBuckets) {
		t.Fatalf("timeline length = %d", len(timeline))
	}
	for index, want := range wantBuckets {
		if timeline[index].Bucket != want {
			t.Fatalf("lap %d bucket = %s, want %s (rain=%v)", index+1, timeline[index].Bucket, want, timeline[index].RainChance)
		}
	}
	if timeline[2].RainChance != 10 || timeline[4].RainChance != 50 || timeline[8].RainChance != 100 {
		t.Fatalf("forecast nodes were not preserved by interpolation: %+v", timeline)
	}
}

func TestSolveWeatherSingleDryScenarioIsDegenerateSolveV2(t *testing.T) {
	input := baseInputV2()
	direct, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	multi, err := SolveWeatherScenarios(input, WeatherScenarioSet{
		Scenarios: []WeightedWeatherScenario{{Scenario: weatherScenario("dry", [5]float64{}), Weight: 1}},
	})
	if err != nil {
		t.Fatalf("SolveWeatherScenarios: %v", err)
	}
	if len(multi.Plans) != 1 || !reflect.DeepEqual(direct.Best, multi.Plans[0].Result.Best) || direct.Expected != multi.Plans[0].Result.Expected {
		t.Fatalf("single dry scenario changed current result: direct=%+v weather=%+v", direct, multi.Plans[0].Result)
	}
	if !reflect.DeepEqual(direct.Best, multi.Robust.Decision) || multi.Robust.MaxRegretSeconds != 0 || multi.Robust.WeightedExpectedLossSeconds != 0 {
		t.Fatalf("dry robust degeneration = %+v", multi.Robust)
	}
}

func TestSolveV2SelectsBucketConsumptionOnEveryCrossingLap(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 5
	input.Formation.Seconds = 0
	input.FuelCapacityLiters = 5
	input.FuelPerLapLiters = 1
	input.PitCost.TransitSeconds = 0
	input.PitCost.RefuelRateLPerS = 100
	wetFuel := 2.0
	input.Weather = &WeatherPlanInput{
		Scenario: weatherScenario("wet-half", [5]float64{0, 0, 100, 100, 100}),
		BucketParameters: []WeatherBucketParameter{
			bucketParameter(sp.ClimateBucketDry, 0),
			bucketParameter(sp.ClimateBucketHumid, 0),
			func() WeatherBucketParameter {
				parameter := bucketParameter(sp.ClimateBucketWet, 1)
				parameter.FuelPerLapLiters = &wetFuel
				return parameter
			}(),
		},
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || len(result.Best.PitStops) == 0 || result.Expected.WeatherSeconds <= 0 {
		t.Fatalf("weather consumption/pace did not affect crossing stint: %+v", result)
	}
	wetLaps := 0
	for _, lap := range result.WeatherTimeline {
		if lap.Bucket == sp.ClimateBucketWet {
			wetLaps++
		}
	}
	if math.Abs(result.Expected.WeatherSeconds-float64(wetLaps)) > epsilon {
		t.Fatalf("weather delta was not selected per lap: timeline=%+v evaluation=%+v", result.WeatherTimeline, result.Expected)
	}
}

func TestSolveV2ConsumesAnalysisClimateBucketPerLap(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 5
	input.Formation.Seconds = 0
	input.FuelCapacityLiters = 5
	input.FuelPerLapLiters = 0
	input.PitCost.TransitSeconds = 0
	input.PitCost.RefuelRateLPerS = 100
	input.Projection = curveProjection([]sp.PacePoint{pacePoint(1, 0, 10)}, 10, 0, 0)
	input.Projection.FuelConsumption = sp.ResourceConsumptionFamily{
		Presence:   sp.PresenceValid,
		Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "analysis:spa-lmgt3"},
		Confidence: sp.Confidence{SampleSize: 20, ComputationVersion: "consumption-pace.v1"},
		MeanPerLap: 1, RangeLower: 1, RangeUpper: 2,
		ByClimateBucket: map[sp.ClimateBucket]float64{
			sp.ClimateBucketDry: 1, sp.ClimateBucketHumid: 1.5, sp.ClimateBucketWet: 2,
		},
	}
	input.Weather = &WeatherPlanInput{
		Scenario: weatherScenario("analysis-buckets", [5]float64{0, 0, 100, 100, 100}),
		BucketParameters: []WeatherBucketParameter{
			bucketParameter(sp.ClimateBucketHumid, 0),
			bucketParameter(sp.ClimateBucketWet, 0),
		},
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || len(result.Best.PitStops) == 0 {
		t.Fatalf("derived weather consumption did not select changing buckets: %+v", result)
	}
}

func TestRainAtNode50PitsForWetsAndRobustBeatsDryPlanWhenRainArrivesEarly(t *testing.T) {
	input, parameters := weatherBusinessInput(t)
	dry := weatherScenario("dry", [5]float64{})
	forecast := weatherScenario("node-50", [5]float64{0, 0, 100, 100, 100})
	early := weatherScenario("early", [5]float64{0, 100, 100, 100, 100})
	result, err := SolveWeatherScenarios(input, WeatherScenarioSet{
		Scenarios: []WeightedWeatherScenario{
			{Scenario: dry, Weight: 0.35},
			{Scenario: forecast, Weight: 0.40},
			{Scenario: early, Weight: 0.25},
		},
		BucketParameters: parameters,
	})
	if err != nil {
		t.Fatalf("SolveWeatherScenarios: %v", err)
	}
	forecastPlan := result.Plans[1].Result.Best
	if len(forecastPlan.PitStops) == 0 || forecastPlan.PitStops[0].Compound != tyres.CompoundWet {
		t.Fatalf("NODE_50 plan did not stop for wets: %+v", forecastPlan)
	}
	firstWet := int64(0)
	for _, lap := range result.Plans[1].Timeline {
		if lap.Bucket == sp.ClimateBucketWet {
			firstWet = lap.Lap
			break
		}
	}
	if firstWet == 0 || forecastPlan.PitStops[0].Lap != firstWet-1 {
		t.Fatalf("wet stop = lap %d, want transition window before lap %d; timeline=%+v", forecastPlan.PitStops[0].Lap, firstWet, result.Plans[1].Timeline)
	}

	earlyInput := withWeather(input, early, normalizedThresholds(RainChanceThresholds{}), parameters)
	dryEvaluation, dryFeasible, err := evaluateDecisionV2(earlyInput, result.Plans[0].Result.Best)
	if err != nil || !dryFeasible {
		t.Fatalf("evaluate dry plan under early rain: feasible=%v err=%v", dryFeasible, err)
	}
	robustEarly := result.Robust.ByScenario[2]
	if !robustEarly.Feasible || robustEarly.Evaluation.TotalSeconds >= dryEvaluation.TotalSeconds {
		t.Fatalf("robust plan did not lose less under early rain: robust=%+v dry=%+v", robustEarly, dryEvaluation)
	}
	if result.Robust.Method != "minimax_regret" || result.Robust.MaxRegretSeconds < 0 || result.Robust.WeightedExpectedLossSeconds < 0 {
		t.Fatalf("robust metrics = %+v", result.Robust)
	}
	if len(result.ThresholdSensitivity) != 2 {
		t.Fatalf("rain threshold sensitivity missing: %+v", result.ThresholdSensitivity)
	}
}

func TestSolveV2WeatherScenarioMatchesExhaustiveOracle(t *testing.T) {
	input, parameters := weatherBusinessInput(t)
	input.RaceLaps = 5
	input.TyreLifeLaps = 5
	maximum := 1
	input.EventRules.MaxPitStops = &maximum
	input.Weather = &WeatherPlanInput{
		Scenario:         weatherScenario("oracle", [5]float64{0, 0, 100, 100, 100}),
		BucketParameters: parameters,
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	want := exhaustiveV2Best(t, input)
	if !result.Feasible || math.Abs(result.Expected.TotalSeconds-want) > epsilon {
		t.Fatalf("scenario solver=%v feasible=%v exhaustive=%v", result.Expected.TotalSeconds, result.Feasible, want)
	}
}

func TestAllowedCompoundByClimateForcesTransitionAndUsesInventory(t *testing.T) {
	input, parameters := weatherBusinessInput(t)
	input.EventRules.AllowedCompoundsByClimate = map[sp.ClimateBucket][]TyreCompound{
		sp.ClimateBucketDry: {tyres.CompoundHard},
		sp.ClimateBucketWet: {tyres.CompoundWet},
	}
	input.Weather = &WeatherPlanInput{
		Scenario:         weatherScenario("mandatory-wet", [5]float64{0, 0, 100, 100, 100}),
		BucketParameters: parameters,
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || len(result.Best.PitStops) == 0 || !result.Best.PitStops[0].ChangeTyres || result.Best.PitStops[0].Compound != tyres.CompoundWet {
		t.Fatalf("hard weather compound rule did not force the physical wet set: %+v", result)
	}
}

func TestWeatherInputsFailClosed(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*SolverInputV2)
	}{
		{
			name: "invalid thresholds",
			mutate: func(input *SolverInputV2) {
				input.Weather = &WeatherPlanInput{
					Scenario:   weatherScenario("thresholds", [5]float64{}),
					Thresholds: RainChanceThresholds{HumidPercent: 70, WetPercent: 60},
				}
			},
		},
		{
			name: "encountered wet bucket without parameters",
			mutate: func(input *SolverInputV2) {
				input.Weather = &WeatherPlanInput{Scenario: weatherScenario("missing-wet", [5]float64{100, 100, 100, 100, 100})}
			},
		},
		{
			name: "climate compound rule without scenario",
			mutate: func(input *SolverInputV2) {
				input.EventRules.AllowedCompoundsByClimate = map[sp.ClimateBucket][]TyreCompound{
					sp.ClimateBucketDry: {tyres.CompoundHard},
				}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := baseInputV2()
			test.mutate(&input)
			if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
				t.Fatalf("SolveV2 error = %v, want invalid_input", err)
			}
		})
	}
}
