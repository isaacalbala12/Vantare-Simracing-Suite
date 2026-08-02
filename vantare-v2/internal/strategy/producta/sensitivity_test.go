package producta

import "testing"

func TestRunSensitivityProducesMinimumBaseMaximumScenarios(t *testing.T) {
	report, err := RunSensitivity(SensitivityInput{
		Base: SolverInput{
			RaceLaps:       30,
			LapTimeSeconds: 100,
			Fuel:           ResourceProjection{Used: true, TotalNeed: 120, AvailableAmount: 20, UsableCapacity: 100, StopsRequired: 1},
			PitLossPerStop: 20,
		},
		ConsumptionDelta: 0.1,
		PaceDeltaSeconds: 2,
	})
	if err != nil {
		t.Fatalf("run sensitivity: %v", err)
	}
	if len(report.Cases) != 3 || report.Cases[0].Scenario != SensitivityMinimum || report.Cases[1].Scenario != SensitivityBase || report.Cases[2].Scenario != SensitivityMaximum {
		t.Fatalf("unexpected sensitivity cases: %#v", report.Cases)
	}
	if report.Cases[0].Input.LapTimeSeconds >= report.Cases[2].Input.LapTimeSeconds {
		t.Fatalf("pace range was not applied: %#v", report.Cases)
	}
	if report.Cases[0].Input.Fuel.TotalNeed >= report.Cases[2].Input.Fuel.TotalNeed {
		t.Fatalf("consumption range was not applied: %#v", report.Cases)
	}
}

func TestRunSensitivityWithZeroDeltaKeepsBaseResultsStable(t *testing.T) {
	input := SensitivityInput{
		Base: SolverInput{
			RaceLaps:       30,
			LapTimeSeconds: 100,
			Fuel:           ResourceProjection{Used: true, TotalNeed: 120, AvailableAmount: 20, UsableCapacity: 100, StopsRequired: 1},
			PitLossPerStop: 20,
		},
	}
	report, err := RunSensitivity(input)
	if err != nil {
		t.Fatalf("run sensitivity: %v", err)
	}
	for _, sensitivityCase := range report.Cases {
		if len(sensitivityCase.Comparison.All) == 0 || sensitivityCase.Input.LapTimeSeconds != 100 || sensitivityCase.Input.Fuel.TotalNeed != 120 {
			t.Fatalf("zero-delta sensitivity changed base: %#v", sensitivityCase)
		}
	}
}
