// Package overlay defines the transport-neutral telemetry contract consumed by
// Overlay Studio, Desktop and OBS.
package overlay

import (
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// R6a.1: la proyeccion Overlay V1 esta retirada. Sobreviven solo los tipos y
// constantes de contrato con consumidor literal en contract-gen (tipos y
// capacidades) o en el Hub inerte (versiones). No queda logica de proyeccion.
const (
	CurrentVersion          projection.Version = 1
	MinimumSupportedVersion projection.Version = 1
)

type Capability string

const (
	CapabilitySession   Capability = "session"
	CapabilityStandings Capability = "standings"
	CapabilityControls  Capability = "controls"
	CapabilityHistory   Capability = "controls.history"
	CapabilityPit       Capability = "pit"
	CapabilitySpatial   Capability = "spatial"
)

// GroundPositionV1 is a vehicle position on the track plane, in centimetres.
//
// Centimetres rather than metres as float64 because a map a few hundred pixels
// wide cannot resolve even a metre, and integers cost a fraction of the digits.
// The axes are the world axes reported by the driver, so the same transform
// places both the circuit outline and the markers on it.
type GroundPositionV1 struct {
	XCentimetres int32 `json:"xCm"`
	ZCentimetres int32 `json:"zCm"`
}

type SnapshotV1 struct {
	projection.Metadata
	PayloadV1
}

type PayloadV1 struct {
	Capabilities            []Capability                            `json:"capabilities"`
	TrackName               projection.Field[string]                `json:"trackName"`
	SessionType             projection.Field[string]                `json:"sessionType"`
	Player                  identity.VehicleID                      `json:"playerVehicleId"`
	Vehicles                []VehicleV1                             `json:"vehicles"`
	History                 ControlHistoryV1                        `json:"controlsHistory"`
	EndTime                 projection.Field[session.EndTime]       `json:"endTimeSeconds"`
	Remaining               projection.Field[session.RemainingTime] `json:"remainingSeconds"`
	MaximumLaps             projection.Field[session.MaximumLaps]   `json:"maximumLaps"`
	PlayerDelta             projection.Field[session.DeltaSeconds]  `json:"playerDeltaSeconds"`
	PlayerDeltaPersonalBest projection.Field[session.DeltaSeconds]  `json:"playerDeltaPersonalBestSeconds"`
	PlayerDeltaSessionBest  projection.Field[session.DeltaSeconds]  `json:"playerDeltaSessionBestSeconds"`
	PlayerDeltaPreviousLap  projection.Field[session.DeltaSeconds]  `json:"playerDeltaPreviousLapSeconds"`
	DeltaReference          projection.Field[string]                `json:"playerDeltaReference"`
	DeltaHistory            DeltaHistoryV1                          `json:"deltaHistory"`
}

type VehicleV1 struct {
	ID               identity.VehicleID                        `json:"id"`
	Name             projection.Field[vehicle.VehicleName]     `json:"name"`
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
	DriverName       projection.Field[identity.DriverName]     `json:"driverName"`
	VehicleClass     projection.Field[standings.VehicleClass]  `json:"vehicleClass"`
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
	GroundPosition   projection.Field[GroundPositionV1]        `json:"groundPositionCm"`
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

type DeltaHistoryV1 struct {
	Present    bool                  `json:"present"`
	Provenance projection.Provenance `json:"provenance"`
	Freshness  projection.Freshness  `json:"freshness"`
	Samples    []DeltaSampleV1       `json:"samples"`
}

type DeltaSampleV1 struct {
	Epoch             schema.Epoch          `json:"epoch"`
	Sequence          schema.Sequence       `json:"sequence"`
	CapturedAtMillis  int64                 `json:"capturedAt"`
	SourceTimeSeconds float64               `json:"sourceTimeSeconds"`
	LapDistanceMeters standings.LapDistance `json:"lapDistanceMeters"`
	DeltaSeconds      session.DeltaSeconds  `json:"deltaSeconds"`
}
