// Package engineer defines the live observation contract consumed by Engineer
// and Spotter. It contains observations and facts, never message or strategy
// decisions.
package engineer

import (
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const (
	VersionV1               projection.Version = 1
	CurrentVersion          projection.Version = VersionV1
	MinimumSupportedVersion projection.Version = VersionV1
)

var ErrUnknownFactKind = errors.New("unknown engineer projection fact kind")

type CapabilityGroup string

const (
	GroupSession   CapabilityGroup = "session"
	GroupStandings CapabilityGroup = "standings"
	GroupControls  CapabilityGroup = "controls"
	GroupPit       CapabilityGroup = "pit"
)

type SnapshotV1 struct {
	projection.Metadata
	PayloadV1
}

type PayloadV1 struct {
	Capabilities []CapabilityGroup        `json:"capabilities"`
	TrackName    projection.Field[string] `json:"trackName"`
	SessionType  projection.Field[string] `json:"sessionType"`
	Player       PlayerV1                 `json:"player"`
}

type PlayerV1 struct {
	ID            identity.VehicleID                        `json:"id"`
	LapNumber     projection.Field[session.LapNumber]       `json:"lapNumber"`
	Gear          projection.Field[vehicle.Gear]            `json:"gear"`
	EngineRPM     projection.Field[vehicle.EngineRPM]       `json:"engineRpm"`
	Speed         projection.Field[float64]                 `json:"speedMps"`
	Throttle      projection.Field[schema.Ratio]            `json:"throttle"`
	Brake         projection.Field[schema.Ratio]            `json:"brake"`
	Clutch        projection.Field[schema.Ratio]            `json:"clutch"`
	Position      projection.Field[standings.Position]      `json:"position"`
	CompletedLaps projection.Field[standings.CompletedLaps] `json:"completedLaps"`
	InPit         projection.Field[pit.InPit]               `json:"inPit"`
	PitStopCount  projection.Field[pit.StopCount]           `json:"pitStopCount"`
}

type ProjectorV1 struct{}

var _ projection.Projector[derive.FinalState, PayloadV1] = ProjectorV1{}

func (ProjectorV1) Project(snapshot envelope.Snapshot[derive.FinalState]) (envelope.Snapshot[PayloadV1], error) {
	final, ok := snapshot.Value()
	if !ok {
		return envelope.Snapshot[PayloadV1]{}, envelope.ErrCloneRequired
	}
	state := final.Observed
	result := PayloadV1{
		Capabilities: make([]CapabilityGroup, 0, 4),
		TrackName:    projection.FromField(state.TrackName),
		SessionType:  projection.MapField(state.SessionType, projection.SessionTypeName),
		Player:       missingPlayer(snapshot.Header().Identity.Vehicle),
	}
	for _, current := range state.Vehicles {
		if current.Identity.Vehicle == result.Player.ID {
			result.Player = projectPlayer(current)
			break
		}
	}
	result.Capabilities = capabilities(result)
	projected, err := envelope.NewSnapshot(snapshot.Header(), result, clonePayload)
	if err != nil {
		return envelope.Snapshot[PayloadV1]{}, fmt.Errorf("own engineer projection: %w", err)
	}
	return projected, nil
}

func ProjectV1(snapshot envelope.Snapshot[derive.FinalState]) (SnapshotV1, error) {
	projected, err := (ProjectorV1{}).Project(snapshot)
	if err != nil {
		return SnapshotV1{}, err
	}
	payload, ok := projected.Value()
	if !ok {
		return SnapshotV1{}, envelope.ErrCloneRequired
	}
	metadata, err := projection.NewMetadata(projected.Header(), VersionV1)
	if err != nil {
		return SnapshotV1{}, fmt.Errorf("project engineer metadata: %w", err)
	}
	return SnapshotV1{Metadata: metadata, PayloadV1: payload}, nil
}

func missingPlayer(id identity.VehicleID) PlayerV1 {
	return PlayerV1{
		ID:            id,
		LapNumber:     projection.MissingField[session.LapNumber](),
		Gear:          projection.MissingField[vehicle.Gear](),
		EngineRPM:     projection.MissingField[vehicle.EngineRPM](),
		Speed:         projection.MissingField[float64](),
		Throttle:      projection.MissingField[schema.Ratio](),
		Brake:         projection.MissingField[schema.Ratio](),
		Clutch:        projection.MissingField[schema.Ratio](),
		Position:      projection.MissingField[standings.Position](),
		CompletedLaps: projection.MissingField[standings.CompletedLaps](),
		InPit:         projection.MissingField[pit.InPit](),
		PitStopCount:  projection.MissingField[pit.StopCount](),
	}
}

func projectPlayer(current core.VehicleState) PlayerV1 {
	return PlayerV1{
		ID:            current.Identity.Vehicle,
		LapNumber:     projection.FromField(current.LapNumber),
		Gear:          projection.FromField(current.Gear),
		EngineRPM:     projection.FromField(current.EngineRPM),
		Speed:         projection.FromField(current.SpeedMPS),
		Throttle:      projection.FromField(current.Throttle),
		Brake:         projection.FromField(current.Brake),
		Clutch:        projection.FromField(current.Clutch),
		Position:      projection.FromField(current.Position),
		CompletedLaps: projection.FromField(current.CompletedLaps),
		InPit:         projection.FromField(current.InPit),
		PitStopCount:  projection.FromField(current.PitStopCount),
	}
}

func capabilities(snapshot PayloadV1) []CapabilityGroup {
	result := make([]CapabilityGroup, 0, 4)
	if projection.Available(snapshot.TrackName) || projection.Available(snapshot.SessionType) {
		result = append(result, GroupSession)
	}
	if projection.Available(snapshot.Player.Position) || projection.Available(snapshot.Player.CompletedLaps) {
		result = append(result, GroupStandings)
	}
	if projection.Available(snapshot.Player.Speed) || projection.Available(snapshot.Player.Throttle) ||
		projection.Available(snapshot.Player.Brake) || projection.Available(snapshot.Player.Clutch) ||
		projection.Available(snapshot.Player.Gear) || projection.Available(snapshot.Player.EngineRPM) {
		result = append(result, GroupControls)
	}
	if projection.Available(snapshot.Player.InPit) || projection.Available(snapshot.Player.PitStopCount) {
		result = append(result, GroupPit)
	}
	return result
}

func clonePayload(value PayloadV1) PayloadV1 {
	value.Capabilities = append([]CapabilityGroup(nil), value.Capabilities...)
	return value
}

type FactKind string

const (
	FactSessionStarted      FactKind = "session.started"
	FactSessionEnded        FactKind = "session.ended"
	FactLapCompleted        FactKind = "lap.completed"
	FactPitEntered          FactKind = "pit.entered"
	FactPitExited           FactKind = "pit.exited"
	FactDriverChanged       FactKind = "driver.changed"
	FactConnectionLost      FactKind = "connection.lost"
	FactConnectionRecovered FactKind = "connection.recovered"
)

type FactEnvelopeV1 struct {
	projection.Metadata
	Fact FactV1 `json:"fact"`
}

type FactV1 struct {
	Sequence   core.FactSequence  `json:"sequence"`
	Kind       FactKind           `json:"kind"`
	OccurredAt string             `json:"occurredAt"`
	VehicleID  identity.VehicleID `json:"vehicleId"`
	Lap        session.LapNumber  `json:"lap"`
}

func ProjectFactV1(fact envelope.Fact[core.SessionFact]) (FactEnvelopeV1, error) {
	metadata, err := projection.NewMetadata(fact.Header(), VersionV1)
	if err != nil {
		return FactEnvelopeV1{}, fmt.Errorf("project engineer fact metadata: %w", err)
	}
	value := fact.Value()
	kind, ok := factKind(value.Kind)
	if !ok {
		return FactEnvelopeV1{}, fmt.Errorf("%w: %d", ErrUnknownFactKind, value.Kind)
	}
	return FactEnvelopeV1{
		Metadata: metadata,
		Fact: FactV1{
			Sequence:   value.Sequence,
			Kind:       kind,
			OccurredAt: value.OccurredUTC.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
			VehicleID:  value.Identity.Vehicle,
			Lap:        value.Lap,
		},
	}, nil
}

func factKind(value core.FactKind) (FactKind, bool) {
	switch value {
	case core.FactSessionStarted:
		return FactSessionStarted, true
	case core.FactSessionEnded:
		return FactSessionEnded, true
	case core.FactLapCompleted:
		return FactLapCompleted, true
	case core.FactPitEntered:
		return FactPitEntered, true
	case core.FactPitExited:
		return FactPitExited, true
	case core.FactDriverChanged:
		return FactDriverChanged, true
	case core.FactConnectionLost:
		return FactConnectionLost, true
	case core.FactConnectionRecovered:
		return FactConnectionRecovered, true
	default:
		return "", false
	}
}
