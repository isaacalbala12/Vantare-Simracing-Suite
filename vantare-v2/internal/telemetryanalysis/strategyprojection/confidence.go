package strategyprojection

// Confidence es el eje de confianza: muestra/rango/varianza/version de calculo.
// Es independiente de Presence y Provenance y viaja en cada familia.
type Confidence struct {
	// SampleSize es N de muestras utiles tras etiquetado de vueltas.
	SampleSize int `json:"sampleSize"`
	// RangeLower/RangeUpper describen el intervalo observado (p. ej. L/s, s/vuelta).
	RangeLower *float64 `json:"rangeLower,omitempty"`
	RangeUpper *float64 `json:"rangeUpper,omitempty"`
	// Variance es varianza muestral cuando aplica (NaN si no calculable).
	Variance *float64 `json:"variance,omitempty"`
	// ComputationVersion versiona el algoritmo de derivacion (semver o hash corto).
	ComputationVersion string `json:"computationVersion"`
}

func (c Confidence) Validate() error {
	if c.SampleSize < 0 {
		return contractError("invalid_confidence", "confidence.sampleSize", "sampleSize must be >= 0")
	}
	if c.RangeLower != nil && c.RangeUpper != nil && *c.RangeLower > *c.RangeUpper {
		return contractError("invalid_confidence", "confidence.range", "rangeLower must be <= rangeUpper")
	}
	if c.ComputationVersion == "" {
		return contractError("invalid_confidence", "confidence.computationVersion", "computationVersion is required")
	}
	return nil
}

// IdentifiabilityGate indica si una curva separada (peso-fuel vs edad-neumatico)
// es publicable o debe quedarse como combinada.
type Identifiability string

const (
	IdentifiabilityCombinedOnly Identifiability = "combined_only"
	IdentifiabilitySeparable    Identifiability = "separable"
)

func (v Identifiability) Valid() bool {
	return v == IdentifiabilityCombinedOnly || v == IdentifiabilitySeparable
}
