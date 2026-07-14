package telemetry

type PlayerTelemetry struct {
	ID                 int32       `json:"id,omitempty"`
	LapNumber          int32       `json:"lapNumber,omitempty"`
	Speed              float64     `json:"speed"`
	Gear               int32       `json:"gear"`
	EngineRPM          float64     `json:"engineRPM"`
	Fuel               float64     `json:"fuel,omitempty"`
	FuelCap            float64     `json:"fuelCap,omitempty"`
	DeltaBest          float64     `json:"deltaBest,omitempty"`
	Throttle           float64     `json:"throttle,omitempty"`
	Brake              float64     `json:"brake,omitempty"`
	Clutch             float64     `json:"clutch,omitempty"`
	Steering           float64     `json:"steering,omitempty"`
	VehicleName        string      `json:"vehicleName,omitempty"`
	TrackName          string      `json:"trackName,omitempty"`
	TimeGapPlaceAhead  float64     `json:"timeGapPlaceAhead,omitempty"`
	TimeGapPlaceBehind float64     `json:"timeGapPlaceBehind,omitempty"`
	Position           Vec3        `json:"position"`
	LocalVelocity      Vec3        `json:"localVelocity"`
	Orientation        Orientation `json:"orientation"`
	EngineWaterTemp    int32       `json:"engineWaterTemp,omitempty"`
	EngineOilTemp      int32       `json:"engineOilTemp,omitempty"`
	TyreTempFL         int32       `json:"tyreTempFL,omitempty"`
	TyreTempFR         int32       `json:"tyreTempFR,omitempty"`
	TyreTempRL         int32       `json:"tyreTempRL,omitempty"`
	TyreTempRR         int32       `json:"tyreTempRR,omitempty"`
	BrakeTempFL        int32       `json:"brakeTempFL,omitempty"`
	BrakeTempFR        int32       `json:"brakeTempFR,omitempty"`
	BrakeTempRL        int32       `json:"brakeTempRL,omitempty"`
	BrakeTempRR        int32       `json:"brakeTempRR,omitempty"`
	TyreWearFL         uint8       `json:"tyreWearFL,omitempty"`
	TyreWearFR         uint8       `json:"tyreWearFR,omitempty"`
	TyreWearRL         uint8       `json:"tyreWearRL,omitempty"`
	TyreWearRR         uint8       `json:"tyreWearRR,omitempty"`

	// mDentSeverity[8] from LMU: 8 bytes representing per-wheel-pair damage.
	// Index mapping: [0-1]=aero, [2-3]=suspension, [4-5]=engine, [6-7]=brake/transmission.
	DentSeverity [8]int32 `json:"dentSeverity,omitempty"`

	// WheelDetachedCount indicates how many wheels are detached (>0 → EventDetachedPart).
	WheelDetachedCount int32 `json:"wheelDetachedCount,omitempty"`
	// Wheel data from LMUWheel struct (decoded via lmu.DecodeWheels).
	WheelBrakeTempFL float64 `json:"wheelBrakeTempFL,omitempty"`
	WheelBrakeTempFR float64 `json:"wheelBrakeTempFR,omitempty"`
	WheelBrakeTempRL float64 `json:"wheelBrakeTempRL,omitempty"`
	WheelBrakeTempRR float64 `json:"wheelBrakeTempRR,omitempty"`
	WheelSurfaceType uint8 `json:"wheelSurfaceType,omitempty"`
	WheelFlatFL      bool   `json:"wheelFlatFL,omitempty"`
}

type SessionInfo struct {
	TrackName                string   `json:"trackName,omitempty"`
	SessionType              int32    `json:"sessionType,omitempty"`
	SessionName              string   `json:"sessionName,omitempty"`
	SessionTime              float64  `json:"sessionTime,omitempty"`
	TimeRemainingInGamePhase float64  `json:"timeRemainingInGamePhase,omitempty"`
	TrackLength              float64  `json:"trackLength,omitempty"`
	NumVehicles              int32    `json:"numVehicles,omitempty"`
	GamePhase                uint8    `json:"gamePhase,omitempty"`
	PlayerName               string   `json:"playerName,omitempty"`
	AmbientTemp              float64  `json:"ambientTemp,omitempty"`
	TrackTemp                float64  `json:"trackTemp,omitempty"`
	YellowFlagState          string   `json:"yellowFlagState,omitempty"`
	SectorFlags              []string `json:"sectorFlags,omitempty"`
	SessionLapsTotal         int32    `json:"sessionLapsTotal,omitempty"`    // total race laps (0 = timed)
	IsTimedSession           bool     `json:"isTimedSession,omitempty"`       // true if time-limited
}

type VehicleScoring struct {
	ID               int32       `json:"id"`
	DriverName       string      `json:"driverName,omitempty"`
	DriverNumber     string      `json:"driverNumber,omitempty"`
	TeamName         string      `json:"teamName,omitempty"`
	VehicleName      string      `json:"vehicleName,omitempty"`
	VehicleClass     string      `json:"vehicleClass,omitempty"`
	Place            uint8       `json:"place,omitempty"`
	TotalLaps        int16       `json:"totalLaps,omitempty"`
	IsPlayer         bool        `json:"isPlayer,omitempty"`
	InPits           bool        `json:"inPits,omitempty"`
	PitState         string      `json:"pitState,omitempty"`
	Sector           string      `json:"sector,omitempty"`
	FinishStatus     string      `json:"finishStatus,omitempty"`
	LapDistance      float64     `json:"lapDistance,omitempty"`
	PathLateral      float64     `json:"pathLateral,omitempty"`
	TrackEdge        float64     `json:"trackEdge,omitempty"`
	Position         Vec3        `json:"position"`
	LocalVelocity    Vec3        `json:"localVelocity"`
	Orientation      Orientation `json:"orientation"`
	TimeBehindLeader float64     `json:"timeBehindLeader,omitempty"`
	TimeBehindNext   float64     `json:"timeBehindNext,omitempty"`
	LapsBehindLeader int32       `json:"lapsBehindLeader,omitempty"`
	LapsBehindNext   int32       `json:"lapsBehindNext,omitempty"`
	BestLapTime      float64     `json:"bestLapTime,omitempty"`
	LastLapTime      float64     `json:"lastLapTime,omitempty"`
	EstimatedLapTime float64     `json:"estimatedLapTime,omitempty"`
	Pitstops         int32       `json:"pitstops,omitempty"`
	Penalties        int32       `json:"penalties,omitempty"`
	Qualification    int32       `json:"qualification,omitempty"`
	Flag             string      `json:"flag,omitempty"`
	FuelFraction     float64     `json:"fuelFraction,omitempty"`
}

type Frame struct {
	Connected        bool             `json:"connected"`
	PlayerHasVehicle bool             `json:"playerHasVehicle,omitempty"`
	Player           *PlayerTelemetry `json:"player,omitempty"`
	Session          *SessionInfo     `json:"session,omitempty"`
	Vehicles         []VehicleScoring `json:"vehicles,omitempty"`
	TimestampUnixMS  int64            `json:"timestampUnixMs"`
}
