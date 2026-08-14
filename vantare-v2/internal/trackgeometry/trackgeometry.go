// Package trackgeometry turns recorded LMU telemetry samples into a closed
// circuit outline in world coordinates.
//
// This is offline pack authoring, not runtime: no product path imports it, so
// it never reaches the shipped binary. It lives under internal so CI exercises
// it and so its tests can read the real fixtures in testdata.
//
// Nothing here performs I/O. Callers supply samples already extracted from a
// session, which keeps the logic testable and keeps this package free of any
// coupling to DuckDB. Reading sessions is the job of
// internal/telemetryanalysis/duckdbadapter, which must not be duplicated.
package trackgeometry

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

// LMU records vehicle position in its telemetry as pseudo-geographic degrees
// anchored at 60N, 0E. The mapping onto the world plane used by the shared
// memory carries no rotation, no reflection and no translation, so a single
// constant converts it.
//
// The constant was fitted against the 44-vehicle fixture in
// testdata/lmu-fixture.bin, averaged over every lap of a real session: 1.07 m
// RMS, rotation 0.00 degrees, translation under 0.15 m. Its own precision is
// only about 0.3%, because the residual is dominated by how far each car sits
// from the recorded line rather than by scale; anything from 110950 to 111320
// fits the evidence about equally well. That is around 14 m over a 4.6 km lap,
// which is invisible in an outline and would only matter if absolute placement
// ever needed sub-metre accuracy.
const (
	anchorLatitude  = 60.0
	metresPerDegree = 111200.0
)

// Point is a position on the ground plane in world metres, matching the axes of
// scoring.world_position.
type Point struct {
	X float64
	Z float64
}

// Sample is one recorded telemetry frame.
type Sample struct {
	LapDistance float64
	Latitude    float64
	Longitude   float64
	InPit       bool
}

type Options struct {
	// BinMetres is the lap-distance resolution the outline is averaged onto.
	BinMetres float64
	// MinimumCoverage is the fraction of bins that must contain a sample before
	// an outline is accepted. Gaps are rejected rather than interpolated.
	MinimumCoverage float64
	// MaximumRegression is the largest backwards jump in lap distance tolerated
	// within a lap before it is discarded as a reset or a rewind.
	MaximumRegression float64
	// LapLength is the length a full lap must reach, in metres. Callers that
	// read a whole session know it and should pass it, because a run judged
	// only against the samples it came from always looks complete: half a lap
	// in isolation reaches its own maximum. Zero derives it from where lap
	// distance was seen wrapping back to the line.
	LapLength float64
	// MaximumDispersion is how far, in metres, laps may disagree about where a
	// point on the track is before the outline is rejected. It catches a bin
	// that mixes two physically distinct paths, such as the track and the pit
	// lane running alongside it. Zero disables the check.
	MaximumDispersion float64
	// SmoothingWindow is how many neighbouring points are averaged around the
	// closed outline. Bins hold few samples on fast sections, so consecutive
	// points can alternate between the lines of different laps; left alone that
	// zig-zag inflates the outline well past the real lap length. A window of 1
	// disables smoothing.
	SmoothingWindow int
}

func DefaultOptions() Options {
	return Options{BinMetres: 10, MinimumCoverage: 0.98, MaximumRegression: 5, SmoothingWindow: 5}
}

type Result struct {
	Points           []Point
	Laps             int
	Coverage         float64
	IntegratedLength float64
	LapDistanceSpan  float64
	// Dispersion is the widest disagreement between laps, in metres.
	Dispersion float64
}

var (
	ErrNoCompleteLap     = errors.New("trackgeometry: no complete lap in samples")
	ErrCoverageTooLow    = errors.New("trackgeometry: outline has gaps")
	ErrInvalidOptions    = errors.New("trackgeometry: invalid options")
	ErrDegenerateOutline = errors.New("trackgeometry: outline has no extent")
	ErrLapsDisagree      = errors.New("trackgeometry: laps disagree about the track")
)

// WorldPosition converts LMU's pseudo-geographic telemetry coordinates into the
// world plane. Longitude is scaled by cos(anchor latitude) so both axes share
// one linear metre.
func WorldPosition(latitude, longitude float64) Point {
	return Point{
		X: longitude * math.Cos(anchorLatitude*math.Pi/180) * metresPerDegree,
		Z: (latitude - anchorLatitude) * metresPerDegree,
	}
}

// Build averages every complete lap in the samples onto a shared lap-distance
// grid and returns the resulting closed outline.
func Build(samples []Sample, options Options) (Result, error) {
	if !(options.BinMetres > 0) || options.MinimumCoverage < 0 || options.MinimumCoverage > 1 ||
		options.MaximumRegression < 0 || options.LapLength < 0 || options.MaximumDispersion < 0 || options.SmoothingWindow < 0 {
		return Result{}, ErrInvalidOptions
	}

	kept := usable(samples)
	span := options.LapLength
	if span <= 0 {
		span = wrapDistance(kept, options.MaximumRegression)
	}

	laps := completeLaps(kept, options.MaximumRegression, span)
	if len(laps) == 0 {
		return Result{}, ErrNoCompleteLap
	}

	binCount := int(math.Ceil(span / options.BinMetres))
	if binCount < 3 {
		return Result{}, ErrNoCompleteLap
	}

	binned := make([][]Point, binCount)
	for _, lap := range laps {
		for _, sample := range lap {
			index := int(sample.LapDistance / options.BinMetres)
			if index < 0 || index >= binCount {
				continue
			}
			binned[index] = append(binned[index], WorldPosition(sample.Latitude, sample.Longitude))
		}
	}

	points := make([]Point, 0, binCount)
	filled := 0
	dispersion := 0.0
	for _, bin := range binned {
		if len(bin) == 0 {
			continue
		}
		filled++
		centre := median(bin)
		points = append(points, centre)
		dispersion = math.Max(dispersion, spreadAround(bin, centre))
	}

	coverage := float64(filled) / float64(binCount)
	if coverage < options.MinimumCoverage {
		return Result{}, fmt.Errorf("%w: %.3f of %d bins", ErrCoverageTooLow, coverage, binCount)
	}
	if !hasExtent(points) {
		return Result{}, ErrDegenerateOutline
	}
	if options.MaximumDispersion > 0 && dispersion > options.MaximumDispersion {
		return Result{}, fmt.Errorf("%w: %.1f m", ErrLapsDisagree, dispersion)
	}
	points = smooth(points, options.SmoothingWindow)

	return Result{
		Points:           points,
		Laps:             len(laps),
		Coverage:         coverage,
		IntegratedLength: closedLength(points),
		LapDistanceSpan:  span,
		Dispersion:       dispersion,
	}, nil
}

// median takes each axis independently. A handful of pit-lane or off-track laps
// cannot drag the result off the racing surface the way an average would, and
// mixing two physically distinct paths in one bin is exactly what the dispersion
// check is there to catch.
func median(points []Point) Point {
	xs := make([]float64, len(points))
	zs := make([]float64, len(points))
	for index, point := range points {
		xs[index] = point.X
		zs[index] = point.Z
	}
	sort.Float64s(xs)
	sort.Float64s(zs)
	return Point{X: middle(xs), Z: middle(zs)}
}

func middle(sorted []float64) float64 {
	half := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[half]
	}
	return (sorted[half-1] + sorted[half]) / 2
}

// spreadAround reports the median distance from the chosen centre, so a few
// outlying laps do not by themselves condemn a bin.
func spreadAround(points []Point, centre Point) float64 {
	distances := make([]float64, len(points))
	for index, point := range points {
		distances[index] = math.Hypot(point.X-centre.X, point.Z-centre.Z)
	}
	sort.Float64s(distances)
	return middle(distances)
}

// smooth averages each point with its neighbours around the loop. The outline
// is closed, so the window wraps rather than flattening the start and finish.
func smooth(points []Point, window int) []Point {
	if window <= 1 || len(points) < window {
		return points
	}
	half := window / 2
	smoothed := make([]Point, len(points))
	for index := range points {
		var sum Point
		for offset := -half; offset <= half; offset++ {
			neighbour := points[((index+offset)%len(points)+len(points))%len(points)]
			sum.X += neighbour.X
			sum.Z += neighbour.Z
		}
		count := float64(half*2 + 1)
		smoothed[index] = Point{X: sum.X / count, Z: sum.Z / count}
	}
	return smoothed
}

// wrapDistance returns how far a lap runs, measured at the points where lap
// distance falls back to the line. Without an observed wrap there is no
// evidence that any lap was ever completed, and the session maximum would
// happily pass a driver who parked halfway round.
func wrapDistance(samples []Sample, maximumRegression float64) float64 {
	furthest := 0.0
	previous := math.NaN()
	for _, sample := range samples {
		if !math.IsNaN(previous) && sample.LapDistance < previous-maximumRegression {
			furthest = math.Max(furthest, previous)
		}
		previous = sample.LapDistance
	}
	return furthest
}

func usable(samples []Sample) []Sample {
	kept := make([]Sample, 0, len(samples))
	for _, sample := range samples {
		if sample.InPit || sample.LapDistance < 0 ||
			!finite(sample.LapDistance) || !finite(sample.Latitude) || !finite(sample.Longitude) {
			continue
		}
		kept = append(kept, sample)
	}
	return kept
}

// completeLaps splits the samples wherever lap distance falls back to the start
// and keeps only the runs that actually cover a lap. A run that merely stops
// halfway, or that jumps backwards mid-lap, is discarded: a partial outline is
// worse than none because nothing downstream could tell it apart from a real
// circuit.
func completeLaps(samples []Sample, maximumRegression, lapLength float64) [][]Sample {
	if len(samples) == 0 {
		return nil
	}

	var laps [][]Sample
	var current []Sample
	for _, sample := range samples {
		if len(current) > 0 {
			previous := current[len(current)-1].LapDistance
			switch {
			case sample.LapDistance < previous-maximumRegression:
				// Either a lap boundary or a rewind; close the run either way.
				laps = appendComplete(laps, current, lapLength)
				current = nil
			case sample.LapDistance < previous:
				continue
			}
		}
		current = append(current, sample)
	}
	return appendComplete(laps, current, lapLength)
}

// appendComplete keeps a run only when it starts near the line and reaches the
// far end of a lap.
func appendComplete(laps [][]Sample, run []Sample, lapLength float64) [][]Sample {
	if len(run) < 3 || lapLength <= 0 {
		return laps
	}
	start := run[0].LapDistance
	end := run[len(run)-1].LapDistance
	if start > lapLength*0.02 || end < lapLength*0.98 {
		return laps
	}
	return append(laps, run)
}

func hasExtent(points []Point) bool {
	minimum, maximum := points[0], points[0]
	for _, point := range points {
		minimum.X = math.Min(minimum.X, point.X)
		minimum.Z = math.Min(minimum.Z, point.Z)
		maximum.X = math.Max(maximum.X, point.X)
		maximum.Z = math.Max(maximum.Z, point.Z)
	}
	return maximum.X-minimum.X > 0 && maximum.Z-minimum.Z > 0
}

func closedLength(points []Point) float64 {
	total := 0.0
	for index := range points {
		next := points[(index+1)%len(points)]
		total += math.Hypot(next.X-points[index].X, next.Z-points[index].Z)
	}
	return total
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
