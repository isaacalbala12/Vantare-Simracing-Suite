package producta

import "testing"

func TestGenerateCandidatesIncludesCoreStrategies(t *testing.T) {
	candidates, err := GenerateCandidates(SolverInput{
		RaceLaps:              60,
		LapTimeSeconds:        100,
		Fuel:                  ResourceProjection{Used: true, UsableCapacity: 100, StopsRequired: 2},
		PitLossPerStop:        20,
		TyreDegradationPerLap: 0.2,
	})
	if err != nil {
		t.Fatalf("generate candidates: %v", err)
	}
	for _, name := range []string{"minimum-stops", "fast", "safe", "balanced", "long-first", "long-last"} {
		if !hasCandidate(candidates, name) {
			t.Fatalf("candidate %q missing from %#v", name, candidates)
		}
	}
	if len(candidates) < 4 {
		t.Fatalf("expected several candidates, got %d", len(candidates))
	}
}

func TestGenerateCandidatesDoesNotAddLongVariantsWhenTheyCannotChangeTime(t *testing.T) {
	candidates, err := GenerateCandidates(SolverInput{
		RaceLaps:       30,
		LapTimeSeconds: 100,
		Fuel:           ResourceProjection{Used: true, UsableCapacity: 100, StopsRequired: 1},
		PitLossPerStop: 20,
	})
	if err != nil {
		t.Fatalf("generate candidates: %v", err)
	}
	if hasCandidate(candidates, "long-first") || hasCandidate(candidates, "long-last") {
		t.Fatalf("long variants should be omitted when degradation is absent: %#v", candidates)
	}
}

func TestGenerateCandidatesRespectsExactAndWindowLocks(t *testing.T) {
	exact := 14.0
	candidates, err := GenerateCandidates(SolverInput{
		RaceLaps:       30,
		LapTimeSeconds: 100,
		Fuel:           ResourceProjection{Used: true, UsableCapacity: 100, StopsRequired: 1},
		PitLossPerStop: 20,
		LockedPitLap:   &exact,
	})
	if err != nil {
		t.Fatalf("generate exact lock: %v", err)
	}
	for _, candidate := range candidates {
		for _, stint := range candidate.Stints {
			if stint.Pit.Required && (stint.Pit.Window.Kind != PitWindowExact || stint.Pit.Window.Lap != exact) {
				t.Fatalf("candidate ignored exact lock: %#v", candidate)
			}
		}
	}

	window := PitWindow{Kind: PitWindowWindow, StartLap: 12, EndLap: 16}
	candidates, err = GenerateCandidates(SolverInput{
		RaceLaps:        30,
		LapTimeSeconds:  100,
		Fuel:            ResourceProjection{Used: true, UsableCapacity: 100, StopsRequired: 1},
		PitLossPerStop:  20,
		LockedPitWindow: &window,
	})
	if err != nil {
		t.Fatalf("generate window lock: %v", err)
	}
	for _, candidate := range candidates {
		for _, stint := range candidate.Stints {
			if stint.Pit.Required && stint.Pit.Window != window {
				t.Fatalf("candidate ignored window lock: %#v", candidate)
			}
		}
	}
}

func TestGenerateCandidatesRejectsInvalidSolverInput(t *testing.T) {
	if _, err := GenerateCandidates(SolverInput{RaceLaps: 0, LapTimeSeconds: 100}); err == nil {
		t.Fatal("expected invalid race laps to fail")
	}
}

func hasCandidate(candidates []StrategyCandidate, name string) bool {
	for _, candidate := range candidates {
		if candidate.Name == name {
			return true
		}
	}
	return false
}
