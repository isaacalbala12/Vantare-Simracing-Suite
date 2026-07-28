// Package overlay defines the transport-neutral telemetry contract consumed by
// Overlay Studio, Desktop and OBS.
package overlay

import (
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

type Capability string

const (
	CapabilitySession   Capability = "session"
	CapabilityStandings Capability = "standings"
	CapabilityControls  Capability = "controls"
	CapabilityHistory   Capability = "controls.history"
	CapabilityPit       Capability = "pit"
)

type SnapshotV1 struct {
	projection.Metadata
	PayloadV1
}

type PayloadV1 struct {
	Capabilities []Capability             `json:"capabilities"`
	TrackName    projection.Field[string] `json:"trackName"`
	SessionType  projection.Field[string] `json:"sessionType"`
	Player       identity.VehicleID       `json:"playerVehicleId"`
	Vehicles     []VehicleV1              `json:"vehicles"`
	History      ControlHistoryV1         `json:"controlsHistory"`
}

type VehicleV1 struct {
	ID            identity.VehicleID                        `json:"id"`
	Name          projection.Field[vehicle.VehicleName]     `json:"name"`
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

type ControlHistoryV1 struct {
	Present    bool                  `json:"present"`
	Provenance projection.Provenance `json:"provenance"`
	Freshness  projection.Freshness  `json:"freshness"`
	Samples    []ControlSampleV1     `json:"samples"`
}

type ControlSampleV1 struct {
	Epoch     schema.Epoch       `json:"epoch"`
	Sequence  schema.Sequence    `json:"sequence"`
	VehicleID identity.VehicleID `json:"vehicleId"`
	Throttle  schema.Ratio       `json:"throttle"`
	Brake     schema.Ratio       `json:"brake"`
	Clutch    schema.Ratio       `json:"clutch"`
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
		Capabilities: make([]Capability, 0, 5),
		TrackName:    projection.FromField(state.TrackName),
		SessionType:  projection.MapField(state.SessionType, projection.SessionTypeName),
		Player:       snapshot.Header().Identity.Vehicle,
		Vehicles:     make([]VehicleV1, len(state.Vehicles)),
		History:      projectHistory(final.Derived.ControlsHistory),
	}
	for index, current := range state.Vehicles {
		result.Vehicles[index] = projectVehicle(current)
	}
	result.Capabilities = capabilities(result)
	projected, err := envelope.NewSnapshot(snapshot.Header(), result, clonePayload)
	if err != nil {
		return envelope.Snapshot[PayloadV1]{}, fmt.Errorf("own overlay projection: %w", err)
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
		return SnapshotV1{}, fmt.Errorf("project overlay metadata: %w", err)
	}
	return SnapshotV1{Metadata: metadata, PayloadV1: payload}, nil
}

func projectVehicle(current core.VehicleState) VehicleV1 {
	return VehicleV1{
		ID:            current.Identity.Vehicle,
		Name:          projection.FromField(current.Name),
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

func projectHistory(history derive.ControlHistory) ControlHistoryV1 {
	result := ControlHistoryV1{
		Present:    len(history.Samples) > 0,
		Provenance: projection.ProvenanceDerived,
		Freshness:  projection.FromFreshness(history.Freshness),
		Samples:    make([]ControlSampleV1, len(history.Samples)),
	}
	for index, sample := range history.Samples {
		result.Samples[index] = ControlSampleV1{
			Epoch:     sample.Cursor.Epoch,
			Sequence:  sample.Cursor.Sequence,
			VehicleID: sample.Vehicle,
			Throttle:  sample.Throttle,
			Brake:     sample.Brake,
			Clutch:    sample.Clutch,
		}
	}
	return result
}

func capabilities(snapshot PayloadV1) []Capability {
	result := make([]Capability, 0, 4)
	if projection.Available(snapshot.TrackName) || projection.Available(snapshot.SessionType) {
		result = append(result, CapabilitySession)
	}
	for _, current := range snapshot.Vehicles {
		if projection.Available(current.Name) || projection.Available(current.Position) || projection.Available(current.CompletedLaps) {
			result = appendCapability(result, CapabilityStandings)
		}
		if projection.Available(current.Speed) || projection.Available(current.Throttle) ||
			projection.Available(current.Brake) || projection.Available(current.Clutch) ||
			projection.Available(current.Gear) || projection.Available(current.EngineRPM) {
			result = appendCapability(result, CapabilityControls)
		}
		if projection.Available(current.InPit) || projection.Available(current.PitStopCount) {
			result = appendCapability(result, CapabilityPit)
		}
	}
	if snapshot.History.Present && snapshot.History.Freshness != projection.FreshnessInvalid {
		result = appendCapability(result, CapabilityHistory)
	}
	return result
}

func clonePayload(value PayloadV1) PayloadV1 {
	value.Capabilities = append([]Capability(nil), value.Capabilities...)
	value.Vehicles = append([]VehicleV1(nil), value.Vehicles...)
	value.History.Samples = append([]ControlSampleV1(nil), value.History.Samples...)
	return value
}

func appendCapability(values []Capability, value Capability) []Capability {
	for _, current := range values {
		if current == value {
			return values
		}
	}
	return append(values, value)
}
