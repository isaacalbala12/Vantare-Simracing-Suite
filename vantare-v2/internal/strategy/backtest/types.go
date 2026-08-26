// Package backtest validates solver calibration and ranking against reserved
// race observations. It never treats an unobserved counterfactual as ground
// truth: observed-strategy replay is a calibration check only.
package backtest

import (
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const ContractVersionV1 = "strategy.backtest.v1"

type Thresholds struct {
	TotalErrorRatio           float64 `json:"totalErrorRatio"`
	RequireExactDryPitStops   bool    `json:"requireExactDryPitStops"`
	RankingSignAgreementRatio float64 `json:"rankingSignAgreementRatio"`
	RegretToleranceSeconds    float64 `json:"regretToleranceSeconds"`
	SignToleranceSeconds      float64 `json:"signToleranceSeconds"`
	CalibrationProvisional    bool    `json:"calibrationProvisional"`
}

// ProvisionalThresholds carries the two initial values from ISA-694 spec #5.
// The ranking agreement remains an explicit caller decision until #702 fixes
// the complete preregistered protocol.
func ProvisionalThresholds(rankingSignAgreementRatio float64) Thresholds {
	return Thresholds{
		TotalErrorRatio:           0.02,
		RequireExactDryPitStops:   true,
		RankingSignAgreementRatio: rankingSignAgreementRatio,
		RegretToleranceSeconds:    1e-9,
		SignToleranceSeconds:      1e-9,
		CalibrationProvisional:    true,
	}
}

type HoldoutConfig struct {
	CutoffByCombination map[string]time.Time `json:"cutoffByCombination"`
	MinimumRaces        int                  `json:"minimumRaces"`
	MinimumRankingRaces int                  `json:"minimumRankingRaces"`
	IntervalZScore      float64              `json:"intervalZScore"`
}

type Config struct {
	Thresholds Thresholds    `json:"thresholds"`
	Holdout    HoldoutConfig `json:"holdout"`
}

type RaceCase struct {
	RaceID              string                      `json:"raceId"`
	CombinationID       string                      `json:"combinationId"`
	OccurredAt          time.Time                   `json:"occurredAt"`
	TrainingDataThrough time.Time                   `json:"trainingDataThrough"`
	Dry                 bool                        `json:"dry"`
	PredictionInput     solver.SolverInputV2        `json:"predictionInput"`
	RealizedInput       solver.SolverInputV2        `json:"realizedInput"`
	Observed            sp.ObservedStrategyV1       `json:"observed"`
	CompoundMapping     map[int]solver.TyreCompound `json:"compoundMapping,omitempty"`
}

type StintError struct {
	StintNumber        int     `json:"stintNumber"`
	PredictedSeconds   float64 `json:"predictedSeconds"`
	ObservedSeconds    float64 `json:"observedSeconds"`
	AbsoluteError      float64 `json:"absoluteErrorSeconds"`
	AbsoluteErrorRatio float64 `json:"absoluteErrorRatio"`
}

type CalibrationResult struct {
	PredictedTotalSeconds float64      `json:"predictedTotalSeconds"`
	ObservedTotalSeconds  float64      `json:"observedTotalSeconds"`
	AbsoluteErrorSeconds  float64      `json:"absoluteErrorSeconds"`
	AbsoluteErrorRatio    float64      `json:"absoluteErrorRatio"`
	Stints                []StintError `json:"stints"`
	ObservedPitLaps       []int64      `json:"observedPitLaps"`
	RecommendedPitLaps    []int64      `json:"recommendedPitLaps"`
	DryPitStopsExact      bool         `json:"dryPitStopsExact"`
	Passed                bool         `json:"passed"`
}

type FeasibilityResult struct {
	Passed  bool                  `json:"passed"`
	Replay  solver.ReplayResultV1 `json:"replay"`
	Reasons []solver.SolverReason `json:"reasons,omitempty"`
}

type RankingResult struct {
	Applicable            bool    `json:"applicable"`
	Evaluable             bool    `json:"evaluable"`
	PredictedDeltaSeconds float64 `json:"predictedDeltaSeconds"`
	RealizedDeltaSeconds  float64 `json:"realizedDeltaSeconds"`
	SignCoherent          bool    `json:"signCoherent"`
	InternalRegretSeconds float64 `json:"internalRegretSeconds"`
	Passed                bool    `json:"passed"`
	Reason                string  `json:"reason,omitempty"`
}

type RaceResult struct {
	ContractVersion string                `json:"contractVersion"`
	RaceID          string                `json:"raceId"`
	CombinationID   string                `json:"combinationId"`
	OccurredAt      time.Time             `json:"occurredAt"`
	Calibration     CalibrationResult     `json:"calibration"`
	Feasibility     FeasibilityResult     `json:"feasibility"`
	Ranking         RankingResult         `json:"ranking"`
	Recommended     solver.SolverResultV2 `json:"recommended"`
}

type Interval struct {
	Count int     `json:"count"`
	Mean  float64 `json:"mean"`
	Lower float64 `json:"lower"`
	Upper float64 `json:"upper"`
}

type AggregateResult struct {
	RaceCount                    int        `json:"raceCount"`
	RankingRaceCount             int        `json:"rankingRaceCount"`
	TotalErrorRatio              Interval   `json:"totalErrorRatio"`
	StintErrorRatio              Interval   `json:"stintErrorRatio"`
	RankingSignAgreementRatio    float64    `json:"rankingSignAgreementRatio"`
	MaximumInternalRegretSeconds float64    `json:"maximumInternalRegretSeconds"`
	CalibrationPassed            bool       `json:"calibrationPassed"`
	FeasibilityPassed            bool       `json:"feasibilityPassed"`
	RankingPassed                bool       `json:"rankingPassed"`
	Passed                       bool       `json:"passed"`
	Thresholds                   Thresholds `json:"thresholds"`
}

type HoldoutResult struct {
	ContractVersion string          `json:"contractVersion"`
	Races           []RaceResult    `json:"races"`
	Aggregate       AggregateResult `json:"aggregate"`
}
