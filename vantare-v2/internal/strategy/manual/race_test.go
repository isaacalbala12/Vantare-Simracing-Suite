package manual

import (
	"errors"
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

func TestCalculateRace(t *testing.T) {
	t.Parallel()

	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "confirmed input")
	tests := []struct {
		name       string
		input      RaceInput
		wantLaps   int64
		wantFinal  int64
		wantDrive  float64
		wantBudget float64
	}{
		{
			name: "lap race",
			input: RaceInput{
				Kind:          RaceByLaps,
				TargetLaps:    sourcedLaps(t, 30, manual),
				AverageLap:    sourcedDuration(t, 120, manual),
				FormationLaps: sourcedLaps(t, 1, manual),
				PitLoss:       sourcedDuration(t, 40, manual),
				Selection:     manual,
			},
			wantLaps:   30,
			wantFinal:  0,
			wantDrive:  3600,
			wantBudget: 3600,
		},
		{
			name: "timed race completes lap in progress",
			input: RaceInput{
				Kind:          RaceByTime,
				Duration:      sourcedDuration(t, 3600, manual),
				AverageLap:    sourcedDuration(t, 121, manual),
				FormationLaps: sourcedLaps(t, 1, manual),
				PitLoss:       sourcedDuration(t, 60, manual),
				TimedFinish:   TimedFinishCurrentLap,
				Selection:     manual,
			},
			wantLaps:   30,
			wantFinal:  1,
			wantDrive:  3630,
			wantBudget: 3540,
		},
		{
			name: "timed race exact boundary has no phantom lap",
			input: RaceInput{
				Kind:          RaceByTime,
				Duration:      sourcedDuration(t, 3600, manual),
				AverageLap:    sourcedDuration(t, 120, manual),
				FormationLaps: sourcedLaps(t, 0, manual),
				PitLoss:       sourcedDuration(t, 0, manual),
				TimedFinish:   TimedFinishCurrentLap,
				Selection:     manual,
			},
			wantLaps:   30,
			wantFinal:  0,
			wantDrive:  3600,
			wantBudget: 3600,
		},
		{
			name: "timed race explicit additional lap",
			input: RaceInput{
				Kind:          RaceByTime,
				Duration:      sourcedDuration(t, 3600, manual),
				AverageLap:    sourcedDuration(t, 120, manual),
				FormationLaps: sourcedLaps(t, 0, manual),
				PitLoss:       sourcedDuration(t, 0, manual),
				TimedFinish:   TimedFinishCurrentPlusOne,
				Selection:     manual,
			},
			wantLaps:   31,
			wantFinal:  1,
			wantDrive:  3720,
			wantBudget: 3600,
		},
		{
			name: "timed race spent entirely in pit has zero laps",
			input: RaceInput{
				Kind:          RaceByTime,
				Duration:      sourcedDuration(t, 60, manual),
				AverageLap:    sourcedDuration(t, 60, manual),
				FormationLaps: sourcedLaps(t, 0, manual),
				PitLoss:       sourcedDuration(t, 60, manual),
				TimedFinish:   TimedFinishCurrentPlusOne,
				Selection:     manual,
			},
			wantLaps:   0,
			wantFinal:  0,
			wantDrive:  0,
			wantBudget: 0,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := CalculateRace(test.input)
			if err != nil {
				t.Fatalf("CalculateRace: %v", err)
			}
			if got.CompetitiveLaps.Value() != test.wantLaps || got.FinalLapsAfterExpiry.Value() != test.wantFinal {
				t.Fatalf("laps: got competitive=%d final=%d", got.CompetitiveLaps.Value(), got.FinalLapsAfterExpiry.Value())
			}
			if got.DrivingSeconds.Value() != test.wantDrive || got.OnTrackBudgetSeconds.Value() != test.wantBudget {
				t.Fatalf("seconds: got driving=%v budget=%v", got.DrivingSeconds.Value(), got.OnTrackBudgetSeconds.Value())
			}
			if len(got.Assumptions) == 0 {
				t.Fatal("result must expose its assumptions")
			}
			for _, assumption := range got.Assumptions {
				if assumption.Value == "" {
					t.Fatalf("assumption %s hides its value", assumption.Field)
				}
				if err := assumption.Evidence().Validate(); err != nil {
					t.Fatalf("assumption %s has invalid evidence: %v", assumption.Field, err)
				}
			}
		})
	}
}

func TestCalculateRaceRejectsInvalidOrOverflowingInputs(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "confirmed input")

	tests := []struct {
		name  string
		input RaceInput
		code  ErrorCode
	}{
		{
			name:  "zero lap time",
			input: RaceInput{Kind: RaceByLaps, TargetLaps: sourcedLaps(t, 1, manual), AverageLap: sourcedDuration(t, 0, manual), FormationLaps: sourcedLaps(t, 0, manual), PitLoss: sourcedDuration(t, 0, manual), Selection: manual},
			code:  ErrorInvalidInput,
		},
		{
			name:  "missing timed finish rule",
			input: RaceInput{Kind: RaceByTime, Duration: sourcedDuration(t, 60, manual), AverageLap: sourcedDuration(t, 60, manual), FormationLaps: sourcedLaps(t, 0, manual), PitLoss: sourcedDuration(t, 0, manual), Selection: manual},
			code:  ErrorInvalidInput,
		},
		{
			name:  "unsafe projected laps",
			input: RaceInput{Kind: RaceByTime, Duration: sourcedDuration(t, float64(contract.ManifestV1().MaxSafeInteger), manual), AverageLap: sourcedDuration(t, 0.5, manual), FormationLaps: sourcedLaps(t, 0, manual), PitLoss: sourcedDuration(t, 0, manual), TimedFinish: TimedFinishCurrentLap, Selection: manual},
			code:  ErrorOverflow,
		},
		{
			name:  "pit loss exceeds timed duration",
			input: RaceInput{Kind: RaceByTime, Duration: sourcedDuration(t, 60, manual), AverageLap: sourcedDuration(t, 60, manual), FormationLaps: sourcedLaps(t, 0, manual), PitLoss: sourcedDuration(t, 61, manual), TimedFinish: TimedFinishCurrentLap, Selection: manual},
			code:  ErrorInvalidInput,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := CalculateRace(test.input)
			var calculationErr *CalculationError
			if !errors.As(err, &calculationErr) || calculationErr.Code != test.code {
				t.Fatalf("got %v, want code %s", err, test.code)
			}
		})
	}

	nonFinite := Sourced[contract.DurationSeconds]{Value: contract.DurationSeconds(math.NaN()), Evidence: manual}
	_, err := CalculateRace(RaceInput{Kind: RaceByLaps, TargetLaps: sourcedLaps(t, 1, manual), AverageLap: nonFinite, FormationLaps: sourcedLaps(t, 0, manual), PitLoss: sourcedDuration(t, 0, manual), Selection: manual})
	if err == nil {
		t.Fatal("NaN must fail")
	}
}

func evidence(kind contract.ProvenanceKind, source string, level contract.ConfidenceLevel, basis string) Evidence {
	observedAt := time.Date(2026, time.August, 2, 8, 0, 0, 0, time.UTC)
	return Evidence{
		Provenance: contract.Provenance{Kind: kind, SourceID: source, ObservedAt: &observedAt},
		Confidence: contract.Confidence{Level: level, Basis: basis},
	}
}

func sourcedDuration(t testing.TB, value float64, source Evidence) Sourced[contract.DurationSeconds] {
	t.Helper()
	quantity, err := contract.NewDurationSeconds(value)
	if err != nil {
		t.Fatalf("duration fixture: %v", err)
	}
	return Sourced[contract.DurationSeconds]{Value: quantity, Evidence: source}
}

func sourcedLaps(t testing.TB, value int64, source Evidence) Sourced[contract.LapCount] {
	t.Helper()
	quantity, err := contract.NewLapCount(value)
	if err != nil {
		t.Fatalf("lap fixture: %v", err)
	}
	return Sourced[contract.LapCount]{Value: quantity, Evidence: source}
}
