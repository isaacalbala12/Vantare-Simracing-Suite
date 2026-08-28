// Package overlayv2 defines the compact Overlay wire contract. It is additive:
// Overlay v1 remains the production contract until the migration gate closes.
package overlayv2

import "encoding/json"

const (
	ContractVersionV2  uint16 = 2
	AlgorithmVersionV2 uint16 = 2
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
	V T       `json:"v,omitempty,omitzero"`
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
	// ModeXYZ is the spotter's: the verdict came from full 3D positions
	// rotated into the player's frame, the strongest spatial mode the spec
	// enumerates (xyz > xy > lap-distance > none).
	ModeXYZ Mode = "xyz"
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

// SourceStateV2 is the closed simulator-neutral lifecycle exposed to Overlay.
// Keep it aligned with driver.State without importing a concrete driver into
// the projection contract.
type SourceStateV2 string

const (
	SourceStateStopped    SourceStateV2 = "stopped"
	SourceStateDetecting  SourceStateV2 = "detecting"
	SourceStateConnecting SourceStateV2 = "connecting"
	SourceStateLive       SourceStateV2 = "live"
	SourceStateDegraded   SourceStateV2 = "degraded"
	SourceStateStale      SourceStateV2 = "stale"
	SourceStateError      SourceStateV2 = "error"
	SourceStateStopping   SourceStateV2 = "stopping"
)

func (state SourceStateV2) Known() bool {
	switch state {
	case SourceStateStopped, SourceStateDetecting, SourceStateConnecting, SourceStateLive,
		SourceStateDegraded, SourceStateStale, SourceStateError, SourceStateStopping:
		return true
	default:
		return false
	}
}

type UnitsV2 struct {
	Speed       SpeedUnit       `json:"speed"`
	Temperature TemperatureUnit `json:"temperature"`
	Pressure    PressureUnit    `json:"pressure"`
	Fuel        FuelUnit        `json:"fuel"`
}

type SourceStatusV2 struct {
	State            SourceStateV2 `json:"state"`
	ReconnectAttempt uint32        `json:"retry,omitempty"`
	LastFrameAgeMS   int64         `json:"ageMs,omitempty"`
	DegradedReason   string        `json:"reason,omitempty"`
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
	Controls         ControlsV2          `json:"controls"`
	Standings        []StandingRowV2     `json:"standings"`
	Relative         []RelativeRowV2     `json:"relative"`
	Delta            DeltaViewV2         `json:"delta"`
	Fuel             FuelViewV2          `json:"fuel"`
	Spotter          SpotterViewV2       `json:"spotter"`
	Damage           DamageViewV2        `json:"damage"`
	Weather          WeatherV2           `json:"weather"`
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

// ControlsHistoryV2 carries the player's recent pedal series. It is the player
// alone, never the grid: one row of three ratios per canonical tick.
//
// The wire form is three parallel arrays of per-mille integers (0..1000), which
// is the ratio quantized to the three decimals the widget draws. Parallel
// arrays cost one number per sample instead of an object with three keys, and
// a per-mille integer costs at most four characters instead of the five a
// "0.123" float needs. At the canonical maximum of 120 samples the whole
// section stays around 1.5 KB.
//
// The samples are evenly spaced in the canonical stream (one per tick), so the
// series publishes a single WindowMS — the span from the first sample to the
// last — instead of repeating a timestamp per sample. A consumer that draws the
// series against time reconstructs each x as an equal step across that window.
// Under an irregular tick that reconstruction is an approximation of the real
// capture instants; it is a declared difference against Overlay v1, which
// carries a per-sample timestamp, and never an invented value.
type ControlsHistoryV2 struct {
	Q Quality `json:"q"`
	// WindowMS is the span covered by the samples, first to last. It is zero
	// when fewer than two samples exist: a single point spans nothing.
	WindowMS int64   `json:"windowMs,omitempty"`
	Throttle []int16 `json:"throttle,omitempty"`
	Brake    []int16 `json:"brake,omitempty"`
	Clutch   []int16 `json:"clutch,omitempty"`
}

type ControlsV2 struct {
	History ControlsHistoryV2 `json:"history"`
}

type GroundPositionV2 struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}

type WeatherV2 struct {
	AmbientC    QValue[float64] `json:"ambientC"`
	TrackC      QValue[float64] `json:"trackC"`
	RainPercent QValue[float64] `json:"rainPercent"`
	WetnessPct  QValue[float64] `json:"wetnessPct"`
	WindKph     QValue[float64] `json:"windKph"`
	WindDir     QValue[string]  `json:"windDir"`
	PressureHpa QValue[float64] `json:"pressureHpa"`
}

type StandingRowV2 struct {
	VehicleID      string                   `json:"id"`
	Position       int32                    `json:"position"`
	ClassPosition  int32                    `json:"classPosition"`
	ClassID        string                   `json:"classId,omitempty"`
	DriverName     string                   `json:"driver,omitempty"`
	CarNumber      string                   `json:"number,omitempty"`
	GapSeconds     QValue[float64]          `json:"gap"`
	GapLaps        int32                    `json:"gapLaps,omitempty"`
	PitState       string                   `json:"pit,omitempty"`
	CompletedLaps  int32                    `json:"laps,omitempty"`
	LastLapSeconds QValue[float64]          `json:"lastLap"`
	LapDistance    QValue[float64]          `json:"lapDistance"`
	GroundPosition QValue[GroundPositionV2] `json:"groundPosition"`
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

// FuelBasis names the arithmetic behind FuelViewV2.EstimatedLaps.
type FuelBasis string

const (
	// FuelBasisFuel is floor(remaining / perLap): the laps the tank allows.
	FuelBasisFuel FuelBasis = "fuel"
	// FuelBasisSession is ceil(sessionRemaining / lastLapTime): the laps the
	// session has left at the last lap pace, which is what Overlay v1 showed.
	FuelBasisSession FuelBasis = "session"
)

type FuelViewV2 struct {
	Remaining     QValue[float64] `json:"remaining"`
	Capacity      QValue[float64] `json:"capacity"`
	PerLap        QValue[float64] `json:"perLap"`
	EstimatedLaps QValue[float64] `json:"estimatedLaps"`
	Basis         FuelBasis       `json:"basis,omitempty"`
}

type SpotterViewV2 struct {
	Mode  Mode         `json:"mode"`
	Left  QValue[bool] `json:"left"`
	Right QValue[bool] `json:"right"`
}

type DamageViewV2 struct {
	Dents              QValue[[]uint16] `json:"dents"`
	Overheating        QValue[bool]     `json:"overheating"`
	Detached           QValue[bool]     `json:"detached"`
	WheelDetachedCount QValue[uint8]    `json:"wheelDetachedCount"`
}

type CapabilityModesV2 struct {
	Spatial   []string `json:"spatial"`
	Delta     []string `json:"delta"`
	Standings Mode     `json:"standings"`
	Gaps      Mode     `json:"gaps"`
}

type PerformanceModeV2 string

const (
	PerformanceModeManual PerformanceModeV2 = "manual"
	PerformanceModeCustom PerformanceModeV2 = "custom"
	PerformanceModeAuto   PerformanceModeV2 = "auto"
)

type PerformanceEffectsV2 string

const (
	PerformanceEffectsFull   PerformanceEffectsV2 = "full"
	PerformanceEffectsNoBlur PerformanceEffectsV2 = "noBlur"
	PerformanceEffectsFlat   PerformanceEffectsV2 = "flat"
)

// PerformanceV2 es la politica efectiva decidida por Go. WidgetHz usa JSON
// crudo solo para conservar la union cerrada number | dirty | event en wire.
type PerformanceV2 struct {
	Level    uint8                      `json:"level"`
	Mode     PerformanceModeV2          `json:"mode"`
	Effects  PerformanceEffectsV2       `json:"effects"`
	RafCap   *int                       `json:"rafCap"`
	WidgetHz map[string]json.RawMessage `json:"widgetHz"`
	Reason   string                     `json:"reason,omitempty"`
	SourceHz float64                    `json:"sourceHz"`
}

type CapabilitiesV2 struct {
	Supported   []string           `json:"supported"`
	Available   map[string]Quality `json:"available"`
	Modes       CapabilityModesV2  `json:"modes"`
	Performance *PerformanceV2     `json:"performance,omitempty"`
}
