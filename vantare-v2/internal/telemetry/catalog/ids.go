package catalog

// SignalID is a stable catalog identifier. Assigned values are never reused.
type SignalID uint16

const (
	SignalIDUnknown SignalID = iota
	SignalIdentityDriverName
	SignalSessionType
	SignalVehicleEngineRPM
	SignalControlsThrottle
	SignalControlsBrake
	SignalControlsClutch
	SignalWheelsBrakeTemperature
	SignalEnergyFuelAmount
	SignalPitStopCount
	SignalStandingsPosition
	SignalWeatherAmbientTemperature
	SignalSpatialPosition
	SignalSessionLapNumber
	SignalVehicleGear
	SignalVehicleTeamName
	SignalVehicleName
	SignalStandingsCompletedLaps
	SignalSpatialOrientation
)
