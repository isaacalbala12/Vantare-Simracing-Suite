package backtest

import (
	"encoding/json"
	"math"
	"os"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type holdoutFixture struct {
	FixtureVersion string `json:"fixtureVersion"`
	SourceEvidence string `json:"sourceEvidence"`
	Cases          []struct {
		RaceID         string    `json:"raceId"`
		CombinationID  string    `json:"combinationId"`
		OccurredAt     time.Time `json:"occurredAt"`
		StintLaps      []int     `json:"stintLaps"`
		BaseLapSeconds float64   `json:"baseLapSeconds"`
		PitSeconds     float64   `json:"pitSeconds"`
		Expected       struct {
			CalibrationErrorRatio float64 `json:"calibrationErrorRatio"`
			DryPitStopsExact      bool    `json:"dryPitStopsExact"`
			Feasible              bool    `json:"feasible"`
			RankingApplicable     bool    `json:"rankingApplicable"`
			SignCoherent          bool    `json:"signCoherent"`
			InternalRegretSeconds float64 `json:"internalRegretSeconds"`
		} `json:"expected"`
	} `json:"cases"`
}

func TestRunHoldoutEndToEndFromSanitizedDerivatives(t *testing.T) {
	fixture := loadHoldoutFixture(t)
	cases := make([]RaceCase, 0, len(fixture.Cases))
	cutoffs := make(map[string]time.Time, len(fixture.Cases))
	for _, item := range fixture.Cases {
		race := fixtureRaceCase(item.RaceID, item.CombinationID, item.OccurredAt, item.StintLaps, item.BaseLapSeconds, item.PitSeconds)
		cases = append(cases, race)
		cutoffs[item.CombinationID] = item.OccurredAt.Add(-24 * time.Hour)
	}
	config := Config{
		Thresholds: ProvisionalThresholds(1),
		Holdout: HoldoutConfig{
			CutoffByCombination: cutoffs,
			MinimumRaces:        4,
			MinimumRankingRaces: 4,
			IntervalZScore:      1.96,
		},
	}

	first, err := RunHoldout(cases, config)
	if err != nil {
		t.Fatalf("RunHoldout: %v", err)
	}
	second, err := RunHoldout(cases, config)
	if err != nil {
		t.Fatalf("second RunHoldout: %v", err)
	}
	firstJSON, _ := json.Marshal(first)
	secondJSON, _ := json.Marshal(second)
	if string(firstJSON) != string(secondJSON) {
		t.Fatal("holdout replay is not deterministic")
	}
	if len(first.Races) != len(fixture.Cases) {
		t.Fatalf("race count = %d, want %d", len(first.Races), len(fixture.Cases))
	}
	wants := make(map[string]struct {
		CalibrationErrorRatio float64
		DryPitStopsExact      bool
		Feasible              bool
		RankingApplicable     bool
		SignCoherent          bool
		InternalRegretSeconds float64
	}, len(fixture.Cases))
	for _, item := range fixture.Cases {
		wants[item.RaceID] = struct {
			CalibrationErrorRatio float64
			DryPitStopsExact      bool
			Feasible              bool
			RankingApplicable     bool
			SignCoherent          bool
			InternalRegretSeconds float64
		}{
			item.Expected.CalibrationErrorRatio,
			item.Expected.DryPitStopsExact,
			item.Expected.Feasible,
			item.Expected.RankingApplicable,
			item.Expected.SignCoherent,
			item.Expected.InternalRegretSeconds,
		}
	}
	for _, race := range first.Races {
		want := wants[race.RaceID]
		if math.Abs(race.Calibration.AbsoluteErrorRatio-want.CalibrationErrorRatio) > 1e-12 ||
			race.Calibration.DryPitStopsExact != want.DryPitStopsExact ||
			race.Feasibility.Passed != want.Feasible ||
			race.Ranking.Applicable != want.RankingApplicable ||
			race.Ranking.SignCoherent != want.SignCoherent ||
			math.Abs(race.Ranking.InternalRegretSeconds-want.InternalRegretSeconds) > 1e-12 {
			t.Fatalf("race %s differs from versioned expected: %+v", race.RaceID, race)
		}
		for _, stint := range race.Calibration.Stints {
			if stint.AbsoluteErrorRatio != 0 {
				t.Fatalf("race %s stint %d error = %v, want zero", race.RaceID, stint.StintNumber, stint.AbsoluteErrorRatio)
			}
		}
	}
	if first.Aggregate.CalibrationPassed {
		t.Fatal("provisional exact-dry-stop gate should fail for these differing observed strategies")
	}
	if !first.Aggregate.FeasibilityPassed || !first.Aggregate.RankingPassed {
		t.Fatalf("aggregate gates = %+v", first.Aggregate)
	}
	if !first.Aggregate.Thresholds.CalibrationProvisional {
		t.Fatal("spec calibration thresholds must remain marked provisional until #702")
	}
}

func TestRunRaceSeparatesCalibrationFromCounterfactualRanking(t *testing.T) {
	race := fixtureRaceCase(
		"race-sign",
		"combo-sign",
		time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC),
		[]int{2, 3},
		90,
		10,
	)
	race.RealizedInput.DegradationPerLap.Value = 8

	result, err := RunRace(race, ProvisionalThresholds(1))
	if err != nil {
		t.Fatalf("RunRace: %v", err)
	}
	if result.Calibration.AbsoluteErrorRatio != 0 {
		t.Fatalf("calibration error = %v, want zero", result.Calibration.AbsoluteErrorRatio)
	}
	if !result.Ranking.Applicable || !result.Ranking.Evaluable || result.Ranking.SignCoherent || result.Ranking.Passed {
		t.Fatalf("ranking should expose the counterfactual sign mismatch: %+v", result.Ranking)
	}
}

func TestRunRaceFeasibilityUsesRealizedSessionConstraints(t *testing.T) {
	race := fixtureRaceCase(
		"race-feasibility",
		"combo-feasibility",
		time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC),
		[]int{2, 3},
		90,
		10,
	)
	race.PredictionInput.FuelCapacityLiters.Value = 5
	race.PredictionInput.FuelPerLapLiters.Value = 1
	race.PredictionInput.Discretization.FuelLiters = 1
	race.RealizedInput.FuelCapacityLiters.Value = 2
	race.RealizedInput.FuelPerLapLiters.Value = 1
	race.RealizedInput.Discretization.FuelLiters = 1
	fuelAdded := 2.0
	race.Observed.PitStops[0].FuelAddedLiters = &fuelAdded

	result, err := RunRace(race, ProvisionalThresholds(1))
	if err != nil {
		t.Fatalf("RunRace: %v", err)
	}
	if result.Feasibility.Passed || result.Ranking.Evaluable || result.Ranking.Reason != "recommended_plan_infeasible_on_realized_data" {
		t.Fatalf("realized feasibility gate = %+v, ranking = %+v", result.Feasibility, result.Ranking)
	}
}

func TestObservedDecisionKeepsConfiguredCompoundsAndPitLaps(t *testing.T) {
	race := fixtureRaceCase(
		"race-compounds",
		"combo-compounds",
		time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC),
		[]int{2, 3},
		90,
		10,
	)
	hard, soft := 0, 1
	race.Observed.Stints[0].CompoundRaw = &hard
	race.Observed.Stints[1].CompoundRaw = &soft
	race.CompoundMapping = map[int]solver.TyreCompound{
		0: tyres.CompoundHard,
		1: tyres.CompoundSoft,
	}

	decision, err := observedDecision(race)
	if err != nil {
		t.Fatalf("observedDecision: %v", err)
	}
	if decision.PitStops[0].Lap != 2 || !decision.PitStops[0].ChangeTyres ||
		decision.Stints[0].Compound != tyres.CompoundHard || decision.Stints[1].Compound != tyres.CompoundSoft {
		t.Fatalf("observed decision = %+v", decision)
	}
}

func TestRunHoldoutRejectsTemporalLeakage(t *testing.T) {
	date := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	race := fixtureRaceCase("race-leak", "combo-leak", date, []int{2, 3}, 90, 10)
	race.TrainingDataThrough = date.Add(-time.Hour)
	config := Config{
		Thresholds: ProvisionalThresholds(1),
		Holdout: HoldoutConfig{
			CutoffByCombination: map[string]time.Time{"combo-leak": date.Add(-24 * time.Hour)},
			MinimumRaces:        1, MinimumRankingRaces: 1, IntervalZScore: 1.96,
		},
	}
	if _, err := RunHoldout([]RaceCase{race}, config); err == nil {
		t.Fatal("training data after the split cutoff was accepted")
	}
}

func TestRunHoldoutRequiresPositiveRankingSample(t *testing.T) {
	date := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	race := fixtureRaceCase("race-minimum", "combo-minimum", date, []int{2, 3}, 90, 10)
	config := Config{
		Thresholds: ProvisionalThresholds(1),
		Holdout: HoldoutConfig{
			CutoffByCombination: map[string]time.Time{"combo-minimum": date.Add(-24 * time.Hour)},
			MinimumRaces:        1, MinimumRankingRaces: 0, IntervalZScore: 1.96,
		},
	}
	if _, err := RunHoldout([]RaceCase{race}, config); err == nil {
		t.Fatal("zero minimum ranking sample was accepted")
	}
}

func TestRunRaceRejectsProjectionContainingHoldoutSession(t *testing.T) {
	date := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	race := fixtureRaceCase("race-leak", "combo-leak", date, []int{2, 3}, 90, 10)
	race.PredictionInput.Projection.SourceSessions = append(race.PredictionInput.Projection.SourceSessions, race.RaceID)
	if _, err := RunRace(race, ProvisionalThresholds(1)); err == nil {
		t.Fatal("projection containing the holdout session was accepted")
	}
}

func TestRunRaceRejectsPredictionObservedFromHoldoutSession(t *testing.T) {
	date := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	race := fixtureRaceCase("race-observed-leak", "combo-observed-leak", date, []int{2, 3}, 90, 10)
	race.PredictionInput.Observed = &race.Observed
	if _, err := RunRace(race, ProvisionalThresholds(1)); err == nil {
		t.Fatal("prediction input containing the holdout observation was accepted")
	}
}

func TestRunRaceAllowsRealizedProjectionFromHoldoutSession(t *testing.T) {
	date := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	race := fixtureRaceCase("race-realized", "combo-realized", date, []int{2, 3}, 90, 10)
	realizedProjection := *race.RealizedInput.Projection
	realizedProjection.SourceSessions = []string{race.RaceID}
	race.RealizedInput.Projection = &realizedProjection
	if _, err := RunRace(race, ProvisionalThresholds(1)); err != nil {
		t.Fatalf("realized session data should be allowed: %v", err)
	}
}

func loadHoldoutFixture(t *testing.T) holdoutFixture {
	t.Helper()
	data, err := os.ReadFile("testdata/sanitized-holdout-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture holdoutFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.FixtureVersion != "strategy.backtest.fixture.v1" || fixture.SourceEvidence == "" {
		t.Fatalf("invalid fixture metadata: %+v", fixture)
	}
	return fixture
}

func fixtureRaceCase(raceID, combinationID string, occurredAt time.Time, stintLaps []int, baseLap, pitSeconds float64) RaceCase {
	projection := fixtureProjection(combinationID, occurredAt.Add(-48*time.Hour))
	raceLaps := 0
	for _, laps := range stintLaps {
		raceLaps += laps
	}
	input := solver.SolverInputV2{
		ContractVersion: solver.SolverContractVersionV2,
		RaceLaps:        int64(raceLaps),
		BaseLapSeconds:  solver.NewFallbackScalar(baseLap, "backtest:base-lap"),
		Projection:      &projection,
		PitCost: solver.PitCostModel{
			TransitSeconds:  solver.NewFallbackScalar(pitSeconds, "backtest:pit-transit"),
			RefuelRateLPerS: solver.NewFallbackScalar(1, "backtest:refuel-rate"),
			VERatePPerS:     solver.NewFallbackScalar(1, "backtest:ve-rate"),
			TyreSeconds:     solver.NewFallbackScalar(0, "backtest:tyre-service"),
			ServiceMode:     manual.PitServiceSequential,
		},
		Formation:          solver.Formation{Seconds: solver.NewFallbackScalar(0, "backtest:formation"), Presence: "valid"},
		Budget:             solver.ComputeBudget{P95Millis: 10_000},
		FuelCapacityLiters: solver.NewFallbackScalar(0, "backtest:fuel-capacity"),
		VECapacityPercent:  solver.NewFallbackScalar(0, "backtest:ve-capacity"),
		TyreLifeLaps:       solver.NewFallbackScalar(0, "backtest:tyre-life"),
		FuelPerLapLiters:   solver.NewFallbackScalar(0, "backtest:fuel-per-lap"),
		VEPerLapPercent:    solver.NewFallbackScalar(0, "backtest:ve-per-lap"),
		DegradationPerLap:  solver.NewFallbackScalar(0, "backtest:degradation"),
	}
	observed := fixtureObserved(raceID, occurredAt, stintLaps, baseLap, pitSeconds)
	return RaceCase{
		RaceID:              raceID,
		CombinationID:       combinationID,
		OccurredAt:          occurredAt,
		TrainingDataThrough: occurredAt.Add(-48 * time.Hour),
		Dry:                 true,
		PredictionInput:     input,
		RealizedInput:       input,
		Observed:            observed,
	}
}

func fixtureProjection(combinationID string, generatedAt time.Time) sp.StrategyInputProjectionV2 {
	return sp.StrategyInputProjectionV2{
		ContractVersion:    sp.ContractVersionStrategyInputProjectionV2,
		GeneratedAt:        generatedAt,
		ComputationVersion: "sanitized-holdout-fixture.v1",
		SourceSessions:     []string{"training-before-holdout"},
		CombinationID:      combinationID,
		CombinedStintPaceCurve: sp.CombinedStintPaceCurve{
			Presence:        sp.PresenceMissing,
			Provenance:      sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "training-before-holdout"},
			Confidence:      sp.Confidence{ComputationVersion: "sanitized-holdout-fixture.v1"},
			Identifiability: sp.IdentifiabilityCombinedOnly,
		},
		Pit: sp.PitFamily{
			Presence:   sp.PresenceMissing,
			Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "training-before-holdout"},
			Confidence: sp.Confidence{ComputationVersion: "sanitized-holdout-fixture.v1"},
		},
	}
}

func fixtureObserved(raceID string, occurredAt time.Time, stintLaps []int, baseLap, pitSeconds float64) sp.ObservedStrategyV1 {
	observed := sp.ObservedStrategyV1{
		ContractVersion: sp.ContractVersionObservedStrategyV1,
		SessionID:       raceID,
		GeneratedAt:     occurredAt.Add(time.Hour),
		Presence:        sp.PresenceValid,
		Provenance:      sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: raceID},
		Confidence:      sp.Confidence{SampleSize: sumInts(stintLaps), ComputationVersion: "sanitized-holdout-fixture.v1"},
		Stints:          []sp.ObservedStint{},
		PitStops:        []sp.ObservedPitStop{},
		Changes:         []sp.ObservedChange{},
	}
	lap := 1
	total := 0.0
	for index, laps := range stintLaps {
		stintTotal := float64(laps) * baseLap
		if index < len(stintLaps)-1 {
			stintTotal += pitSeconds
		}
		endLap := lap + laps - 1
		observed.Stints = append(observed.Stints, sp.ObservedStint{
			StintNumber: index + 1, StartLap: lap, EndLap: endLap, TotalTimeSeconds: floatPointer(stintTotal),
			Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: raceID},
		})
		if index < len(stintLaps)-1 {
			observed.PitStops = append(observed.PitStops, sp.ObservedPitStop{
				LapNumber: endLap, PitLaneSeconds: pitSeconds, Presence: sp.PresenceValid,
				Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: raceID},
			})
		}
		total += stintTotal
		lap = endLap + 1
	}
	observed.Result = &sp.ObservedResult{CompletedLaps: sumInts(stintLaps), TotalTimeSeconds: total, Completed: true}
	return observed
}

func sumInts(values []int) int {
	total := 0
	for _, value := range values {
		total += value
	}
	return total
}

func floatPointer(value float64) *float64 { return &value }
