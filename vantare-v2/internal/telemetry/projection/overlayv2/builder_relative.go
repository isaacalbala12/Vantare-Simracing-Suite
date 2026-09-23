package overlayv2

import (
	"math"
	"sort"
	"strings"

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
// widget configures a smaller range (3/3 by default) and slices what it needs
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
// lap-distance ordering and produced [ahead near→far, player, behind
// near→far]. That selection is domain, not presentation, so it lives here now.
//
// LapDistance is the physical ordering signal. RelativeTime is display data:
// a missing time never removes a physical neighbour from the window. This
// keeps classification laps independent from traffic around the player.
//
// With no player in the state the window is empty: it is a declared outcome,
// not a fallback to the first vehicles of the grid.
func BuildRelative(final derive.FinalState) []RelativeRowV2 {
	return buildRelativeWindow(final, false)
}

// BuildRelativeSameClass selects class neighbours before applying the bounded range.
func BuildRelativeSameClass(final derive.FinalState) []RelativeRowV2 {
	return buildRelativeWindow(final, true)
}

func buildRelativeWindow(final derive.FinalState, sameClass bool) []RelativeRowV2 {
	rows := make([]RelativeRowV2, 0, MaxRelativeAhead+MaxRelativeBehind+1)
	window, found := selectPhysicalRelativeWindow(final.Observed, sameClass)
	if !found {
		return rows
	}
	gaps := make(map[string]derive.VehicleGap, len(final.Derived.Gaps.Vehicles))
	for _, gap := range final.Derived.Gaps.Vehicles {
		gaps[string(gap.Vehicle)] = gap
	}
	positions := resolvedRelativePositions(final.Observed.Vehicles)

	for _, current := range window.ahead {
		rows = append(rows, relativeRow(current, positions[string(current.Identity.Vehicle)], gaps[string(current.Identity.Vehicle)], RelativeSideAhead))
	}
	rows = append(rows, playerRelativeRow(window.player, positions[string(window.player.Identity.Vehicle)], gaps[string(window.player.Identity.Vehicle)]))
	for _, current := range window.behind {
		rows = append(rows, relativeRow(current, positions[string(current.Identity.Vehicle)], gaps[string(current.Identity.Vehicle)], RelativeSideBehind))
	}
	return rows
}

// resolvedRelativePositions is shared by the immediate and settled views so
// a missing observed Position takes the same canonical ordered fallback.
func resolvedRelativePositions(vehicles []core.VehicleState) map[string]int32 {
	positions := make(map[string]int32, len(vehicles))
	for index, current := range orderedVehicles(vehicles) {
		positions[string(current.Identity.Vehicle)] = resolvedPosition(current, index)
	}
	return positions
}

type physicalRelativeWindow struct {
	ahead  []core.VehicleState
	player core.VehicleState
	behind []core.VehicleState
}

// Each rival belongs to its shortest metric arc. The exact half-lap tie goes
// ahead; coincident cars use stable identity order. Neither classification nor
// the temporal gap can choose a side. Without observed circuit length only the
// player anchor is published: a wrap cannot be resolved safely.
func selectPhysicalRelativeWindow(observed core.ObservedState, sameClass bool) (physicalRelativeWindow, bool) {
	player, found := playerVehicle(observed.Vehicles)
	if !found {
		return physicalRelativeWindow{}, false
	}
	window := physicalRelativeWindow{player: player}
	length, validLength := usableLapDistance(observed.TrackLength)
	playerDistance, validPlayer := usableLapDistance(player.LapDistance)
	if !validLength || length <= 0 || !validPlayer || playerDistance > length {
		return window, true
	}
	type candidate struct {
		vehicle core.VehicleState
		arc     float64
	}
	var ahead, behind []candidate
	seen := map[string]bool{string(player.Identity.Vehicle): true}
	for _, current := range observed.Vehicles {
		id := string(current.Identity.Vehicle)
		if seen[id] {
			continue
		}
		seen[id] = true
		if sameClass && (vehicleClassID(player) == "" || !strings.EqualFold(vehicleClassID(current), vehicleClassID(player))) {
			continue
		}
		distance, valid := usableLapDistance(current.LapDistance)
		if !valid || distance > length {
			continue
		}
		arc := math.Mod(distance-playerDistance+length, length)
		if arc > length/2 {
			arc -= length
		}
		if arc < 0 || (arc == 0 && current.Identity.Vehicle < player.Identity.Vehicle) {
			behind = append(behind, candidate{current, -arc})
		} else {
			ahead = append(ahead, candidate{current, arc})
		}
	}
	selectSide := func(candidates []candidate, limit int) []core.VehicleState {
		sort.Slice(candidates, func(i, j int) bool {
			if candidates[i].arc != candidates[j].arc {
				return candidates[i].arc < candidates[j].arc
			}
			return candidates[i].vehicle.Identity.Vehicle < candidates[j].vehicle.Identity.Vehicle
		})
		if len(candidates) > limit {
			candidates = candidates[:limit]
		}
		rows := make([]core.VehicleState, 0, len(candidates))
		for _, candidate := range candidates {
			rows = append(rows, candidate.vehicle)
		}
		return rows
	}
	window.ahead = selectSide(ahead, MaxRelativeAhead)
	window.behind = selectSide(behind, MaxRelativeBehind)
	return window, true
}

func usableLapDistance(field schema.Field[standings.LapDistance]) (float64, bool) {
	value, present := field.Value()
	if !present || (field.Freshness() != schema.FreshnessFresh && field.Freshness() != schema.FreshnessStale) {
		return 0, false
	}
	number := float64(value)
	return number, number >= 0 && !math.IsNaN(number) && !math.IsInf(number, 0)
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
// shown. Physical membership in the window is independent from this display
// value, so an unusable gap leaves the row present with explicit missing data.
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

func relativeRow(
	vehicle core.VehicleState,
	position int32,
	gap derive.VehicleGap,
	side string,
) RelativeRowV2 {
	return RelativeRowV2{
		VehicleID:      string(vehicle.Identity.Vehicle),
		CarNumber:      observedCarNumber(vehicle.CarNumber),
		BestLapSeconds: qualityValue(vehicle.BestLapTime, func(value standings.LapTime) float64 { return float64(value) }),
		Position:       position,
		GapSeconds:     canonicalRelativeGap(gap.Time, side),
		LapDelta:       qualityValue(gap.Laps, func(value standings.RelativeLaps) int32 { return int32(value) }),
		LastLapSeconds: qualityValue(vehicle.LastLapTime, func(value standings.LapTime) float64 { return float64(value) }),
		Side:           side,
		Authority:      relativeAuthority(gap.Time),
		DisplayName:    observedString(vehicle.DriverName),
		ClassID:        vehicleClassID(vehicle),
	}
}

func canonicalRelativeGap(gap schema.Field[standings.RelativeTime], side string) QValue[float64] {
	value := qualityValue(gap, func(raw standings.RelativeTime) float64 { return float64(raw) })
	if value.Q != QualityFresh && value.Q != QualityStale {
		return value
	}
	consistent := side == RelativeSidePlayer && value.V == 0 ||
		side == RelativeSideAhead && value.V > 0 ||
		side == RelativeSideBehind && value.V < 0
	if !consistent {
		return QValue[float64]{Q: QualityInvalid}
	}
	return value
}

// playerRelativeRow publishes the player anchor. Its gap to itself is zero by
// construction, and it carries the quality of the gap set rather than claiming
// a freshness the canonical state never observed.
func playerRelativeRow(player core.VehicleState, position int32, gap derive.VehicleGap) RelativeRowV2 {
	row := relativeRow(player, position, gap, RelativeSidePlayer)
	if _, usable := usableRelativeGap(gap.Time); !usable {
		row.GapSeconds = missingValue[float64]()
		row.Authority = AuthorityDerived
	}
	return row
}

// relativeAuthority reports where the gap came from. The canonical relative
// gap is currently derived from each vehicle's observed temporal lap coordinate;
// the mapping stays explicit so a future native equivalent can retain its
// observed provenance without changing this builder.
func relativeAuthority(gap schema.Field[standings.RelativeTime]) Authority {
	if gap.Provenance() == schema.ProvenanceObserved {
		return AuthorityNative
	}
	return AuthorityDerived
}
