package weather

import (
	"time"
)

// ContractVersion para StrategyWeatherReadModel v1 — lo único que Overlays podrá consumir.
const ContractVersionWeatherReadModelV1 = "strategyweatherreadmodel.v1"

// StrategyWeatherReadModelV1 es el read model que Strategy expone a Overlays.
// No contiene telemetría cruda ni campos desconocidos; es derivado del WeatherScenario capturado
// con presencia/frescura. Overlays jamás lee Core, REST ni repositorios directamente (ADR 0009 §15,
// guard arquitectónico).
type StrategyWeatherReadModelV1 struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	ModelID         string          `json:"modelId"`
	CombinationID   string          `json:"combinationId"`
	GeneratedAt     time.Time       `json:"generatedAt"`
	Nodes           [5]WeatherNode  `json:"nodes"`
	Presence        string          `json:"presence"`
	Freshness       Freshness       `json:"freshness"`
	Source          string          `json:"source"`
}

type Freshness struct {
	CapturedAt time.Time `json:"capturedAt"`
	FreshUntil time.Time `json:"freshUntil"`
	IsFresh    bool      `json:"isFresh"`
	IsStale    bool      `json:"isStale"`
}

// Validate minimal.
func (m StrategyWeatherReadModelV1) Validate() error {
	if m.ContractVersion != ContractVersionWeatherReadModelV1 {
		return validationError("unsupported contractVersion")
	}
	if m.ModelID == "" || m.CombinationID == "" {
		return validationError("modelId/combinationId required")
	}
	// reutiliza validación de nodos
	exp := [5]WeatherNodeProgress{NodeStart, Node25, Node50, Node75, NodeFinish}
	for i, want := range exp {
		if m.Nodes[i].Progress != want {
			return validationError("nodes progress mismatch")
		}
		if err := m.Nodes[i].Validate(); err != nil {
			return err
		}
	}
	return nil
}

func validationError(msg string) error { return &validationErr{msg: msg} }

type validationErr struct{ msg string }

func (e *validationErr) Error() string { return e.msg }
