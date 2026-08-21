package strategyprojection

import "time"

// StrategyInputProjectionV2 es el contrato que Analysis produce en F3a.
// Familias degradadas por D19/informe F0-1:
//
//   - CombinedStintPaceCurve con identifiability (combined_only por defecto)
//   - Pit degradado: ObservedPitLaneInterval + tasas observadas, con trafico/servicio manual
//   - Ahorro con procedencia manual (A5 INVALID)
//   - Clima por buckets de Path Wetness (D5): seco/humedo/mojado, booleanos no informativos descartados
//   - Degradacion por eje/rueda (corner futuro condicionado a mapping versionado)
type StrategyInputProjectionV2 struct {
	ContractVersion    ContractVersion `json:"contractVersion"`
	GeneratedAt        time.Time       `json:"generatedAt"`
	ComputationVersion string          `json:"computationVersion"`
	SourceSessions     []string        `json:"sourceSessions"`
	CombinationID      string          `json:"combinationId"`

	// Familias. Cada una lleva sus tres ejes; una familia ausente queda con
	// Presence=missing/unsupported y no bloquea las demas.
	SessionClassification    SessionClassificationFamily `json:"sessionClassification"`
	LapValidity              LapValidityFamily           `json:"lapValidity"`
	FuelConsumption          ResourceConsumptionFamily   `json:"fuelConsumption"`
	VirtualEnergyConsumption ResourceConsumptionFamily   `json:"virtualEnergyConsumption"`
	CombinedStintPaceCurve   CombinedStintPaceCurve      `json:"combinedStintPaceCurve"`
	// Curvas separadas solo si identifiability==separable.
	FuelWeightCurve *SeparableCurve `json:"fuelWeightCurve,omitempty"`
	TyreAgeCurve    *SeparableCurve `json:"tyreAgeCurve,omitempty"`

	TyreDegradation TyreDegradationFamily `json:"tyreDegradation"`
	Pit             PitFamily             `json:"pit"`
	SavingCost      SavingCostFamily      `json:"savingCost"`
	ClimateBuckets  ClimateBucketsFamily  `json:"climateBuckets"`
	Temporal        TemporalSegmentsV1    `json:"temporal"`
}

// SessionClassificationFamily (A3 VALID tras spot-check). Seis campos de identidad
// presentes en 336/336; sesiones cortas/sin vuelta -> identificada pero no utilizable.
type SessionClassificationFamily struct {
	Presence          Presence   `json:"presence"`
	Provenance        Provenance `json:"provenance"`
	Confidence        Confidence `json:"confidence"`
	TrackName         string     `json:"trackName"`
	TrackLayout       string     `json:"trackLayout"`
	CarName           string     `json:"carName"`
	CarClass          string     `json:"carClass"`
	SessionType       string     `json:"sessionType"`
	WeatherConditions string     `json:"weatherConditions"`
	UsableForFamilies []string   `json:"usableForFamilies"`
}

// LapValidityFamily: exclusion con motivo; etiqueta out/in-lap, pit, incidente, trafico (D7).
type LapValidityFamily struct {
	Presence   Presence      `json:"presence"`
	Provenance Provenance    `json:"provenance"`
	Confidence Confidence    `json:"confidence"`
	Laps       []LapValidity `json:"laps"`
}

type LapValidity struct {
	LapNumber int      `json:"lapNumber"`
	Included  bool     `json:"included"`
	Reason    string   `json:"reason"`
	Tags      []string `json:"tags"`
}

// ResourceConsumptionFamily: media/rango/varianza/confianza por condicion de clima y mezcla.
type ResourceConsumptionFamily struct {
	Presence        Presence                  `json:"presence"`
	Provenance      Provenance                `json:"provenance"`
	Confidence      Confidence                `json:"confidence"`
	MeanPerLap      float64                   `json:"meanPerLap"`
	RangeLower      float64                   `json:"rangeLower"`
	RangeUpper      float64                   `json:"rangeUpper"`
	ByClimateBucket map[ClimateBucket]float64 `json:"byClimateBucket,omitempty"`
	ByMixture       map[int]float64           `json:"byMixture,omitempty"`
}

// CombinedStintPaceCurve: curva combinada obligatoria. Identifiability por defecto combined_only.
type CombinedStintPaceCurve struct {
	Presence        Presence        `json:"presence"`
	Provenance      Provenance      `json:"provenance"`
	Confidence      Confidence      `json:"confidence"`
	Identifiability Identifiability `json:"identifiability"`
	Reason          string          `json:"reason,omitempty"`
	Points          []PacePoint     `json:"points"`
}

// SeparableCurve solo se publica si identifiability==separable tras gate.
type SeparableCurve struct {
	Presence   Presence    `json:"presence"`
	Provenance Provenance  `json:"provenance"`
	Confidence Confidence  `json:"confidence"`
	Points     []PacePoint `json:"points"`
}

type PacePoint struct {
	LapInStint   int      `json:"lapInStint"`
	DeltaSeconds float64  `json:"deltaSeconds"`
	SampleSize   int      `json:"sampleSize"`
	RangeLower   *float64 `json:"rangeLower,omitempty"`
	RangeUpper   *float64 `json:"rangeUpper,omitempty"`
}

// TyreDegradationFamily por eje/rueda (corner futuro condicionado).
type TyreDegradationFamily struct {
	Presence             Presence              `json:"presence"`
	Provenance           Provenance            `json:"provenance"`
	Confidence           Confidence            `json:"confidence"`
	Reason               string                `json:"reason,omitempty"`
	ByAxle               map[TyreAxle]float64  `json:"byAxle,omitempty"`
	ByWheel              map[TyreWheel]float64 `json:"byWheel,omitempty"`
	ByCorner             map[string]float64    `json:"byCorner,omitempty"`
	LifeLapsEstimate     *int                  `json:"lifeLapsEstimate,omitempty"`
	LifeLapsByWheel      map[TyreWheel]float64 `json:"lifeLapsByWheel,omitempty"`
	LifeLapsRangeLower   *float64              `json:"lifeLapsRangeLower,omitempty"`
	LifeLapsRangeUpper   *float64              `json:"lifeLapsRangeUpper,omitempty"`
	LifeThresholdPercent float64               `json:"lifeThresholdPercent,omitempty"`
	CompoundPresence     Presence              `json:"compoundPresence"`
	CompoundMappingNote  string                `json:"compoundMappingNote"`
}

type TyreAxle string

const (
	TyreAxleFront TyreAxle = "front"
	TyreAxleRear  TyreAxle = "rear"
)

type TyreWheel string

const (
	TyreWheelFL TyreWheel = "FL"
	TyreWheelFR TyreWheel = "FR"
	TyreWheelRL TyreWheel = "RL"
	TyreWheelRR TyreWheel = "RR"
)

// PitFamily degradado: ObservedPitLaneInterval + tasas observadas (A4 INVALID -> ramas degradadas).
// Breakdown exacto condicionado a reloj comun y marcadores (futuro). Transito/servicio manual.
type PitFamily struct {
	Presence             Presence                  `json:"presence"`
	Provenance           Provenance                `json:"provenance"`
	Confidence           Confidence                `json:"confidence"`
	ObservedIntervals    []ObservedPitLaneInterval `json:"observedIntervals"`
	TransitSecondsManual *float64                  `json:"transitSecondsManual,omitempty"`
	ServiceSecondsManual *float64                  `json:"serviceSecondsManual,omitempty"`
	RatesNote            string                    `json:"ratesNote"`
}

type ObservedPitLaneInterval struct {
	PitNumber       int      `json:"pitNumber"`
	DurationSeconds float64  `json:"durationSeconds"`
	FuelRateLPerS   *float64 `json:"fuelRateLPerS,omitempty"`
	VERatePPerS     *float64 `json:"veRatePPerS,omitempty"`
	HasFuelRise     bool     `json:"hasFuelRise"`
	HasVERise       bool     `json:"hasVERise"`
}

// SavingCostFamily: A5 INVALID -> procedencia manual, derivable solo via protocolo A/B.
type SavingCostFamily struct {
	Presence   Presence      `json:"presence"`
	Provenance Provenance    `json:"provenance"`
	Confidence Confidence    `json:"confidence"`
	ManualNote string        `json:"manualNote"`
	Levels     []SavingLevel `json:"levels,omitempty"`
}

type SavingLevel struct {
	MixtureCode     int     `json:"mixtureCode"`
	FuelSavedPerLap float64 `json:"fuelSavedPerLap"`
	TimeCostPerLap  float64 `json:"timeCostPerLap"`
}

// ClimateBucketsFamily: buckets discretos via Path Wetness (0, 5, 12.5% observados).
type ClimateBucketsFamily struct {
	Presence   Presence             `json:"presence"`
	Provenance Provenance           `json:"provenance"`
	Confidence Confidence           `json:"confidence"`
	Buckets    []ClimateBucketPoint `json:"buckets"`
}

type ClimateBucket string

const (
	ClimateBucketDry   ClimateBucket = "dry"
	ClimateBucketHumid ClimateBucket = "humid"
	ClimateBucketWet   ClimateBucket = "wet"
)

type ClimateBucketPoint struct {
	Bucket             ClimateBucket `json:"bucket"`
	PathWetnessPercent float64       `json:"pathWetnessPercent"`
	SampleSize         int           `json:"sampleSize"`
}

func (p StrategyInputProjectionV2) Validate() error {
	if p.ContractVersion != ContractVersionStrategyInputProjectionV2 {
		return contractError("unsupported_contract_version", "contractVersion", "unsupported strategy input projection version")
	}
	if err := validateTimestamp("generatedAt", p.GeneratedAt); err != nil {
		return err
	}
	if p.ComputationVersion == "" {
		return contractError("invalid_document", "computationVersion", "is required")
	}
	if err := p.CombinedStintPaceCurve.Validate(); err != nil {
		return err
	}
	if p.FuelWeightCurve != nil && p.CombinedStintPaceCurve.Identifiability != IdentifiabilitySeparable {
		return contractError("invalid_document", "fuelWeightCurve", "requires separable identifiability")
	}
	if p.TyreAgeCurve != nil && p.CombinedStintPaceCurve.Identifiability != IdentifiabilitySeparable {
		return contractError("invalid_document", "tyreAgeCurve", "requires separable identifiability")
	}
	// Pit: si no hay reloj comun, breakdown exacto no se publica; solo intervalos.
	// La validacion aqui solo comprueba presencia/provenance/confidence basicos.
	if !p.Pit.Presence.Valid() {
		return contractError("invalid_document", "pit.presence", "unknown presence")
	}
	return nil
}

func (c CombinedStintPaceCurve) Validate() error {
	if !c.Presence.Valid() {
		return contractError("invalid_document", "combinedStintPaceCurve.presence", "unknown presence")
	}
	if !c.Identifiability.Valid() {
		return contractError("invalid_document", "combinedStintPaceCurve.identifiability", "unknown identifiability")
	}
	if err := c.Provenance.Validate(); err != nil {
		return err
	}
	return c.Confidence.Validate()
}
