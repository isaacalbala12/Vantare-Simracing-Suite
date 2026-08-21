// Package geometry is the single authority for Spotter lateral overlap.
package geometry

import "math"

const (
	TrackZoneToConsiderM = 20.0
	CarLengthM           = 4.5
	CarWidthM            = 1.8
	CarBehindExtraM      = 0.4
	GapNeededForClearM   = 0.5
	MinSpotterSpeedMPS   = 10.0
)

type Side string

const (
	SideLeft  Side = "left"
	SideRight Side = "right"
)

type Sensitivity string

const (
	SensitivityConservative Sensitivity = "conservative"
	SensitivityNormal       Sensitivity = "normal"
	SensitivityAggressive   Sensitivity = "aggressive"
)

type Vec3 struct {
	X float64
	Y float64
	Z float64
}

type AlignedOpponent struct {
	X float64
	Z float64
}

type OverlapConfig struct {
	TrackZoneToConsiderM float64
	CarLengthM           float64
	CarWidthM            float64
	CarBehindExtraM      float64
	GapNeededForClearM   float64
}

type OverlapResult struct {
	InOverlap    bool
	Side         Side
	LateralM     float64
	ForwardM     float64
	RejectReason string
}

func DefaultOverlapConfig() OverlapConfig {
	return OverlapConfig{
		TrackZoneToConsiderM: TrackZoneToConsiderM,
		CarLengthM:           CarLengthM,
		CarWidthM:            CarWidthM,
		CarBehindExtraM:      CarBehindExtraM,
		GapNeededForClearM:   GapNeededForClearM,
	}
}

func ConfigForSensitivity(sensitivity Sensitivity) OverlapConfig {
	config := DefaultOverlapConfig()
	switch sensitivity {
	case SensitivityConservative:
		config.CarWidthM = 1.6
		config.CarLengthM = 4.8
	case SensitivityAggressive:
		config.CarWidthM = 2.0
		config.CarLengthM = 4.2
	}
	return config
}

func YawFromForward(forward Vec3) (float64, bool) {
	if !finite(forward.X) || !finite(forward.Z) || (forward.X == 0 && forward.Z == 0) {
		return 0, false
	}
	yaw := math.Atan2(forward.X, forward.Z)
	if yaw < 0 {
		yaw += 2 * math.Pi
	}
	return yaw, true
}

func AlignOpponentXZ(playerYaw float64, player, opponent Vec3) AlignedOpponent {
	rawX := opponent.X - player.X
	rawZ := opponent.Z - player.Z
	cos, sin := math.Cos(playerYaw), math.Sin(playerYaw)
	return AlignedOpponent{X: cos*rawX + sin*rawZ, Z: cos*rawZ - sin*rawX}
}

func ClassifyAlignedOverlap(aligned AlignedOpponent, existingOverlap bool, config OverlapConfig) OverlapResult {
	side := sideFromAlignedX(aligned.X)
	lateral := math.Abs(aligned.X)
	longitudinal := math.Abs(aligned.Z)
	result := OverlapResult{Side: side, LateralM: lateral, ForwardM: longitudinal}
	if !finite(aligned.X) || !finite(aligned.Z) || side == "" {
		result.RejectReason = "centerline"
		return result
	}
	if lateral > config.TrackZoneToConsiderM {
		result.RejectReason = "outside_track_zone"
		return result
	}
	if lateral <= config.CarWidthM {
		result.RejectReason = "inside_min_lateral_gap"
		return result
	}
	if existingOverlap {
		if longitudinal < config.CarLengthM+config.GapNeededForClearM {
			result.InOverlap = true
			return result
		}
		result.RejectReason = "existing_overlap_clear_gap"
		return result
	}
	if aligned.Z <= 0 && -aligned.Z < config.CarLengthM {
		result.InOverlap = true
		return result
	}
	if aligned.Z > 0 && aligned.Z < config.CarLengthM+config.CarBehindExtraM {
		result.InOverlap = true
		return result
	}
	result.RejectReason = "outside_longitudinal_overlap"
	return result
}

func sideFromAlignedX(x float64) Side {
	if x > 0 {
		return SideLeft
	}
	if x < 0 {
		return SideRight
	}
	return ""
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
