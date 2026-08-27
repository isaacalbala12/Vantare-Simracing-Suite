package solver

import (
	"fmt"

	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const defaultFuelWeightSensitivity = 0.20

type fuelWeightCost struct {
	secondsPerLiter float64
	source          FuelWeightCostSource
}

func (input SolverInputV2) fuelWeightCost() (fuelWeightCost, error) {
	if input.Projection != nil && input.Projection.FuelWeightCurve != nil && input.Projection.FuelWeightCurve.Presence == sp.PresenceValid {
		curve := input.Projection.FuelWeightCurve
		if input.FuelWeight != nil {
			return fuelWeightCost{}, fmt.Errorf("manual/reference and derived fuel weight sources cannot be combined")
		}
		return fuelWeightCost{
			secondsPerLiter: curve.SlopeSecondsPerUnit,
			source: FuelWeightCostSource{
				Presence: curve.Presence, SecondsPerLiter: curve.SlopeSecondsPerUnit,
				Provenance: curve.Provenance, Confidence: curve.Confidence,
			},
		}, nil
	}
	if input.FuelWeight != nil {
		return fuelWeightCost{
			secondsPerLiter: input.FuelWeight.SecondsPerLiter,
			source: FuelWeightCostSource{
				Presence: input.FuelWeight.Presence, SecondsPerLiter: input.FuelWeight.SecondsPerLiter,
				Provenance: input.FuelWeight.Provenance, Confidence: input.FuelWeight.Confidence,
			},
		}, nil
	}
	if input.Projection != nil && input.Projection.FuelWeightCurve != nil {
		curve := input.Projection.FuelWeightCurve
		return fuelWeightCost{
			source: FuelWeightCostSource{
				Presence: curve.Presence, SecondsPerLiter: curve.SlopeSecondsPerUnit,
				Provenance: curve.Provenance, Confidence: curve.Confidence,
			},
		}, nil
	}
	return fuelWeightCost{
		source: FuelWeightCostSource{
			Presence:   sp.PresenceMissing,
			Provenance: sp.Provenance{Kind: sp.ProvenanceUnknown},
			Confidence: sp.Confidence{ComputationVersion: "not-configured.v1"},
		},
	}, nil
}

func (cost fuelWeightCost) stint(startFuel, fuelPerLap, laps int64) float64 {
	if cost.secondsPerLiter == 0 || laps <= 0 {
		return 0
	}
	count := float64(laps)
	fuelLiters := count*serviceValue(startFuel) - count*(count-1)*serviceValue(fuelPerLap)/2
	return fuelLiters * cost.secondsPerLiter
}

func (cost fuelWeightCost) assumption() SolverReason {
	if cost.source.Presence != sp.PresenceValid {
		return SolverReason{
			Code:    "fuel_weight_not_configured",
			Message: "el modelo no aplica penalizacion por peso de combustible",
		}
	}
	return SolverReason{
		Code: "fuel_weight_source",
		Message: fmt.Sprintf(
			"cada litro a bordo cuesta %.4f s/vuelta (%s: %s)",
			cost.secondsPerLiter,
			cost.source.Provenance.Kind,
			cost.source.Provenance.SourceID,
		),
	}
}
