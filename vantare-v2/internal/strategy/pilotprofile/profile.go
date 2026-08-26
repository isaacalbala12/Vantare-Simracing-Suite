package pilotprofile

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ContractVersion para PilotProfile v1 (por combinación y condición; export/import de archivo).
const ContractVersionV1 ContractVersion = "pilotprofile.v1"

type ContractVersion string

type Condition string

const (
	ConditionDry   Condition = "dry"
	ConditionWet   Condition = "wet"
	ConditionMixed Condition = "mixed"
)

func (c Condition) Valid() bool {
	switch c {
	case ConditionDry, ConditionWet, ConditionMixed:
		return true
	default:
		return false
	}
}

// FuelConsumption es consumo por vuelta con rango y confianza (referencia a projection).
type FuelConsumption struct {
	MeanPerLap float64 `json:"meanPerLap"`
	RangeLower float64 `json:"rangeLower"`
	RangeUpper float64 `json:"rangeUpper"`
	SampleSize int     `json:"sampleSize"`
}

// Pace representa ritmo base + degradación por vuelta.
type Pace struct {
	BaseSeconds       float64 `json:"baseSeconds"`
	DegradationPerLap float64 `json:"degradationPerLap"`
	SampleSize        int     `json:"sampleSize"`
}

// PilotProfileV1 es propiedad de Strategy (ADR 0009 §15), exportable/importable
// como archivo (puente de equipo sin servidor) y unidad que la subida opt-in
// comparte seudonimizada según §5 (sin nombres, sin fechas absolutas).
type PilotProfileV1 struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	ProfileID       string          `json:"profileId"`
	CombinationID   string          `json:"combinationId"`
	Condition       Condition       `json:"condition"`
	DisplayName     string          `json:"displayName"`
	ExportedAt      time.Time       `json:"exportedAt"`
	Fuel            FuelConsumption `json:"fuel"`
	VE              FuelConsumption `json:"ve"`
	Pace            Pace            `json:"pace"`
	Provenance      Provenance      `json:"provenance"`
}

type Provenance struct {
	Kind     string `json:"kind"`
	SourceID string `json:"sourceId"`
}

func (p PilotProfileV1) Validate() error {
	if p.ContractVersion != ContractVersionV1 {
		return fmt.Errorf("unsupported contractVersion %q", p.ContractVersion)
	}
	if strings.TrimSpace(p.ProfileID) == "" || len(p.ProfileID) > 128 {
		return fmt.Errorf("profileId required 1-128")
	}
	if strings.TrimSpace(p.CombinationID) == "" {
		return fmt.Errorf("combinationId required")
	}
	if !p.Condition.Valid() {
		return fmt.Errorf("condition invalid %q", p.Condition)
	}
	if strings.TrimSpace(p.DisplayName) == "" {
		return fmt.Errorf("displayName required")
	}
	if p.ExportedAt.IsZero() {
		return fmt.Errorf("exportedAt required")
	}
	if p.Fuel.MeanPerLap < 0 || p.VE.MeanPerLap < 0 {
		return fmt.Errorf("fuel/ve mean invalid")
	}
	if p.Pace.BaseSeconds <= 0 {
		return fmt.Errorf("pace baseSeconds must be >0")
	}
	if strings.TrimSpace(p.Provenance.Kind) == "" || strings.TrimSpace(p.Provenance.SourceID) == "" {
		return fmt.Errorf("provenance required")
	}
	return nil
}

// Export serializa el perfil para archivo (round-trip íntegro).
func (p PilotProfileV1) Export() ([]byte, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}
	return json.Marshal(p)
}

// Import deserializa y valida.
func Import(data []byte) (PilotProfileV1, error) {
	var p PilotProfileV1
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&p); err != nil {
		return PilotProfileV1{}, fmt.Errorf("decode pilot profile: %w", err)
	}
	if err := p.Validate(); err != nil {
		return PilotProfileV1{}, err
	}
	return p, nil
}
