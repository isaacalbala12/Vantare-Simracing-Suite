package scenario

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

// TestRuleWithoutProvenanceIsRefused verifies that a rule whose
// Provenance.Kind is empty or ProvenanceUnknown is rejected.
func TestRuleWithoutProvenanceIsRefused(t *testing.T) {
	tests := []struct {
		name      string
		rule      Rule
		wantError bool
	}{
		{
			name: "rule with empty provenance kind",
			rule: Rule{
				ID:     "test1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind: "", // Empty is invalid
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
			wantError: true,
		},
		{
			name: "rule with unknown provenance kind",
			rule: Rule{
				ID:     "test2",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind: contract.ProvenanceUnknown,
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
			wantError: true,
		},
		{
			name: "rule with valid provenance kind",
			rule: Rule{
				ID:     "test3",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
			wantError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set := RuleSet{
				Version: RuleSetVersionV1,
				Rules:   []Rule{tt.rule},
			}
			err := set.Validate()
			if tt.wantError {
				assert.Error(t, err)
				assert.True(t, HasErrorCode(err, "rule_without_origin"), "expected rule_without_origin error")
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestDuplicateRuleIDIsRefused verifies that rule IDs must be unique within a set.
func TestDuplicateRuleIDIsRefused(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "duplicate",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
			{
				ID:     "duplicate",
				Effect: EffectWeather,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				Weather: &WeatherRule{LapTimeMultiplier: 1.2, DegradationMultiplier: 1.3, TyreLifeMultiplier: 0.9},
			},
		},
	}
	err := set.Validate()
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, "duplicate_rule"), "expected duplicate_rule error")
}

// TestRuleWithNoPayloadIsRefused verifies that exactly one payload must be set.
func TestRuleWithNoPayloadIsRefused(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "no_payload",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				// All payloads are nil
			},
		},
	}
	err := set.Validate()
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, "invalid_rule"), "expected invalid_rule error")
}

// TestRuleWithTwoPayloadsIsRefused verifies that exactly one payload must be set.
func TestRuleWithTwoPayloadsIsRefused(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "two_payloads",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
				Weather:   &WeatherRule{LapTimeMultiplier: 1.2, DegradationMultiplier: 1.3, TyreLifeMultiplier: 0.9},
			},
		},
	}
	err := set.Validate()
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, "invalid_rule"), "expected invalid_rule error")
}

// TestPayloadMustMatchEffect verifies that the payload type matches the Effect.
func TestPayloadMustMatchEffect(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "mismatch",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				// Setting Weather payload when Effect is SafetyCar
				Weather: &WeatherRule{LapTimeMultiplier: 1.2, DegradationMultiplier: 1.3, TyreLifeMultiplier: 0.9},
			},
		},
	}
	err := set.Validate()
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, "invalid_rule"), "expected invalid_rule error")
}

// TestSafetyCarRuleBoundsValidation verifies numeric constraints.
func TestSafetyCarRuleBoundsValidation(t *testing.T) {
	tests := []struct {
		name      string
		rule      SafetyCarRule
		wantError bool
	}{
		{
			name:      "valid safety car rule",
			rule:      SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			wantError: false,
		},
		{
			name:      "lap time multiplier less than 1",
			rule:      SafetyCarRule{Laps: 5, LapTimeMultiplier: 0.9, PitLossMultiplier: 0.5},
			wantError: true,
		},
		{
			name:      "pit loss multiplier negative",
			rule:      SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: -0.1},
			wantError: true,
		},
		{
			name:      "pit loss multiplier greater than 1",
			rule:      SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 1.5},
			wantError: true,
		},
		{
			name:      "zero laps",
			rule:      SafetyCarRule{Laps: 0, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			wantError: true,
		},
		{
			name:      "NaN in lap time multiplier",
			rule:      SafetyCarRule{Laps: 5, LapTimeMultiplier: math.NaN(), PitLossMultiplier: 0.5},
			wantError: true,
		},
		{
			name:      "Inf in pit loss multiplier",
			rule:      SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: math.Inf(1)},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set := RuleSet{
				Version: RuleSetVersionV1,
				Rules: []Rule{
					{
						ID:     "test",
						Effect: EffectSafetyCar,
						Provenance: contract.Provenance{
							Kind:     contract.ProvenanceObserved,
							SourceID: "telemetry",
						},
						SafetyCar: &tt.rule,
					},
				},
			}
			err := set.Validate()
			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestWeatherRuleBoundsValidation verifies numeric constraints.
func TestWeatherRuleBoundsValidation(t *testing.T) {
	tests := []struct {
		name      string
		rule      WeatherRule
		wantError bool
	}{
		{
			name:      "valid weather rule",
			rule:      WeatherRule{LapTimeMultiplier: 1.2, DegradationMultiplier: 1.3, TyreLifeMultiplier: 0.9},
			wantError: false,
		},
		{
			name:      "lap time multiplier zero",
			rule:      WeatherRule{LapTimeMultiplier: 0, DegradationMultiplier: 1.3, TyreLifeMultiplier: 0.9},
			wantError: true,
		},
		{
			name:      "degradation multiplier negative",
			rule:      WeatherRule{LapTimeMultiplier: 1.2, DegradationMultiplier: -0.5, TyreLifeMultiplier: 0.9},
			wantError: true,
		},
		{
			name:      "tyre life multiplier negative",
			rule:      WeatherRule{LapTimeMultiplier: 1.2, DegradationMultiplier: 1.3, TyreLifeMultiplier: -0.1},
			wantError: true,
		},
		{
			name:      "NaN in any field",
			rule:      WeatherRule{LapTimeMultiplier: math.NaN(), DegradationMultiplier: 1.3, TyreLifeMultiplier: 0.9},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set := RuleSet{
				Version: RuleSetVersionV1,
				Rules: []Rule{
					{
						ID:     "test",
						Effect: EffectWeather,
						Provenance: contract.Provenance{
							Kind:     contract.ProvenanceObserved,
							SourceID: "telemetry",
						},
						Weather: &tt.rule,
					},
				},
			}
			err := set.Validate()
			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestRaceLengthRuleBoundsValidation verifies numeric constraints.
func TestRaceLengthRuleBoundsValidation(t *testing.T) {
	tests := []struct {
		name      string
		rule      RaceLengthRule
		wantError bool
	}{
		{
			name:      "valid race length",
			rule:      RaceLengthRule{RaceLaps: 50},
			wantError: false,
		},
		{
			name:      "zero laps",
			rule:      RaceLengthRule{RaceLaps: 0},
			wantError: true,
		},
		{
			name:      "negative laps",
			rule:      RaceLengthRule{RaceLaps: -10},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set := RuleSet{
				Version: RuleSetVersionV1,
				Rules: []Rule{
					{
						ID:     "test",
						Effect: EffectRaceLength,
						Provenance: contract.Provenance{
							Kind:     contract.ProvenanceObserved,
							SourceID: "telemetry",
						},
						RaceLength: &tt.rule,
					},
				},
			}
			err := set.Validate()
			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestPenaltyRuleBoundsValidation verifies numeric constraints.
func TestPenaltyRuleBoundsValidation(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "test",
				Effect: EffectPenalty,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				Penalty: &PenaltyRule{AddedSeconds: math.NaN()},
			},
		},
	}
	err := set.Validate()
	assert.Error(t, err, "NaN should be rejected")
}

// TestDamageRuleBoundsValidation verifies numeric constraints.
func TestDamageRuleBoundsValidation(t *testing.T) {
	tests := []struct {
		name      string
		rule      DamageRule
		wantError bool
	}{
		{
			name:      "valid damage rule",
			rule:      DamageRule{RepairSeconds: 10.5, AdditionalPitStops: 2},
			wantError: false,
		},
		{
			name:      "negative repair seconds",
			rule:      DamageRule{RepairSeconds: -5, AdditionalPitStops: 1},
			wantError: true,
		},
		{
			name:      "negative additional stops",
			rule:      DamageRule{RepairSeconds: 10, AdditionalPitStops: -1},
			wantError: true,
		},
		{
			name:      "NaN repair seconds",
			rule:      DamageRule{RepairSeconds: math.NaN(), AdditionalPitStops: 1},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set := RuleSet{
				Version: RuleSetVersionV1,
				Rules: []Rule{
					{
						ID:     "test",
						Effect: EffectDamage,
						Provenance: contract.Provenance{
							Kind:     contract.ProvenanceObserved,
							SourceID: "telemetry",
						},
						Damage: &tt.rule,
					},
				},
			}
			err := set.Validate()
			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestUnsupportedVersionIsRefused verifies version validation.
func TestUnsupportedVersionIsRefused(t *testing.T) {
	set := RuleSet{
		Version: "strategy.rules.v99",
		Rules:   []Rule{},
	}
	err := set.Validate()
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, "unsupported_rules_version"))
}

// TestRuleIDMustBeNonEmpty verifies that empty IDs are rejected.
func TestRuleIDMustBeNonEmpty(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
		},
	}
	err := set.Validate()
	assert.Error(t, err)
	assert.True(t, HasErrorCode(err, "invalid_rule"))
}

// TestHashIsStableAcrossRuns verifies that Hash produces consistent results.
func TestHashIsStableAcrossRuns(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rule1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
		},
	}

	hash1, err := set.Hash()
	assert.NoError(t, err)

	hash2, err := set.Hash()
	assert.NoError(t, err)

	assert.Equal(t, hash1, hash2, "hash should be stable across runs")
}

// TestHashDiffersWhenRuleChanges verifies that Hash differs when rules change.
func TestHashDiffersWhenRuleChanges(t *testing.T) {
	set1 := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rule1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
		},
	}

	set2 := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rule1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 10, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
		},
	}

	hash1, err := set1.Hash()
	assert.NoError(t, err)

	hash2, err := set2.Hash()
	assert.NoError(t, err)

	assert.NotEqual(t, hash1, hash2, "hash should differ when rules change")
}

// TestStaleDetectsChanges verifies Stale reports correctly.
func TestStaleDetectsChanges(t *testing.T) {
	set := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:     "rule1",
				Effect: EffectSafetyCar,
				Provenance: contract.Provenance{
					Kind:     contract.ProvenanceObserved,
					SourceID: "telemetry",
				},
				SafetyCar: &SafetyCarRule{Laps: 5, LapTimeMultiplier: 1.1, PitLossMultiplier: 0.5},
			},
		},
	}

	hash, err := set.Hash()
	assert.NoError(t, err)

	stale, err := Stale(hash, set)
	assert.NoError(t, err)
	assert.False(t, stale, "same set should not be stale")

	// Modify the set
	set.Rules[0].SafetyCar.Laps = 10

	stale, err = Stale(hash, set)
	assert.NoError(t, err)
	assert.True(t, stale, "modified set should be stale")
}
