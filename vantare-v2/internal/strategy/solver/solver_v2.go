package solver

import (
	"fmt"
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
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
}

type StintDecision struct {
	Index       int          `json:"index"`
	Laps        int64        `json:"laps"`
	Compound    TyreCompound `json:"compound"`
	Driver      string       `json:"driver"`
	SavingLevel SavingLevel  `json:"savingLevel"`
}

type TyreCompound string
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
}

type PitWindow struct {
	FromLap int64 `json:"fromLap"`
	ToLap   int64 `json:"toLap"`
}

type DriverLimit struct {
	MinLaps        *int64              `json:"minLaps,omitempty"`
	MaxLaps        *int64              `json:"maxLaps,omitempty"`
	MaxTimeSeconds *float64            `json:"maxTimeSeconds,omitempty"`
	Unavailable    []UnavailableWindow `json:"unavailable,omitempty"`
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
	// Projection puede ser nil (arranque en frío): se usa reference del catálogo o manual.
	if in.Projection != nil {
		if err := in.Projection.Validate(); err != nil {
			return fmt.Errorf("projection: %w", err)
		}
	}
	return nil
}

// SolverResultV2 es el resultado con binding, sensibilidades y esperado/caso-malo.
type SolverResultV2 struct {
	ContractVersion ContractVersion     `json:"contractVersion"`
	InputHash       string              `json:"inputHash"`
	Best            DecisionVector      `json:"best"`
	Binding         BindingConstraint   `json:"binding"`
	Sensitivities   []SolverSensitivity `json:"sensitivities"`
	Expected        ScenarioEvaluation  `json:"expected"`
	WorstCase       ScenarioEvaluation  `json:"worstCase"`
	Candidates      []DecisionVector    `json:"candidates,omitempty"`
	Feasible        bool                `json:"feasible"`
	Reasons         []SolverReason      `json:"reasons,omitempty"`
	ComputeStats    ComputeStats        `json:"computeStats"`
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
	PitSeconds         float64 `json:"pitSeconds"`
	FormationSeconds   float64 `json:"formationSeconds"`
}

type ComputeStats struct {
	EvaluatedCandidates int           `json:"evaluatedCandidates"`
	Duration            time.Duration `json:"duration"`
	WithinBudget        bool          `json:"withinBudget"`
}

// SolverReason explica inviabilidad o asunción.
type SolverReason struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
