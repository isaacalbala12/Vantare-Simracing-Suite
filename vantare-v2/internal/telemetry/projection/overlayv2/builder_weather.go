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
// never a current reading, so they stay out of this builder. Rain, wetness,
// wind and pressure remain missing until a demonstrated source exists; the
// wire shape does not change when they arrive.
func BuildWeather(final derive.FinalState) WeatherV2 {
	return WeatherV2{
		AmbientC:    qualityValue(final.Observed.AmbientTemp, func(value weather.Temperature) float64 { return float64(value) }),
		TrackC:      qualityValue(final.Observed.TrackTemp, func(value weather.Temperature) float64 { return float64(value) }),
		RainPercent: missingValue[float64](),
		WetnessPct:  missingValue[float64](),
		WindKph:     missingValue[float64](),
		WindDir:     missingValue[string](),
		PressureHpa: missingValue[float64](),
	}
}
