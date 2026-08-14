// Package strategy defines the observation contract available to Strategy
// Planner. It deliberately contains no planning or optimization decisions.
package strategy

import (
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

const (
	VersionV1               projection.Version = 1
	CurrentVersion          projection.Version = VersionV1
	MinimumSupportedVersion projection.Version = VersionV1
)

type Capability string

const (
	CapabilitySession  Capability = "session"
	CapabilityProgress Capability = "progress"
	CapabilityPit      Capability = "pit"
	CapabilityFuel     Capability = "fuel"
)

type SnapshotV1 struct {
	projection.Metadata
	PayloadV1
}

type PayloadV1 struct {
	Capabilities []Capability                            `json:"capabilities"`
	TrackName    projection.Field[string]                `json:"trackName"`
	SessionType  projection.Field[string]                `json:"sessionType"`
	SourceTime   projection.Field[float64]               `json:"sourceTimeSeconds"`
	EndTime      projection.Field[session.EndTime]       `json:"endTimeSeconds"`
	Remaining    projection.Field[session.RemainingTime] `json:"remainingSeconds"`
	MaximumLaps  projection.Field[session.MaximumLaps]   `json:"maximumLaps"`
	Player       PlayerV1                                `json:"player"`
}

// PlayerV1 is intentionally limited to demonstrated canonical inputs. Virtual
// Energy, tyres and weather remain absent; Strategy must not infer them from
// Fuel or unrelated values.
type PlayerV1 struct {
	ID            identity.VehicleID                        `json:"id"`
	LapNumber     projection.Field[session.LapNumber]       `json:"lapNumber"`
	CompletedLaps projection.Field[standings.CompletedLaps] `json:"completedLaps"`
	Sector        projection.Field[standings.Sector]        `json:"sector"`
	LapDistance   projection.Field[standings.LapDistance]   `json:"lapDistanceMeters"`
	InPit         projection.Field[pit.InPit]               `json:"inPit"`
	PitStopCount  projection.Field[pit.StopCount]           `json:"pitStopCount"`
	FuelLiters    projection.Field[energy.FuelAmount]       `json:"fuelLiters"`
	FuelCapacity  projection.Field[energy.FuelCapacity]     `json:"fuelCapacityLiters"`
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
		Capabilities: make([]Capability, 0, 4),
		TrackName:    projection.FromField(state.TrackName),
		SessionType:  projection.MapField(state.SessionType, projection.SessionTypeName),
		SourceTime: projection.MapField(state.SourceTime, func(sourceTime time.Duration) float64 {
			return float64(sourceTime) / float64(time.Second)
		}),
		EndTime:     projection.FromField(state.EndTime),
		Remaining:   projection.FromField(final.Derived.SessionRemaining),
		MaximumLaps: projection.FromField(state.MaximumLaps),
		Player:      missingPlayer(snapshot.Header().Identity.Vehicle),
	}
	for _, current := range state.Vehicles {
		if current.Identity.Vehicle == result.Player.ID {
			result.Player.LapNumber = projection.FromField(current.LapNumber)
			result.Player.CompletedLaps = projection.FromField(current.CompletedLaps)
			result.Player.Sector = projection.FromField(current.Sector)
			result.Player.LapDistance = projection.FromField(current.LapDistance)
			result.Player.InPit = projection.FromField(current.InPit)
			result.Player.PitStopCount = projection.FromField(current.PitStopCount)
			// Fuel amount and capacity come from one atomic canonical field, so
			// neither can acquire different presence or quality metadata.
			result.Player.FuelLiters = projection.MapField(current.Fuel, func(fuel energy.Fuel) energy.FuelAmount {
				return fuel.Amount
			})
			result.Player.FuelCapacity = projection.MapField(current.Fuel, func(fuel energy.Fuel) energy.FuelCapacity {
				return fuel.Capacity
			})
			break
		}
	}
	if projection.Available(result.TrackName) || projection.Available(result.SessionType) ||
		projection.Available(result.SourceTime) || projection.Available(result.EndTime) ||
		projection.Available(result.Remaining) || projection.Available(result.MaximumLaps) {
		result.Capabilities = append(result.Capabilities, CapabilitySession)
	}
	if projection.Available(result.Player.LapNumber) || projection.Available(result.Player.CompletedLaps) ||
		projection.Available(result.Player.Sector) || projection.Available(result.Player.LapDistance) {
		result.Capabilities = append(result.Capabilities, CapabilityProgress)
	}
	if projection.Available(result.Player.InPit) || projection.Available(result.Player.PitStopCount) {
		result.Capabilities = append(result.Capabilities, CapabilityPit)
	}
	if projection.Available(result.Player.FuelLiters) || projection.Available(result.Player.FuelCapacity) {
		result.Capabilities = append(result.Capabilities, CapabilityFuel)
	}
	projected, err := envelope.NewSnapshot(snapshot.Header(), result, clonePayload)
	if err != nil {
		return envelope.Snapshot[PayloadV1]{}, fmt.Errorf("own strategy projection: %w", err)
	}
	return projected, nil
}

func missingPlayer(id identity.VehicleID) PlayerV1 {
	return PlayerV1{
		ID:            id,
		LapNumber:     projection.MissingField[session.LapNumber](),
		CompletedLaps: projection.MissingField[standings.CompletedLaps](),
		Sector:        projection.MissingField[standings.Sector](),
		LapDistance:   projection.MissingField[standings.LapDistance](),
		InPit:         projection.MissingField[pit.InPit](),
		PitStopCount:  projection.MissingField[pit.StopCount](),
		FuelLiters:    projection.MissingField[energy.FuelAmount](),
		FuelCapacity:  projection.MissingField[energy.FuelCapacity](),
	}
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
		return SnapshotV1{}, fmt.Errorf("project strategy metadata: %w", err)
	}
	return SnapshotV1{Metadata: metadata, PayloadV1: payload}, nil
}

func clonePayload(value PayloadV1) PayloadV1 {
	value.Capabilities = append([]Capability(nil), value.Capabilities...)
	return value
}
