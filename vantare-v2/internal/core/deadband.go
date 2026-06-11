package core

import "math"

// ShouldEmit returns true when |curr-prev| exceeds threshold.
func ShouldEmit(prev, curr, threshold float64) bool {
	return math.Abs(curr-prev) > threshold
}

// ThresholdSpeedMPS is ~0.1 km/h expressed in m/s (see V2 doc §7.8).
const ThresholdSpeedMPS = 0.1 / 3.6

// Default thresholds — see docs/V2-STACK-AND-PERFORMANCE.md §7.8
// Prefer ThresholdSpeedMPS for player speed in m/s; ThresholdSpeed is legacy/generic.
const (
	ThresholdSpeed = 0.1
	ThresholdGap   = 0.001
	ThresholdRPM   = 50
	ThresholdFuel  = 0.05
)
