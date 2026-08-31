package overlayv2

import (
	"math"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

// Fine-grained dirty detection.
//
// The coarse signals in cadence.go answer "did the grid move?"; these answer
// "did anything the builder actually projects change?". They are FNV-1a
// fingerprints over exactly the fields BuildStandings and BuildRelative read,
// so a canonical signal the builders ignore (RPM, throttle, world position…)
// never marks their section dirty, and any field they do read always does.
//
// Standings is one allocation-free linear pass. Relative deliberately reuses
// the builder's bounded physical-window selector so dirty detection and the
// emitted section cannot diverge.

const (
	fnvOffset64 uint64 = 14695981039346656037
	fnvPrime64  uint64 = 1099511628211
)

func hashByte(sum uint64, value byte) uint64 { return (sum ^ uint64(value)) * fnvPrime64 }

func hashBool(sum uint64, value bool) uint64 {
	if value {
		return hashByte(sum, 1)
	}
	return hashByte(sum, 0)
}

func hashUint64(sum uint64, value uint64) uint64 {
	for shift := 0; shift < 64; shift += 8 {
		sum = hashByte(sum, byte(value>>shift))
	}
	return sum
}

// hashString terminates with a zero byte so "ab"+"c" and "a"+"bc" differ.
func hashString(sum uint64, value string) uint64 {
	for index := 0; index < len(value); index++ {
		sum = hashByte(sum, value[index])
	}
	return hashByte(sum, 0)
}

// hashQuality folds the presence and the freshness of a field, because both
// reach the wire through QValue.Q and through the missing/fallback branches.
func hashQuality[T comparable](sum uint64, field schema.Field[T]) uint64 {
	_, present := field.Value()
	sum = hashBool(sum, present)
	return hashByte(sum, byte(field.Freshness()))
}

func hashFieldString[T ~string](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashString(hashQuality(sum, field), string(value))
}

func hashFieldInt32[T ~int32](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashUint64(hashQuality(sum, field), uint64(uint32(value)))
}

func hashFieldFloat[T ~float64](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashUint64(hashQuality(sum, field), math.Float64bits(float64(value)))
}

func hashFieldBool[T ~bool](sum uint64, field schema.Field[T]) uint64 {
	value, _ := field.Value()
	return hashBool(hashQuality(sum, field), bool(value))
}

// hashStandingsVehicle folds one vehicle exactly as BuildStandings projects it:
// identity, position (value and freshness, which decides the sort and the
// index fallback), class, driver name, gap to the leader in time and laps, pit
// state, completed laps, last lap time, lap distance and world position (X,Z).
// Gaps are folded bit for bit because the v2 frame publishes them unquantized.
func hashStandingsVehicle(sum uint64, vehicle *core.VehicleState) uint64 {
	sum = hashString(sum, string(vehicle.Identity.Vehicle))
	sum = hashFieldInt32(sum, vehicle.Position)
	sum = hashFieldString(sum, vehicle.VehicleClass)
	sum = hashFieldString(sum, vehicle.DriverName)
	sum = hashFieldFloat(sum, vehicle.TimeBehindLeader)
	sum = hashFieldInt32(sum, vehicle.LapsBehindLeader)
	sum = hashFieldBool(sum, vehicle.InPit)
	sum = hashFieldInt32(sum, vehicle.CompletedLaps)
	sum = hashFieldFloat(sum, vehicle.BestLapTime)
	sum = hashFieldFloat(sum, vehicle.LastLapTime)
	sum = hashFieldFloat(sum, vehicle.LapDistance)
	sum = hashQuality(sum, vehicle.WorldPosition)
	if value, present := vehicle.WorldPosition.Value(); present {
		sum = hashUint64(sum, math.Float64bits(value.X))
		sum = hashUint64(sum, math.Float64bits(value.Z))
	}
	return sum
}

// hashRelativeMark fingerprints exactly the fields BuildRelative projects, scoped
// to the published window around the player. A signal the builder ignores (RPM,
// world position, fuel) never marks the section dirty; changing the player or
// any neighbour inside the window always does, even if the rest of the grid is
// untouched. The hash is ordered far->near ahead, player, near->far behind.
func hashRelativeMark(final derive.FinalState) uint64 {
	sum := fnvOffset64
	window, found := selectPhysicalRelativeWindow(final.Observed.Vehicles)
	if !found {
		sum = hashByte(sum, 0)
		return sum
	}
	sum = hashByte(sum, 1)
	gapsByVehicle := make(map[string]schema.Field[standings.RelativeTime], len(final.Derived.Gaps.Vehicles))
	for _, gap := range final.Derived.Gaps.Vehicles {
		gapsByVehicle[string(gap.Vehicle)] = gap.Time
	}

	for _, current := range window.ahead {
		row := relativeRow(current, gapsByVehicle[string(current.Identity.Vehicle)], RelativeSideAhead)
		sum = hashRelativeRow(sum, row)
	}
	sum = hashRelativeRow(sum, playerRelativeRow(window.player, gapsByVehicle[string(window.player.Identity.Vehicle)]))
	for _, current := range window.behind {
		row := relativeRow(current, gapsByVehicle[string(current.Identity.Vehicle)], RelativeSideBehind)
		sum = hashRelativeRow(sum, row)
	}
	sum = hashUint64(sum, uint64(len(window.ahead)))
	sum = hashUint64(sum, uint64(len(window.behind)))
	return sum
}

func hashRelativeRow(sum uint64, row RelativeRowV2) uint64 {
	sum = hashString(sum, row.VehicleID)
	sum = hashString(sum, string(row.GapSeconds.Q))
	sum = hashUint64(sum, math.Float64bits(row.GapSeconds.V))
	sum = hashString(sum, row.Side)
	sum = hashString(sum, string(row.Authority))
	sum = hashString(sum, row.DisplayName)
	return hashString(sum, row.ClassID)
}
