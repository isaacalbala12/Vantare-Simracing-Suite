package spotter

type Side string

const (
	SideLeft  Side = "left"
	SideRight Side = "right"
)

type Zone struct {
	Side      Side
	VehicleID int32
	LateralM  float64
	ForwardM  float64
}

type Sensitivity string

const (
	SensitivityConservative Sensitivity = "conservative"
	SensitivityNormal       Sensitivity = "normal"
	SensitivityAggressive   Sensitivity = "aggressive"
)

type ActiveSides struct {
	Left  bool
	Right bool
}

// FormationGamePhase es el valor de SessionInfo.GamePhase que indica
// la fase de Formación (parrilla de salida). Según CC Spotter.cs:67-94,
// solo durante Formation se hace grid side detection.
const FormationGamePhase uint8 = 3
