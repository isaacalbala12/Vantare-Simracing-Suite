package v1

import (
	"fmt"
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/damage"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const deltaReferenceBestCompletedPlayerLap = "best-completed-player-lap"

// Project copies the closed remote allowlist from one accepted final snapshot.
// It is pure and performs no I/O. Peek is safe because every projected slice
// and pointer is newly owned and the canonical snapshot is only read.
func Project(snapshot envelope.Snapshot[derive.FinalState]) (RemoteCanonicalUpdateV1, error) {
	final, ok := snapshot.Peek()
	if !ok {
		return RemoteCanonicalUpdateV1{}, ErrSnapshotUnavailable
	}
	header := snapshot.Header()
	update := RemoteCanonicalUpdateV1{
		Version:          VersionV1,
		Kind:             KindFull,
		CanonicalVersion: CanonicalVersionV1,
		StreamEpoch:      uint64(header.Cursor.Epoch),
		Revision:         uint64(header.Cursor.Sequence),
		SessionID:        string(header.Identity.Session),
		CapturedAt:       header.Clock.ReceivedUTC.Round(0).UTC().Format(time.RFC3339Nano),
		Session: SessionV1{
			Track:            projectQ(final.Observed.TrackName, func(value string) string { return value }),
			Type:             projectQ(final.Observed.SessionType, projection.SessionTypeName),
			RemainingSeconds: projectQ(final.Derived.SessionRemaining, func(value session.RemainingTime) float64 { return float64(value) }),
			MaximumLaps:      projectQ(final.Observed.MaximumLaps, func(value session.MaximumLaps) int32 { return int32(value) }),
		},
		Player:   projectPlayer(final, string(header.Identity.Vehicle)),
		Vehicles: make([]VehicleV1, len(final.Observed.Vehicles)),
	}
	for index, current := range final.Observed.Vehicles {
		update.Vehicles[index] = projectVehicle(current, findGap(final.Derived.Gaps, string(current.Identity.Vehicle)))
	}
	if err := Validate(update); err != nil {
		return RemoteCanonicalUpdateV1{}, fmt.Errorf("project remote canonical update V1: %w", err)
	}
	return update, nil
}

func projectPlayer(final derive.FinalState, playerID string) PlayerV1 {
	result := missingPlayer()
	if playerID == "" {
		return result
	}
	result.VehicleID = playerID
	for _, current := range final.Observed.Vehicles {
		if string(current.Identity.Vehicle) != playerID {
			continue
		}
		result.SpeedMPS = projectQ(current.SpeedMPS, func(value float64) float64 { return value })
		result.RPM = projectQ(current.EngineRPM, func(value vehicle.EngineRPM) float64 { return float64(value) })
		result.Gear = projectQ(current.Gear, func(value vehicle.Gear) int32 { return int32(value) })
		result.Throttle = projectQ(current.Throttle, func(value schema.Ratio) float64 { return float64(value) })
		result.Brake = projectQ(current.Brake, func(value schema.Ratio) float64 { return float64(value) })
		result.Clutch = projectQ(current.Clutch, func(value schema.Ratio) float64 { return float64(value) })
		result.LapNumber = projectQ(current.LapNumber, func(value session.LapNumber) int32 { return int32(value) })
		result.CompletedLaps = projectQ(current.CompletedLaps, func(value standings.CompletedLaps) int32 { return int32(value) })
		result.Sector = projectQ(current.Sector, func(value standings.Sector) uint8 { return uint8(value) })
		result.LapDistanceMeters = projectQ(current.LapDistance, func(value standings.LapDistance) float64 { return float64(value) })
		result.InPit = projectQ(current.InPit, func(value pit.InPit) bool { return bool(value) })
		result.PitStopCount = projectQ(current.PitStopCount, func(value pit.StopCount) int32 { return int32(value) })
		result.FuelRemainingLiters = projectQ(current.Fuel, func(value energy.Fuel) float64 { return float64(value.Amount) })
		result.FuelCapacityLiters = projectQ(current.Fuel, func(value energy.Fuel) float64 { return float64(value.Capacity) })
		result.FuelPerLapLiters = projectQ(final.Derived.Fuel.PerLap, func(value energy.FuelAmount) float64 { return float64(value) })
		result.DeltaSeconds = projectQ(final.Derived.Delta.Seconds, func(value session.DeltaSeconds) float64 { return float64(value) })
		result.DeltaReference = projectDeltaReference(final.Derived.Delta.Reference)
		result.Damage = projectDamage(current.Damage)
		return result
	}
	return result
}

func missingPlayer() PlayerV1 {
	return PlayerV1{
		SpeedMPS: missingQ[float64](), RPM: missingQ[float64](), Gear: missingQ[int32](),
		Throttle: missingQ[float64](), Brake: missingQ[float64](), Clutch: missingQ[float64](),
		LapNumber: missingQ[int32](), CompletedLaps: missingQ[int32](), Sector: missingQ[uint8](),
		LapDistanceMeters: missingQ[float64](), InPit: missingQ[bool](), PitStopCount: missingQ[int32](),
		FuelRemainingLiters: missingQ[float64](), FuelCapacityLiters: missingQ[float64](), FuelPerLapLiters: missingQ[float64](),
		DeltaSeconds: missingQ[float64](), DeltaReference: missingQ[string](), Damage: missingDamage(),
	}
}

func projectVehicle(current core.VehicleState, gap derive.VehicleGap) VehicleV1 {
	return VehicleV1{
		VehicleID:          string(current.Identity.Vehicle),
		DriverName:         projectQ(current.DriverName, func(value identity.DriverName) string { return string(value) }),
		VehicleName:        projectQ(current.Name, func(value vehicle.VehicleName) string { return string(value) }),
		VehicleClass:       projectQ(current.VehicleClass, func(value standings.VehicleClass) string { return string(value) }),
		Position:           projectQ(current.Position, func(value standings.Position) int32 { return int32(value) }),
		LapNumber:          projectQ(current.LapNumber, func(value session.LapNumber) int32 { return int32(value) }),
		CompletedLaps:      projectQ(current.CompletedLaps, func(value standings.CompletedLaps) int32 { return int32(value) }),
		Sector:             projectQ(current.Sector, func(value standings.Sector) uint8 { return uint8(value) }),
		LapDistanceMeters:  projectQ(current.LapDistance, func(value standings.LapDistance) float64 { return float64(value) }),
		InPit:              projectQ(current.InPit, func(value pit.InPit) bool { return bool(value) }),
		PenaltyCount:       projectQ(current.PenaltyCount, func(value standings.PenaltyCount) int32 { return int32(value) }),
		GapToLeaderSeconds: projectQ(current.TimeBehindLeader, func(value standings.TimeGap) float64 { return float64(value) }),
		LapsBehindLeader:   projectQ(current.LapsBehindLeader, func(value standings.LapGap) int32 { return int32(value) }),
		GapToNextSeconds:   projectQ(current.TimeBehindNext, func(value standings.TimeGap) float64 { return float64(value) }),
		LapsBehindNext:     projectQ(current.LapsBehindNext, func(value standings.LapGap) int32 { return int32(value) }),
		GapToPlayerSeconds: projectQ(gap.Time, func(value standings.RelativeTime) float64 { return float64(value) }),
		LapDeltaToPlayer:   projectQ(gap.Laps, func(value standings.RelativeLaps) int32 { return int32(value) }),
		GroundPositionCM:   projectGroundPosition(current.WorldPosition),
	}
}

func projectDamage(field schema.Field[damage.State]) PlayerDamageV1 {
	value, present := field.Value()
	quality := qualityFromFreshness(field.Freshness())
	if !present || quality == QualityMissing {
		return missingDamage()
	}
	if quality == QualityInvalid {
		return PlayerDamageV1{Dents: invalidQ[[]uint16](), Overheating: invalidQ[bool](), Detached: invalidQ[bool](), WheelDetachedCount: invalidQ[uint8]()}
	}
	dents := make([]uint16, len(value.Dents))
	for index := range value.Dents {
		dents[index] = uint16(value.Dents[index])
	}
	return PlayerDamageV1{
		Dents: presentQ(quality, dents), Overheating: presentQ(quality, value.Overheating),
		Detached: presentQ(quality, value.Detached), WheelDetachedCount: presentQ(quality, value.WheelDetachedCount),
	}
}

func missingDamage() PlayerDamageV1 {
	return PlayerDamageV1{Dents: missingQ[[]uint16](), Overheating: missingQ[bool](), Detached: missingQ[bool](), WheelDetachedCount: missingQ[uint8]()}
}

func projectGroundPosition(field schema.Field[spatial.Position]) QValue[GroundPositionCM] {
	value, present := field.Value()
	quality := qualityFromFreshness(field.Freshness())
	if !present || quality == QualityMissing {
		return missingQ[GroundPositionCM]()
	}
	if quality == QualityInvalid {
		return invalidQ[GroundPositionCM]()
	}
	x, xOK := centimetres(value.X)
	z, zOK := centimetres(value.Z)
	if !xOK || !zOK {
		return invalidQ[GroundPositionCM]()
	}
	return presentQ(quality, GroundPositionCM{X: x, Z: z})
}

func projectDeltaReference(field schema.Field[session.DeltaReference]) QValue[string] {
	value, present := field.Value()
	quality := qualityFromFreshness(field.Freshness())
	if !present || quality == QualityMissing {
		return missingQ[string]()
	}
	if quality == QualityInvalid || !value.Known() {
		return invalidQ[string]()
	}
	return presentQ(quality, deltaReferenceBestCompletedPlayerLap)
}

func centimetres(metres float64) (int32, bool) {
	if math.IsNaN(metres) || math.IsInf(metres, 0) {
		return 0, false
	}
	scaled := math.Round(metres * 100)
	if scaled < math.MinInt32 || scaled > math.MaxInt32 {
		return 0, false
	}
	return int32(scaled), true
}

func findGap(gaps derive.GapSet, vehicleID string) derive.VehicleGap {
	for _, gap := range gaps.Vehicles {
		if string(gap.Vehicle) == vehicleID {
			return gap
		}
	}
	return derive.VehicleGap{}
}

func projectQ[Source comparable, Target any](field schema.Field[Source], convert func(Source) Target) QValue[Target] {
	value, present := field.Value()
	quality := qualityFromFreshness(field.Freshness())
	if !present || quality == QualityMissing {
		return missingQ[Target]()
	}
	if quality == QualityInvalid {
		return invalidQ[Target]()
	}
	return presentQ(quality, convert(value))
}

func presentQ[T any](quality Quality, value T) QValue[T] {
	return QValue[T]{Quality: quality, Value: &value}
}

func missingQ[T any]() QValue[T] { return QValue[T]{Quality: QualityMissing} }

func invalidQ[T any]() QValue[T] { return QValue[T]{Quality: QualityInvalid} }

func qualityFromFreshness(freshness schema.Freshness) Quality {
	switch freshness {
	case schema.FreshnessFresh:
		return QualityFresh
	case schema.FreshnessStale:
		return QualityStale
	case schema.FreshnessInvalid:
		return QualityInvalid
	default:
		return QualityMissing
	}
}
