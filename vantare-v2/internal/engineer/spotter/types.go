package spotter

import "github.com/vantare/overlays/v2/internal/spotter/geometry"

type Side = geometry.Side

const (
	SideLeft  = geometry.SideLeft
	SideRight = geometry.SideRight
)

type Zone struct {
	Side      Side
	VehicleID int32
	LateralM  float64
	ForwardM  float64
}

type Sensitivity = geometry.Sensitivity

const (
	SensitivityConservative = geometry.SensitivityConservative
	SensitivityNormal       = geometry.SensitivityNormal
	SensitivityAggressive   = geometry.SensitivityAggressive
)

type ActiveSides struct {
	Left  bool
	Right bool
}

// FormationGamePhase es el valor de SessionInfo.GamePhase que indica
// la fase de Formación (parrilla de salida). Según CC Spotter.cs:67-94,
// solo durante Formation se hace grid side detection.
const FormationGamePhase uint8 = 3
