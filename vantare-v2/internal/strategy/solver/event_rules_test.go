package solver

import (
	"math"
	"testing"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestEventRulesValidateWithoutInventingRaceContext(t *testing.T) {
	minus, one, two := -1, 1, 2
	nan := math.NaN()
	for _, tc := range []struct {
		name  string
		rules EventRules
		valid bool
	}{
		{"empty", EventRules{}, true},
		{"future window", EventRules{RequiredWindows: []PitWindow{{FromLap: 30, ToLap: 40}}}, true},
		{"driver without observations", EventRules{DriverLimits: map[string]DriverLimit{"d1": {}}}, true},
		{"negative minimum", EventRules{MinPitStops: &minus}, false},
		{"reversed stops", EventRules{MinPitStops: &two, MaxPitStops: &one}, false},
		{"zero window", EventRules{RequiredWindows: []PitWindow{{FromLap: 0, ToLap: 1}}}, false},
		{"too many windows", EventRules{RequiredWindows: make([]PitWindow, 65)}, false},
		{"invalid compound", EventRules{MandatoryCompounds: []TyreCompound{"unknown"}}, false},
		{"missing driver", EventRules{DriverLimits: map[string]DriverLimit{"": {}}}, false},
		{"nonfinite time", EventRules{DriverLimits: map[string]DriverLimit{"d1": {MaxTotalTimeSeconds: &nan}}}, false},
		{"empty climate", EventRules{AllowedCompoundsByClimate: map[sp.ClimateBucket][]TyreCompound{sp.ClimateBucketDry: {}}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.rules.Validate()
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v error=%v", tc.valid, err)
			}
		})
	}
}
