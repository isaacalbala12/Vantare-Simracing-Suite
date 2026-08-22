package solver

import (
	"fmt"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	StintPaceModelCompoundParameters = "compound_parameters"
	defaultCompoundDeltaSensitivity  = 0.20
	maxCompoundCurvePoints           = 256
)

// TyreInventoryInput is the existing physical tyre inventory transported into
// the solver. NewInventory remains the authority for all identity, state,
// corner and capacity validation.
type TyreInventoryInput struct {
	Maximum int          `json:"maximum"`
	Tyres   []tyres.Tyre `json:"tyres"`
}

// CompoundPaceParameter is the D19 fallback while LMU compound codes have no
// semantic mapping. Each declared compound is manual or reference data with a
// base pace delta and either a linear degradation slope or an explicit curve.
type CompoundPaceParameter struct {
	Compound                 tyres.Compound      `json:"compound"`
	Presence                 sp.Presence         `json:"presence"`
	Provenance               sp.Provenance       `json:"provenance"`
	Confidence               sp.Confidence       `json:"confidence"`
	PaceDeltaSeconds         float64             `json:"paceDeltaSeconds"`
	DegradationPerLapSeconds float64             `json:"degradationPerLapSeconds"`
	Curve                    []CompoundPacePoint `json:"curve,omitempty"`
}

type CompoundPacePoint struct {
	LapInStint   int64   `json:"lapInStint"`
	DeltaSeconds float64 `json:"deltaSeconds"`
}

type CompoundPaceCostSource struct {
	Compound                 tyres.Compound      `json:"compound"`
	Presence                 sp.Presence         `json:"presence"`
	Provenance               sp.Provenance       `json:"provenance"`
	Confidence               sp.Confidence       `json:"confidence"`
	PaceDeltaSeconds         float64             `json:"paceDeltaSeconds"`
	DegradationPerLapSeconds float64             `json:"degradationPerLapSeconds"`
	Curve                    []CompoundPacePoint `json:"curve,omitempty"`
}

type compoundPaceCost struct {
	paceDelta float64
	curve     stintPaceCost
	source    CompoundPaceCostSource
}

type compoundPaceCosts struct {
	enabled bool
	order   []tyres.Compound
	byName  map[tyres.Compound]compoundPaceCost
}

func (input SolverInputV2) compoundPaceCosts() (compoundPaceCosts, error) {
	if input.TyreInventory == nil && len(input.CompoundPace) == 0 {
		return compoundPaceCosts{}, nil
	}
	if input.TyreInventory == nil || len(input.CompoundPace) == 0 {
		return compoundPaceCosts{}, fmt.Errorf("tyreInventory and compoundPace must be configured together")
	}
	if input.DegradationPerLap.Value != 0 {
		return compoundPaceCosts{}, fmt.Errorf("global degradationPerLapSeconds and compoundPace cannot be combined")
	}
	if input.Projection != nil && input.Projection.CombinedStintPaceCurve.Presence == sp.PresenceValid {
		return compoundPaceCosts{}, fmt.Errorf("derived combined curve and compoundPace cannot be combined")
	}
	if _, err := tyres.NewInventory(input.TyreInventory.Maximum, input.TyreInventory.Tyres); err != nil {
		return compoundPaceCosts{}, fmt.Errorf("tyreInventory: %w", err)
	}
	result := compoundPaceCosts{enabled: true, byName: make(map[tyres.Compound]compoundPaceCost, len(input.CompoundPace))}
	for index, parameter := range input.CompoundPace {
		if err := parameter.Validate(); err != nil {
			return compoundPaceCosts{}, fmt.Errorf("compoundPace[%d]: %w", index, err)
		}
		if _, duplicate := result.byName[parameter.Compound]; duplicate {
			return compoundPaceCosts{}, fmt.Errorf("compoundPace[%d].compound is duplicated", index)
		}
		curve, err := parameter.paceCurve(input.RaceLaps)
		if err != nil {
			return compoundPaceCosts{}, fmt.Errorf("compoundPace[%d]: %w", index, err)
		}
		for lap := int64(1); lap <= input.RaceLaps; lap++ {
			if input.BaseLapSeconds.Value+parameter.PaceDeltaSeconds+curve.deltaAt(lap) <= 0 {
				return compoundPaceCosts{}, fmt.Errorf("compoundPace[%d] produces a non-positive lap time", index)
			}
		}
		result.order = append(result.order, parameter.Compound)
		result.byName[parameter.Compound] = compoundPaceCost{
			paceDelta: parameter.PaceDeltaSeconds,
			curve:     curve,
			source: CompoundPaceCostSource{
				Compound: parameter.Compound, Presence: parameter.Presence,
				Provenance: parameter.Provenance, Confidence: parameter.Confidence,
				PaceDeltaSeconds:         parameter.PaceDeltaSeconds,
				DegradationPerLapSeconds: parameter.DegradationPerLapSeconds,
				Curve:                    append([]CompoundPacePoint(nil), parameter.Curve...),
			},
		}
	}
	sort.Slice(result.order, func(i, j int) bool { return result.order[i] < result.order[j] })
	return result, nil
}

func (parameter CompoundPaceParameter) Validate() error {
	if !parameter.Compound.Valid() {
		return fmt.Errorf("compound is invalid")
	}
	if parameter.Presence != sp.PresenceValid {
		return fmt.Errorf("presence must be valid")
	}
	if parameter.Provenance.Kind != sp.ProvenanceManual && parameter.Provenance.Kind != sp.ProvenanceReference {
		return fmt.Errorf("provenance.kind must be manual or reference")
	}
	if err := parameter.Provenance.Validate(); err != nil {
		return err
	}
	if err := parameter.Confidence.Validate(); err != nil {
		return err
	}
	if !finite(parameter.PaceDeltaSeconds) {
		return fmt.Errorf("paceDeltaSeconds must be finite")
	}
	if parameter.DegradationPerLapSeconds < 0 || !finite(parameter.DegradationPerLapSeconds) {
		return fmt.Errorf("degradationPerLapSeconds must be finite and non-negative")
	}
	if len(parameter.Curve) > 0 && parameter.DegradationPerLapSeconds != 0 {
		return fmt.Errorf("curve and degradationPerLapSeconds cannot be combined")
	}
	if len(parameter.Curve) > maxCompoundCurvePoints {
		return fmt.Errorf("curve exceeds %d points", maxCompoundCurvePoints)
	}
	return nil
}

func (parameter CompoundPaceParameter) paceCurve(horizon int64) (stintPaceCost, error) {
	if len(parameter.Curve) == 0 {
		return stintPaceCost{manualSlope: parameter.DegradationPerLapSeconds}.withHorizon(horizon), nil
	}
	points := make([]stintPacePoint, len(parameter.Curve))
	for index, point := range parameter.Curve {
		if point.LapInStint <= 0 || point.LapInStint > horizon {
			return stintPaceCost{}, fmt.Errorf("curve[%d].lapInStint out of range", index)
		}
		if !finite(point.DeltaSeconds) {
			return stintPaceCost{}, fmt.Errorf("curve[%d].deltaSeconds must be finite", index)
		}
		points[index] = stintPacePoint{lap: point.LapInStint, delta: point.DeltaSeconds}
	}
	sort.Slice(points, func(i, j int) bool { return points[i].lap < points[j].lap })
	for index := 1; index < len(points); index++ {
		if points[index].lap == points[index-1].lap {
			return stintPaceCost{}, fmt.Errorf("curve contains duplicate lapInStint %d", points[index].lap)
		}
	}
	return stintPaceCost{points: points}.withHorizon(horizon), nil
}

func (costs compoundPaceCosts) sources() []CompoundPaceCostSource {
	result := make([]CompoundPaceCostSource, 0, len(costs.order))
	for _, compound := range costs.order {
		result = append(result, costs.byName[compound].source)
	}
	return result
}

func (costs compoundPaceCosts) stint(compound tyres.Compound, laps int64, baseLapSeconds float64) (StintPlan, float64, error) {
	cost, ok := costs.byName[compound]
	if !ok {
		return StintPlan{}, 0, fmt.Errorf("compound %q has no pace parameter", compound)
	}
	stint, err := cost.curve.stint(laps, baseLapSeconds)
	if err != nil {
		return StintPlan{}, 0, err
	}
	return stint, float64(laps) * cost.paceDelta, nil
}

func (costs compoundPaceCosts) perturbedDegradation(decision DecisionVector, factor float64) float64 {
	total := 0.0
	for _, stint := range decision.Stints {
		cost := costs.byName[stint.Compound].curve.perturbed(factor)
		if int64(len(cost.cumulative)) > stint.Laps {
			total += cost.cumulative[stint.Laps]
		}
	}
	return total
}

func compoundDeltaSensitivities(decision DecisionVector) []SolverSensitivity {
	laps := make(map[tyres.Compound]int64)
	for _, stint := range decision.Stints {
		laps[stint.Compound] += stint.Laps
	}
	compounds := make([]tyres.Compound, 0, len(laps))
	for compound := range laps {
		compounds = append(compounds, compound)
	}
	sort.Slice(compounds, func(i, j int) bool { return compounds[i] < compounds[j] })
	result := make([]SolverSensitivity, 0, len(compounds))
	for _, compound := range compounds {
		result = append(result, SolverSensitivity{
			Parameter:     fmt.Sprintf("compoundPaceDeltaSeconds.%s", compound),
			Delta:         defaultCompoundDeltaSensitivity,
			ImpactSeconds: float64(laps[compound]) * defaultCompoundDeltaSensitivity,
		})
	}
	return result
}
