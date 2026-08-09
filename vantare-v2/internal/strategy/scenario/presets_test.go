package scenario

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

// TestBuiltInPresetsValidate verifies that every preset validates successfully.
func TestBuiltInPresetsValidate(t *testing.T) {
	presets := BuiltInPresets()
	assert.True(t, len(presets) > 0, "should have at least one preset")

	for name, set := range presets {
		t.Run(name, func(t *testing.T) {
			err := set.Validate()
			assert.NoError(t, err, "preset %s should validate", name)
		})
	}
}

// TestBuiltInPresetsHaveOrigin verifies that every rule in every preset
// carries a non-empty SourceID with ProvenanceEstimated.
func TestBuiltInPresetsHaveOrigin(t *testing.T) {
	presets := BuiltInPresets()
	assert.True(t, len(presets) > 0, "should have at least one preset")

	for presetName, set := range presets {
		t.Run(presetName, func(t *testing.T) {
			for i, rule := range set.Rules {
				assert.Equal(t, contract.ProvenanceEstimated, rule.Provenance.Kind,
					"preset %s rule %d should have ProvenanceEstimated", presetName, i)
				assert.NotEmpty(t, rule.Provenance.SourceID,
					"preset %s rule %d should have non-empty SourceID", presetName, i)
				assert.Equal(t, "vantare.presets.v1", rule.Provenance.SourceID,
					"preset %s rule %d should have SourceID vantare.presets.v1", presetName, i)
			}
		})
	}
}

// TestWetRacePresetExists verifies the wet-race preset exists.
func TestWetRacePresetExists(t *testing.T) {
	presets := BuiltInPresets()
	_, ok := presets["wet-race"]
	assert.True(t, ok, "wet-race preset should exist")
}

// TestSafetyCarHeavyPresetExists verifies the safety-car-heavy preset exists.
func TestSafetyCarHeavyPresetExists(t *testing.T) {
	presets := BuiltInPresets()
	_, ok := presets["safety-car-heavy"]
	assert.True(t, ok, "safety-car-heavy preset should exist")
}

// TestShortenedRacePresetExists verifies the shortened-race preset exists.
func TestShortenedRacePresetExists(t *testing.T) {
	presets := BuiltInPresets()
	_, ok := presets["shortened-race"]
	assert.True(t, ok, "shortened-race preset should exist")
}
