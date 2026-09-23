package overlayv2

import (
	"math"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// Pit states published by the v2 contract. The canonical state only observes
// the LMU VehicleScoring boolean, so the builder distinguishes exactly two
// known states and leaves the field empty when the boolean itself is absent.
const (
	PitStateTrack = "track"
	PitStatePit   = "pit"
)

// BuildStandings preserves canonical order and per-field authority. A missing
// position is zero with missing quality, never a fabricated classification.
func BuildStandings(final derive.FinalState) []StandingRowV2 {
	ordered := orderedVehicles(final.Observed.Vehicles)
	rows := make([]StandingRowV2, 0, len(ordered))
	classPositions := make(map[string]int32, len(ordered))
	incompleteClasses := make(map[string]bool)
	unknownClass := false
	for _, current := range ordered {
		classID := vehicleClassID(current)
		if classID == "" {
			unknownClass = true
		}
		if _, ok := usablePosition(current); !ok {
			incompleteClasses[classID] = true
		}
	}
	classLeaders := make(map[string]core.VehicleState)
	for _, current := range ordered {
		classID := vehicleClassID(current)
		position, positioned := usablePosition(current)
		classQuality := QualityMissing
		classPosition := int32(0)
		classGap, classLaps := missingValue[float64](), missingValue[int32]()
		referencePosition := int32(0)
		if positioned && classID != "" && !unknownClass && !incompleteClasses[classID] {
			classPositions[classID]++
			classPosition, classQuality = classPositions[classID], QualityFresh
			leader, exists := classLeaders[classID]
			if !exists {
				leader = current
				classLeaders[classID] = current
			}
			referencePosition, _ = usablePosition(leader)
			classGap, classLaps = classStandingGap(current, leader, final.Observed.TrackLength)
		}
		interval := qualityValue(current.TimeBehindNext, func(value standings.TimeGap) float64 { return float64(value) })
		intervalLaps := qualityValue(current.LapsBehindNext, func(value standings.LapGap) int32 { return int32(value) })
		rows = append(rows, StandingRowV2{
			VehicleID:     string(current.Identity.Vehicle),
			Position:      position,
			ClassPosition: classPosition,
			Quality:       standingQuality(current, classQuality, classGap.Q, classLaps.Q, interval.Q, intervalLaps.Q),
			ClassGap:      classGap.V, ClassGapLaps: classLaps.V, ClassGapReferencePosition: referencePosition,
			Interval:       interval.V,
			IntervalLaps:   intervalLaps.V,
			ClassID:        classID,
			DriverName:     observedString(current.DriverName),
			CarNumber:      observedCarNumber(current.CarNumber),
			GapSeconds:     qualityValue(current.TimeBehindLeader, func(value standings.TimeGap) float64 { return float64(value) }),
			GapLaps:        observedInt32(current.LapsBehindLeader),
			PitState:       pitState(current.InPit),
			CompletedLaps:  observedInt32(current.CompletedLaps),
			BestLapSeconds: qualityValue(current.BestLapTime, func(value standings.LapTime) float64 { return float64(value) }),
			LastLapSeconds: qualityValue(current.LastLapTime, func(value standings.LapTime) float64 { return float64(value) }),
			GroundPosition: groundPositionValue(current.WorldPosition),
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
	if !present || qualityFromFreshness(vehicle.Position.Freshness()) != QualityFresh || value <= 0 {
		return 0, false
	}
	return int32(value), true
}

func vehicleClassID(vehicle core.VehicleState) string {
	value, present := vehicle.VehicleClass.Value()
	if !present || qualityFromFreshness(vehicle.VehicleClass.Freshness()) != QualityFresh {
		return ""
	}
	return strings.ToUpper(strings.TrimSpace(string(value)))
}

func pitState(field schema.Field[pit.InPit]) string {
	value, present := field.Value()
	if !present || fieldQuality(field) != QualityFresh {
		return ""
	}
	if bool(value) {
		return PitStatePit
	}
	return PitStateTrack
}

func observedCarNumber(field schema.Field[standings.CarNumber]) string {
	value, present := field.Value()
	if !present || qualityFromFreshness(field.Freshness()) != QualityFresh {
		return ""
	}
	return string(value)
}

func observedString[T ~string](field schema.Field[T]) string {
	value, present := field.Value()
	if !present || fieldQuality(field) != QualityFresh {
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

func groundPositionValue(field schema.Field[spatial.Position]) QValue[GroundPositionV2] {
	value, present := field.Value()
	if !present {
		return missingValue[GroundPositionV2]()
	}
	quality := qualityFromFreshness(field.Freshness())
	if quality == QualityMissing {
		return missingValue[GroundPositionV2]()
	}
	return QValue[GroundPositionV2]{V: GroundPositionV2{X: value.X, Z: value.Z}, Q: quality}
}

func fieldQuality[T comparable](field schema.Field[T]) Quality {
	if _, present := field.Value(); !present {
		return QualityMissing
	}
	return qualityFromFreshness(field.Freshness())
}

// Completed-lap counters alone overcount at the timing line. Full race
// progress distinguishes that crossing from a complete lap deficit. Native
// time gaps can only be subtracted when their global lap references agree.
func classStandingGap(row, leader core.VehicleState, length schema.Field[standings.LapDistance]) (QValue[float64], QValue[int32]) {
	missingSeconds, missingLaps := missingValue[float64](), missingValue[int32]()
	if row.Identity.Vehicle == leader.Identity.Vehicle {
		return QValue[float64]{Q: QualityFresh}, QValue[int32]{Q: QualityFresh}
	}
	track, ok := freshFinite(length)
	rowLaps, rowOK := row.CompletedLaps.Value()
	leaderLaps, leaderOK := leader.CompletedLaps.Value()
	rowDistance, rdOK := freshFinite(row.LapDistance)
	leaderDistance, ldOK := freshFinite(leader.LapDistance)
	if !ok || track <= 0 || !rowOK || !leaderOK || rowLaps < 0 || leaderLaps < 0 || fieldQuality(row.CompletedLaps) != QualityFresh || fieldQuality(leader.CompletedLaps) != QualityFresh || !rdOK || !ldOK || rowDistance < 0 || leaderDistance < 0 || rowDistance >= track || leaderDistance >= track {
		return missingSeconds, missingLaps
	}
	progress := float64(leaderLaps-rowLaps) + (leaderDistance-rowDistance)/track
	if progress < 0 {
		return missingSeconds, missingLaps
	}
	laps := QValue[int32]{V: int32(math.Floor(progress)), Q: QualityFresh}
	globalLaps, glOK := row.LapsBehindLeader.Value()
	leaderGlobalLaps, llOK := leader.LapsBehindLeader.Value()
	seconds, sOK := freshFinite(row.TimeBehindLeader)
	leaderSeconds, lsOK := freshFinite(leader.TimeBehindLeader)
	if laps.V != 0 || !glOK || !llOK || globalLaps != leaderGlobalLaps || fieldQuality(row.LapsBehindLeader) != QualityFresh || fieldQuality(leader.LapsBehindLeader) != QualityFresh || !sOK || !lsOK || seconds < leaderSeconds || leaderSeconds < 0 {
		return missingSeconds, laps
	}
	return QValue[float64]{V: seconds - leaderSeconds, Q: QualityFresh}, laps
}

func freshFinite[T ~float64](field schema.Field[T]) (float64, bool) {
	value, present := field.Value()
	n := float64(value)
	return n, present && fieldQuality(field) == QualityFresh && !math.IsNaN(n) && !math.IsInf(n, 0)
}

// Zero denotes unknown; the index is retained only for source compatibility.
func resolvedPosition(vehicle core.VehicleState, _ int) int32 {
	value, _ := usablePosition(vehicle)
	return value
}

func standingQuality(row core.VehicleState, classQuality, classGap, classLaps, interval, intervalLaps Quality) StandingQualityV2 {
	values := []Quality{fieldQuality(row.Position), classQuality, fieldQuality(row.InPit), fieldQuality(row.CompletedLaps), fieldQuality(row.LapsBehindLeader), classGap, classLaps, interval, intervalLaps}
	if p, present := row.Position.Value(); present && p <= 0 {
		values[0] = QualityInvalid
	}
	base, count := QualityFresh, 0
	for _, candidate := range values {
		n := 0
		for _, quality := range values {
			if candidate == quality {
				n++
			}
		}
		if n > count {
			base, count = candidate, n
		}
	}
	for i, value := range values {
		if value == base {
			values[i] = ""
		}
	}
	return StandingQualityV2{Q: base, Position: values[0], ClassPosition: values[1], Pit: values[2], Laps: values[3], GapLaps: values[4], ClassGap: values[5], ClassGapLaps: values[6], Interval: values[7], IntervalLaps: values[8]}
}
