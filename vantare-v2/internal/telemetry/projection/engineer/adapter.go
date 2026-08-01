package engineer

import (
	"errors"
	"fmt"
	"slices"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

var (
	ErrProjectionCapabilityConflict = errors.New("engineer projection capability contradicts its payload")
	ErrProjectionPayloadConflict    = errors.New("engineer projection payload contradicts its context")
	ErrProjectionCanonicalVersion   = errors.New("engineer projection canonical version is unsupported")
)

const (
	CapabilitySession   CapabilityID = "session"
	CapabilityStandings CapabilityID = "standings"
	CapabilityControls  CapabilityID = "controls"
	CapabilityPit       CapabilityID = "pit"
	CapabilityFuel      CapabilityID = "fuel"
	CapabilityGaps      CapabilityID = "gaps"
	CapabilitySpatial   CapabilityID = "spatial"
)

// Vector3 and Orientation are product-facing value types. They prevent
// Engineer consumers from depending on canonical schema packages.
type Vector3 struct {
	X float64
	Y float64
	Z float64
}

type Orientation struct {
	Row0 Vector3
	Row1 Vector3
	Row2 Vector3
}

// ObservationV1 is the only in-process snapshot surface consumed by Engineer.
// It is an owned, full-grid projection with explicit capability and field
// quality. It performs no simulator I/O and contains no message decisions.
type ObservationV1 struct {
	Context       Context
	Manifest      Manifest
	TrackName     Field[string]
	SessionType   Field[string]
	SourceTime    Field[float64]
	EndTime       Field[float64]
	Remaining     Field[float64]
	MaximumLaps   Field[int]
	VehicleCount  Field[int]
	PlayerPresent Field[bool]
	Player        VehicleObservationV1
	Vehicles      []VehicleObservationV1
}

type ObservationSnapshotV1 struct {
	projection.Metadata
	ObservationV1
}

type VehicleObservationV1 struct {
	ID               VehicleID
	DriverName       Field[string]
	VehicleName      Field[string]
	VehicleClass     Field[string]
	IsPlayer         Field[bool]
	LapNumber        Field[int]
	Gear             Field[int]
	EngineRPM        Field[int]
	Speed            Field[float64]
	Throttle         Field[float64]
	Brake            Field[float64]
	Clutch           Field[float64]
	Position         Field[int]
	CompletedLaps    Field[int]
	InPit            Field[bool]
	PitStopCount     Field[int]
	Sector           Field[int]
	LapDistance      Field[float64]
	BestLapTime      Field[float64]
	LastLapTime      Field[float64]
	EstimatedLapTime Field[float64]
	PenaltyCount     Field[int]
	TimeBehindLeader Field[float64]
	LapsBehindLeader Field[int]
	TimeBehindNext   Field[float64]
	LapsBehindNext   Field[int]
	FuelLiters       Field[float64]
	FuelCapacity     Field[float64]
	RelativeTimeGap  Field[float64]
	RelativeLapDelta Field[int]
	WorldPosition    Field[Vector3]
	LocalVelocity    Field[Vector3]
	Orientation      Field[Orientation]
}

// PlayerObservationV1 is retained as a compatibility name for consumers that
// only inspect the active vehicle. The contract itself now exposes the grid.
type PlayerObservationV1 = VehicleObservationV1

func ProjectObservationV1(snapshot envelope.Snapshot[derive.FinalState], manifest Manifest) (ObservationSnapshotV1, error) {
	projected, err := (ProjectorV1{}).Project(snapshot)
	if err != nil {
		return ObservationSnapshotV1{}, err
	}
	payload, ok := projected.Value()
	if !ok {
		return ObservationSnapshotV1{}, envelope.ErrCloneRequired
	}
	metadata, err := projection.NewMetadata(projected.Header(), VersionV1)
	if err != nil {
		return ObservationSnapshotV1{}, fmt.Errorf("project engineer metadata: %w", err)
	}
	observation, err := adaptProjectedV1(metadata, identityFromHeader(projected.Header()), payload, manifest)
	if err != nil {
		return ObservationSnapshotV1{}, err
	}
	return ObservationSnapshotV1{Metadata: metadata, ObservationV1: observation}, nil
}

func adaptProjectedV1(metadata projection.Metadata, run Identity, payload PayloadV1, manifest Manifest) (ObservationV1, error) {
	policy := projection.VersionPolicy{Current: CurrentVersion, MinimumSupported: MinimumSupportedVersion}
	if err := policy.Validate(metadata.ProjectionVersion); err != nil {
		return ObservationV1{}, err
	}
	if metadata.CanonicalVersion != schema.CanonicalVersionV1 {
		return ObservationV1{}, ErrProjectionCanonicalVersion
	}
	if metadata.Epoch == 0 {
		return ObservationV1{}, ErrInvalidProjectionEpoch
	}
	if VehicleID(payload.Player.ID) != run.Vehicle {
		return ObservationV1{}, ErrProjectionPayloadConflict
	}
	if err := validateManifestV1(manifest); err != nil {
		return ObservationV1{}, err
	}
	if err := validateCapabilityGroups(payload); err != nil {
		return ObservationV1{}, err
	}

	trackName, err := adaptField(manifest, CapabilitySession, payload.TrackName)
	if err != nil {
		return ObservationV1{}, err
	}
	sessionType, err := adaptField(manifest, CapabilitySession, payload.SessionType)
	if err != nil {
		return ObservationV1{}, err
	}
	sourceTime, err := adaptField(manifest, CapabilitySession, payload.SourceTime)
	if err != nil {
		return ObservationV1{}, err
	}
	endTime, err := adaptField(manifest, CapabilitySession, payload.EndTime)
	if err != nil {
		return ObservationV1{}, err
	}
	remaining, err := adaptField(manifest, CapabilitySession, payload.Remaining)
	if err != nil {
		return ObservationV1{}, err
	}
	maximumLaps, err := adaptField(manifest, CapabilitySession, payload.MaximumLaps)
	if err != nil {
		return ObservationV1{}, err
	}
	vehicleCount, err := adaptField(manifest, CapabilitySession, payload.VehicleCount)
	if err != nil {
		return ObservationV1{}, err
	}
	playerPresent, err := adaptField(manifest, CapabilitySession, payload.PlayerPresent)
	if err != nil {
		return ObservationV1{}, err
	}
	player, err := adaptVehicle(manifest, payload.Player)
	if err != nil {
		return ObservationV1{}, err
	}
	vehicles := make([]VehicleObservationV1, len(payload.Vehicles))
	for index, current := range payload.Vehicles {
		vehicles[index], err = adaptVehicle(manifest, current)
		if err != nil {
			return ObservationV1{}, fmt.Errorf("adapt vehicle %q: %w", current.ID, err)
		}
	}
	return ObservationV1{
		Context: Context{Epoch: uint64(metadata.Epoch), Identity: run}, Manifest: manifest,
		TrackName: trackName, SessionType: sessionType, SourceTime: sourceTime, EndTime: endTime,
		Remaining: remaining, MaximumLaps: maximumLaps, VehicleCount: vehicleCount,
		PlayerPresent: playerPresent, Player: player, Vehicles: vehicles,
	}, nil
}

func adaptVehicle(manifest Manifest, player PlayerV1) (VehicleObservationV1, error) {
	result := VehicleObservationV1{ID: VehicleID(player.ID)}
	var err error
	if result.DriverName, err = adaptCastField(manifest, CapabilityStandings, player.DriverName, func(v identity.DriverName) string { return string(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.VehicleName, err = adaptCastField(manifest, CapabilityStandings, player.VehicleName, func(v vehicle.VehicleName) string { return string(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.VehicleClass, err = adaptCastField(manifest, CapabilityStandings, player.VehicleClass, func(v standings.VehicleClass) string { return string(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.IsPlayer, err = adaptField(manifest, CapabilityStandings, player.IsPlayer); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.LapNumber, err = adaptCastField(manifest, CapabilityStandings, player.LapNumber, func(v session.LapNumber) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Gear, err = adaptCastField(manifest, CapabilityControls, player.Gear, func(v vehicle.Gear) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.EngineRPM, err = adaptCastField(manifest, CapabilityControls, player.EngineRPM, func(v vehicle.EngineRPM) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Speed, err = adaptField(manifest, CapabilityControls, player.Speed); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Throttle, err = adaptCastField(manifest, CapabilityControls, player.Throttle, func(v schema.Ratio) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Brake, err = adaptCastField(manifest, CapabilityControls, player.Brake, func(v schema.Ratio) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Clutch, err = adaptCastField(manifest, CapabilityControls, player.Clutch, func(v schema.Ratio) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Position, err = adaptCastField(manifest, CapabilityStandings, player.Position, func(v standings.Position) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.CompletedLaps, err = adaptCastField(manifest, CapabilityStandings, player.CompletedLaps, func(v standings.CompletedLaps) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.InPit, err = adaptCastField(manifest, CapabilityPit, player.InPit, func(v pit.InPit) bool { return bool(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.PitStopCount, err = adaptCastField(manifest, CapabilityPit, player.PitStopCount, func(v pit.StopCount) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Sector, err = adaptCastField(manifest, CapabilityStandings, player.Sector, func(v standings.Sector) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.LapDistance, err = adaptCastField(manifest, CapabilityStandings, player.LapDistance, func(v standings.LapDistance) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.BestLapTime, err = adaptCastField(manifest, CapabilityStandings, player.BestLapTime, func(v standings.LapTime) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.LastLapTime, err = adaptCastField(manifest, CapabilityStandings, player.LastLapTime, func(v standings.LapTime) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.EstimatedLapTime, err = adaptCastField(manifest, CapabilityStandings, player.EstimatedLapTime, func(v standings.LapTime) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.PenaltyCount, err = adaptCastField(manifest, CapabilityStandings, player.PenaltyCount, func(v standings.PenaltyCount) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.TimeBehindLeader, err = adaptCastField(manifest, CapabilityGaps, player.TimeBehindLeader, func(v standings.TimeGap) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.LapsBehindLeader, err = adaptCastField(manifest, CapabilityGaps, player.LapsBehindLeader, func(v standings.LapGap) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.TimeBehindNext, err = adaptCastField(manifest, CapabilityGaps, player.TimeBehindNext, func(v standings.TimeGap) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.LapsBehindNext, err = adaptCastField(manifest, CapabilityGaps, player.LapsBehindNext, func(v standings.LapGap) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.FuelLiters, err = adaptCastField(manifest, CapabilityFuel, player.FuelLiters, func(v energy.FuelAmount) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.FuelCapacity, err = adaptCastField(manifest, CapabilityFuel, player.FuelCapacity, func(v energy.FuelCapacity) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.RelativeTimeGap, err = adaptCastField(manifest, CapabilityGaps, player.RelativeTimeGap, func(v standings.RelativeTime) float64 { return float64(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.RelativeLapDelta, err = adaptCastField(manifest, CapabilityGaps, player.RelativeLapDelta, func(v standings.RelativeLaps) int { return int(v) }); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.WorldPosition, err = adaptCastField(manifest, CapabilitySpatial, player.WorldPosition, vector3); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.LocalVelocity, err = adaptCastField(manifest, CapabilitySpatial, player.LocalVelocity, localVector3); err != nil {
		return VehicleObservationV1{}, err
	}
	if result.Orientation, err = adaptCastField(manifest, CapabilitySpatial, player.Orientation, orientation); err != nil {
		return VehicleObservationV1{}, err
	}
	return result, nil
}

func adaptField[T comparable](manifest Manifest, id CapabilityID, field projection.Field[T]) (Field[T], error) {
	if manifest.State(id) == CapabilityUnsupported {
		if field.Present || field.Freshness != projection.FreshnessMissing {
			return Field[T]{}, ErrProjectionCapabilityConflict
		}
		result, err := newUnsupportedField[T](manifest, id)
		if err != nil {
			return Field[T]{}, fmt.Errorf("%w: %v", ErrProjectionCapabilityConflict, err)
		}
		return result, nil
	}
	result, err := newProjectedField(manifest, id, field)
	if err != nil {
		return Field[T]{}, fmt.Errorf("%w: %v", ErrProjectionCapabilityConflict, err)
	}
	return result, nil
}

func adaptCastField[Source, Target comparable](manifest Manifest, id CapabilityID, field projection.Field[Source], convert func(Source) Target) (Field[Target], error) {
	source, err := adaptField(manifest, id, field)
	if err != nil {
		return Field[Target]{}, err
	}
	return castField(source, convert), nil
}

func validateManifestV1(manifest Manifest) error {
	for _, capability := range manifest.Entries() {
		switch capability.ID {
		case CapabilitySession, CapabilityStandings, CapabilityControls, CapabilityPit,
			CapabilityFuel, CapabilityGaps, CapabilitySpatial:
		default:
			return ErrProjectionCapabilityConflict
		}
	}
	return nil
}

func validateCapabilityGroups(payload PayloadV1) error {
	if !slices.Equal(payload.Capabilities, capabilities(payload)) {
		return ErrProjectionCapabilityConflict
	}
	return nil
}

func identityFromHeader(header envelope.Header) Identity {
	return Identity{Event: EventID(header.Identity.Event), Session: SessionID(header.Identity.Session), Vehicle: VehicleID(header.Identity.Vehicle), Team: TeamID(header.Identity.Team), Driver: DriverID(header.Identity.Driver)}
}

func castField[Source, Target comparable](source Field[Source], convert func(Source) Target) Field[Target] {
	value, present := source.Value()
	var target Target
	if present {
		target = convert(value)
	}
	return Field[Target]{capability: source.capability, capabilityState: source.capabilityState, value: target, present: present, provenance: source.provenance, state: source.state}
}

func vector3(value spatial.Position) Vector3 { return Vector3{X: value.X, Y: value.Y, Z: value.Z} }

func localVector3(value spatial.LocalVelocity) Vector3 {
	return Vector3{X: value.X, Y: value.Y, Z: value.Z}
}

func spatialVector3(value spatial.Vector3) Vector3 {
	return Vector3{X: value.X, Y: value.Y, Z: value.Z}
}

func orientation(value spatial.Orientation) Orientation {
	return Orientation{Row0: spatialVector3(value.Row0), Row1: spatialVector3(value.Row1), Row2: spatialVector3(value.Row2)}
}
