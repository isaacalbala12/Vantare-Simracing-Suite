// Package analysis is deprecated as a live projection. It remains only as the
// transport-neutral contract reference for F12.b post-session Analysis.
package analysis

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const VersionV1 projection.Version = 1

// Deprecated: reference version for F12.b post-session Analysis; no live consumer.
const CurrentVersion projection.Version = VersionV1

// Deprecated: reference version for F12.b post-session Analysis; no live consumer.
const MinimumSupportedVersion projection.Version = VersionV1

type Capability string

const (
	CapabilitySession  Capability = "session"
	CapabilityLap      Capability = "lap"
	CapabilityControls Capability = "controls"
)

type SnapshotV1 struct {
	projection.Metadata
	PayloadV1
}

type PayloadV1 struct {
	Capabilities []Capability             `json:"capabilities"`
	TrackName    projection.Field[string] `json:"trackName"`
	SessionType  projection.Field[string] `json:"sessionType"`
	Player       PlayerV1                 `json:"player"`
}

type PlayerV1 struct {
	ID        identity.VehicleID                  `json:"id"`
	LapNumber projection.Field[session.LapNumber] `json:"lapNumber"`
	Gear      projection.Field[vehicle.Gear]      `json:"gear"`
	EngineRPM projection.Field[vehicle.EngineRPM] `json:"engineRpm"`
	Speed     projection.Field[float64]           `json:"speedMps"`
	Throttle  projection.Field[schema.Ratio]      `json:"throttle"`
	Brake     projection.Field[schema.Ratio]      `json:"brake"`
	Clutch    projection.Field[schema.Ratio]      `json:"clutch"`
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
		Capabilities: make([]Capability, 0, 3),
		TrackName:    projection.FromField(state.TrackName),
		SessionType:  projection.MapField(state.SessionType, projection.SessionTypeName),
		Player:       missingPlayer(snapshot.Header().Identity.Vehicle),
	}
	for _, current := range state.Vehicles {
		if current.Identity.Vehicle == result.Player.ID {
			result.Player.LapNumber = projection.FromField(current.LapNumber)
			result.Player.Gear = projection.FromField(current.Gear)
			result.Player.EngineRPM = projection.FromField(current.EngineRPM)
			result.Player.Speed = projection.FromField(current.SpeedMPS)
			result.Player.Throttle = projection.FromField(current.Throttle)
			result.Player.Brake = projection.FromField(current.Brake)
			result.Player.Clutch = projection.FromField(current.Clutch)
			break
		}
	}
	if projection.Available(result.TrackName) || projection.Available(result.SessionType) {
		result.Capabilities = append(result.Capabilities, CapabilitySession)
	}
	if projection.Available(result.Player.LapNumber) {
		result.Capabilities = append(result.Capabilities, CapabilityLap)
	}
	if projection.Available(result.Player.Speed) || projection.Available(result.Player.Throttle) ||
		projection.Available(result.Player.Brake) || projection.Available(result.Player.Clutch) ||
		projection.Available(result.Player.Gear) || projection.Available(result.Player.EngineRPM) {
		result.Capabilities = append(result.Capabilities, CapabilityControls)
	}
	projected, err := envelope.NewSnapshot(snapshot.Header(), result, clonePayload)
	if err != nil {
		return envelope.Snapshot[PayloadV1]{}, fmt.Errorf("own analysis projection: %w", err)
	}
	return projected, nil
}

func missingPlayer(id identity.VehicleID) PlayerV1 {
	return PlayerV1{
		ID:        id,
		LapNumber: projection.MissingField[session.LapNumber](),
		Gear:      projection.MissingField[vehicle.Gear](),
		EngineRPM: projection.MissingField[vehicle.EngineRPM](),
		Speed:     projection.MissingField[float64](),
		Throttle:  projection.MissingField[schema.Ratio](),
		Brake:     projection.MissingField[schema.Ratio](),
		Clutch:    projection.MissingField[schema.Ratio](),
	}
}

// Deprecated: reference projector for F12.b post-session Analysis; no live consumer.
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
		return SnapshotV1{}, fmt.Errorf("project analysis metadata: %w", err)
	}
	return SnapshotV1{Metadata: metadata, PayloadV1: payload}, nil
}

func clonePayload(value PayloadV1) PayloadV1 {
	value.Capabilities = append([]Capability(nil), value.Capabilities...)
	return value
}
