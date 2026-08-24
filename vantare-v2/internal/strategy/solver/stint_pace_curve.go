package solver

import (
	"fmt"
	"math"
	"sort"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	StintPaceModelManualLinear  = "manual_linear"
	StintPaceModelCombinedCurve = "combined_stint_pace_curve"
	defaultCurveSensitivity     = 0.20
)

// StintPaceCostSource conserva en el resultado la familia que costo cada
// stint. Manual linear es el caso particular sin proyeccion derivada.
type StintPaceCostSource struct {
	Model           string             `json:"model"`
	Provenance      sp.Provenance      `json:"provenance"`
	Confidence      sp.Confidence      `json:"confidence"`
	Identifiability sp.Identifiability `json:"identifiability,omitempty"`
}

type stintPacePoint struct {
	lap   int64
	delta float64
}

type stintPaceCost struct {
	manualSlope float64
	points      []stintPacePoint
	rangeWidth  float64
	sampleSize  int
	cumulative  []float64
	source      StintPaceCostSource
}

func (input SolverInputV2) stintPaceCost() (stintPaceCost, error) {
	if input.DegradationPerLap.Role != ScalarRoleUserOverride && input.Projection != nil {
		curve := input.Projection.CombinedStintPaceCurve
		if curve.Presence == sp.PresenceValid && curve.Identifiability == sp.IdentifiabilityCombinedOnly && len(curve.Points) > 0 {
			return newCombinedStintPaceCost(curve)
		}
	}
	return stintPaceCost{
		manualSlope: input.DegradationPerLap.Value,
		source: StintPaceCostSource{
			Model:      StintPaceModelManualLinear,
			Provenance: input.DegradationPerLap.Provenance,
			Confidence: input.DegradationPerLap.Confidence,
		},
	}.withHorizon(input.RaceLaps), nil
}

func (input SolverInputV2) stintPaceDegradationAssumption(cost stintPaceCost) *SolverReason {
	if input.Projection == nil || cost.source.Model == StintPaceModelCombinedCurve {
		return nil
	}
	curve := input.Projection.CombinedStintPaceCurve
	reason := curve.Reason
	if curve.Presence == sp.PresenceValid && len(curve.Points) == 0 {
		reason = "empty_combined_stint_pace_curve"
	}
	if reason == "" {
		reason = string(curve.Presence)
	}
	result := SolverReason{
		Code:    "combined_stint_pace_curve_degraded",
		Message: fmt.Sprintf("la curva combinada no se usa (%s); el calculo continua sin esa familia", reason),
	}
	return &result
}

func newCombinedStintPaceCost(curve sp.CombinedStintPaceCurve) (stintPaceCost, error) {
	if len(curve.Points) == 0 {
		return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.points must not be empty")
	}
	if curve.Confidence.SampleSize <= 0 {
		return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.confidence.sampleSize must be >0")
	}
	if curve.Confidence.RangeLower == nil || curve.Confidence.RangeUpper == nil {
		return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.confidence.range is required")
	}
	lower, upper := *curve.Confidence.RangeLower, *curve.Confidence.RangeUpper
	if !finite(lower) || !finite(upper) || lower > upper {
		return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.confidence.range invalid")
	}

	points := make([]stintPacePoint, len(curve.Points))
	for index, point := range curve.Points {
		if point.LapInStint <= 0 {
			return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.points[%d].lapInStint must be >0", index)
		}
		if !finite(point.DeltaSeconds) {
			return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.points[%d].deltaSeconds invalid", index)
		}
		if point.SampleSize <= 0 {
			return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.points[%d].sampleSize must be >0", index)
		}
		if (point.RangeLower == nil) != (point.RangeUpper == nil) {
			return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.points[%d].range must be complete", index)
		}
		if point.RangeLower != nil && (!finite(*point.RangeLower) || !finite(*point.RangeUpper) || *point.RangeLower > *point.RangeUpper) {
			return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.points[%d].range invalid", index)
		}
		points[index] = stintPacePoint{lap: int64(point.LapInStint), delta: point.DeltaSeconds}
	}
	sort.Slice(points, func(i, j int) bool { return points[i].lap < points[j].lap })
	for index := 1; index < len(points); index++ {
		if points[index].lap == points[index-1].lap {
			return stintPaceCost{}, fmt.Errorf("combinedStintPaceCurve.points contains duplicate lapInStint %d", points[index].lap)
		}
	}

	return stintPaceCost{
		points: points, rangeWidth: upper - lower, sampleSize: curve.Confidence.SampleSize,
		source: StintPaceCostSource{
			Model: StintPaceModelCombinedCurve, Provenance: curve.Provenance,
			Confidence: curve.Confidence, Identifiability: curve.Identifiability,
		},
	}, nil
}

func (cost stintPaceCost) deltaAt(lapInStint int64) float64 {
	if len(cost.points) == 0 {
		return float64(lapInStint-1) * cost.manualSlope
	}
	if lapInStint <= cost.points[0].lap {
		return cost.points[0].delta
	}
	last := cost.points[len(cost.points)-1]
	if lapInStint > last.lap {
		slope := cost.rangeWidth / math.Sqrt(float64(cost.sampleSize))
		if len(cost.points) > 1 {
			previous := cost.points[len(cost.points)-2]
			tailSlope := (last.delta - previous.delta) / float64(last.lap-previous.lap)
			if tailSlope > slope {
				slope = tailSlope
			}
		}
		return last.delta + float64(lapInStint-last.lap)*math.Max(0, slope)
	}
	index := sort.Search(len(cost.points), func(index int) bool { return cost.points[index].lap >= lapInStint })
	right := cost.points[index]
	if right.lap == lapInStint {
		return right.delta
	}
	left := cost.points[index-1]
	fraction := float64(lapInStint-left.lap) / float64(right.lap-left.lap)
	return left.delta + fraction*(right.delta-left.delta)
}

func (cost stintPaceCost) stint(laps int64, baseLapSeconds float64) (StintPlan, error) {
	if laps <= 0 {
		return StintPlan{}, solveError(ErrorInvalidInput, "stintLaps", "must be positive")
	}
	green := float64(laps) * baseLapSeconds
	degradation := 0.0
	if int64(len(cost.cumulative)) > laps {
		degradation = cost.cumulative[laps]
	} else {
		for lap := int64(1); lap <= laps; lap++ {
			degradation += cost.deltaAt(lap)
		}
	}
	return StintPlan{Laps: laps, GreenSeconds: green, DegradationSeconds: degradation, TotalSeconds: green + degradation}, nil
}

func (cost stintPaceCost) withHorizon(laps int64) stintPaceCost {
	cost.cumulative = make([]float64, laps+1)
	for lap := int64(1); lap <= laps; lap++ {
		cost.cumulative[lap] = cost.cumulative[lap-1] + cost.deltaAt(lap)
	}
	return cost
}

func (cost stintPaceCost) perturbed(factor float64) stintPaceCost {
	result := cost
	horizon := int64(len(cost.cumulative) - 1)
	if len(cost.points) == 0 {
		result.manualSlope *= 1 + factor
		return result.withHorizon(horizon)
	}
	result.points = append([]stintPacePoint(nil), cost.points...)
	for index := range result.points {
		result.points[index].delta += math.Abs(result.points[index].delta) * factor
	}
	result.rangeWidth *= 1 + factor
	return result.withHorizon(horizon)
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
