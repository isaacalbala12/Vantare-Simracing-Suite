package main

import (
	"bytes"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/backtest"
	"github.com/vantare/overlays/v2/internal/strategy/curation"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestBuildSummaryTableDriven(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		wantFiles      int
		wantAccepted   int
		wantRejected   int
		wantDuplicates int
		golden         string
	}{
		{
			name:           "synthetic test bundles",
			input:          filepath.Join("testdata", "input"),
			wantFiles:      7,
			wantAccepted:   6,
			wantRejected:   1,
			wantDuplicates: 1,
			golden:         filepath.Join("testdata", "expected-summary.json"),
		},
		{
			name:  "empty environment root",
			input: t.TempDir(),
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := buildSummary(test.input)
			if err != nil {
				t.Fatalf("buildSummary: %v", err)
			}
			var decoded summary
			if err := json.Unmarshal(got, &decoded); err != nil {
				t.Fatalf("decode summary: %v", err)
			}
			if decoded.Input.Files != test.wantFiles || decoded.Input.Accepted != test.wantAccepted ||
				decoded.Input.Rejected != test.wantRejected || decoded.Input.Duplicates != test.wantDuplicates {
				t.Fatalf("input stats = %+v", decoded.Input)
			}
			if test.golden == "" {
				return
			}
			want, err := os.ReadFile(test.golden)
			if err != nil {
				t.Fatalf("read golden: %v", err)
			}
			want = bytes.TrimSuffix(want, []byte{'\n'})
			if !bytes.Equal(got, want) {
				t.Fatalf("summary differs byte-for-byte\ngot:  %s\nwant: %s", got, want)
			}
		})
	}
}

func TestBuildSummarySeparatesEnvironmentsAndAppliesCohort(t *testing.T) {
	encoded, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("buildSummary: %v", err)
	}
	var got summary
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	testEnvironment := findEnvironment(t, got, "test")
	controlled := findEnvironment(t, got, "controlled-capture")
	if len(testEnvironment.Combinations) != 1 || len(controlled.Combinations) != 1 {
		t.Fatalf("separate combinations = test:%d controlled:%d", len(testEnvironment.Combinations), len(controlled.Combinations))
	}
	testCombination := testEnvironment.Combinations[0]
	controlledCombination := controlled.Combinations[0]
	if len(testCombination.Strategies) != 1 || testCombination.Contributors != 3 ||
		!testCombination.Publishable || !testCombination.Strategies[0].Publishable {
		t.Fatalf("test cohort = %+v", testCombination)
	}
	if controlledCombination.Contributors != 1 || controlledCombination.Publishable || controlledCombination.Reason != "minimum_cohort_not_met" {
		t.Fatalf("controlled cohort = %+v", controlledCombination)
	}
	if testCombination.SemanticBundles != 2 || testEnvironment.Duplicates != 1 {
		t.Fatalf("semantic dedupe = %+v", testEnvironment)
	}
}

func TestBuildSummaryReferenceProfilesApplyKAnonymity(t *testing.T) {
	encoded, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("buildSummary: %v", err)
	}
	var got summary
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatalf("decode summary: %v", err)
	}

	tests := []struct {
		name         string
		environment  string
		combination  string
		contributors int
		publishable  bool
	}{
		{name: "k=2 suppresses rare combination", environment: "production-community", combination: "lemans-hyper", contributors: 2},
		{name: "k=3 publishes sample and quality", environment: "test", combination: "spa-lmgt3", contributors: 3, publishable: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			environment := findEnvironment(t, got, test.environment)
			combination := findCombination(t, environment, test.combination)
			if combination.Contributors != test.contributors || combination.Publishable != test.publishable {
				t.Fatalf("cohort = %+v", combination)
			}
			if !test.publishable {
				if combination.Reason != "minimum_cohort_not_met" || combination.Reference.Publishable ||
					combination.Reference.Fuel != nil || combination.Reference.VirtualEnergy != nil ||
					combination.Reference.Pace != nil || combination.Reference.StintPaceCurve != nil ||
					combination.Reference.Pit != nil || combination.Reference.Quality != nil || len(combination.Strategies) != 0 {
					t.Fatalf("rare combination was not suppressed: %+v", combination)
				}
				return
			}
			if !combination.Reference.Publishable || combination.Reference.Fuel == nil || combination.Reference.Fuel.SampleLaps == 0 ||
				combination.Reference.VirtualEnergy == nil || combination.Reference.VirtualEnergy.SampleLaps == 0 ||
				combination.Reference.Quality == nil || combination.Reference.Quality.ValidSessions == 0 ||
				combination.Reference.Quality.SampleSessions == 0 {
				t.Fatalf("published reference lacks sample or quality: %+v", combination.Reference)
			}
			if math.Abs(combination.Reference.Fuel.MedianPerLap-2.15) > 1e-12 ||
				combination.Reference.Fuel.RangeLower != 2 || combination.Reference.Fuel.RangeUpper != 2.3 ||
				combination.Reference.Fuel.SampleLaps != 20 || combination.Reference.Pit == nil ||
				combination.Reference.Pit.Count != 2 || combination.Reference.Pit.TypicalDurationSeconds != 20.5 ||
				combination.Reference.Quality.ValidSessions != 7 || combination.Reference.Quality.InvalidSessions != 1 ||
				combination.Reference.Quality.SampleSessions != 8 || combination.Reference.Quality.ValidRatio != 0.875 {
				t.Fatalf("published reference aggregates = %+v", combination.Reference)
			}
		})
	}
}

func TestMetricAccumulatorUsesLapWeightedMedian(t *testing.T) {
	var accumulator metricAccumulator
	accumulator.add(1, 3)
	accumulator.add(10, 1)

	got := accumulator.summary()
	if got.MedianPerLap != 1 || got.RangeLower != 1 || got.RangeUpper != 10 || got.SampleLaps != 4 {
		t.Fatalf("weighted median summary = %+v", got)
	}
}

func TestNormalizedRaceCaseIsAcceptedByBacktest(t *testing.T) {
	strategy := curation.ObservedStrategyRef{StintCount: 2, PitLaps: []int{5}, Compounds: []string{"hard", "soft"}}
	race, err := normalizedRaceCase("spa-lmgt3", strategy, 10, 20.5)
	if err != nil {
		t.Fatalf("normalizedRaceCase: %v", err)
	}
	result, err := backtest.RunRace(race, backtest.ProvisionalThresholds(0))
	if err != nil {
		t.Fatalf("RunRace rejected normalized curator input: %v", err)
	}
	if result.Calibration.PredictedTotalSeconds != 30.5 || !result.Feasibility.Passed || !result.Ranking.Passed {
		t.Fatalf("normalized backtest result = %+v", result)
	}

	scalars := []struct {
		name  string
		input solver.ScalarInput
	}{
		{name: "base lap", input: race.PredictionInput.BaseLapSeconds},
		{name: "pit transit", input: race.PredictionInput.PitCost.TransitSeconds},
		{name: "refuel rate", input: race.PredictionInput.PitCost.RefuelRateLPerS},
		{name: "VE rate", input: race.PredictionInput.PitCost.VERatePPerS},
		{name: "tyre service", input: race.PredictionInput.PitCost.TyreSeconds},
		{name: "formation", input: race.PredictionInput.Formation.Seconds},
		{name: "fuel capacity", input: race.PredictionInput.FuelCapacityLiters},
		{name: "VE capacity", input: race.PredictionInput.VECapacityPercent},
		{name: "tyre life", input: race.PredictionInput.TyreLifeLaps},
		{name: "fuel per lap", input: race.PredictionInput.FuelPerLapLiters},
		{name: "VE per lap", input: race.PredictionInput.VEPerLapPercent},
		{name: "degradation", input: race.PredictionInput.DegradationPerLap},
	}
	for _, scalar := range scalars {
		t.Run(scalar.name, func(t *testing.T) {
			if scalar.input.Role != solver.ScalarRoleFallback || scalar.input.Provenance.Kind != sp.ProvenanceReference {
				t.Fatalf("normalized scalar authority = %+v", scalar.input)
			}
		})
	}
}

func TestBuildSummaryUsesMedianAndDeclaresUnavailablePaceCurve(t *testing.T) {
	encoded, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("buildSummary: %v", err)
	}
	if bytes.Contains(encoded, []byte(`"meanPerLap"`)) || !bytes.Contains(encoded, []byte(`"medianPerLap"`)) {
		t.Fatalf("reference consumption is not encoded as a median: %s", encoded)
	}
	if !bytes.Contains(encoded, []byte(`"stintPaceCurve":{"available":false,"reason":"stint_pace_curve_not_present_in_curationbundle_v1"}`)) {
		t.Fatalf("missing explicit combined stint curve absence: %s", encoded)
	}
}

func TestBuildSummaryDoesNotExposeAdministrativeIdentityOrAbsoluteDates(t *testing.T) {
	encoded, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("buildSummary: %v", err)
	}
	for _, forbidden := range [][]byte{
		[]byte("uploadId"), []byte("deleteHash"), []byte("install-a"), []byte("delete-a"), []byte("2026-W34"),
	} {
		if bytes.Contains(encoded, forbidden) {
			t.Fatalf("summary contains forbidden value %q", forbidden)
		}
	}
}

func TestBuildSummaryIsByteDeterministic(t *testing.T) {
	first, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("first summary: %v", err)
	}
	second, err := buildSummary(filepath.Join("testdata", "input"))
	if err != nil {
		t.Fatalf("second summary: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("same input produced different bytes")
	}
}

func TestRunRequiresOutputOutsideInput(t *testing.T) {
	input := filepath.Join("testdata", "input")
	output := filepath.Join(input, "summary.json")
	if err := run([]string{"--in", input, "--out", output}, &bytes.Buffer{}); err == nil {
		t.Fatal("output inside input was accepted")
	}
}

func TestPathInsideTreatsDifferentWindowsVolumesAsOutside(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows volume semantics")
	}
	inside, err := pathInside(`C:\input`, `D:\output\summary.json`)
	if err != nil {
		t.Fatalf("pathInside: %v", err)
	}
	if inside {
		t.Fatal("a path on another Windows volume was considered inside")
	}
}

func TestRunWritesCompactDeterministicSummary(t *testing.T) {
	input := filepath.Join("testdata", "input")
	output := filepath.Join(t.TempDir(), "summary.json")
	if err := run([]string{"--in", input, "--out", output}, &bytes.Buffer{}); err != nil {
		t.Fatalf("run: %v", err)
	}
	got, err := os.ReadFile(output)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	want, err := buildSummary(input)
	if err != nil {
		t.Fatalf("build expected summary: %v", err)
	}
	if !bytes.Equal(got, want) || bytes.Contains(got, []byte{'\n'}) {
		t.Fatal("CLI output is not the exact compact deterministic summary")
	}
}

func findEnvironment(t *testing.T, value summary, environment string) environmentSummary {
	t.Helper()
	for _, candidate := range value.Environments {
		if candidate.Environment == environment {
			return candidate
		}
	}
	t.Fatalf("environment %q not found", environment)
	return environmentSummary{}
}

func findCombination(t *testing.T, environment environmentSummary, combination string) combinationSummary {
	t.Helper()
	for _, candidate := range environment.Combinations {
		if candidate.CombinationID == combination {
			return candidate
		}
	}
	t.Fatalf("combination %q not found", combination)
	return combinationSummary{}
}
