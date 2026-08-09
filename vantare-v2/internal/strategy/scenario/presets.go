package scenario

import (
	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

// BuiltInPresets returns rule sets for common race situations. Every preset
// rule carries provenance naming this catalogue, so a preset can never be
// mistaken for something observed. The caller may modify the returned rule
// sets without affecting the originals, but should typically use them
// read-only to ensure consistent behaviour.
func BuiltInPresets() map[string]RuleSet {
	estimatedProvenance := contract.Provenance{
		Kind:     contract.ProvenanceEstimated,
		SourceID: "vantare.presets.v1",
	}

	wetRace := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:         "wet_weather",
				Effect:     EffectWeather,
				Provenance: estimatedProvenance,
				Weather: &WeatherRule{
					LapTimeMultiplier:     1.15,
					DegradationMultiplier: 0.8,
					TyreLifeMultiplier:    1.3,
				},
			},
		},
	}

	safetyCarHeavy := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:         "sc_period_1",
				Effect:     EffectSafetyCar,
				Provenance: estimatedProvenance,
				SafetyCar: &SafetyCarRule{
					Laps:              8,
					LapTimeMultiplier: 1.3,
					PitLossMultiplier: 0.3,
				},
			},
			{
				ID:         "sc_period_2",
				Effect:     EffectSafetyCar,
				Provenance: estimatedProvenance,
				SafetyCar: &SafetyCarRule{
					Laps:              6,
					LapTimeMultiplier: 1.3,
					PitLossMultiplier: 0.3,
				},
			},
		},
	}

	shortenedRace := RuleSet{
		Version: RuleSetVersionV1,
		Rules: []Rule{
			{
				ID:         "shortened_distance",
				Effect:     EffectRaceLength,
				Provenance: estimatedProvenance,
				RaceLength: &RaceLengthRule{
					RaceLaps: 40,
				},
			},
		},
	}

	return map[string]RuleSet{
		"wet-race":         wetRace,
		"safety-car-heavy": safetyCarHeavy,
		"shortened-race":   shortenedRace,
	}
}
