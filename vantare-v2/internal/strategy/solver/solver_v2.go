package solver

import (
	"fmt"
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/tyres"
	"github.com/vantare/overlays/v2/internal/strategy/weather"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// SolverContractVersion para el I/O ampliado (compile-only, no wiring).
const SolverContractVersionV2 = "strategy.solver.v2"

// DecisionVector es el vector completo que el solver elige (spec §5 D6).
// Cada pit es una variable: vuelta arbitraria + cantidades por servicio + compuesto/piloto/ahorro del stint siguiente.
type DecisionVector struct {
	PitStops []PitStopDecision `json:"pitStops"`
	Stints   []StintDecision   `json:"stints"`
}

type PitStopDecision struct {
	Lap          int64                 `json:"lap"`
	FuelLiters   float64               `json:"fuelLiters"`
	VEPercent    float64               `json:"vePercent"`
	Compound     TyreCompound          `json:"compound"`
	Driver       string                `json:"driver"`
	SavingLevel  SavingLevel           `json:"savingLevel"`
	ServiceMode  manual.PitServiceMode `json:"serviceMode"`
	PitCostInput *manual.PitStopInput  `json:"pitCostInput,omitempty"`
	PitBreakdown *manual.PitBreakdown  `json:"pitBreakdown,omitempty"`
	ChangeTyres  bool                  `json:"changeTyres"`
	TyreFitment  *tyres.Fitment        `json:"tyreFitment,omitempty"`
}

type StintDecision struct {
	Index             int            `json:"index"`
	Laps              int64          `json:"laps"`
	Compound          TyreCompound   `json:"compound"`
	Driver            string         `json:"driver"`
	SavingLevel       SavingLevel    `json:"savingLevel"`
	FuelSavedPerLap   float64        `json:"fuelSavedPerLap"`
	VESavedPerLap     float64        `json:"veSavedPerLap"`
	TimeCostPerLap    float64        `json:"timeCostPerLap"`
	SavingCostSeconds float64        `json:"savingCostSeconds"`
	TyreFitment       *tyres.Fitment `json:"tyreFitment,omitempty"`
}

type TyreCompound = tyres.Compound
type SavingLevel string

const (
	SavingNone SavingLevel = "none"
	SavingLow  SavingLevel = "low"
	SavingMid  SavingLevel = "mid"
	SavingHigh SavingLevel = "high"
)

// PitCostModel describe el desglose compatible con manual.PitStopInput:
// tránsito + repostaje por cantidad (rate) + neumáticos + solape paralelo/secuencial.
// El solver no duplica la fórmula: delega en manual.CalculatePitStop y expone tasas.
type PitCostModel struct {
	TransitSeconds  float64               `json:"transitSeconds"`
	RefuelRateLPerS float64               `json:"refuelRateLPerS"`
	VERatePPerS     float64               `json:"veRatePPerS"`
	TyreSeconds     float64               `json:"tyreSeconds"`
	ServiceMode     manual.PitServiceMode `json:"serviceMode"`
	// Por cantidad: el solver calcula refuelSeconds = fuelLiters / refuelRate etc.
}

func (m PitCostModel) Validate() error {
	if m.TransitSeconds < 0 || math.IsNaN(m.TransitSeconds) || math.IsInf(m.TransitSeconds, 0) {
		return fmt.Errorf("transitSeconds invalid")
	}
	if m.RefuelRateLPerS <= 0 || math.IsNaN(m.RefuelRateLPerS) || math.IsInf(m.RefuelRateLPerS, 0) {
		return fmt.Errorf("refuelRateLPerS must be >0")
	}
	if m.VERatePPerS <= 0 || math.IsNaN(m.VERatePPerS) || math.IsInf(m.VERatePPerS, 0) {
		return fmt.Errorf("veRatePPerS must be >0")
	}
	if m.TyreSeconds < 0 || math.IsNaN(m.TyreSeconds) || math.IsInf(m.TyreSeconds, 0) {
		return fmt.Errorf("tyreSeconds invalid")
	}
	if m.ServiceMode != manual.PitServiceParallel && m.ServiceMode != manual.PitServiceSequential {
		return fmt.Errorf("serviceMode invalid")
	}
	return nil
}

// Formation es el coste de formación (grid/rolling start) antes de la vuelta 1.
type Formation struct {
	Seconds  float64 `json:"seconds"`
	Presence string  `json:"presence"`
}

// EventRules cubre reglas del evento y ventanas obligatorias (spec F1.3).
type EventRules struct {
	MinPitStops *int `json:"minPitStops,omitempty"`
	MaxPitStops *int `json:"maxPitStops,omitempty"`
	// Ventanas donde debe ocurrir un pit (p.ej. [lapFrom,lapTo]).
	RequiredWindows []PitWindow `json:"requiredWindows,omitempty"`
	// Compuestos obligatorios (p.ej. al menos un stint con cada).
	MandatoryCompounds []TyreCompound `json:"mandatoryCompounds,omitempty"`
	// Límites de conducción por piloto (min/max laps or time).
	DriverLimits map[string]DriverLimit `json:"driverLimits,omitempty"`
	// AllowedCompoundsByClimate restringe el compuesto durante cada vuelta de
	// una condicion. Si un stint cruza una transicion debe ser valido en ambos
	// buckets o parar antes de la primera vuelta incompatible.
	AllowedCompoundsByClimate map[sp.ClimateBucket][]TyreCompound `json:"allowedCompoundsByClimate,omitempty"`
}

type PitWindow struct {
	FromLap int64 `json:"fromLap"`
	ToLap   int64 `json:"toLap"`
}

type DriverLimit struct {
	MinLaps                  *int64              `json:"minLaps,omitempty"`
	MaxLaps                  *int64              `json:"maxLaps,omitempty"`
	MaxContinuousTimeSeconds *float64            `json:"maxContinuousTimeSeconds,omitempty"`
	MaxTotalTimeSeconds      *float64            `json:"maxTotalTimeSeconds,omitempty"`
	Unavailable              []UnavailableWindow `json:"unavailable,omitempty"`
}

type UnavailableWindow struct {
	FromLap int64 `json:"fromLap"`
	ToLap   int64 `json:"toLap"`
}

// ComputeBudget es el presupuesto p95 de cómputo como parámetro (spec F1.3).
type ComputeBudget struct {
	P95Millis     int `json:"p95Millis"`
	MaxCandidates int `json:"maxCandidates"`
	MaxIterations int `json:"maxIterations,omitempty"`
}

func (b ComputeBudget) Validate() error {
	if b.P95Millis <= 0 {
		return fmt.Errorf("p95Millis must be >0")
	}
	if b.MaxCandidates < 0 {
		return fmt.Errorf("maxCandidates must be >=0")
	}
	return nil
}

// SolverInputV2 es el I/O ampliado del solver. Consume familias de Analysis
// por referencia (no duplica tipos): Projection y ObservedStrategy.
type SolverInputV2 struct {
	ContractVersion ContractVersion               `json:"contractVersion"`
	RaceLaps        int64                         `json:"raceLaps"`
	BaseLapSeconds  float64                       `json:"baseLapSeconds"`
	Projection      *sp.StrategyInputProjectionV2 `json:"projection"`
	Observed        *sp.ObservedStrategyV1        `json:"observed,omitempty"`
	PitCost         PitCostModel                  `json:"pitCost"`
	Formation       Formation                     `json:"formation"`
	EventRules      EventRules                    `json:"eventRules"`
	Budget          ComputeBudget                 `json:"budget"`
	// Inputs manuales cuando projection está missing/unsupported
	FuelCapacityLiters float64 `json:"fuelCapacityLiters"`
	VECapacityPercent  float64 `json:"veCapacityPercent"`
	TyreLifeLaps       int64   `json:"tyreLifeLaps"`
	// Consumos manuales usados cuando la familia correspondiente de Projection
	// no esta disponible. Cero desactiva el recurso junto con capacidad cero.
	FuelPerLapLiters  float64                 `json:"fuelPerLapLiters"`
	VEPerLapPercent   float64                 `json:"vePerLapPercent"`
	DegradationPerLap float64                 `json:"degradationPerLapSeconds"`
	FuelWeight        *FuelWeightParameter    `json:"fuelWeight,omitempty"`
	SavingCost        *SavingCostParameter    `json:"savingCost,omitempty"`
	TyreInventory     *TyreInventoryInput     `json:"tyreInventory,omitempty"`
	CompoundPace      []CompoundPaceParameter `json:"compoundPace,omitempty"`
	DriverProfiles    []DriverProfileInput    `json:"driverProfiles,omitempty"`
	Weather           *WeatherPlanInput       `json:"weather,omitempty"`
	Discretization    ServiceDiscretization   `json:"serviceDiscretization"`
}

// RainChanceThresholds traduce la probabilidad interpolada del forecast a los
// buckets observados por Analysis. Los defaults son 20 % (humid) y 60 % (wet).
type RainChanceThresholds struct {
	HumidPercent float64 `json:"humidPercent"`
	WetPercent   float64 `json:"wetPercent"`
}

// WeatherPlanInput fija un escenario para una ejecucion concreta de SolveV2.
// SolveWeatherScenarios construye uno por escenario y compara sus planes.
type WeatherPlanInput struct {
	Scenario         weather.WeatherScenarioV1 `json:"scenario"`
	Thresholds       RainChanceThresholds      `json:"thresholds"`
	BucketParameters []WeatherBucketParameter  `json:"bucketParameters,omitempty"`
}

// WeatherBucketParameter es el fallback manual/reference por condicion. Los
// consumos son punteros porque cero es un valor valido; si Projection publica
// el mismo bucket, esa familia derivada es la autoridad y el fallback se omite.
// CompoundPace reemplaza, vuelta a vuelta, los parametros globales declarados
// para esos mismos compuestos.
type WeatherBucketParameter struct {
	Bucket           sp.ClimateBucket        `json:"bucket"`
	PaceDeltaSeconds float64                 `json:"paceDeltaSeconds"`
	FuelPerLapLiters *float64                `json:"fuelPerLapLiters,omitempty"`
	VEPerLapPercent  *float64                `json:"vePerLapPercent,omitempty"`
	CompoundPace     []CompoundPaceParameter `json:"compoundPace,omitempty"`
	Provenance       sp.Provenance           `json:"provenance"`
	Confidence       sp.Confidence           `json:"confidence"`
}

// SavingCostParameter transporta niveles manuales o de referencia. El nivel
// none es siempre implicito y no se declara aqui.
type SavingCostParameter struct {
	Presence   sp.Presence         `json:"presence"`
	Provenance sp.Provenance       `json:"provenance"`
	Confidence sp.Confidence       `json:"confidence"`
	Levels     []SavingLevelOption `json:"levels"`
}

type SavingLevelOption struct {
	Level           SavingLevel `json:"level"`
	FuelSavedPerLap float64     `json:"fuelSavedPerLap"`
	VESavedPerLap   float64     `json:"veSavedPerLap"`
	TimeCostPerLap  float64     `json:"timeCostPerLap"`
}

// FuelWeightParameter transporta el fallback manual o de referencia para el
// coste del combustible. Una fuente derivada solo puede llegar por la curva
// separada que publica Analysis tras su gate de identificabilidad.
type FuelWeightParameter struct {
	Presence        sp.Presence   `json:"presence"`
	SecondsPerLiter float64       `json:"secondsPerLiter"`
	Provenance      sp.Provenance `json:"provenance"`
	Confidence      sp.Confidence `json:"confidence"`
}

// ServiceDiscretization fija el espacio finito de cantidades que exploran
// tanto SolveV2 como el oraculo exhaustivo: cero y multiplos enteros del paso
// que no superen el hueco disponible. Los ceros eligen los defaults 1 L/1 %.
type ServiceDiscretization struct {
	FuelLiters float64 `json:"fuelLiters"`
	VEPercent  float64 `json:"vePercent"`
}

func (in SolverInputV2) resourcePerLap(kind ResourceKind) float64 {
	if in.Projection != nil {
		family := in.Projection.FuelConsumption
		if kind == ResourceVirtualEnergy {
			family = in.Projection.VirtualEnergyConsumption
		}
		if family.Presence == sp.PresenceValid && family.MeanPerLap > 0 {
			return family.MeanPerLap
		}
	}
	if kind == ResourceVirtualEnergy {
		return in.VEPerLapPercent
	}
	return in.FuelPerLapLiters
}

type ContractVersion string

func (in SolverInputV2) Validate() error {
	if in.ContractVersion != SolverContractVersionV2 {
		return fmt.Errorf("unsupported contractVersion %q", in.ContractVersion)
	}
	if in.RaceLaps <= 0 || in.RaceLaps > 100000 {
		return fmt.Errorf("raceLaps out of range")
	}
	if in.BaseLapSeconds <= 0 || math.IsNaN(in.BaseLapSeconds) || math.IsInf(in.BaseLapSeconds, 0) {
		return fmt.Errorf("baseLapSeconds invalid")
	}
	if in.Formation.Seconds < 0 || math.IsNaN(in.Formation.Seconds) || math.IsInf(in.Formation.Seconds, 0) {
		return fmt.Errorf("formation.seconds invalid")
	}
	if err := in.PitCost.Validate(); err != nil {
		return fmt.Errorf("pitCost: %w", err)
	}
	if err := in.Budget.Validate(); err != nil {
		return err
	}
	if in.FuelCapacityLiters < 0 || math.IsNaN(in.FuelCapacityLiters) || math.IsInf(in.FuelCapacityLiters, 0) {
		return fmt.Errorf("fuelCapacityLiters invalid")
	}
	if in.VECapacityPercent < 0 || in.VECapacityPercent > 100 || math.IsNaN(in.VECapacityPercent) || math.IsInf(in.VECapacityPercent, 0) {
		return fmt.Errorf("veCapacityPercent invalid")
	}
	if in.TyreLifeLaps < 0 || in.TyreLifeLaps > maxSupportedLaps {
		return fmt.Errorf("tyreLifeLaps out of range")
	}
	if in.EventRules.MinPitStops != nil && *in.EventRules.MinPitStops < 0 {
		return fmt.Errorf("eventRules.minPitStops invalid")
	}
	if in.EventRules.MaxPitStops != nil && *in.EventRules.MaxPitStops < 0 {
		return fmt.Errorf("eventRules.maxPitStops invalid")
	}
	if in.EventRules.MinPitStops != nil && in.EventRules.MaxPitStops != nil && *in.EventRules.MinPitStops > *in.EventRules.MaxPitStops {
		return fmt.Errorf("eventRules pit stop range invalid")
	}
	for field, value := range map[string]float64{
		"fuelPerLapLiters":           in.FuelPerLapLiters,
		"vePerLapPercent":            in.VEPerLapPercent,
		"degradationPerLapSeconds":   in.DegradationPerLap,
		"serviceDiscretization.fuel": in.Discretization.FuelLiters,
		"serviceDiscretization.ve":   in.Discretization.VEPercent,
	} {
		if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			return fmt.Errorf("%s invalid", field)
		}
	}
	if in.FuelWeight != nil {
		if err := in.FuelWeight.Validate(); err != nil {
			return fmt.Errorf("fuelWeight: %w", err)
		}
	}
	if in.SavingCost != nil {
		if err := in.SavingCost.Validate(); err != nil {
			return fmt.Errorf("savingCost: %w", err)
		}
	}
	compoundPace, err := in.compoundPaceCosts()
	if err != nil {
		return fmt.Errorf("compoundPace: %w", err)
	}
	if err := in.validateF45(compoundPace); err != nil {
		return err
	}
	if len(in.EventRules.AllowedCompoundsByClimate) > 0 && in.Weather == nil {
		return fmt.Errorf("eventRules.allowedCompoundsByClimate requires weather")
	}
	// Projection puede ser nil (arranque en frío): se usa reference del catálogo o manual.
	if in.Projection != nil {
		if err := in.Projection.Validate(); err != nil {
			return fmt.Errorf("projection: %w", err)
		}
	}
	return nil
}

func (parameter SavingCostParameter) Validate() error {
	if parameter.Presence != sp.PresenceValid {
		return fmt.Errorf("presence must be valid")
	}
	if parameter.Provenance.Kind != sp.ProvenanceManual && parameter.Provenance.Kind != sp.ProvenanceReference {
		return fmt.Errorf("provenance.kind must be manual or reference")
	}
	if err := parameter.Provenance.Validate(); err != nil {
		return err
	}
	if err := parameter.Confidence.Validate(); err != nil {
		return err
	}
	return validateSavingLevelOptions(parameter.Levels)
}

func (parameter FuelWeightParameter) Validate() error {
	if parameter.Presence != sp.PresenceValid {
		return fmt.Errorf("presence must be valid")
	}
	if parameter.SecondsPerLiter < 0 || math.IsNaN(parameter.SecondsPerLiter) || math.IsInf(parameter.SecondsPerLiter, 0) {
		return fmt.Errorf("secondsPerLiter invalid")
	}
	if parameter.Provenance.Kind != sp.ProvenanceManual && parameter.Provenance.Kind != sp.ProvenanceReference {
		return fmt.Errorf("provenance.kind must be manual or reference")
	}
	if err := parameter.Provenance.Validate(); err != nil {
		return err
	}
	if err := parameter.Confidence.Validate(); err != nil {
		return err
	}
	return nil
}

// SolverResultV2 es el resultado con binding, sensibilidades y esperado/caso-malo.
type SolverResultV2 struct {
	ContractVersion   ContractVersion           `json:"contractVersion"`
	InputHash         string                    `json:"inputHash"`
	StintPaceCost     StintPaceCostSource       `json:"stintPaceCost"`
	FuelWeightCost    FuelWeightCostSource      `json:"fuelWeightCost"`
	SavingCost        SavingCostSource          `json:"savingCost"`
	CompoundPaceCost  []CompoundPaceCostSource  `json:"compoundPaceCost,omitempty"`
	DriverProfileCost []DriverProfileSource     `json:"driverProfileCost,omitempty"`
	WeatherBucketCost []WeatherBucketCostSource `json:"weatherBucketCost,omitempty"`
	WeatherTimeline   []WeatherLapCondition     `json:"weatherTimeline,omitempty"`
	SavingPlan        SavingPlan                `json:"savingPlan"`
	Best              DecisionVector            `json:"best"`
	Binding           BindingConstraint         `json:"binding"`
	Sensitivities     []SolverSensitivity       `json:"sensitivities"`
	Expected          ScenarioEvaluation        `json:"expected"`
	WorstCase         ScenarioEvaluation        `json:"worstCase"`
	Candidates        []DecisionVector          `json:"candidates,omitempty"`
	CandidateDetails  []SolverCandidateV2       `json:"candidateDetails,omitempty"`
	Feasible          bool                      `json:"feasible"`
	Reasons           []SolverReason            `json:"reasons,omitempty"`
	Assumptions       []SolverReason            `json:"assumptions"`
	ComputeStats      ComputeStats              `json:"computeStats"`
}

type SavingCostSource struct {
	Presence   sp.Presence         `json:"presence"`
	Provenance sp.Provenance       `json:"provenance"`
	Confidence sp.Confidence       `json:"confidence"`
	Levels     []SavingLevelOption `json:"levels"`
}

type SavingPlan struct {
	Stints           []SavingPlanStint `json:"stints"`
	TotalFuelSaved   float64           `json:"totalFuelSaved"`
	TotalVESaved     float64           `json:"totalVESaved"`
	TotalCostSeconds float64           `json:"totalCostSeconds"`
}

type SavingPlanStint struct {
	StintIndex       int         `json:"stintIndex"`
	Laps             int64       `json:"laps"`
	Level            SavingLevel `json:"level"`
	FuelSavedPerLap  float64     `json:"fuelSavedPerLap"`
	VESavedPerLap    float64     `json:"veSavedPerLap"`
	TimeCostPerLap   float64     `json:"timeCostPerLap"`
	TotalFuelSaved   float64     `json:"totalFuelSaved"`
	TotalVESaved     float64     `json:"totalVESaved"`
	TotalCostSeconds float64     `json:"totalCostSeconds"`
}

type FuelWeightCostSource struct {
	Presence        sp.Presence   `json:"presence"`
	SecondsPerLiter float64       `json:"secondsPerLiter"`
	Provenance      sp.Provenance `json:"provenance"`
	Confidence      sp.Confidence `json:"confidence"`
}

// SolverCandidateV2 conserva tanto planes completos como intentos inviables;
// estos ultimos nunca desaparecen sin un motivo observable.
type SolverCandidateV2 struct {
	Decision   DecisionVector     `json:"decision"`
	Evaluation ScenarioEvaluation `json:"evaluation"`
	Feasible   bool               `json:"feasible"`
	Reasons    []SolverReason     `json:"reasons,omitempty"`
}

type BindingConstraint struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
	Laps    int64  `json:"laps,omitempty"`
}

type SolverSensitivity struct {
	Parameter     string  `json:"parameter"`
	Delta         float64 `json:"delta"`
	ImpactSeconds float64 `json:"impactSeconds"`
}

type ScenarioEvaluation struct {
	TotalSeconds       float64 `json:"totalSeconds"`
	GreenSeconds       float64 `json:"greenSeconds"`
	DegradationSeconds float64 `json:"degradationSeconds"`
	CompoundSeconds    float64 `json:"compoundSeconds"`
	FuelWeightSeconds  float64 `json:"fuelWeightSeconds"`
	SavingSeconds      float64 `json:"savingSeconds"`
	WeatherSeconds     float64 `json:"weatherSeconds"`
	PitSeconds         float64 `json:"pitSeconds"`
	FormationSeconds   float64 `json:"formationSeconds"`
}

type WeatherLapCondition struct {
	Lap        int64            `json:"lap"`
	RainChance float64          `json:"rainChance"`
	Bucket     sp.ClimateBucket `json:"bucket"`
}

type WeatherBucketCostSource struct {
	Bucket           sp.ClimateBucket         `json:"bucket"`
	PaceDeltaSeconds float64                  `json:"paceDeltaSeconds"`
	FuelPerLapLiters *float64                 `json:"fuelPerLapLiters,omitempty"`
	VEPerLapPercent  *float64                 `json:"vePerLapPercent,omitempty"`
	CompoundPace     []CompoundPaceCostSource `json:"compoundPace,omitempty"`
	Provenance       sp.Provenance            `json:"provenance"`
	Confidence       sp.Confidence            `json:"confidence"`
}

type ComputeStats struct {
	EvaluatedCandidates int           `json:"evaluatedCandidates"`
	PrunedStates        int           `json:"prunedStates"`
	Duration            time.Duration `json:"duration"`
	WithinBudget        bool          `json:"withinBudget"`
}

// SolverReason explica inviabilidad o asunción.
type SolverReason struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
