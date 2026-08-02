package derive

import (
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

type GapSet struct {
	Freshness schema.Freshness
	Vehicles  []VehicleGap
}

type VehicleGap struct {
	Vehicle identity.VehicleID
	Time    schema.Field[standings.RelativeTime]
	Laps    schema.Field[standings.RelativeLaps]
}

func deriveSessionRemaining(
	current schema.Field[time.Duration],
	end schema.Field[session.EndTime],
) schema.Field[session.RemainingTime] {
	quality, usable := exactFreshQuality(current, end)
	if !usable {
		if quality == schema.FreshnessInvalid {
			return invalidDerived[session.RemainingTime]()
		}
		return schema.MissingField[session.RemainingTime]()
	}
	currentValue, _ := current.Value()
	endValue, _ := end.Value()
	currentSeconds := float64(currentValue) / float64(time.Second)
	remaining := float64(endValue) - currentSeconds
	if currentValue < 0 || !isFinite(float64(endValue)) || remaining < 0 || !isFinite(remaining) {
		return invalidDerived[session.RemainingTime]()
	}
	return mustDerived(session.RemainingTime(remaining), quality)
}

func deriveRelativeGaps(
	playerID identity.VehicleID,
	playerPresent schema.Field[bool],
	vehicles []core.VehicleState,
) GapSet {
	if playerID == "" {
		return GapSet{Freshness: schema.FreshnessMissing}
	}
	present, playerPresenceUsable := observedBool(playerPresent)
	if !playerPresenceUsable || !present {
		return GapSet{Freshness: schema.FreshnessMissing}
	}
	var player *core.VehicleState
	for index := range vehicles {
		if vehicles[index].Identity.Vehicle == playerID {
			player = &vehicles[index]
			break
		}
	}
	if player == nil {
		return GapSet{Freshness: schema.FreshnessMissing}
	}
	isPlayer, markerUsable := observedBool(player.Player)
	if !markerUsable || !isPlayer {
		return GapSet{Freshness: schema.FreshnessMissing}
	}

	result := GapSet{
		Freshness: singleQuality(player.LapsBehindLeader),
		Vehicles:  make([]VehicleGap, len(vehicles)),
	}
	for index, current := range vehicles {
		result.Vehicles[index] = deriveVehicleGap(*player, current)
		result.Freshness = worstGapFreshness(result.Freshness, relevantGapFreshness(result.Vehicles[index]))
	}
	return result
}

func relevantGapFreshness(gap VehicleGap) schema.Freshness {
	laps, present := gap.Laps.Value()
	if !present || laps != 0 {
		return gap.Laps.Freshness()
	}
	return worstGapFreshness(gap.Laps.Freshness(), gap.Time.Freshness())
}

func worstGapFreshness(left, right schema.Freshness) schema.Freshness {
	rank := func(value schema.Freshness) int {
		switch value {
		case schema.FreshnessFresh:
			return 0
		case schema.FreshnessStale:
			return 1
		case schema.FreshnessMissing:
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

func deriveVehicleGap(player, current core.VehicleState) VehicleGap {
	result := VehicleGap{Vehicle: current.Identity.Vehicle}
	lapQuality, lapsUsable := exactFreshQuality(player.LapsBehindLeader, current.LapsBehindLeader)
	if !lapsUsable {
		if lapQuality == schema.FreshnessInvalid {
			result.Laps = invalidDerived[standings.RelativeLaps]()
		} else {
			result.Laps = schema.MissingField[standings.RelativeLaps]()
		}
		result.Time = schema.MissingField[standings.RelativeTime]()
		return result
	}

	playerLaps, _ := player.LapsBehindLeader.Value()
	currentLaps, _ := current.LapsBehindLeader.Value()
	difference := int64(playerLaps) - int64(currentLaps)
	if difference < math.MinInt32 || difference > math.MaxInt32 {
		result.Laps = invalidDerived[standings.RelativeLaps]()
		result.Time = schema.MissingField[standings.RelativeTime]()
		return result
	}
	result.Laps = mustDerived(standings.RelativeLaps(difference), lapQuality)
	if difference != 0 {
		result.Time = schema.MissingField[standings.RelativeTime]()
		return result
	}

	timeQuality, timeUsable := exactFreshQuality(player.TimeBehindLeader, current.TimeBehindLeader)
	if !timeUsable {
		if timeQuality == schema.FreshnessInvalid {
			result.Time = invalidDerived[standings.RelativeTime]()
		} else {
			result.Time = schema.MissingField[standings.RelativeTime]()
		}
		return result
	}
	playerTime, _ := player.TimeBehindLeader.Value()
	currentTime, _ := current.TimeBehindLeader.Value()
	delta := float64(playerTime) - float64(currentTime)
	if !isFinite(float64(playerTime)) || !isFinite(float64(currentTime)) || !isFinite(delta) {
		result.Time = invalidDerived[standings.RelativeTime]()
		return result
	}
	result.Time = mustDerived(standings.RelativeTime(delta), timeQuality)
	return result
}

func exactFreshQuality[A, B comparable](left schema.Field[A], right schema.Field[B]) (schema.Freshness, bool) {
	if left.Freshness() == schema.FreshnessInvalid || right.Freshness() == schema.FreshnessInvalid {
		return schema.FreshnessInvalid, false
	}
	_, leftPresent := left.Value()
	_, rightPresent := right.Value()
	if (leftPresent && left.Provenance() != schema.ProvenanceObserved) ||
		(rightPresent && right.Provenance() != schema.ProvenanceObserved) {
		return schema.FreshnessInvalid, false
	}
	if !leftPresent || !rightPresent || left.Freshness() == schema.FreshnessMissing || right.Freshness() == schema.FreshnessMissing {
		return schema.FreshnessMissing, false
	}
	if left.Freshness() != right.Freshness() {
		return schema.FreshnessMissing, false
	}
	if left.Freshness() != schema.FreshnessFresh && left.Freshness() != schema.FreshnessStale {
		return schema.FreshnessInvalid, false
	}
	return left.Freshness(), true
}

func observedBool(field schema.Field[bool]) (bool, bool) {
	value, present := field.Value()
	return value, present && field.Provenance() == schema.ProvenanceObserved &&
		(field.Freshness() == schema.FreshnessFresh || field.Freshness() == schema.FreshnessStale)
}

func singleQuality[T comparable](field schema.Field[T]) schema.Freshness {
	_, present := field.Value()
	if !present {
		return schema.FreshnessMissing
	}
	if field.Provenance() != schema.ProvenanceObserved {
		return schema.FreshnessInvalid
	}
	return field.Freshness()
}

func invalidDerived[T comparable]() schema.Field[T] {
	var zero T
	return mustDerived(zero, schema.FreshnessInvalid)
}

func mustDerived[T comparable](value T, freshness schema.Freshness) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceDerived, freshness)
	if err != nil {
		panic(err)
	}
	return field
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
