package producta

import "testing"

// Baseline is informational only; hardware-specific timings are not a gate.
func BenchmarkSolverCandidates(b *testing.B) {
	fixtures := []struct {
		name  string
		input SolverInput
	}{
		{
			name:  "sprint",
			input: SolverInput{RaceLaps: 30, LapTimeSeconds: 100, Fuel: ResourceProjection{Used: true, UsableCapacity: 100, StopsRequired: 1}, PitLossPerStop: 20},
		},
		{
			name:  "six-hours",
			input: SolverInput{RaceLaps: 216, LapTimeSeconds: 100, Fuel: ResourceProjection{Used: true, UsableCapacity: 100, StopsRequired: 8}, PitLossPerStop: 20, TyreDegradationPerLap: 0.1},
		},
		{
			name:  "twenty-four-hours",
			input: SolverInput{RaceLaps: 864, LapTimeSeconds: 100, Fuel: ResourceProjection{Used: true, UsableCapacity: 100, StopsRequired: 32}, PitLossPerStop: 20, TyreDegradationPerLap: 0.1},
		},
	}

	for _, fixture := range fixtures {
		b.Run(fixture.name, func(b *testing.B) {
			b.ReportAllocs()
			for iteration := 0; iteration < b.N; iteration++ {
				if _, err := GenerateCandidates(fixture.input); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
