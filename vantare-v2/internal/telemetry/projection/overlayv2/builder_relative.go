package overlayv2

import (
	"math"
	"sort"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
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
// LapDistance is the physical ordering signal. RelativeTime is display data:
// a missing time never removes a physical neighbour from the window. This
// keeps classification laps independent from traffic around the player.
//
// With no player in the state the window is empty: it is a declared outcome,
// not a fallback to the first vehicles of the grid.
func BuildRelative(final derive.FinalState) []RelativeRowV2 {
	rows := make([]RelativeRowV2, 0, MaxRelativeAhead+MaxRelativeBehind+1)
	window, found := selectPhysicalRelativeWindow(final.Observed.Vehicles)
	if !found {
		return rows
	}
	gaps := make(map[string]schema.Field[standings.RelativeTime], len(final.Derived.Gaps.Vehicles))
	for _, gap := range final.Derived.Gaps.Vehicles {
		gaps[string(gap.Vehicle)] = gap.Time
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

func selectPhysicalRelativeWindow(vehicles []core.VehicleState) (physicalRelativeWindow, bool) {
	player, found := playerVehicle(vehicles)
	if !found {
		return physicalRelativeWindow{}, false
	}
	window := physicalRelativeWindow{player: player}
	if _, usable := usableLapDistance(player.LapDistance); !usable {
		return window, true
	}
	type candidate struct {
		vehicle  core.VehicleState
		distance float64
	}
	candidates := make([]candidate, 0, len(vehicles))
	for _, current := range vehicles {
		distance, usable := usableLapDistance(current.LapDistance)
		if !usable {
			continue
		}
		candidates = append(candidates, candidate{vehicle: current, distance: distance})
	}
	sort.SliceStable(candidates, func(left, right int) bool {
		if candidates[left].distance != candidates[right].distance {
			return candidates[left].distance < candidates[right].distance
		}
		return candidates[left].vehicle.Identity.Vehicle < candidates[right].vehicle.Identity.Vehicle
	})
	playerIndex := -1
	for index := range candidates {
		if candidates[index].vehicle.Identity.Vehicle == player.Identity.Vehicle {
			playerIndex = index
			break
		}
	}
	if playerIndex < 0 {
		return window, true
	}

	selected := map[identity.VehicleID]struct{}{player.Identity.Vehicle: {}}
	aheadNearToFar := make([]core.VehicleState, 0, MaxRelativeAhead)
	window.behind = make([]core.VehicleState, 0, MaxRelativeBehind)
	for offset := 1; offset < len(candidates) && (len(aheadNearToFar) < MaxRelativeAhead || len(window.behind) < MaxRelativeBehind); offset++ {
		ahead := candidates[(playerIndex+offset)%len(candidates)].vehicle
		if len(aheadNearToFar) < MaxRelativeAhead {
			if _, exists := selected[ahead.Identity.Vehicle]; !exists {
				selected[ahead.Identity.Vehicle] = struct{}{}
				aheadNearToFar = append(aheadNearToFar, ahead)
			}
		}

		behindIndex := (playerIndex - offset + len(candidates)) % len(candidates)
		behindCandidate := candidates[behindIndex].vehicle
		if len(window.behind) < MaxRelativeBehind {
			if _, exists := selected[behindCandidate.Identity.Vehicle]; !exists {
				selected[behindCandidate.Identity.Vehicle] = struct{}{}
				window.behind = append(window.behind, behindCandidate)
			}
		}
	}

	window.ahead = make([]core.VehicleState, 0, len(aheadNearToFar))
	for index := len(aheadNearToFar) - 1; index >= 0; index-- {
		window.ahead = append(window.ahead, aheadNearToFar[index])
	}
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
	gap schema.Field[standings.RelativeTime],
	side string,
) RelativeRowV2 {
	return RelativeRowV2{
		VehicleID:      string(vehicle.Identity.Vehicle),
		Position:       position,
		GapSeconds:     canonicalRelativeGap(gap, side),
		GroundPosition: groundPositionValue(vehicle.WorldPosition),
		LastLapSeconds: qualityValue(vehicle.LastLapTime, func(value standings.LapTime) float64 { return float64(value) }),
		Side:           side,
		Authority:      relativeAuthority(gap),
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
func playerRelativeRow(player core.VehicleState, position int32, gap schema.Field[standings.RelativeTime]) RelativeRowV2 {
	row := relativeRow(player, position, gap, RelativeSidePlayer)
	if _, usable := usableRelativeGap(gap); !usable {
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
