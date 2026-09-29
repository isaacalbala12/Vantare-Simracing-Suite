package telemetryprocess

import (
	"encoding/binary"
	"math"
	"time"
	"unicode/utf8"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// DecodeEngineerBinarySnapshot is the strict R21 candidate decoder for VTE1.
// The live receiver continues to select the existing JSON codec until the
// binary route has temporal parity and whole-route performance evidence.
func DecodeEngineerBinarySnapshot(frame Frame) (engineer.SnapshotV1, *engineer.Identity, error) {
	if frame.Kind != KindSnapshot {
		return engineer.SnapshotV1{}, nil, ErrInvalidObservationSnapshot
	}
	r := binaryEngineerReader{data: frame.Payload}
	if string(r.take(4)) != "VTE1" || r.byte() != 1 || r.byte() != 1 {
		return engineer.SnapshotV1{}, nil, ErrInvalidObservationSnapshot
	}
	snapshot := engineer.SnapshotV1{}
	snapshot.Metadata = projection.Metadata{
		CanonicalVersion: 1, ProjectionVersion: 1,
		Epoch: schema.Epoch(r.u64()), Sequence: schema.Sequence(r.u64()),
		CapturedAt: r.string(),
	}
	var run *engineer.Identity
	switch r.byte() {
	case 0:
	case 1:
		run = &engineer.Identity{
			Event: engineer.EventID(r.string()), Session: engineer.SessionID(r.string()),
			Vehicle: engineer.VehicleID(r.string()), Team: engineer.TeamID(r.string()),
			Driver: engineer.DriverID(r.string()),
		}
	default:
		r.invalid()
	}
	capabilities := r.byte()
	if capabilities&^0x7f != 0 {
		r.invalid()
	}
	snapshot.Capabilities = make([]engineer.CapabilityGroup, 0, 7)
	for index, group := range [...]engineer.CapabilityGroup{
		engineer.GroupSession, engineer.GroupStandings, engineer.GroupControls,
		engineer.GroupPit, engineer.GroupFuel, engineer.GroupGaps, engineer.GroupSpatial,
	} {
		if capabilities&(1<<index) != 0 {
			snapshot.Capabilities = append(snapshot.Capabilities, group)
		}
	}
	snapshot.TrackName = binaryStringField[string](&r)
	snapshot.SessionType = binaryStringField[string](&r)
	snapshot.SourceTime = binaryFloatField[float64](&r)
	snapshot.EndTime = binaryFloatField[float64](&r)
	snapshot.Remaining = binaryFloatField[float64](&r)
	snapshot.MaximumLaps = binaryIntField[int](&r)
	snapshot.VehicleCount = binaryIntField[int](&r)
	snapshot.PlayerPresent = binaryBoolField[bool](&r)
	snapshot.Player = r.vehicle()
	count := int(r.u16())
	if count > 512 || count > len(r.data)/34 {
		r.invalid()
	}
	if r.err == nil {
		snapshot.Vehicles = make([]engineer.PlayerV1, count)
		for index := range snapshot.Vehicles {
			snapshot.Vehicles[index] = r.vehicle()
		}
	}
	if r.err != nil || r.offset != len(r.data) || snapshot.Metadata.Epoch == 0 || snapshot.Metadata.Sequence == 0 {
		return engineer.SnapshotV1{}, nil, ErrInvalidObservationSnapshot
	}
	if _, err := time.Parse(time.RFC3339Nano, snapshot.Metadata.CapturedAt); err != nil {
		return engineer.SnapshotV1{}, nil, ErrInvalidObservationSnapshot
	}
	if run != nil && (!(engineer.Context{Epoch: uint64(snapshot.Metadata.Epoch), Identity: *run}).Complete() ||
		run.Vehicle != engineer.VehicleID(snapshot.Player.ID)) {
		return engineer.SnapshotV1{}, nil, ErrInvalidObservationSnapshot
	}
	return snapshot, run, nil
}

type binaryEngineerReader struct {
	data   []byte
	offset int
	err    error
}

func (r *binaryEngineerReader) invalid() { r.err = ErrInvalidObservationSnapshot }

func (r *binaryEngineerReader) take(size int) []byte {
	if r.err != nil || size < 0 || size > len(r.data)-r.offset {
		r.invalid()
		return nil
	}
	value := r.data[r.offset : r.offset+size]
	r.offset += size
	return value
}

func (r *binaryEngineerReader) byte() byte {
	value := r.take(1)
	if value == nil {
		return 0
	}
	return value[0]
}

func (r *binaryEngineerReader) u16() uint16 {
	value := r.take(2)
	if value == nil {
		return 0
	}
	return binary.LittleEndian.Uint16(value)
}

func (r *binaryEngineerReader) u64() uint64 {
	value := r.take(8)
	if value == nil {
		return 0
	}
	return binary.LittleEndian.Uint64(value)
}

func (r *binaryEngineerReader) i32() int32 { return int32(r.u32()) }

func (r *binaryEngineerReader) u32() uint32 {
	value := r.take(4)
	if value == nil {
		return 0
	}
	return binary.LittleEndian.Uint32(value)
}

func (r *binaryEngineerReader) f64() float64 {
	value := math.Float64frombits(r.u64())
	if math.IsNaN(value) || math.IsInf(value, 0) {
		r.invalid()
	}
	return value
}

func (r *binaryEngineerReader) string() string {
	value := r.take(int(r.u16()))
	if value == nil || !utf8.Valid(value) {
		r.invalid()
		return ""
	}
	return string(value)
}

func binaryField[T comparable](r *binaryEngineerReader, read func(*binaryEngineerReader) T) projection.Field[T] {
	flags := r.byte()
	if flags&^0x1f != 0 {
		r.invalid()
	}
	return projection.Field[T]{
		Present: flags&1 != 0, Value: read(r),
		Provenance: [...]projection.Provenance{
			projection.ProvenanceUnknown, projection.ProvenanceObserved,
			projection.ProvenanceDerived, projection.ProvenanceEstimated,
		}[(flags>>1)&3],
		Freshness: [...]projection.Freshness{
			projection.FreshnessMissing, projection.FreshnessFresh,
			projection.FreshnessStale, projection.FreshnessInvalid,
		}[(flags>>3)&3],
	}
}

func binaryStringField[T ~string](r *binaryEngineerReader) projection.Field[T] {
	return binaryField(r, func(r *binaryEngineerReader) T { return T(r.string()) })
}

func binaryIntField[T ~int32 | ~int](r *binaryEngineerReader) projection.Field[T] {
	return binaryField(r, func(r *binaryEngineerReader) T { return T(r.i32()) })
}

func binaryFloatField[T ~float64](r *binaryEngineerReader) projection.Field[T] {
	return binaryField(r, func(r *binaryEngineerReader) T { return T(r.f64()) })
}

func binaryBoolField[T ~bool](r *binaryEngineerReader) projection.Field[T] {
	return binaryField(r, func(r *binaryEngineerReader) T {
		value := r.byte()
		if value > 1 {
			r.invalid()
		}
		return T(value == 1)
	})
}

func binaryU8Field[T ~uint8](r *binaryEngineerReader) projection.Field[T] {
	return binaryField(r, func(r *binaryEngineerReader) T { return T(r.byte()) })
}

func (r *binaryEngineerReader) vector() spatial.Vector3 {
	return spatial.Vector3{X: r.f64(), Y: r.f64(), Z: r.f64()}
}

func (r *binaryEngineerReader) vehicle() engineer.PlayerV1 {
	value := engineer.PlayerV1{ID: identity.VehicleID(r.string())}
	value.DriverName = binaryStringField[identity.DriverName](r)
	value.VehicleName = binaryStringField[vehicle.VehicleName](r)
	value.VehicleClass = binaryStringField[standings.VehicleClass](r)
	value.IsPlayer = binaryBoolField[bool](r)
	value.LapNumber = binaryIntField[session.LapNumber](r)
	value.Gear = binaryIntField[vehicle.Gear](r)
	value.EngineRPM = binaryFloatField[vehicle.EngineRPM](r)
	value.Speed = binaryFloatField[float64](r)
	value.Throttle = binaryFloatField[schema.Ratio](r)
	value.Brake = binaryFloatField[schema.Ratio](r)
	value.Clutch = binaryFloatField[schema.Ratio](r)
	value.Position = binaryIntField[standings.Position](r)
	value.CompletedLaps = binaryIntField[standings.CompletedLaps](r)
	value.InPit = binaryBoolField[pit.InPit](r)
	value.PitStopCount = binaryIntField[pit.StopCount](r)
	value.Sector = binaryU8Field[standings.Sector](r)
	value.LapDistance = binaryFloatField[standings.LapDistance](r)
	value.BestLapTime = binaryFloatField[standings.LapTime](r)
	value.LastLapTime = binaryFloatField[standings.LapTime](r)
	value.EstimatedLapTime = binaryFloatField[standings.LapTime](r)
	value.PenaltyCount = binaryIntField[standings.PenaltyCount](r)
	value.TimeBehindLeader = binaryFloatField[standings.TimeGap](r)
	value.LapsBehindLeader = binaryIntField[standings.LapGap](r)
	value.TimeBehindNext = binaryFloatField[standings.TimeGap](r)
	value.LapsBehindNext = binaryIntField[standings.LapGap](r)
	value.FuelLiters = binaryFloatField[energy.FuelAmount](r)
	value.FuelCapacity = binaryFloatField[energy.FuelCapacity](r)
	value.RelativeTimeGap = binaryFloatField[standings.RelativeTime](r)
	value.RelativeLapDelta = binaryIntField[standings.RelativeLaps](r)
	value.WorldPosition = binaryField(r, func(r *binaryEngineerReader) spatial.Position { return spatial.Position(r.vector()) })
	value.LocalVelocity = binaryField(r, func(r *binaryEngineerReader) spatial.LocalVelocity { return spatial.LocalVelocity(r.vector()) })
	value.Orientation = binaryField(r, func(r *binaryEngineerReader) spatial.Orientation {
		return spatial.Orientation{Row0: r.vector(), Row1: r.vector(), Row2: r.vector()}
	})
	return value
}
