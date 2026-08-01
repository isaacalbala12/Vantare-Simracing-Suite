// Package engineer defines the live observation contract consumed by Engineer
// and Spotter. It contains observations and facts, never message or strategy
// decisions.
package engineer

import (
	"errors"
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
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
	GroupFuel      CapabilityGroup = "fuel"
	GroupGaps      CapabilityGroup = "gaps"
	GroupSpatial   CapabilityGroup = "spatial"
)

type SnapshotV1 struct {
	projection.Metadata
	PayloadV1
}

type PayloadV1 struct {
	Capabilities  []CapabilityGroup         `json:"capabilities"`
	TrackName     projection.Field[string]  `json:"trackName"`
	SessionType   projection.Field[string]  `json:"sessionType"`
	SourceTime    projection.Field[float64] `json:"sourceTimeSeconds"`
	EndTime       projection.Field[float64] `json:"endTimeSeconds"`
	Remaining     projection.Field[float64] `json:"remainingSeconds"`
	MaximumLaps   projection.Field[int]     `json:"maximumLaps"`
	VehicleCount  projection.Field[int]     `json:"vehicleCount"`
	PlayerPresent projection.Field[bool]    `json:"playerPresent"`
	Player        PlayerV1                  `json:"player"`
	Vehicles      []PlayerV1                `json:"vehicles"`
}

type PlayerV1 struct {
	ID               identity.VehicleID                        `json:"id"`
	DriverName       projection.Field[identity.DriverName]     `json:"driverName"`
	VehicleName      projection.Field[vehicle.VehicleName]     `json:"vehicleName"`
	VehicleClass     projection.Field[standings.VehicleClass]  `json:"vehicleClass"`
	IsPlayer         projection.Field[bool]                    `json:"isPlayer"`
	LapNumber        projection.Field[session.LapNumber]       `json:"lapNumber"`
	Gear             projection.Field[vehicle.Gear]            `json:"gear"`
	EngineRPM        projection.Field[vehicle.EngineRPM]       `json:"engineRpm"`
	Speed            projection.Field[float64]                 `json:"speedMps"`
	Throttle         projection.Field[schema.Ratio]            `json:"throttle"`
	Brake            projection.Field[schema.Ratio]            `json:"brake"`
	Clutch           projection.Field[schema.Ratio]            `json:"clutch"`
	Position         projection.Field[standings.Position]      `json:"position"`
	CompletedLaps    projection.Field[standings.CompletedLaps] `json:"completedLaps"`
	InPit            projection.Field[pit.InPit]               `json:"inPit"`
	PitStopCount     projection.Field[pit.StopCount]           `json:"pitStopCount"`
	Sector           projection.Field[standings.Sector]        `json:"sector"`
	LapDistance      projection.Field[standings.LapDistance]   `json:"lapDistanceMeters"`
	BestLapTime      projection.Field[standings.LapTime]       `json:"bestLapSeconds"`
	LastLapTime      projection.Field[standings.LapTime]       `json:"lastLapSeconds"`
	EstimatedLapTime projection.Field[standings.LapTime]       `json:"estimatedLapSeconds"`
	PenaltyCount     projection.Field[standings.PenaltyCount]  `json:"penaltyCount"`
	TimeBehindLeader projection.Field[standings.TimeGap]       `json:"timeBehindLeaderSeconds"`
	LapsBehindLeader projection.Field[standings.LapGap]        `json:"lapsBehindLeader"`
	TimeBehindNext   projection.Field[standings.TimeGap]       `json:"timeBehindNextSeconds"`
	LapsBehindNext   projection.Field[standings.LapGap]        `json:"lapsBehindNext"`
	FuelLiters       projection.Field[energy.FuelAmount]       `json:"fuelLiters"`
	FuelCapacity     projection.Field[energy.FuelCapacity]     `json:"fuelCapacityLiters"`
	RelativeTimeGap  projection.Field[standings.RelativeTime]  `json:"relativeTimeGapSeconds"`
	RelativeLapDelta projection.Field[standings.RelativeLaps]  `json:"relativeLapDelta"`
	WorldPosition    projection.Field[spatial.Position]        `json:"worldPosition"`
	LocalVelocity    projection.Field[spatial.LocalVelocity]   `json:"localVelocity"`
	Orientation      projection.Field[spatial.Orientation]     `json:"orientation"`
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
		Capabilities: make([]CapabilityGroup, 0, 7),
		TrackName:    projection.FromField(state.TrackName),
		SessionType:  projection.MapField(state.SessionType, projection.SessionTypeName),
		SourceTime: projection.MapField(state.SourceTime, func(value time.Duration) float64 {
			return value.Seconds()
		}),
		EndTime: projection.MapField(state.EndTime, func(value session.EndTime) float64 {
			return float64(value)
		}),
		Remaining: projection.MapField(final.Derived.SessionRemaining, func(value session.RemainingTime) float64 {
			return float64(value)
		}),
		MaximumLaps: projection.MapField(state.MaximumLaps, func(value session.MaximumLaps) int {
			return int(value)
		}),
		VehicleCount: projection.MapField(state.VehicleCount, func(value schema.Count) int {
			return int(value)
		}),
		PlayerPresent: projection.FromField(state.PlayerPresent),
		Player:        missingPlayer(snapshot.Header().Identity.Vehicle),
		Vehicles:      make([]PlayerV1, len(state.Vehicles)),
	}
	for index, current := range state.Vehicles {
		projectedVehicle := projectVehicle(current, findGap(final.Derived.Gaps, current.Identity.Vehicle))
		result.Vehicles[index] = projectedVehicle
		if current.Identity.Vehicle == result.Player.ID {
			result.Player = projectedVehicle
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
		ID:               id,
		DriverName:       projection.MissingField[identity.DriverName](),
		VehicleName:      projection.MissingField[vehicle.VehicleName](),
		VehicleClass:     projection.MissingField[standings.VehicleClass](),
		IsPlayer:         projection.MissingField[bool](),
		LapNumber:        projection.MissingField[session.LapNumber](),
		Gear:             projection.MissingField[vehicle.Gear](),
		EngineRPM:        projection.MissingField[vehicle.EngineRPM](),
		Speed:            projection.MissingField[float64](),
		Throttle:         projection.MissingField[schema.Ratio](),
		Brake:            projection.MissingField[schema.Ratio](),
		Clutch:           projection.MissingField[schema.Ratio](),
		Position:         projection.MissingField[standings.Position](),
		CompletedLaps:    projection.MissingField[standings.CompletedLaps](),
		InPit:            projection.MissingField[pit.InPit](),
		PitStopCount:     projection.MissingField[pit.StopCount](),
		Sector:           projection.MissingField[standings.Sector](),
		LapDistance:      projection.MissingField[standings.LapDistance](),
		BestLapTime:      projection.MissingField[standings.LapTime](),
		LastLapTime:      projection.MissingField[standings.LapTime](),
		EstimatedLapTime: projection.MissingField[standings.LapTime](),
		PenaltyCount:     projection.MissingField[standings.PenaltyCount](),
		TimeBehindLeader: projection.MissingField[standings.TimeGap](),
		LapsBehindLeader: projection.MissingField[standings.LapGap](),
		TimeBehindNext:   projection.MissingField[standings.TimeGap](),
		LapsBehindNext:   projection.MissingField[standings.LapGap](),
		FuelLiters:       projection.MissingField[energy.FuelAmount](),
		FuelCapacity:     projection.MissingField[energy.FuelCapacity](),
		RelativeTimeGap:  projection.MissingField[standings.RelativeTime](),
		RelativeLapDelta: projection.MissingField[standings.RelativeLaps](),
		WorldPosition:    projection.MissingField[spatial.Position](),
		LocalVelocity:    projection.MissingField[spatial.LocalVelocity](),
		Orientation:      projection.MissingField[spatial.Orientation](),
	}
}

func projectVehicle(current core.VehicleState, gap derive.VehicleGap) PlayerV1 {
	return PlayerV1{
		ID:               current.Identity.Vehicle,
		DriverName:       projection.FromField(current.DriverName),
		VehicleName:      projection.FromField(current.Name),
		VehicleClass:     projection.FromField(current.VehicleClass),
		IsPlayer:         projection.FromField(current.Player),
		LapNumber:        projection.FromField(current.LapNumber),
		Gear:             projection.FromField(current.Gear),
		EngineRPM:        projection.FromField(current.EngineRPM),
		Speed:            projection.FromField(current.SpeedMPS),
		Throttle:         projection.FromField(current.Throttle),
		Brake:            projection.FromField(current.Brake),
		Clutch:           projection.FromField(current.Clutch),
		Position:         projection.FromField(current.Position),
		CompletedLaps:    projection.FromField(current.CompletedLaps),
		InPit:            projection.FromField(current.InPit),
		PitStopCount:     projection.FromField(current.PitStopCount),
		Sector:           projection.FromField(current.Sector),
		LapDistance:      projection.FromField(current.LapDistance),
		BestLapTime:      projection.FromField(current.BestLapTime),
		LastLapTime:      projection.FromField(current.LastLapTime),
		EstimatedLapTime: projection.FromField(current.EstimatedLapTime),
		PenaltyCount:     projection.FromField(current.PenaltyCount),
		TimeBehindLeader: projection.FromField(current.TimeBehindLeader),
		LapsBehindLeader: projection.FromField(current.LapsBehindLeader),
		TimeBehindNext:   projection.FromField(current.TimeBehindNext),
		LapsBehindNext:   projection.FromField(current.LapsBehindNext),
		FuelLiters: projection.MapField(current.Fuel, func(value energy.Fuel) energy.FuelAmount {
			return value.Amount
		}),
		FuelCapacity: projection.MapField(current.Fuel, func(value energy.Fuel) energy.FuelCapacity {
			return value.Capacity
		}),
		RelativeTimeGap:  projection.FromField(gap.Time),
		RelativeLapDelta: projection.FromField(gap.Laps),
		WorldPosition:    projection.FromField(current.WorldPosition),
		LocalVelocity:    projection.FromField(current.LocalVelocity),
		Orientation:      projection.FromField(current.Orientation),
	}
}

func findGap(gaps derive.GapSet, id identity.VehicleID) derive.VehicleGap {
	for _, current := range gaps.Vehicles {
		if current.Vehicle == id {
			return current
		}
	}
	return derive.VehicleGap{Vehicle: id}
}

func capabilities(snapshot PayloadV1) []CapabilityGroup {
	sessionAvailable := projection.Available(snapshot.TrackName) || projection.Available(snapshot.SessionType) ||
		projection.Available(snapshot.SourceTime) || projection.Available(snapshot.EndTime) ||
		projection.Available(snapshot.Remaining) || projection.Available(snapshot.MaximumLaps) ||
		projection.Available(snapshot.VehicleCount) || projection.Available(snapshot.PlayerPresent)
	var standingsAvailable, controlsAvailable, pitAvailable, fuelAvailable, gapsAvailable, spatialAvailable bool
	for _, current := range snapshot.Vehicles {
		if projection.Available(current.DriverName) || projection.Available(current.VehicleName) ||
			projection.Available(current.VehicleClass) || projection.Available(current.IsPlayer) ||
			projection.Available(current.LapNumber) || projection.Available(current.Position) ||
			projection.Available(current.CompletedLaps) || projection.Available(current.Sector) ||
			projection.Available(current.LapDistance) || projection.Available(current.BestLapTime) ||
			projection.Available(current.LastLapTime) || projection.Available(current.EstimatedLapTime) ||
			projection.Available(current.PenaltyCount) {
			standingsAvailable = true
		}
		if projection.Available(current.Speed) || projection.Available(current.Throttle) ||
			projection.Available(current.Brake) || projection.Available(current.Clutch) ||
			projection.Available(current.Gear) || projection.Available(current.EngineRPM) {
			controlsAvailable = true
		}
		if projection.Available(current.InPit) || projection.Available(current.PitStopCount) {
			pitAvailable = true
		}
		if projection.Available(current.FuelLiters) || projection.Available(current.FuelCapacity) {
			fuelAvailable = true
		}
		if projection.Available(current.TimeBehindLeader) || projection.Available(current.LapsBehindLeader) ||
			projection.Available(current.TimeBehindNext) || projection.Available(current.LapsBehindNext) ||
			projection.Available(current.RelativeTimeGap) || projection.Available(current.RelativeLapDelta) {
			gapsAvailable = true
		}
		if projection.Available(current.WorldPosition) || projection.Available(current.LocalVelocity) ||
			projection.Available(current.Orientation) {
			spatialAvailable = true
		}
	}
	result := make([]CapabilityGroup, 0, 7)
	for _, candidate := range []struct {
		group     CapabilityGroup
		available bool
	}{
		{GroupSession, sessionAvailable},
		{GroupStandings, standingsAvailable},
		{GroupControls, controlsAvailable},
		{GroupPit, pitAvailable},
		{GroupFuel, fuelAvailable},
		{GroupGaps, gapsAvailable},
		{GroupSpatial, spatialAvailable},
	} {
		if candidate.available {
			result = append(result, candidate.group)
		}
	}
	return result
}

func clonePayload(value PayloadV1) PayloadV1 {
	value.Capabilities = append([]CapabilityGroup(nil), value.Capabilities...)
	value.Vehicles = append([]PlayerV1(nil), value.Vehicles...)
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
