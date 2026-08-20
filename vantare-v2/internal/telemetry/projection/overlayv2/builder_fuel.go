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
// PerLap is derive.FuelUsage.PerLap: the moving average of the consumption of
// the last completed valid laps, computed once in derive/ and only converted
// to the preferred unit here. ISA-372 left it missing on purpose because the
// series only existed in the TypeScript snapshot (`derived.fuelHistory`) and
// rebuilding it inside the projection would have created a second authority
// over fuel consumption. ISA-678 puts that authority in derive/, so the
// builder can read it instead of inventing it.
//
// EstimatedLaps has a documented precedence, published in Basis:
//
//  1. "fuel": floor(remaining / perLap), the laps the tank still allows. It
//     wins whenever the canonical consumption exists, because it is the
//     question the fuel widget actually asks and it comes from two canonical
//     inputs of the same concept.
//  2. "session": ceil(sessionRemaining / lastLapTime), the laps the session
//     still has left at the last lap pace. That is the quantity Overlay v1
//     displayed as `lapsRemaining` (fuel-strategy-view-model.ts:27-32) and it
//     remains the fallback while no lap has been measured yet.
//
// Both keep the worst quality of their inputs; Basis lets a consumer tell the
// two apart instead of guessing which arithmetic produced the number.
//
// `requiredFuel` stays absent. It is perLap x laps-to-go **of the session**,
// and that projection is no longer always the published EstimatedLaps once the
// fuel basis wins. Publishing it would need a second laps field in the frame
// for a consumer that has not asked for one, so it is declared missing with a
// reason instead of being approximated from whichever basis happened to win.
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
	result.PerLap = qualityValue(final.Derived.Fuel.PerLap, func(value energy.FuelAmount) float64 {
		return convertFuel(float64(value), preferences.Fuel)
	})
	if laps := fuelLapsRemaining(result.Remaining, result.PerLap); laps.Q != QualityMissing {
		result.EstimatedLaps = laps
		result.Basis = FuelBasisFuel
		return result
	}
	if laps := sessionLapsRemaining(final.Derived.SessionRemaining, player.LastLapTime); laps.Q != QualityMissing {
		result.EstimatedLaps = laps
		result.Basis = FuelBasisSession
	}
	return result
}

// fuelLapsRemaining is the laps the tank still allows at the canonical
// consumption. It floors: a partially fuelled lap is not a lap the driver can
// complete, and rounding it up is exactly the mistake the widget must not make.
func fuelLapsRemaining(remaining, perLap QValue[float64]) QValue[float64] {
	quality := worstOf(remaining.Q, perLap.Q)
	switch quality {
	case QualityFresh, QualityStale:
	default:
		return missingValue[float64]()
	}
	if perLap.V <= 0 || !finite(perLap.V) || !finite(remaining.V) || remaining.V < 0 {
		return missingValue[float64]()
	}
	laps := math.Floor(remaining.V / perLap.V)
	if !finite(laps) || laps < 0 {
		return QValue[float64]{V: 0, Q: quality}
	}
	return QValue[float64]{V: laps, Q: quality}
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
