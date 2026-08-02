package producta

import (
	"errors"
	"fmt"
	"math"
)

const litresPerGallon = 3.785411784

// ErrNonFinite is returned when a numeric strategy value cannot be represented
// as a meaningful finite measurement.
var ErrNonFinite = errors.New("strategy value must be finite")

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

// LitresToGallons converts a volume without rounding the internal result.
func LitresToGallons(litres float64) (float64, error) {
	if !isFinite(litres) {
		return 0, ErrNonFinite
	}
	return litres / litresPerGallon, nil
}

// GallonsToLitres converts a volume without rounding the internal result.
func GallonsToLitres(gallons float64) (float64, error) {
	if !isFinite(gallons) {
		return 0, ErrNonFinite
	}
	return gallons * litresPerGallon, nil
}

// FormatLapTime formats seconds as mm:ss.mmm. Internal precision is rounded
// only for display, so a millisecond carry is handled consistently.
func FormatLapTime(seconds float64) (string, error) {
	if !isFinite(seconds) {
		return "", ErrNonFinite
	}
	if seconds < 0 {
		return "", fmt.Errorf("lap time must not be negative: %v", seconds)
	}

	totalMilliseconds := int64(math.Round(seconds * 1000))
	minutes := totalMilliseconds / 60000
	remaining := totalMilliseconds % 60000
	wholeSeconds := remaining / 1000
	milliseconds := remaining % 1000
	return fmt.Sprintf("%02d:%02d.%03d", minutes, wholeSeconds, milliseconds), nil
}

// RoundRecommendedAmount rounds a display recommendation to the requested
// decimal places while leaving all solver calculations at full precision.
func RoundRecommendedAmount(amount float64, decimals int) (float64, error) {
	if !isFinite(amount) {
		return 0, ErrNonFinite
	}
	if decimals < 0 || decimals > 12 {
		return 0, fmt.Errorf("decimal places out of range: %d", decimals)
	}

	factor := math.Pow10(decimals)
	return math.Round(amount*factor) / factor, nil
}
