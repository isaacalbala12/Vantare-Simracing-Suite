package overlayv2

import (
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

// BuildDamage returns the compact damage view for the player vehicle.
// It mirrors the observed damage carried by the canonical vehicle state.
func BuildDamage(final derive.FinalState) DamageViewV2 {
	for _, current := range final.Observed.Vehicles {
		player, present := current.Player.Value()
		if !present || !player || current.Player.Freshness() == schema.FreshnessInvalid {
			continue
		}
		freshness := current.Damage.Freshness()
		tyreWear := buildTyreWear(current.TyreWear)
		if freshness == schema.FreshnessMissing {
			return DamageViewV2{
				TyreWear:           tyreWear,
				Dents:              missingValue[[]uint16](),
				Overheating:        missingValue[bool](),
				Detached:           missingValue[bool](),
				WheelDetachedCount: missingValue[uint8](),
			}
		}
		quality := qualityFromFreshness(freshness)
		if freshness == schema.FreshnessInvalid {
			return DamageViewV2{
				TyreWear:           tyreWear,
				Dents:              QValue[[]uint16]{Q: QualityInvalid},
				Overheating:        QValue[bool]{Q: QualityInvalid},
				Detached:           QValue[bool]{Q: QualityInvalid},
				WheelDetachedCount: QValue[uint8]{Q: QualityInvalid},
			}
		}
		value, present := current.Damage.Value()
		if !present {
			return DamageViewV2{
				TyreWear:           tyreWear,
				Dents:              missingValue[[]uint16](),
				Overheating:        missingValue[bool](),
				Detached:           missingValue[bool](),
				WheelDetachedCount: missingValue[uint8](),
			}
		}
		dents := make([]uint16, 8)
		for i, s := range value.Dents {
			dents[i] = uint16(s)
		}
		return DamageViewV2{
			TyreWear:           tyreWear,
			Dents:              QValue[[]uint16]{V: dents, Q: quality},
			Overheating:        QValue[bool]{V: value.Overheating, Q: quality},
			Detached:           QValue[bool]{V: value.Detached, Q: quality},
			WheelDetachedCount: QValue[uint8]{V: value.WheelDetachedCount, Q: quality},
		}
	}
	return DamageViewV2{
		Dents:              missingValue[[]uint16](),
		Overheating:        missingValue[bool](),
		Detached:           missingValue[bool](),
		WheelDetachedCount: missingValue[uint8](),
	}
}

func buildTyreWear(field schema.Field[[4]float64]) *QValue[[]float64] {
	freshness := field.Freshness()
	if freshness == schema.FreshnessMissing {
		return nil
	}
	if freshness == schema.FreshnessInvalid {
		return &QValue[[]float64]{Q: QualityInvalid}
	}
	value, present := field.Value()
	if !present {
		return nil
	}
	return &QValue[[]float64]{V: []float64{value[0], value[1], value[2], value[3]}, Q: qualityFromFreshness(freshness)}
}
