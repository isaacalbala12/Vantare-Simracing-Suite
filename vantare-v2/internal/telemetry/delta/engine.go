package delta

import "math"

// ReferenceMode identifies whose best lap is the reference.
type ReferenceMode string

const (
	ModeSelf    ReferenceMode = "self"
	ModeSession ReferenceMode = "session"
	ModeGlobal  ReferenceMode = "global"
)

// LapPoint is a single sample along a lap: the time taken (in seconds)
// to reach a given cumulative distance (in meters).
type LapPoint struct {
	Distance    float64
	TimeIntoLap float64
}

// ReferenceLap is a collection of points describing a complete lap.
type ReferenceLap struct {
	Mode      ReferenceMode
	TrackName string
	CarClass  string
	Points    []LapPoint
	Total     float64 // cached total lap time
}

// NewReferenceLap builds a ReferenceLap and precomputes Total.
func NewReferenceLap(mode ReferenceMode, trackName, carClass string, points []LapPoint) *ReferenceLap {
	total := 0.0
	if len(points) > 0 {
		total = points[len(points)-1].TimeIntoLap
	}
	return &ReferenceLap{Mode: mode, TrackName: trackName, CarClass: carClass, Points: points, Total: total}
}

// ComputeDelta computes the time difference between the current lap point
// and the reference lap at the same distance. Positive means the driver is
// slower than the reference. Returns (0, false) when no comparison is possible.
func ComputeDelta(ref *ReferenceLap, current LapPoint) (float64, bool) {
	if ref == nil || len(ref.Points) == 0 {
		return 0, false
	}
	target := interpolateTime(ref.Points, current.Distance)
	return current.TimeIntoLap - target, true
}

// interpolateTime performs linear interpolation between the two nearest
// reference points around the given distance. Points must be sorted by
// Distance ascending.
func interpolateTime(points []LapPoint, distance float64) float64 {
	n := len(points)
	if n == 0 {
		return 0
	}
	if distance <= points[0].Distance {
		return points[0].TimeIntoLap
	}
	if distance >= points[n-1].Distance {
		return points[n-1].TimeIntoLap
	}
	for i := 1; i < n; i++ {
		if distance < points[i].Distance {
			p0, p1 := points[i-1], points[i]
			segLen := p1.Distance - p0.Distance
			if segLen <= 0 {
				return p0.TimeIntoLap
			}
			ratio := (distance - p0.Distance) / segLen
			return p0.TimeIntoLap + ratio*(p1.TimeIntoLap-p0.TimeIntoLap)
		}
	}
	return points[n-1].TimeIntoLap
}

// interpolateDistance is the inverse of interpolateTime: given a time,
// find the approximate distance on this reference lap. Used for synthetic
// reference construction when only total lap time and track length are known.
func interpolateDistance(points []LapPoint, time float64) float64 {
	n := len(points)
	if n == 0 {
		return 0
	}
	if time <= points[0].TimeIntoLap {
		return points[0].Distance
	}
	if time >= points[n-1].TimeIntoLap {
		return points[n-1].Distance
	}
	for i := 1; i < n; i++ {
		if time < points[i].TimeIntoLap {
			p0, p1 := points[i-1], points[i]
			segLen := p1.TimeIntoLap - p0.TimeIntoLap
			if segLen <= 0 {
				return p0.Distance
			}
			ratio := (time - p0.TimeIntoLap) / segLen
			return p0.Distance + ratio*(p1.Distance-p0.Distance)
		}
	}
	return points[n-1].Distance
}

// SyntheticReference creates a reference lap with evenly-spaced points,
// assuming constant speed throughout the lap. This is an approximation used
// when only total lap time and track length are available (e.g. session/global
// best from the API, which does not provide per-sector distance data).
func SyntheticReference(totalTime, trackLength float64, numPoints int) *ReferenceLap {
	if numPoints < 2 {
		numPoints = 20
	}
	if totalTime <= 0 || trackLength <= 0 {
		return nil
	}
	points := make([]LapPoint, 0, numPoints+1)
	for i := 0; i <= numPoints; i++ {
		d := trackLength * float64(i) / float64(numPoints)
		t := totalTime * float64(i) / float64(numPoints)
		points = append(points, LapPoint{Distance: math.Round(d*100) / 100, TimeIntoLap: math.Round(t*1000) / 1000})
	}
	return NewReferenceLap(ModeSession, "", "", points)
}
