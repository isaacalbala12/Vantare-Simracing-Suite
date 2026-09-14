package solver

import (
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/pilotprofile"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func manualDriver(driverID string, lapSeconds, fuelPerLap float64) DriverProfileInput {
	return DriverProfileInput{
		DriverID: driverID,
		Manual: &ManualDriverProfile{
			BaseLapSeconds: lapSeconds, FuelPerLapLiters: fuelPerLap,
			Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "event.driver." + driverID},
			Confidence: sp.Confidence{ComputationVersion: "manual-driver.v1"},
		},
	}
}

func profiledDriver(driverID string, lapSeconds, fuelPerLap float64) DriverProfileInput {
	return DriverProfileInput{
		DriverID: driverID,
		Profile: &pilotprofile.PilotProfileV1{
			ContractVersion: pilotprofile.ContractVersionV1,
			ProfileID:       "profile-" + driverID,
			CombinationID:   "spa-lmgt3",
			Condition:       pilotprofile.ConditionDry,
			DisplayName:     driverID,
			ExportedAt:      time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC),
			Fuel:            pilotprofile.FuelConsumption{MeanPerLap: fuelPerLap, SampleSize: 20},
			Pace:            pilotprofile.Pace{BaseSeconds: lapSeconds, SampleSize: 20},
			Provenance:      pilotprofile.Provenance{Kind: "derived", SourceID: "analysis-" + driverID},
		},
	}
}

func driverBusinessInput() SolverInputV2 {
	input := baseInputV2()
	input.RaceLaps = 8
	input.BaseLapSeconds.Value = 92
	input.FuelCapacityLiters.Value = 8
	input.FuelPerLapLiters.Value = 1
	input.PitCost.TransitSeconds.Value = 1
	input.DriverProfiles = []DriverProfileInput{
		profiledDriver("rapido", 90, 1),
		manualDriver("constante", 92, 1),
	}
	return input
}

func TestSolveV2AssignsFastDriverWhereAvailableAndConstraintForcesSlowerStint(t *testing.T) {
	unrestricted := driverBusinessInput()
	bestPurePace, err := SolveV2(unrestricted)
	if err != nil {
		t.Fatalf("SolveV2 unrestricted: %v", err)
	}
	if !bestPurePace.Feasible || len(bestPurePace.Best.Stints) != 1 || bestPurePace.Best.Stints[0].Driver != "rapido" {
		t.Fatalf("pure pace did not assign the whole race to the fast driver: %+v", bestPurePace.Best)
	}

	restricted := driverBusinessInput()
	restricted.EventRules.DriverLimits = map[string]DriverLimit{
		"rapido": {Unavailable: []UnavailableWindow{{FromLap: 4, ToLap: 5}}},
	}
	bestAvailable, err := SolveV2(restricted)
	if err != nil {
		t.Fatalf("SolveV2 restricted: %v", err)
	}
	if !bestAvailable.Feasible {
		t.Fatalf("restricted plan is infeasible: %+v", bestAvailable.Reasons)
	}
	wantDrivers := []string{"rapido", "constante", "rapido"}
	wantLaps := []int64{3, 2, 3}
	if len(bestAvailable.Best.Stints) != len(wantDrivers) {
		t.Fatalf("stints = %+v", bestAvailable.Best.Stints)
	}
	for index, stint := range bestAvailable.Best.Stints {
		if stint.Driver != wantDrivers[index] || stint.Laps != wantLaps[index] {
			t.Fatalf("stint[%d] = %+v, want driver=%s laps=%d", index, stint, wantDrivers[index], wantLaps[index])
		}
	}
	if bestAvailable.Expected.TotalSeconds <= bestPurePace.Expected.TotalSeconds {
		t.Fatalf("availability did not force the slower pure-pace assignment: restricted=%v unrestricted=%v", bestAvailable.Expected.TotalSeconds, bestPurePace.Expected.TotalSeconds)
	}
}

func TestSolveV2DriverSequenceConstrainsStintsAndAbsentRemainsFree(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.FuelCapacityLiters.Value = 4
	input.FuelPerLapLiters.Value = 1
	input.PitCost.TransitSeconds.Value = 1
	input.DriverProfiles = []DriverProfileInput{
		manualDriver("fast", 90, 1),
		manualDriver("slow", 92, 1),
	}

	free, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	if !free.Feasible || len(free.Best.Stints) != 1 || free.Best.Stints[0].Driver != "fast" {
		t.Fatalf("free driver choice changed: %+v", free.Best.Stints)
	}

	input.DriverSequence = []string{"fast", "slow"}
	sequenced, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	if !sequenced.Feasible || len(sequenced.Best.Stints) != 2 {
		t.Fatalf("sequence did not require its first pass: %+v", sequenced)
	}
	if sequenced.Best.Stints[0].Driver != "fast" || sequenced.Best.Stints[1].Driver != "slow" {
		t.Fatalf("driver sequence = %+v, want fast then slow", sequenced.Best.Stints)
	}
}

func TestSolveV2DriverSequenceRepeatsAndReplayRejectsSwap(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.FuelCapacityLiters.Value = 1
	input.FuelPerLapLiters.Value = 1
	input.PitCost.TransitSeconds.Value = 1
	input.DriverProfiles = []DriverProfileInput{
		manualDriver("a", 90, 1),
		manualDriver("b", 91, 1),
	}
	input.DriverSequence = []string{"a", "b"}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"a", "b", "a", "b"}
	if !result.Feasible || len(result.Best.Stints) != len(want) {
		t.Fatalf("repeated sequence plan = %+v", result)
	}
	for index, driverID := range want {
		if result.Best.Stints[index].Driver != driverID {
			t.Fatalf("stint %d driver = %q, want %q", index, result.Best.Stints[index].Driver, driverID)
		}
	}

	swapped := result.Best
	swapped.Stints = append([]StintDecision(nil), result.Best.Stints...)
	swapped.Stints[0].Driver, swapped.Stints[1].Driver = swapped.Stints[1].Driver, swapped.Stints[0].Driver
	replayed, err := ReplayDecisionV2(input, swapped)
	if err != nil {
		t.Fatal(err)
	}
	if replayed.Feasible || len(replayed.Reasons) == 0 || replayed.Reasons[0].Code != "driver_sequence" {
		t.Fatalf("swapped sequence replay = %+v", replayed)
	}
}

func TestSolveV2DriverSequenceRequiresConfiguredProfiles(t *testing.T) {
	input := baseInputV2()
	input.DriverProfiles = []DriverProfileInput{manualDriver("known", 90, 1)}
	input.DriverSequence = []string{"known", "missing"}
	if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
		t.Fatalf("missing sequence profile error = %v", err)
	}
}

func TestSolveV2DriverSequenceFallsBackFromSingleStintShortcut(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.FuelCapacityLiters.Value = 4
	input.FuelPerLapLiters.Value = 1
	input.PitCost.TransitSeconds.Value = 1_000
	input.DriverProfiles = []DriverProfileInput{manualDriver("solo", input.BaseLapSeconds.Value, input.FuelPerLapLiters.Value)}
	input.DriverSequence = []string{"solo", "solo"}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Feasible || len(result.Best.Stints) != 2 {
		t.Fatalf("sequence must fall back from the one-stint shortcut: %+v", result)
	}
}

func TestSolveV2DriverSequenceKeepsDistinctSequencePositionsDuringPruning(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 3
	input.FuelCapacityLiters.Value = 3
	input.FuelPerLapLiters.Value = 1
	input.PitCost.TransitSeconds.Value = 1
	input.DriverProfiles = []DriverProfileInput{
		manualDriver("a", 90, 1),
		manualDriver("b", 91, 1),
	}
	input.DriverSequence = []string{"a", "a", "b"}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	wantTotal := exhaustiveV2Best(t, input)
	if math.Abs(result.Expected.TotalSeconds-wantTotal) > epsilon {
		t.Fatalf("sequence solver=%v exhaustive=%v", result.Expected.TotalSeconds, wantTotal)
	}
	want := []string{"a", "a", "b"}
	if !result.Feasible || len(result.Best.Stints) != len(want) {
		t.Fatalf("sequence position was lost during pruning: %+v", result)
	}
	for index, driverID := range want {
		if result.Best.Stints[index].Driver != driverID || result.Best.Stints[index].Laps != 1 {
			t.Fatalf("stint %d = %+v, want one lap by %s", index, result.Best.Stints[index], driverID)
		}
	}
}

func TestSolveV2LongIdenticalDriverSequenceUsesScalarShortcut(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 136
	input.BaseLapSeconds.Value = 104
	input.FuelCapacityLiters.Value = 90
	input.FuelPerLapLiters.Value = 2.75
	input.PitCost.TransitSeconds.Value = 64
	input.PitCost.RefuelRateLPerS.Value = 1e12
	input.PitCost.VERatePPerS.Value = 1e12
	input.PitCost.TyreSeconds.Value = 0
	input.DriverProfiles = []DriverProfileInput{
		manualDriver("a", 104, 2.75),
		manualDriver("b", 104, 2.75),
		manualDriver("c", 104, 2.75),
		manualDriver("d", 104, 2.75),
	}
	input.DriverSequence = []string{"a", "b", "c", "d"}

	result, err := SolveV2(input)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Feasible || !result.ComputeStats.WithinBudget || result.ComputeStats.Iterations != 0 {
		t.Fatalf("long cyclic sequence did not use the bounded scalar shortcut: %+v", result.ComputeStats)
	}
	if len(result.Best.Stints) < len(input.DriverSequence) {
		t.Fatalf("result has %d stints, want at least one complete sequence", len(result.Best.Stints))
	}
	for index := range result.Best.Stints {
		driverID := input.DriverSequence[index%len(input.DriverSequence)]
		if result.Best.Stints[index].Driver != driverID {
			t.Fatalf("stint %d driver = %q, want %q", index, result.Best.Stints[index].Driver, driverID)
		}
	}
}

func TestSolveV2UsesConsumptionFromAssignedDriverProfile(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 4
	input.FuelCapacityLiters.Value = 2
	input.FuelPerLapLiters.Value = 0
	input.PitCost.TransitSeconds.Value = 20
	input.DriverProfiles = []DriverProfileInput{
		profiledDriver("rapido", 90, 1),
		manualDriver("eficiente", 93, 0.5),
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	if !result.Feasible || len(result.Best.Stints) != 1 || result.Best.Stints[0].Driver != "eficiente" {
		t.Fatalf("driver consumption did not participate in autonomy and objective: %+v", result)
	}
}

func TestSolveV2DriverHardLimitsAreExplained(t *testing.T) {
	tests := []struct {
		name       string
		limit      DriverLimit
		reasonCode string
	}{
		{name: "unavailable segment", limit: DriverLimit{Unavailable: []UnavailableWindow{{FromLap: 2, ToLap: 2}}}, reasonCode: "driver_unavailable"},
		{name: "continuous time", limit: DriverLimit{MaxContinuousTimeSeconds: floatPointer(179)}, reasonCode: "driver_continuous_time"},
		{name: "total time", limit: DriverLimit{MaxTotalTimeSeconds: floatPointer(179)}, reasonCode: "driver_total_time"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := baseInputV2()
			input.RaceLaps = 2
			input.FuelCapacityLiters.Value = 2
			input.DriverProfiles = []DriverProfileInput{manualDriver("solo", 90, 1)}
			input.EventRules.DriverLimits = map[string]DriverLimit{"solo": test.limit}
			result, err := SolveV2(input)
			if err != nil {
				t.Fatalf("SolveV2: %v", err)
			}
			if result.Feasible || !candidateHasReason(result.CandidateDetails, test.reasonCode) {
				t.Fatalf("reason %q missing from infeasible result: %+v", test.reasonCode, result)
			}
		})
	}
}

func TestSolveV2DriverOracleParityPruningProvenanceAndSensitivity(t *testing.T) {
	input := baseInputV2()
	input.RaceLaps = 5
	input.FuelCapacityLiters.Value = 2
	input.DriverProfiles = []DriverProfileInput{
		profiledDriver("rapido", 89.5, 1),
		manualDriver("constante", 90, 1),
	}
	maxFast := 3
	input.EventRules.DriverLimits = map[string]DriverLimit{
		"rapido": {MaxLaps: int64Pointer(int64(maxFast))},
	}
	result, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2: %v", err)
	}
	want := exhaustiveV2Best(t, input)
	if !result.Feasible || math.Abs(result.Expected.TotalSeconds-want) > epsilon {
		t.Fatalf("solver=%v feasible=%v exhaustive=%v", result.Expected.TotalSeconds, result.Feasible, want)
	}
	if result.ComputeStats.PrunedStates == 0 {
		t.Fatalf("driver state did not demonstrate safe pruning: %+v", result.ComputeStats)
	}
	if len(result.DriverProfileCost) != 2 || result.DriverProfileCost[0].Source != "pilot_profile" || result.DriverProfileCost[1].Provenance.Kind != sp.ProvenanceManual {
		t.Fatalf("driver provenance was not preserved: %+v", result.DriverProfileCost)
	}
	if !hasSensitivity(result.Sensitivities, "driverPaceDeltaSeconds.rapido") {
		t.Fatalf("driver pace sensitivity missing: %+v", result.Sensitivities)
	}
}

func TestSolveV2ImplicitSingleDriverIsNumericallyIdentical(t *testing.T) {
	input := baseInputV2()
	legacy, err := SolveV2(input)
	if err != nil {
		t.Fatalf("SolveV2 implicit: %v", err)
	}
	explicit := input
	explicit.DriverProfiles = []DriverProfileInput{manualDriver("solo", input.BaseLapSeconds.Value, input.FuelPerLapLiters.Value)}
	configured, err := SolveV2(explicit)
	if err != nil {
		t.Fatalf("SolveV2 explicit: %v", err)
	}
	if legacy.Expected != configured.Expected || legacy.ComputeStats.EvaluatedCandidates != configured.ComputeStats.EvaluatedCandidates {
		t.Fatalf("single-driver degeneration changed current calculation: implicit=%+v explicit=%+v", legacy, configured)
	}
}

func TestSolveV2DriverProfilesFailClosed(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*SolverInputV2)
	}{
		{
			name: "duplicate driver",
			mutate: func(input *SolverInputV2) {
				input.DriverProfiles = []DriverProfileInput{manualDriver("same", 90, 1), manualDriver("same", 91, 1)}
			},
		},
		{
			name: "two profile authorities",
			mutate: func(input *SolverInputV2) {
				driver := profiledDriver("driver", 90, 1)
				driver.Manual = manualDriver("driver", 90, 1).Manual
				input.DriverProfiles = []DriverProfileInput{driver}
			},
		},
		{
			name: "limit without profile",
			mutate: func(input *SolverInputV2) {
				input.DriverProfiles = []DriverProfileInput{manualDriver("known", 90, 1)}
				input.EventRules.DriverLimits = map[string]DriverLimit{"unknown": {MaxLaps: int64Pointer(1)}}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := baseInputV2()
			test.mutate(&input)
			if _, err := SolveV2(input); err == nil || !HasErrorCode(err, ErrorInvalidInput) {
				t.Fatalf("SolveV2 error = %v, want invalid input", err)
			}
		})
	}
}

func floatPointer(value float64) *float64 { return &value }
func int64Pointer(value int64) *int64     { return &value }

func candidateHasReason(candidates []SolverCandidateV2, code string) bool {
	for _, candidate := range candidates {
		for _, reason := range candidate.Reasons {
			if reason.Code == code {
				return true
			}
		}
	}
	return false
}

func hasSensitivity(sensitivities []SolverSensitivity, parameter string) bool {
	for _, sensitivity := range sensitivities {
		if sensitivity.Parameter == parameter && sensitivity.Delta == defaultDriverPaceDeltaSensitivity && sensitivity.ImpactSeconds > 0 {
			return true
		}
	}
	return false
}
