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
		if freshness == schema.FreshnessMissing {
			return DamageViewV2{
				Dents:              missingValue[[8]uint8](),
				Overheating:        missingValue[bool](),
				Detached:           missingValue[bool](),
				WheelDetachedCount: missingValue[uint8](),
			}
		}
		quality := qualityFromFreshness(freshness)
		if freshness == schema.FreshnessInvalid {
			return DamageViewV2{
				Dents:              QValue[[8]uint8]{Q: QualityInvalid},
				Overheating:        QValue[bool]{Q: QualityInvalid},
				Detached:           QValue[bool]{Q: QualityInvalid},
				WheelDetachedCount: QValue[uint8]{Q: QualityInvalid},
			}
		}
		value, present := current.Damage.Value()
		if !present {
			return DamageViewV2{
				Dents:              missingValue[[8]uint8](),
				Overheating:        missingValue[bool](),
				Detached:           missingValue[bool](),
				WheelDetachedCount: missingValue[uint8](),
			}
		}
		var dents [8]uint8
		for i, s := range value.Dents {
			dents[i] = uint8(s)
		}
		return DamageViewV2{
			Dents:              QValue[[8]uint8]{V: dents, Q: quality},
			Overheating:        QValue[bool]{V: value.Overheating, Q: quality},
			Detached:           QValue[bool]{V: value.Detached, Q: quality},
			WheelDetachedCount: QValue[uint8]{V: value.WheelDetachedCount, Q: quality},
		}
	}
	return DamageViewV2{
		Dents:              missingValue[[8]uint8](),
		Overheating:        missingValue[bool](),
		Detached:           missingValue[bool](),
		WheelDetachedCount: missingValue[uint8](),
	}
}
