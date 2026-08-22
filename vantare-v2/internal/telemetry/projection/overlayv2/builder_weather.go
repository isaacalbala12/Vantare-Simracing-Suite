package overlayv2

import "github.com/vantare/overlays/v2/internal/telemetry/derive"

// BuildWeather projects the weather slice of the Overlay v2 contract.
//
// The canonical LMU state has no admitted weather source today (the strategy
// audit declares every weather.ambient_temperature/track_temperature/rain/wetness
// unsupported and the overlay adapter marks environment as
// unsupported-by-projection). The builder therefore publishes every field as
// missing rather than inventing a default. When a future driver admits a
// weather signal the builder will read it here without changing the wire shape.
func BuildWeather(_ derive.FinalState) WeatherV2 {
	return WeatherV2{
		AmbientC:    missingValue[float64](),
		TrackC:      missingValue[float64](),
		RainPercent: missingValue[float64](),
		WetnessPct:  missingValue[float64](),
		WindKph:     missingValue[float64](),
		WindDir:     missingValue[string](),
		PressureHpa: missingValue[float64](),
	}
}
