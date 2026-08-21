package weather

import (
	"fmt"
	"math"
	"time"
)

// ContractVersion para WeatherScenario v1 (comando de captura).
const ContractVersionWeatherScenarioV1 = "weatherscenario.v1"

// Sky representa el estado del cielo según /rest/sessions/weather (verificado #702).
type Sky string

const (
	SkyClear           Sky = "clear"
	SkyLightClouds     Sky = "light_clouds"
	SkyMostlyCloudy    Sky = "mostly_cloudy"
	SkyOvercast        Sky = "overcast"
	SkyPartiallyCloudy Sky = "partially_cloudy"
	SkyDrizzle         Sky = "drizzle"
)

func (s Sky) Valid() bool {
	switch s {
	case SkyClear, SkyLightClouds, SkyMostlyCloudy, SkyOvercast, SkyPartiallyCloudy, SkyDrizzle:
		return true
	default:
		return false
	}
}

// WeatherNodeProgress es la progresión fija del forecast: START/25/50/75/FINISH (5 nodos).
type WeatherNodeProgress string

const (
	NodeStart  WeatherNodeProgress = "START"
	Node25     WeatherNodeProgress = "25"
	Node50     WeatherNodeProgress = "50"
	Node75     WeatherNodeProgress = "75"
	NodeFinish WeatherNodeProgress = "FINISH"
)

func (p WeatherNodeProgress) Valid() bool {
	switch p {
	case NodeStart, Node25, Node50, Node75, NodeFinish:
		return true
	default:
		return false
	}
}

// WeatherNode es un nodo del escenario (rain chance/sky/temp).
type WeatherNode struct {
	Progress   WeatherNodeProgress `json:"progress"`
	RainChance float64             `json:"rainChance"`
	Sky        Sky                 `json:"sky"`
	AirTempC   float64             `json:"airTempC"`
	TrackTempC float64             `json:"trackTempC"`
}

func (n WeatherNode) Validate() error {
	if !n.Progress.Valid() {
		return fmt.Errorf("progress %q invalid", n.Progress)
	}
	if math.IsNaN(n.RainChance) || math.IsInf(n.RainChance, 0) || n.RainChance < 0 || n.RainChance > 100 {
		return fmt.Errorf("rainChance must be in [0,100]")
	}
	if !n.Sky.Valid() {
		return fmt.Errorf("sky %q invalid", n.Sky)
	}
	if math.IsNaN(n.AirTempC) || math.IsInf(n.AirTempC, 0) {
		return fmt.Errorf("airTempC invalid")
	}
	if math.IsNaN(n.TrackTempC) || math.IsInf(n.TrackTempC, 0) {
		return fmt.Errorf("trackTempC invalid")
	}
	return nil
}

// CaptureProvenance registra procedencia y frescura de la captura (ADR 0009 §10:
// Telemetry Core posee la adquisición REST; Strategy persiste WeatherScenario al capturar).
type CaptureProvenance struct {
	Source      string    `json:"source"`
	CapturedAt  time.Time `json:"capturedAt"`
	FreshUntil  time.Time `json:"freshUntil"`
	SessionType string    `json:"sessionType"`
	// SignalFreshness indica si la señal de Core estaba fresh en el momento de capturar.
	SignalFreshness string `json:"signalFreshness"`
}

// WeatherScenarioV1 es el comando de captura WeatherScenario v1.
// El forecast proviene de GET /rest/sessions/weather (5 nodos) y se persiste
// por Strategy; Overlays jamás lee Core ni REST directamente.
type WeatherScenarioV1 struct {
	ContractVersion ContractVersion   `json:"contractVersion"`
	ScenarioID      string            `json:"scenarioId"`
	CombinationID   string            `json:"combinationId"`
	GeneratedAt     time.Time         `json:"generatedAt"`
	Nodes           [5]WeatherNode    `json:"nodes"`
	Provenance      CaptureProvenance `json:"provenance"`
}

type ContractVersion string

func (s WeatherScenarioV1) Validate() error {
	if s.ContractVersion != ContractVersionWeatherScenarioV1 {
		return fmt.Errorf("unsupported contractVersion %q", s.ContractVersion)
	}
	if s.ScenarioID == "" || len(s.ScenarioID) > 128 {
		return fmt.Errorf("scenarioId required 1-128")
	}
	if s.CombinationID == "" {
		return fmt.Errorf("combinationId required")
	}
	if s.GeneratedAt.IsZero() || s.GeneratedAt.Location() != time.UTC {
		return fmt.Errorf("generatedAt must be UTC")
	}
	// Validar progresión exacta en orden START/25/50/75/FINISH
	exp := [5]WeatherNodeProgress{NodeStart, Node25, Node50, Node75, NodeFinish}
	for i, want := range exp {
		if s.Nodes[i].Progress != want {
			return fmt.Errorf("nodes[%d] progress must be %q", i, want)
		}
		if err := s.Nodes[i].Validate(); err != nil {
			return fmt.Errorf("nodes[%d]: %w", i, err)
		}
	}
	if s.Provenance.Source == "" {
		return fmt.Errorf("provenance.source required")
	}
	if s.Provenance.CapturedAt.IsZero() {
		return fmt.Errorf("provenance.capturedAt required")
	}
	if !s.Provenance.FreshUntil.After(s.Provenance.CapturedAt) {
		return fmt.Errorf("freshUntil must be after capturedAt")
	}
	return nil
}
