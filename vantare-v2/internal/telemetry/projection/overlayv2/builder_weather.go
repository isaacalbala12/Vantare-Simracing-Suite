package overlayv2

import (
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

// BuildWeather projects the weather slice of the Overlay v2 contract.
//
// AmbientC and TrackC read the canonical REST-joined sessionInfo temperatures
// admitted from the LMU driver (ISA-1106), preserving missing/stale/invalid
// per field. The forecast nodes of /rest/sessions/weather are configuration,
// never a current reading, so they stay out of this builder. Rain severity and average path wetness are fractions.
// Wind, direction and pressure remain missing: no demonstrated REST units, cardinal orientation or pressure
// source is inferred from the vector or forecast.
func BuildWeather(final derive.FinalState) WeatherV2 {
	return WeatherV2{
		AmbientC:    qualityValue(final.Observed.AmbientTemp, func(value weather.Temperature) float64 { return float64(value) }),
		TrackC:      qualityValue(final.Observed.TrackTemp, func(value weather.Temperature) float64 { return float64(value) }),
		RainPercent: qualityValue(final.Observed.RainFraction, func(value weather.Fraction) float64 { return float64(value) * 100 }),
		WetnessPct:  qualityValue(final.Observed.WetnessFraction, func(value weather.Fraction) float64 { return float64(value) * 100 }),
		WindKph:     missingValue[float64](),
		WindDir:     missingValue[string](),
		PressureHpa: missingValue[float64](),
	}
}
