// Package v1 defines the allowlisted, transport-neutral remote telemetry V1
// contract. It contains no listener, network, lifecycle or runtime wiring.
package v1

import "errors"

const (
	VersionV1          uint16 = 1
	CanonicalVersionV1 uint16 = 1
	MaxVehiclesV1             = 104
	MaxPayloadBytesV1         = 128 * 1024
)

var (
	ErrSnapshotUnavailable         = errors.New("remote V1 snapshot is unavailable")
	ErrInvalidUpdate               = errors.New("remote V1 update is invalid")
	ErrUnsupportedVersion          = errors.New("remote V1 version is unsupported")
	ErrUnsupportedKind             = errors.New("remote V1 kind is unsupported")
	ErrUnsupportedCanonicalVersion = errors.New("remote V1 canonical version is unsupported")
	ErrInvalidJSON                 = errors.New("remote V1 JSON is invalid")
	ErrPayloadTooLarge             = errors.New("remote V1 payload exceeds the size limit")
	ErrInvalidQuality              = errors.New("remote V1 quality/value pair is invalid")
	ErrInvalidValue                = errors.New("remote V1 value is invalid")
	ErrDuplicateVehicle            = errors.New("remote V1 contains a duplicate vehicle identity")
	ErrRevisionNotIncreasing       = errors.New("remote V1 revision is duplicate or out of order")
	ErrEpochRegression             = errors.New("remote V1 epoch moved backwards")
	ErrSessionChangedWithinEpoch   = errors.New("remote V1 session changed within the current epoch")
	ErrInvalidReceivedAt           = errors.New("remote V1 local receipt time is invalid")
	ErrReceivedAtRegression        = errors.New("remote V1 local receipt time moved backwards")
)

type Kind string

const KindFull Kind = "full"

type Quality string

const (
	QualityFresh   Quality = "fresh"
	QualityStale   Quality = "stale"
	QualityMissing Quality = "missing"
	QualityInvalid Quality = "invalid"
)

// QValue preserves a fresh zero through JSON while omitting values that are
// missing or invalid. The pointer is wire presence, not shared canonical state.
type QValue[T any] struct {
	Quality Quality `json:"q"`
	Value   *T      `json:"v,omitempty"`
}

type RemoteCanonicalUpdateV1 struct {
	Version          uint16      `json:"version"`
	Kind             Kind        `json:"kind"`
	CanonicalVersion uint16      `json:"canonicalVersion"`
	StreamEpoch      uint64      `json:"streamEpoch"`
	Revision         uint64      `json:"revision"`
	SessionID        string      `json:"sessionId"`
	CapturedAt       string      `json:"capturedAt"`
	Session          SessionV1   `json:"session"`
	Player           PlayerV1    `json:"player"`
	Vehicles         []VehicleV1 `json:"vehicles"`
}

type SessionV1 struct {
	Track            QValue[string]  `json:"track"`
	Type             QValue[string]  `json:"type"`
	RemainingSeconds QValue[float64] `json:"remainingSeconds"`
	MaximumLaps      QValue[int32]   `json:"maximumLaps"`
}

type PlayerV1 struct {
	VehicleID           string          `json:"vehicleId,omitempty"`
	SpeedMPS            QValue[float64] `json:"speedMps"`
	RPM                 QValue[float64] `json:"rpm"`
	Gear                QValue[int32]   `json:"gear"`
	Throttle            QValue[float64] `json:"throttle"`
	Brake               QValue[float64] `json:"brake"`
	Clutch              QValue[float64] `json:"clutch"`
	LapNumber           QValue[int32]   `json:"lapNumber"`
	CompletedLaps       QValue[int32]   `json:"completedLaps"`
	Sector              QValue[uint8]   `json:"sector"`
	LapDistanceMeters   QValue[float64] `json:"lapDistanceMeters"`
	InPit               QValue[bool]    `json:"inPit"`
	PitStopCount        QValue[int32]   `json:"pitStopCount"`
	FuelRemainingLiters QValue[float64] `json:"fuelRemainingLiters"`
	FuelCapacityLiters  QValue[float64] `json:"fuelCapacityLiters"`
	FuelPerLapLiters    QValue[float64] `json:"fuelPerLapLiters"`
	DeltaSeconds        QValue[float64] `json:"deltaSeconds"`
	DeltaReference      QValue[string]  `json:"deltaReference"`
	Damage              PlayerDamageV1  `json:"damage"`
}

type PlayerDamageV1 struct {
	Dents              QValue[[]uint16] `json:"dents"`
	Overheating        QValue[bool]     `json:"overheating"`
	Detached           QValue[bool]     `json:"detached"`
	WheelDetachedCount QValue[uint8]    `json:"wheelDetachedCount"`
}

type VehicleV1 struct {
	VehicleID          string                   `json:"vehicleId"`
	DriverName         QValue[string]           `json:"driverName"`
	VehicleName        QValue[string]           `json:"vehicleName"`
	VehicleClass       QValue[string]           `json:"vehicleClass"`
	Position           QValue[int32]            `json:"position"`
	LapNumber          QValue[int32]            `json:"lapNumber"`
	CompletedLaps      QValue[int32]            `json:"completedLaps"`
	Sector             QValue[uint8]            `json:"sector"`
	LapDistanceMeters  QValue[float64]          `json:"lapDistanceMeters"`
	InPit              QValue[bool]             `json:"inPit"`
	PenaltyCount       QValue[int32]            `json:"penaltyCount"`
	GapToLeaderSeconds QValue[float64]          `json:"gapToLeaderSeconds"`
	LapsBehindLeader   QValue[int32]            `json:"lapsBehindLeader"`
	GapToNextSeconds   QValue[float64]          `json:"gapToNextSeconds"`
	LapsBehindNext     QValue[int32]            `json:"lapsBehindNext"`
	GapToPlayerSeconds QValue[float64]          `json:"gapToPlayerSeconds"`
	LapDeltaToPlayer   QValue[int32]            `json:"lapDeltaToPlayer"`
	GroundPositionCM   QValue[GroundPositionCM] `json:"groundPositionCm"`
}

type GroundPositionCM struct {
	X int32 `json:"x"`
	Z int32 `json:"z"`
}
