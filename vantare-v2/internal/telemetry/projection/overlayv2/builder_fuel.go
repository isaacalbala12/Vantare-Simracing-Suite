package overlayv2

import (
	"math"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// usGallonsPerLitre converts the canonical litres to the preference unit. The
// canonical state stores litres; the preference only changes the presentation.
const usGallonsPerLitre = 0.26417205235814842

// BuildFuel publishes the player fuel state.
//
// Remaining and Capacity come straight from the canonical energy.Fuel the
// reducer already observes for the player, converted to the preferred unit.
//
// EstimatedLaps is the laps the session still has left at the player's last lap
// pace. That is exactly the quantity Overlay v1 displayed as `lapsRemaining`
// and computed inside fuel-strategy-view-model.ts:27-32
// (ceil(session.remainingSeconds / player.lastLapSeconds)); both inputs are
// canonical, so the arithmetic moves here and the widget stops owning it.
//
// PerLap stays missing on purpose. Overlay v1's `avgPerLap` averages
// `derived.fuelHistory`, a per-lap consumption series that today exists only in
// the TypeScript snapshot: there is no canonical fuel history and no derivation
// producing one. Reconstructing it here would put a second authority for fuel
// consumption inside the projection layer, next to the one that legitimately
// belongs in derive/. It is declared missing and the derivation is left as a
// follow-up in derive/, which is where "one authority per concept" puts it.
// `requiredFuel` (avgPerLap x lapsRemaining) is missing for the same reason.
func BuildFuel(final derive.FinalState, preferences PreferencesV2) FuelViewV2 {
	preferences = normalizedPreferences(preferences)
	result := FuelViewV2{
		Remaining:     missingValue[float64](),
		Capacity:      missingValue[float64](),
		PerLap:        missingValue[float64](),
		EstimatedLaps: missingValue[float64](),
	}
	player, found := playerVehicle(final.Observed.Vehicles)
	if !found {
		return result
	}
	result.Remaining = qualityValue(player.Fuel, func(value energy.Fuel) float64 {
		return convertFuel(float64(value.Amount), preferences.Fuel)
	})
	result.Capacity = qualityValue(player.Fuel, func(value energy.Fuel) float64 {
		return convertFuel(float64(value.Capacity), preferences.Fuel)
	})
	result.EstimatedLaps = sessionLapsRemaining(final.Derived.SessionRemaining, player.LastLapTime)
	return result
}

// sessionLapsRemaining keeps the worst quality of the two inputs: an estimate
// built on a stale lap time is stale, never fresh.
func sessionLapsRemaining(
	remaining schema.Field[session.RemainingTime],
	lastLap schema.Field[standings.LapTime],
) QValue[float64] {
	remainingSeconds, remainingPresent := remaining.Value()
	lapSeconds, lapPresent := lastLap.Value()
	if !remainingPresent || !lapPresent {
		return missingValue[float64]()
	}
	quality := worstOf(qualityFromFreshness(remaining.Freshness()), qualityFromFreshness(lastLap.Freshness()))
	switch quality {
	case QualityFresh, QualityStale:
	default:
		return missingValue[float64]()
	}
	if float64(lapSeconds) <= 0 || !finite(float64(lapSeconds)) || !finite(float64(remainingSeconds)) {
		return missingValue[float64]()
	}
	laps := math.Ceil(float64(remainingSeconds) / float64(lapSeconds))
	if !finite(laps) || laps < 0 {
		return QValue[float64]{V: 0, Q: quality}
	}
	return QValue[float64]{V: laps, Q: quality}
}

func worstOf(left, right Quality) Quality {
	rank := func(value Quality) int {
		switch value {
		case QualityFresh:
			return 0
		case QualityStale:
			return 1
		case QualityMissing:
			return 2
		default:
			return 3
		}
	}
	if rank(right) > rank(left) {
		return right
	}
	return left
}

func convertFuel(litres float64, unit FuelUnit) float64 {
	if unit == FuelUnitGallonsUS {
		return litres * usGallonsPerLitre
	}
	return litres
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
