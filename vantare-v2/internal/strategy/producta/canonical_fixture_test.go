package producta

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
)

type canonicalFixture struct {
	Cases         []canonicalCase `json:"cases"`
	MixedTyrePlan TyrePlan        `json:"mixedTyrePlan"`
	RepairStints  []StintInput    `json:"repairStints"`
}

type canonicalCase struct {
	Name           string      `json:"name"`
	Input          SolverInput `json:"input"`
	CandidateCount int         `json:"candidateCount"`
	TopName        string      `json:"topName"`
}

func TestCanonicalFixturesRemainDeterministic(t *testing.T) {
	fixtureBytes, err := os.ReadFile(filepath.Join("testdata", "canonical-cases.json"))
	if err != nil {
		t.Fatalf("read canonical fixtures: %v", err)
	}
	var fixture canonicalFixture
	if err := json.Unmarshal(fixtureBytes, &fixture); err != nil {
		t.Fatalf("decode canonical fixtures: %v", err)
	}

	for _, testCase := range fixture.Cases {
		t.Run(testCase.Name, func(t *testing.T) {
			candidates, err := GenerateCandidates(testCase.Input)
			if err != nil {
				t.Fatalf("generate candidates: %v", err)
			}
			if len(candidates) != testCase.CandidateCount {
				t.Fatalf("candidate count = %d, want %d", len(candidates), testCase.CandidateCount)
			}
			comparison := Rank(candidates)
			if len(comparison.Top3) == 0 || comparison.Top3[0].Name != testCase.TopName {
				t.Fatalf("top candidate = %#v, want %q", comparison.Top3, testCase.TopName)
			}
			for _, candidate := range comparison.All {
				if len(candidate.Stints) != candidate.Stops+1 {
					t.Fatalf("%s has %d stints for %d stops", candidate.Name, len(candidate.Stints), candidate.Stops)
				}
			}
		})
	}

	if err := ValidateTyrePlan(fixture.MixedTyrePlan); err != nil {
		t.Fatalf("mixed tyre fixture should be valid: %v", err)
	}
	if _, err := BuildStints(fixture.RepairStints); err != nil {
		t.Fatalf("repair fixture should be valid: %v", err)
	}
}

func TestSolverInvariantsAcrossFixedSeeds(t *testing.T) {
	for seed := 0; seed < 10000; seed++ {
		input := SolverInput{
			RaceLaps:              float64(10 + seed%240),
			LapTimeSeconds:        70 + float64(seed%50)/10,
			PitLossPerStop:        float64(seed % 40),
			TyreDegradationPerLap: float64(seed%5) / 100,
			Fuel: ResourceProjection{
				Used:            true,
				UsableCapacity:  float64(20 + seed%30),
				AvailableAmount: float64(15 + seed%20),
				StopsRequired:   seed % 5,
				AvailableLaps:   float64(15 + seed%20),
			},
		}
		candidates, err := GenerateCandidates(input)
		if err != nil {
			t.Fatalf("seed %d: generate candidates: %v", seed, err)
		}
		if len(candidates) == 0 {
			t.Fatalf("seed %d: no candidates", seed)
		}
		for _, candidate := range candidates {
			if !candidate.Valid || !isFinite(candidate.TotalTimeSeconds) || !isFinite(candidate.Margin) {
				t.Fatalf("seed %d: invalid candidate %#v", seed, candidate)
			}
			var stintLaps float64
			for _, stint := range candidate.Stints {
				stintLaps += stint.Laps
			}
			if math.Abs(stintLaps-input.RaceLaps) > 1e-9 {
				t.Fatalf("seed %d: stint laps = %v, want %v", seed, stintLaps, input.RaceLaps)
			}
		}
	}
}
