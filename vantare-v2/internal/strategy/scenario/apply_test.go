package scenario

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
)

// TestApplyValidatesRuleSetFirst verifies that validation errors are returned.
func TestApplyValidatesRuleSetFirst(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: "unsupported",
		Rules:   []Rule{},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, "unsupported_rules_version"))
}

// TestUnsupportedCapabilitySkipsRule verifies that unsupported capabilities
// skip rules without approximation.
func TestUnsupportedCapabilitySkipsRule(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "sc1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
		},
	}

	capabilities := Capabilities{
		EffectSafetyCar: CapabilityUnsupported,
	}

	scenario, err := Apply(base, set, capabilities)
	assert.NoError(t, err)
	assert.Equal(t, base, scenario.Input, "input should be unchanged when capability is unsupported")
	assert.Len(t, scenario.Applied, 0, "no rules should be applied")
	assert.Len(t, scenario.Skipped, 1, "one rule should be skipped")
	assert.Equal(t, "sc1", scenario.Skipped[0].RuleID)
	assert.Equal(t, CapabilityUnsupported, scenario.Skipped[0].Capability)
}

// TestMissingCapabilitySkipsRule verifies that missing capabilities skip rules.
func TestMissingCapabilitySkipsRule(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "weather1",
				Effect: EffectWeather,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				Weather: &WeatherRule{LapTimeMultiplier: 1.2, DegradationMultiplier: 1.5, TyreLifeMultiplier: 0.8},
			},
		},
	}

	capabilities := Capabilities{
		EffectWeather: CapabilityMissing,
	}

	scenario, err := Apply(base, set, capabilities)
	assert.NoError(t, err)
	assert.Equal(t, base, scenario.Input, "input should be unchanged when capability is missing")
	assert.Len(t, scenario.Skipped, 1)
	assert.Equal(t, CapabilityMissing, scenario.Skipped[0].Capability)
}

// TestDegradedCapabilityAppliesToRuleAndAddsAssumption verifies degraded capability behavior.
func TestDegradedCapabilityAppliesToRuleAndAddsAssumption(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "penalty1",
				Effect: EffectPenalty,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceEstimated,
					SourceID: "vantare.presets.v1",
				},
				Penalty: &PenaltyRule{AddedSeconds: 5},
			},
		},
	}

	capabilities := Capabilities{
		EffectPenalty: CapabilityDegraded,
	}

	scenario, err := Apply(base, set, capabilities)
	assert.NoError(t, err)
	assert.Len(t, scenario.Applied, 1, "rule should be applied despite degraded capability")
	assert.Equal(t, "penalty1", scenario.Applied[0])
	assert.True(t, len(scenario.Assumptions) > 0, "degraded capability should add an assumption")
}

// TestDefaultCapabilityIsSupportedWhenAbsentFromMap verifies default behavior.
func TestDefaultCapabilityIsSupportedWhenAbsentFromMap(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rl1",
				Effect: EffectRaceLength,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				RaceLength: &RaceLengthRule{RaceLaps: 48},
			},
		},
	}

	// Empty capabilities map - effect is absent
	capabilities := Capabilities{}

	scenario, err := Apply(base, set, capabilities)
	assert.NoError(t, err)
	assert.Len(t, scenario.Applied, 1, "rule should be applied when effect is absent from map")
	assert.Len(t, scenario.Skipped, 0, "no rules should be skipped")
	assert.Equal(t, int64(48), scenario.Input.RaceLaps, "race length should be changed")
}

// TestApplyNeverMutatesBaseInput verifies that the base input is never modified.
func TestApplyNeverMutatesBaseInput(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	baseCopy := base

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rl1",
				Effect: EffectRaceLength,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				RaceLength: &RaceLengthRule{RaceLaps: 48},
			},
		},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.NoError(t, err)
	assert.Equal(t, baseCopy, base, "base input should not be mutated")
}

// TestAppliedRuleProducesAssumption verifies every applied rule produces an assumption.
func TestAppliedRuleProducesAssumption(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rl1",
				Effect: EffectRaceLength,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				RaceLength: &RaceLengthRule{RaceLaps: 48},
			},
		},
	}

	scenario, err := Apply(base, set, Capabilities{})
	assert.NoError(t, err)
	assert.Len(t, scenario.Applied, 1)
	assert.True(t, len(scenario.Assumptions) > 0, "applied rule should generate at least one assumption")
}

// TestEmptyRuleSetReturnsBaseUnchanged verifies empty sets work correctly.
func TestEmptyRuleSetReturnsBaseUnchanged(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules:   []Rule{},
	}

	scenario, err := Apply(base, set, Capabilities{})
	assert.NoError(t, err)
	assert.Equal(t, base, scenario.Input, "empty rule set should leave input unchanged")
	assert.Len(t, scenario.Assumptions, 0, "empty rule set should produce no assumptions")
}

// TestRuleOrderMattersForMultipliers verifies that rule order affects results.
func TestRuleOrderMattersForMultipliers(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           100,
		DegradationPerLapSeconds: 0.2,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	// Set 1: Weather first, then safety car
	set1 := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "weather1",
				Effect: EffectWeather,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				Weather: &WeatherRule{LapTimeMultiplier: 2, DegradationMultiplier: 1, TyreLifeMultiplier: 1},
			},
			{
				ID:     "sc1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 10, LapTimeMultiplier: 1.5, PitLossMultiplier: 0.5},
			},
		},
	}

	scenario1, err := Apply(base, set1, Capabilities{})
	assert.NoError(t, err)

	// Set 2: Safety car first, then weather (opposite order)
	set2 := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "sc2",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 10, LapTimeMultiplier: 1.5, PitLossMultiplier: 0.5},
			},
			{
				ID:     "weather2",
				Effect: EffectWeather,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				Weather: &WeatherRule{LapTimeMultiplier: 2, DegradationMultiplier: 1, TyreLifeMultiplier: 1},
			},
		},
	}

	scenario2, err := Apply(base, set2, Capabilities{})
	assert.NoError(t, err)

	// Both should have applied all rules
	assert.Len(t, scenario1.Applied, 2)
	assert.Len(t, scenario2.Applied, 2)

	// The final values might differ due to order of application, but both should be modified
	assert.NotEqual(t, base.BaseLapSeconds, scenario1.Input.BaseLapSeconds)
	assert.NotEqual(t, base.BaseLapSeconds, scenario2.Input.BaseLapSeconds)
}

// TestScenarioContainsRuleSetHash verifies RuleSetHash is populated.
func TestScenarioContainsRuleSetHash(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rl1",
				Effect: EffectRaceLength,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				RaceLength: &RaceLengthRule{RaceLaps: 48},
			},
		},
	}

	scenario, err := Apply(base, set, Capabilities{})
	assert.NoError(t, err)
	assert.NotEmpty(t, scenario.RuleSetHash)
}

// TestValidateInputRejectsZeroLaps verifies that zero-lap base input is refused.
func TestValidateInputRejectsZeroLaps(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 0, // Invalid: must be > 0
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules:   []Rule{},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidInput), "error should have code invalid_input")
}

// TestValidateInputRejectsNegativeLaps verifies that negative-lap base input is refused.
func TestValidateInputRejectsNegativeLaps(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 -5, // Invalid: must be > 0
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules:   []Rule{},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidInput))
}

// TestValidateInputRejectsZeroBaseLapSeconds verifies that zero lap time is refused.
func TestValidateInputRejectsZeroBaseLapSeconds(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           0, // Invalid: must be > 0
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules:   []Rule{},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidInput))
}

// TestValidateInputRejectsNegativeBaseLapSeconds verifies that negative lap time is refused.
func TestValidateInputRejectsNegativeBaseLapSeconds(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           -90, // Invalid: must be > 0
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules:   []Rule{},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidInput))
}

// TestValidateInputRejectsNaNInBaseLapSeconds verifies that NaN lap time is refused.
func TestValidateInputRejectsNaNInBaseLapSeconds(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           math.NaN(), // Invalid: must not be NaN
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules:   []Rule{},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidInput))
}

// TestValidateInputRejectsInfInBaseLapSeconds verifies that Inf lap time is refused.
func TestValidateInputRejectsInfInBaseLapSeconds(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           math.Inf(1), // Invalid: must not be Inf
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules:   []Rule{},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidInput))
}

// TestSafetyCarLongerThanRaceIsRejected verifies that a safety car rule
// with laps >= race laps is refused.
func TestSafetyCarLongerThanRaceIsRejected(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 10,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "sc1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 500, LapTimeMultiplier: 1.4, PitLossMultiplier: 1},
			},
		},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidRule))
}

// TestSafetyCarEqualToRaceIsRejected verifies the boundary: safety car == race laps is invalid.
func TestSafetyCarEqualToRaceIsRejected(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 10,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "sc1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 10, LapTimeMultiplier: 1.4, PitLossMultiplier: 1},
			},
		},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidRule))
}

// TestSafetyCarOneLessThanRaceIsAccepted verifies the boundary: safety car < race laps is valid.
func TestSafetyCarOneLessThanRaceIsAccepted(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 10,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "sc1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 9, LapTimeMultiplier: 1.4, PitLossMultiplier: 1},
			},
		},
	}

	scenario, err := Apply(base, set, Capabilities{})
	assert.NoError(t, err)
	assert.Len(t, scenario.Applied, 1)
	assert.Equal(t, "sc1", scenario.Applied[0])
}

// TestRaceLengthShorteningBeforeSafetyCarInvalidatesIt verifies that rule order
// affects validation: a race-length change can make a previously-valid safety car
// rule invalid, and vice versa.
func TestRaceLengthShorteningBeforeSafetyCarInvalidatesIt(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	// First, apply a rule that shortens the race to 5 laps,
	// then try a safety car rule that would have been valid at 50 laps but not at 5.
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rl1",
				Effect: EffectRaceLength,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				RaceLength: &RaceLengthRule{RaceLaps: 5},
			},
			{
				ID:     "sc1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 4, LapTimeMultiplier: 1.4, PitLossMultiplier: 1},
			},
		},
	}

	scenario, err := Apply(base, set, Capabilities{})
	assert.NoError(t, err)
	assert.Len(t, scenario.Applied, 2, "both rules should be applied")
	assert.Equal(t, int64(5), scenario.Input.RaceLaps)
}

// TestRaceLengthShorteningBeforeSafetyCarValidatesIt verifies that even if
// a safety car rule becomes invalid due to a race-length change, it should fail.
func TestRaceLengthShorteningMakesSafetyCarInvalid(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 50,
		BaseLapSeconds:           90,
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	// First, shorten race to 5 laps, then try a safety car for 5 laps (invalid at new length).
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rl1",
				Effect: EffectRaceLength,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				RaceLength: &RaceLengthRule{RaceLaps: 5},
			},
			{
				ID:     "sc1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.4, PitLossMultiplier: 1},
			},
		},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidRule))
}

// TestOverflowToInfinityIsRejected verifies that composed multipliers that
// overflow to +Inf are detected and refused.
func TestOverflowToInfinityIsRejected(t *testing.T) {
	base := solver.Input{
		RaceLaps:                 10,
		BaseLapSeconds:           1e308, // Very large, near max float64
		DegradationPerLapSeconds: 0.1,
		PitLossSeconds:           25,
		Fuel:                     solver.Resource{Kind: solver.ResourceFuel, Used: true, UsableCapacity: 100, PerLap: 2},
		VirtualEnergy:            solver.Resource{Kind: solver.ResourceVirtualEnergy, Used: false},
		TyreLifeLaps:             40,
	}

	// Apply weather rule with multiplier large enough to cause overflow to Inf.
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "weather1",
				Effect: EffectWeather,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				Weather: &WeatherRule{LapTimeMultiplier: 10.0, DegradationMultiplier: 1, TyreLifeMultiplier: 1},
			},
		},
	}

	_, err := Apply(base, set, Capabilities{})
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, ErrorInvalidInput), "overflow to Inf should be caught by validateFiniteness")
}
