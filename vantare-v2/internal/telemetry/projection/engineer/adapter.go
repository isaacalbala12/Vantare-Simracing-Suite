package engineer

import (
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
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
)

// ObservationV1 is the only in-process snapshot surface consumed by Engineer.
// Envelope metadata and compatibility remain owned by TC-05A; this value keeps
// only the cancellation context, capability manifest and product fields.
type ObservationV1 struct {
	Context     Context
	Manifest    Manifest
	TrackName   Field[string]
	SessionType Field[string]
	Player      PlayerObservationV1
}

// ObservationSnapshotV1 reuses the only TC-05A projection metadata. It is not
// a second envelope: the version, cursor and capture time are copied once from
// the transversal projection result.
type ObservationSnapshotV1 struct {
	projection.Metadata
	ObservationV1
}

type PlayerObservationV1 struct {
	ID            VehicleID
	LapNumber     Field[int]
	Gear          Field[int]
	EngineRPM     Field[int]
	Speed         Field[float64]
	Throttle      Field[float64]
	Brake         Field[float64]
	Clutch        Field[float64]
	Position      Field[int]
	CompletedLaps Field[int]
	InPit         Field[bool]
	PitStopCount  Field[int]
}

// ProjectObservationV1 composes the TC-05A ProjectorV1 with the ENG-02
// capability contract. It is producer-side code: Engineer consumers receive
// ObservationSnapshotV1 and never import canonical schema, core, derive or
// envelope.
func ProjectObservationV1(
	snapshot envelope.Snapshot[derive.FinalState],
	manifest Manifest,
) (ObservationSnapshotV1, error) {
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
	return ObservationSnapshotV1{
		Metadata:      metadata,
		ObservationV1: observation,
	}, nil
}

// adaptProjectedV1 validates and adapts one TC-05A Engineer payload. Sequence
// is intentionally not interpreted: full snapshots are latest-wins and may
// legitimately skip intermediate values.
func adaptProjectedV1(
	metadata projection.Metadata,
	identity Identity,
	payload PayloadV1,
	manifest Manifest,
) (ObservationV1, error) {
	policy := projection.VersionPolicy{
		Current:          CurrentVersion,
		MinimumSupported: MinimumSupportedVersion,
	}
	if err := policy.Validate(metadata.ProjectionVersion); err != nil {
		return ObservationV1{}, err
	}
	if metadata.CanonicalVersion != schema.CanonicalVersionV1 {
		return ObservationV1{}, ErrProjectionCanonicalVersion
	}
	if metadata.Epoch == 0 {
		return ObservationV1{}, ErrInvalidProjectionEpoch
	}
	if VehicleID(payload.Player.ID) != identity.Vehicle {
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
	player, err := adaptPlayer(manifest, payload.Player)
	if err != nil {
		return ObservationV1{}, err
	}
	return ObservationV1{
		Context: Context{
			Epoch:    uint64(metadata.Epoch),
			Identity: identity,
		},
		Manifest:    manifest,
		TrackName:   trackName,
		SessionType: sessionType,
		Player:      player,
	}, nil
}

func adaptPlayer(manifest Manifest, player PlayerV1) (PlayerObservationV1, error) {
	lapNumber, err := adaptField(manifest, CapabilityStandings, player.LapNumber)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	gear, err := adaptField(manifest, CapabilityControls, player.Gear)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	engineRPM, err := adaptField(manifest, CapabilityControls, player.EngineRPM)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	speed, err := adaptField(manifest, CapabilityControls, player.Speed)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	throttle, err := adaptField(manifest, CapabilityControls, player.Throttle)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	brake, err := adaptField(manifest, CapabilityControls, player.Brake)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	clutch, err := adaptField(manifest, CapabilityControls, player.Clutch)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	position, err := adaptField(manifest, CapabilityStandings, player.Position)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	completedLaps, err := adaptField(manifest, CapabilityStandings, player.CompletedLaps)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	inPit, err := adaptField(manifest, CapabilityPit, player.InPit)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	pitStopCount, err := adaptField(manifest, CapabilityPit, player.PitStopCount)
	if err != nil {
		return PlayerObservationV1{}, err
	}
	return PlayerObservationV1{
		ID:            VehicleID(player.ID),
		LapNumber:     castField(lapNumber, func(value session.LapNumber) int { return int(value) }),
		Gear:          castField(gear, func(value vehicle.Gear) int { return int(value) }),
		EngineRPM:     castField(engineRPM, func(value vehicle.EngineRPM) int { return int(value) }),
		Speed:         speed,
		Throttle:      castField(throttle, func(value schema.Ratio) float64 { return float64(value) }),
		Brake:         castField(brake, func(value schema.Ratio) float64 { return float64(value) }),
		Clutch:        castField(clutch, func(value schema.Ratio) float64 { return float64(value) }),
		Position:      castField(position, func(value standings.Position) int { return int(value) }),
		CompletedLaps: castField(completedLaps, func(value standings.CompletedLaps) int { return int(value) }),
		InPit:         castField(inPit, func(value pit.InPit) bool { return bool(value) }),
		PitStopCount:  castField(pitStopCount, func(value pit.StopCount) int { return int(value) }),
	}, nil
}

func adaptField[T comparable](
	manifest Manifest,
	id CapabilityID,
	field projection.Field[T],
) (Field[T], error) {
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

func validateManifestV1(manifest Manifest) error {
	for _, capability := range manifest.Entries() {
		switch capability.ID {
		case CapabilitySession, CapabilityStandings, CapabilityControls, CapabilityPit:
		default:
			return ErrProjectionCapabilityConflict
		}
	}
	return nil
}

func validateCapabilityGroups(payload PayloadV1) error {
	seen := make(map[CapabilityGroup]struct{}, len(payload.Capabilities))
	lastIndex := -1
	for _, group := range payload.Capabilities {
		if _, exists := seen[group]; exists {
			return ErrProjectionCapabilityConflict
		}
		seen[group] = struct{}{}
		index := capabilityGroupOrder(group)
		if index < 0 || index <= lastIndex || !groupAvailable(payload, group) {
			return ErrProjectionCapabilityConflict
		}
		lastIndex = index
	}
	for _, group := range []CapabilityGroup{GroupSession, GroupStandings, GroupControls, GroupPit} {
		_, declared := seen[group]
		if groupAvailable(payload, group) != declared {
			return ErrProjectionCapabilityConflict
		}
	}
	return nil
}

func groupAvailable(payload PayloadV1, group CapabilityGroup) bool {
	switch group {
	case GroupSession:
		return projection.Available(payload.TrackName) || projection.Available(payload.SessionType)
	case GroupStandings:
		return projection.Available(payload.Player.LapNumber) ||
			projection.Available(payload.Player.Position) ||
			projection.Available(payload.Player.CompletedLaps)
	case GroupControls:
		return projection.Available(payload.Player.Gear) ||
			projection.Available(payload.Player.EngineRPM) ||
			projection.Available(payload.Player.Speed) ||
			projection.Available(payload.Player.Throttle) ||
			projection.Available(payload.Player.Brake) ||
			projection.Available(payload.Player.Clutch)
	case GroupPit:
		return projection.Available(payload.Player.InPit) ||
			projection.Available(payload.Player.PitStopCount)
	default:
		return false
	}
}

func capabilityGroupOrder(group CapabilityGroup) int {
	switch group {
	case GroupSession:
		return 0
	case GroupStandings:
		return 1
	case GroupControls:
		return 2
	case GroupPit:
		return 3
	default:
		return -1
	}
}

func identityFromHeader(header envelope.Header) Identity {
	return Identity{
		Event:   EventID(header.Identity.Event),
		Session: SessionID(header.Identity.Session),
		Vehicle: VehicleID(header.Identity.Vehicle),
		Team:    TeamID(header.Identity.Team),
		Driver:  DriverID(header.Identity.Driver),
	}
}

func castField[Source, Target comparable](source Field[Source], convert func(Source) Target) Field[Target] {
	value, present := source.Value()
	var target Target
	if present {
		target = convert(value)
	}
	return Field[Target]{
		capability:      source.capability,
		capabilityState: source.capabilityState,
		value:           target,
		present:         present,
		provenance:      source.provenance,
		state:           source.state,
	}
}
