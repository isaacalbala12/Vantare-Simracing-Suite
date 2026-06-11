package models

// PlayerTelemetry is the player's live vehicle data (normalized subset).
type PlayerTelemetry struct {
	ID          int32   `json:"id,omitempty"`
	LapNumber   int32   `json:"lapNumber,omitempty"`
	Speed       float64 `json:"speed"` // m/s from local velocity magnitude
	Gear        int32   `json:"gear"`
	EngineRPM   float64 `json:"engineRPM"`
	Fuel        float64 `json:"fuel,omitempty"`
	FuelCap     float64 `json:"fuelCap,omitempty"`
	DeltaBest   float64 `json:"deltaBest,omitempty"`
	Throttle    float64 `json:"throttle,omitempty"`
	Brake       float64 `json:"brake,omitempty"`
	Steering    float64 `json:"steering,omitempty"`
	VehicleName string  `json:"vehicleName,omitempty"`
	TrackName   string  `json:"trackName,omitempty"`
}

// SessionInfo is static-ish session context from scoring block.
type SessionInfo struct {
	TrackName   string  `json:"trackName,omitempty"`
	SessionType int32   `json:"sessionType,omitempty"`
	SessionTime float64 `json:"sessionTime,omitempty"`
	NumVehicles int32   `json:"numVehicles,omitempty"`
	GamePhase   uint8   `json:"gamePhase,omitempty"`
	PlayerName  string  `json:"playerName,omitempty"`
	AmbientTemp float64 `json:"ambientTemp,omitempty"`
	TrackTemp   float64 `json:"trackTemp,omitempty"`
}

// VehicleScoring is one row in standings / relative.
type VehicleScoring struct {
	ID               int32   `json:"id"`
	DriverName       string  `json:"driverName,omitempty"`
	Place            uint8   `json:"place,omitempty"`
	TotalLaps        int16   `json:"totalLaps,omitempty"`
	VehicleClass     string  `json:"vehicleClass,omitempty"`
	IsPlayer         bool    `json:"isPlayer,omitempty"`
	InPits           bool    `json:"inPits,omitempty"`
	TimeBehindLeader float64 `json:"timeBehindLeader,omitempty"`
}

// Telemetry is the unified snapshot consumed by UI and SSE.
type Telemetry struct {
	Connected        bool             `json:"connected"`
	Player           *PlayerTelemetry `json:"player,omitempty"`
	Session          *SessionInfo     `json:"session,omitempty"`
	Vehicles         []VehicleScoring `json:"vehicles,omitempty"`
	PlayerHasVehicle bool             `json:"playerHasVehicle,omitempty"`
}
