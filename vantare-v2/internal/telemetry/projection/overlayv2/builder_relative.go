package overlayv2

import (
	"math"
	"sort"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// Sides published by the v2 contract for a relative row.
const (
	RelativeSideAhead  = "ahead"
	RelativeSidePlayer = "player"
	RelativeSideBehind = "behind"
)

// MaxRelativeAhead and MaxRelativeBehind bound the published window. The
// widget configures a smaller range (2/2 by default) and slices what it needs
// from an already ordered list; publishing a fixed, generous window keeps the
// frame one per tick instead of one per widget, and keeps its size bounded
// regardless of the grid size.
const (
	MaxRelativeAhead  = 8
	MaxRelativeBehind = 8
)

// BuildRelative resolves the relative window in Go, ordered.
//
// Overlay v1 selected and ordered the rows in the widget
// (relative-row-selection.ts:9-48): it walked outwards from the player over a
// lap-distance ordering and produced [ahead far→near, player, behind
// near→far]. That selection is domain, not presentation, so it lives here now.
//
// The canonical ordering signal is the derived relative gap
// (derive.GapSet.Vehicles): positive means the vehicle is ahead of the player
// on the same lap, negative means behind. A single descending sort by that gap
// reproduces exactly the v1 output order, with the vehicle id as the
// deterministic tie-break.
//
// Declared differences, never invented:
//   - a vehicle on a different lap has no relative time gap in the canonical
//     state (deriveVehicleGap publishes Laps and leaves Time missing), so it is
//     not part of the window; Overlay v1 kept the row and blanked the gap;
//   - CarNumber has no canonical signal and is absent from the row.
//
// With no player in the state the window is empty: it is a declared outcome,
// not a fallback to the first vehicles of the grid.
func BuildRelative(final derive.FinalState) []RelativeRowV2 {
	rows := make([]RelativeRowV2, 0, MaxRelativeAhead+MaxRelativeBehind+1)
	player, found := playerVehicle(final.Observed.Vehicles)
	if !found {
		return rows
	}
	gaps := make(map[string]schema.Field[standings.RelativeTime], len(final.Derived.Gaps.Vehicles))
	for _, gap := range final.Derived.Gaps.Vehicles {
		gaps[string(gap.Vehicle)] = gap.Time
	}

	type candidate struct {
		row   RelativeRowV2
		value float64
	}
	candidates := make([]candidate, 0, len(final.Observed.Vehicles))
	for _, current := range final.Observed.Vehicles {
		id := string(current.Identity.Vehicle)
		if id == string(player.Identity.Vehicle) {
			continue
		}
		field, present := gaps[id]
		if !present {
			continue
		}
		value, usable := usableRelativeGap(field)
		if !usable {
			continue
		}
		candidates = append(candidates, candidate{row: relativeRow(current, field, relativeSide(value)), value: value})
	}
	sort.SliceStable(candidates, func(left, right int) bool {
		if candidates[left].value != candidates[right].value {
			return candidates[left].value > candidates[right].value
		}
		return candidates[left].row.VehicleID < candidates[right].row.VehicleID
	})

	// The player splits the descending order: everything before it is ahead
	// (far to near) and everything after it is behind (near to far).
	split := len(candidates)
	for index := range candidates {
		if candidates[index].value < 0 {
			split = index
			break
		}
	}
	ahead := candidates[:split]
	behind := candidates[split:]
	if len(ahead) > MaxRelativeAhead {
		ahead = ahead[len(ahead)-MaxRelativeAhead:]
	}
	if len(behind) > MaxRelativeBehind {
		behind = behind[:MaxRelativeBehind]
	}

	for _, current := range ahead {
		rows = append(rows, current.row)
	}
	rows = append(rows, playerRelativeRow(player, gaps[string(player.Identity.Vehicle)]))
	for _, current := range behind {
		rows = append(rows, current.row)
	}
	return rows
}

func playerVehicle(vehicles []core.VehicleState) (core.VehicleState, bool) {
	for _, current := range vehicles {
		value, present := current.Player.Value()
		if present && value && current.Player.Freshness() != schema.FreshnessInvalid {
			return current, true
		}
	}
	return core.VehicleState{}, false
}

// usableRelativeGap accepts only a present, finite gap whose quality can be
// shown. A missing gap means the vehicle is on another lap or the pair of
// observations was not comparable, and it keeps the vehicle out of the window.
func usableRelativeGap(field schema.Field[standings.RelativeTime]) (float64, bool) {
	value, present := field.Value()
	if !present {
		return 0, false
	}
	switch qualityFromFreshness(field.Freshness()) {
	case QualityFresh, QualityStale:
	default:
		return 0, false
	}
	number := float64(value)
	if math.IsNaN(number) || math.IsInf(number, 0) {
		return 0, false
	}
	return number, true
}

func relativeSide(gap float64) string {
	if gap < 0 {
		return RelativeSideBehind
	}
	return RelativeSideAhead
}

func relativeRow(
	vehicle core.VehicleState,
	gap schema.Field[standings.RelativeTime],
	side string,
) RelativeRowV2 {
	return RelativeRowV2{
		VehicleID:   string(vehicle.Identity.Vehicle),
		GapSeconds:  qualityValue(gap, func(value standings.RelativeTime) float64 { return float64(value) }),
		Side:        side,
		Authority:   relativeAuthority(gap),
		DisplayName: observedString(vehicle.DriverName),
		ClassID:     vehicleClassID(vehicle),
	}
}

// playerRelativeRow publishes the player anchor. Its gap to itself is zero by
// construction, and it carries the quality of the gap set rather than claiming
// a freshness the canonical state never observed.
func playerRelativeRow(player core.VehicleState, gap schema.Field[standings.RelativeTime]) RelativeRowV2 {
	row := relativeRow(player, gap, RelativeSidePlayer)
	if _, usable := usableRelativeGap(gap); !usable {
		row.GapSeconds = missingValue[float64]()
		row.Authority = AuthorityDerived
	}
	return row
}

// relativeAuthority reports where the gap came from. The canonical relative
// gap is always reconstructed from the two observed times behind the leader,
// so it is derived; the mapping stays explicit so a future observed gap from a
// driver would publish itself as native without touching this builder.
func relativeAuthority(gap schema.Field[standings.RelativeTime]) Authority {
	if gap.Provenance() == schema.ProvenanceObserved {
		return AuthorityNative
	}
	return AuthorityDerived
}
