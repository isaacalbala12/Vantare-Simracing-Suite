package overlayv2

import (
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// Pit states published by the v2 contract. The canonical state only observes
// the LMU VehicleScoring boolean, so the builder distinguishes exactly two
// known states and leaves the field empty when the boolean itself is absent.
const (
	PitStateTrack = "track"
	PitStatePit   = "pit"
)

// BuildStandings resolves the classification rows already ordered, so the
// frontend never has to. Overlay v1 left the order to the widget, which fell
// back to `index+1` without telling anybody when Position was absent; here the
// fallback is explicit, deterministic and observable through Position quality.
//
// Ordering: vehicles with a usable Position sort ascending by it; vehicles
// without one keep their observed order after them. ClassPosition is derived
// from that final order within each ClassID.
//
// CarNumber stays empty: the canonical VehicleState has no car-number signal,
// and the builder does not invent one from the driver or vehicle name.
func BuildStandings(final derive.FinalState) []StandingRowV2 {
	ordered := orderedVehicles(final.Observed.Vehicles)
	rows := make([]StandingRowV2, 0, len(ordered))
	classPositions := make(map[string]int32, len(ordered))
	for index, current := range ordered {
		classID := vehicleClassID(current)
		classPositions[classID]++
		rows = append(rows, StandingRowV2{
			VehicleID:      string(current.Identity.Vehicle),
			Position:       resolvedPosition(current, index),
			ClassPosition:  classPositions[classID],
			ClassID:        classID,
			DriverName:     observedString(current.DriverName),
			GapSeconds:     qualityValue(current.TimeBehindLeader, func(value standings.TimeGap) float64 { return float64(value) }),
			GapLaps:        observedInt32(current.LapsBehindLeader),
			PitState:       pitState(current.InPit),
			CompletedLaps:  observedInt32(current.CompletedLaps),
			LastLapSeconds: qualityValue(current.LastLapTime, func(value standings.LapTime) float64 { return float64(value) }),
		})
	}
	return rows
}

// orderedVehicles returns a stable copy ordered by observed Position. It never
// mutates the snapshot slice, which stays owned by the reducer.
func orderedVehicles(vehicles []core.VehicleState) []core.VehicleState {
	ordered := make([]core.VehicleState, len(vehicles))
	copy(ordered, vehicles)
	sort.SliceStable(ordered, func(left, right int) bool {
		leftValue, leftOK := usablePosition(ordered[left])
		rightValue, rightOK := usablePosition(ordered[right])
		if leftOK != rightOK {
			return leftOK
		}
		if !leftOK {
			return false
		}
		return leftValue < rightValue
	})
	return ordered
}

func usablePosition(vehicle core.VehicleState) (int32, bool) {
	value, present := vehicle.Position.Value()
	if !present || qualityFromFreshness(vehicle.Position.Freshness()) == QualityMissing {
		return 0, false
	}
	return int32(value), true
}

// resolvedPosition keeps the observed position when it exists and otherwise
// publishes the resolved order index. The consumer can still tell them apart:
// a fallback row has a missing GapSeconds and no observed Position upstream.
func resolvedPosition(vehicle core.VehicleState, index int) int32 {
	if value, ok := usablePosition(vehicle); ok {
		return value
	}
	return int32(index + 1)
}

func vehicleClassID(vehicle core.VehicleState) string {
	value, present := vehicle.VehicleClass.Value()
	if !present || qualityFromFreshness(vehicle.VehicleClass.Freshness()) == QualityMissing {
		return ""
	}
	return strings.TrimSpace(string(value))
}

func pitState(field schema.Field[pit.InPit]) string {
	value, present := field.Value()
	if !present {
		return ""
	}
	if bool(value) {
		return PitStatePit
	}
	return PitStateTrack
}

func observedString[T ~string](field schema.Field[T]) string {
	value, present := field.Value()
	if !present {
		return ""
	}
	return string(value)
}

func observedInt32[T ~int32](field schema.Field[T]) int32 {
	value, present := field.Value()
	if !present {
		return 0
	}
	return int32(value)
}
