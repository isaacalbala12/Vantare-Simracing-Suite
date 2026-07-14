package pitmanager

// PitMenuStatus reflects the current pit menu state from LMU.
type PitMenuStatus struct {
	Category string `json:"category"`
	Message  string `json:"message"`
	ChoiceID int    `json:"choiceID"`
}

// StandingRow is a single entry in the race standings.
type StandingRow struct {
	SlotID                int32   `json:"slotID"`
	DriverName            string  `json:"driverName"`
	CarNumber             string  `json:"carNumber"`
	CarClass              string  `json:"carClass"`
	FullTeamName          string  `json:"fullTeamName"`
	VehicleName           string  `json:"vehicleName"`
	Position              int32   `json:"position"`
	Qualification         int32   `json:"qualification"`
	Player                bool    `json:"player"`
	LapsCompleted         int16   `json:"lapsCompleted"`
	LapsBehindLeader      int32   `json:"lapsBehindLeader"`
	LapsBehindClassLeader int32   `json:"lapsBehindClassLeader"`
	LapsBehindNext        int32   `json:"lapsBehindNext"`
	TimeBehindLeader      float64 `json:"timeBehindLeader"`
	TimeBehindNext        float64 `json:"timeBehindNext"`
	LapDistance           float64 `json:"lapDistance"`
	TimeIntoLap           float64 `json:"timeIntoLap"`
	BestLapTime           float64 `json:"bestLapTime"`
	LastLapTime           float64 `json:"lastLapTime"`
	EstimatedLapTime      float64 `json:"estimatedLapTime"`
	CurrentSectorTime1    float64 `json:"currentSectorTime1"`
	CurrentSectorTime2    float64 `json:"currentSectorTime2"`
	PitState              string  `json:"pitState"`
	Pitting               bool    `json:"pitting"`
	InGarageStall         bool    `json:"inGarageStall"`
	Sector                string  `json:"sector"`
	Flag                  string  `json:"flag"`
	FinishStatus          string  `json:"finishStatus"`
	Penalties             int32   `json:"penalties"`
	Pitstops              int32   `json:"pitstops"`
	FuelFraction          float64 `json:"fuelFraction"`
}

// Standings wraps the list of standing rows from LMU.
type Standings struct {
	Rows []StandingRow `json:"rows"`
}

// WeatherData reflects the current weather/session info from LMU REST.
// GET /rest/watch/sessionInfo returns track/ambient temp, rain intensity, etc.
type WeatherData struct {
	AmbientTemp       float64 `json:"ambientTemp"`
	TrackTemp         float64 `json:"trackTemp"`
	RainIntensity     float64 `json:"rainIntensity"`     // 0.0 (dry) - 1.0 (full wet)
	CloudBrightness   float64 `json:"cloudBrightness"`   // 0.0 (dark) - 1.0 (bright)
	WindSpeed         float64 `json:"windSpeedMS"`
	WindDirection     float64 `json:"windDirectionDeg"`
}
