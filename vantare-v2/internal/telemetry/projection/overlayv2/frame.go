// Package overlayv2 defines the compact Overlay wire contract. It is additive:
// Overlay v1 remains the production contract until the migration gate closes.
package overlayv2

const (
	ContractVersionV2  uint16 = 2
	AlgorithmVersionV1 uint16 = 1
)

// Quality preserves whether a compact value is usable without repeating the
// complete canonical Field envelope on every wire cell.
type Quality string

const (
	QualityFresh   Quality = "fresh"
	QualityStale   Quality = "stale"
	QualityMissing Quality = "missing"
	QualityInvalid Quality = "invalid"
)

// QValue is the compact wire representation of one quality-bearing value.
// A fresh zero may omit v; q still distinguishes it from a missing value.
type QValue[T any] struct {
	V T       `json:"v,omitempty"`
	Q Quality `json:"q"`
}

type Authority string

const (
	AuthorityNative    Authority = "native"
	AuthorityDerived   Authority = "derived"
	AuthorityEstimated Authority = "estimated"
)

type Mode string

const (
	ModeNone          Mode = "none"
	ModeOfficial      Mode = "official"
	ModeReconstructed Mode = "reconstructed"
	ModeEstimated     Mode = "estimated"
)

type SpeedUnit string

const (
	SpeedUnitMPS SpeedUnit = "mps"
	SpeedUnitKPH SpeedUnit = "kph"
	SpeedUnitMPH SpeedUnit = "mph"
)

type TemperatureUnit string

const (
	TemperatureUnitCelsius    TemperatureUnit = "celsius"
	TemperatureUnitFahrenheit TemperatureUnit = "fahrenheit"
)

type PressureUnit string

const (
	PressureUnitKPA PressureUnit = "kpa"
	PressureUnitPSI PressureUnit = "psi"
)

type FuelUnit string

const (
	FuelUnitLiters    FuelUnit = "liters"
	FuelUnitGallonsUS FuelUnit = "gallons-us"
)

type UnitsV2 struct {
	Speed       SpeedUnit       `json:"speed"`
	Temperature TemperatureUnit `json:"temperature"`
	Pressure    PressureUnit    `json:"pressure"`
	Fuel        FuelUnit        `json:"fuel"`
}

type SourceStatusV2 struct {
	State            string `json:"state"`
	ReconnectAttempt uint32 `json:"retry,omitempty"`
	LastFrameAgeMS   int64  `json:"ageMs,omitempty"`
	DegradedReason   string `json:"reason,omitempty"`
}

type UpdateV2 struct {
	DeliveryRevision uint64         `json:"revision"`
	Source           SourceStatusV2 `json:"source"`
	Frame            *FrameV2       `json:"frame"`
}

type FrameV2 struct {
	ContractVersion  uint16              `json:"contract"`
	AlgorithmVersion uint16              `json:"algorithm"`
	StreamEpoch      uint64              `json:"epoch"`
	SourceSequence   uint64              `json:"sequence"`
	SessionID        string              `json:"sessionId"`
	GeneratedAt      string              `json:"generatedAt"`
	Units            UnitsV2             `json:"units"`
	Session          SessionV2           `json:"session"`
	Player           PlayerInstrumentsV2 `json:"player"`
	Standings        []StandingRowV2     `json:"standings"`
	Relative         []RelativeRowV2     `json:"relative"`
	Delta            DeltaViewV2         `json:"delta"`
	Fuel             FuelViewV2          `json:"fuel"`
	Spotter          SpotterViewV2       `json:"spotter"`
	Capabilities     CapabilitiesV2      `json:"capabilities"`
}

type SessionV2 struct {
	Track            QValue[string]  `json:"track"`
	Phase            QValue[string]  `json:"phase"`
	Flag             QValue[string]  `json:"flag"`
	RemainingSeconds QValue[float64] `json:"remaining"`
	MaximumLaps      QValue[int32]   `json:"maxLaps"`
}

type PlayerInstrumentsV2 struct {
	VehicleID string          `json:"id,omitempty"`
	Speed     QValue[float64] `json:"speed"`
	RPM       QValue[float64] `json:"rpm"`
	Gear      QValue[int32]   `json:"gear"`
	Throttle  QValue[float64] `json:"throttle"`
	Brake     QValue[float64] `json:"brake"`
	Clutch    QValue[float64] `json:"clutch"`
	Steering  QValue[float64] `json:"steering"`
}

type StandingRowV2 struct {
	VehicleID      string          `json:"id"`
	Position       int32           `json:"position"`
	ClassPosition  int32           `json:"classPosition"`
	ClassID        string          `json:"classId,omitempty"`
	DriverName     string          `json:"driver,omitempty"`
	CarNumber      string          `json:"number,omitempty"`
	GapSeconds     QValue[float64] `json:"gap"`
	GapLaps        int32           `json:"gapLaps,omitempty"`
	PitState       string          `json:"pit,omitempty"`
	CompletedLaps  int32           `json:"laps,omitempty"`
	LastLapSeconds QValue[float64] `json:"lastLap"`
}

type RelativeRowV2 struct {
	VehicleID   string          `json:"id"`
	GapSeconds  QValue[float64] `json:"gap"`
	Side        string          `json:"side"`
	Authority   Authority       `json:"authority"`
	DisplayName string          `json:"name,omitempty"`
	ClassID     string          `json:"classId,omitempty"`
}

type DeltaViewV2 struct {
	Seconds   QValue[float64] `json:"seconds"`
	Reference string          `json:"reference,omitempty"`
	Requested string          `json:"requested,omitempty"`
	Available []string        `json:"available"`
	Trend     string          `json:"trend,omitempty"`
	Authority Authority       `json:"authority,omitempty"`
}

type FuelViewV2 struct {
	Remaining     QValue[float64] `json:"remaining"`
	Capacity      QValue[float64] `json:"capacity"`
	PerLap        QValue[float64] `json:"perLap"`
	EstimatedLaps QValue[float64] `json:"estimatedLaps"`
}

type SpotterViewV2 struct {
	Mode  Mode         `json:"mode"`
	Left  QValue[bool] `json:"left"`
	Right QValue[bool] `json:"right"`
}

type CapabilityModesV2 struct {
	Spatial   []string `json:"spatial"`
	Delta     []string `json:"delta"`
	Standings Mode     `json:"standings"`
	Gaps      Mode     `json:"gaps"`
}

type CapabilitiesV2 struct {
	Supported []string           `json:"supported"`
	Available map[string]Quality `json:"available"`
	Modes     CapabilityModesV2  `json:"modes"`
}
