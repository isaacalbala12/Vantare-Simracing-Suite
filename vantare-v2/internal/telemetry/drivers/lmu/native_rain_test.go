package lmu

import (
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

func TestNativeRainSeverityUsesAdmittedScoringHeader(t *testing.T) {
	// SDK ScoringInfoV01: mRaining relative220, LMU wrapper starts1632.
	for _, value := range []float64{0, 0.25, 1, -1, 1.1, math.NaN(), math.Inf(1)} {
		buffer := knownBuffer(t)
		writeFloat64(buffer, 1852, value)
		wall := time.Unix(100, 0).UTC()
		parsed, err := parseSupported(buffer, wall)
		if err != nil {
			t.Fatal(err)
		}
		valid := finite(value) && value >= 0 && value <= 1
		if valid {
			assertFieldValue(t, parsed.RainFraction, weather.Fraction(value))
			fusion := new(Fusion)
			merged := fusion.Merge(wall, 0, parsed)
			assertFieldValue(t, merged.RainFraction, weather.Fraction(value))
			stale := withFreshness(parsed, schema.FreshnessStale)
			if stale.RainFraction.Freshness() != schema.FreshnessStale {
				t.Fatal("stale rain became fresh")
			}
		} else if parsed.RainFraction.Freshness() != schema.FreshnessInvalid {
			t.Fatalf("invalid rain %v became available", value)
		}
	}
}
