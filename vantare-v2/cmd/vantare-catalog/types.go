package main

import (
	"encoding/json"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
	"github.com/vantare/overlays/v2/internal/strategy/curation"
)

const (
	curatorSummaryVersion = "vantare.curator.summary.v2"
	selectionVersion      = "vantare.catalog.selection.v1"
	payloadVersion        = "strategy.catalog.payload.v1"
	productionEnvironment = "production-community"
	minimumProductionK    = 3
)

type curatorSummary struct {
	ContractVersion string               `json:"contractVersion"`
	MinimumCohort   int                  `json:"minimumCohort"`
	Engine          engineSummary        `json:"engine"`
	Input           json.RawMessage      `json:"input"`
	Environments    []environmentSummary `json:"environments"`
	Rejections      json.RawMessage      `json:"rejections"`
}

type engineSummary struct {
	Version    string `json:"version"`
	SourceHash string `json:"sourceHash"`
}

type environmentSummary struct {
	Environment  string               `json:"environment"`
	Accepted     int                  `json:"accepted"`
	Duplicates   int                  `json:"duplicates"`
	Combinations []combinationSummary `json:"combinations"`
}

type combinationSummary struct {
	CombinationID   string                   `json:"combinationId"`
	SemanticBundles int                      `json:"semanticBundles"`
	Contributors    int                      `json:"contributors"`
	Publishable     bool                     `json:"publishable"`
	Reason          string                   `json:"reason,omitempty"`
	Reference       referenceProfileSummary  `json:"referenceProfile"`
	Strategies      []strategyClusterSummary `json:"strategies"`
}

type referenceProfileSummary struct {
	TargetContractVersion string          `json:"targetContractVersion"`
	Publishable           bool            `json:"publishable"`
	Reason                string          `json:"reason,omitempty"`
	Fuel                  *metricSummary  `json:"fuel,omitempty"`
	VirtualEnergy         *metricSummary  `json:"virtualEnergy,omitempty"`
	Pace                  *presenceReason `json:"pace,omitempty"`
	StintPaceCurve        *presenceReason `json:"stintPaceCurve,omitempty"`
	Pit                   *pitSummary     `json:"pit,omitempty"`
	Quality               *qualitySummary `json:"quality,omitempty"`
}

type metricSummary struct {
	MedianPerLap float64 `json:"medianPerLap"`
	RangeLower   float64 `json:"rangeLower"`
	RangeUpper   float64 `json:"rangeUpper"`
	SampleLaps   int     `json:"sampleLaps"`
}

type presenceReason struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason"`
}

type pitSummary struct {
	Count                  int     `json:"count"`
	TypicalDurationSeconds float64 `json:"typicalDurationSeconds"`
}

type qualitySummary struct {
	ValidSessions   int     `json:"validSessions"`
	InvalidSessions int     `json:"invalidSessions"`
	SampleSessions  int     `json:"sampleSessions"`
	ValidRatio      float64 `json:"validRatio"`
}

type strategyClusterSummary struct {
	Rank            int                          `json:"rank"`
	ClusterDigest   string                       `json:"clusterDigest"`
	Representative  curation.ObservedStrategyRef `json:"representative"`
	SemanticBundles int                          `json:"semanticBundles"`
	Contributors    int                          `json:"contributors"`
	Publishable     bool                         `json:"publishable"`
	Reason          string                       `json:"reason,omitempty"`
	Score           scoreSummary                 `json:"score"`
}

type scoreSummary struct {
	Available              bool    `json:"available"`
	NormalizedTotalSeconds float64 `json:"normalizedTotalSeconds"`
	Feasible               bool    `json:"feasible"`
	RankingPassed          bool    `json:"rankingPassed"`
	Reason                 string  `json:"reason,omitempty"`
	Basis                  string  `json:"basis"`
}

type approvedSelection struct {
	ContractVersion string          `json:"contractVersion"`
	Items           []selectionItem `json:"items"`
}

type selectionItem struct {
	Environment        string   `json:"environment"`
	CombinationID      string   `json:"combinationId"`
	IncludeReference   bool     `json:"includeReferenceProfile"`
	StrategyClusterIDs []string `json:"strategyClusterDigests"`
}

type unsignedCatalog struct {
	Envelope catalog.Envelope `json:"envelope"`
	Payload  catalogPayload   `json:"payload"`
}

type catalogPayload struct {
	ContractVersion string               `json:"contractVersion"`
	Source          catalogSource        `json:"source"`
	Combinations    []catalogCombination `json:"combinations"`
}

type catalogSource struct {
	SummaryContractVersion string `json:"summaryContractVersion"`
	SummaryDigest          string `json:"summaryDigest"`
	EngineVersion          string `json:"engineVersion"`
	EngineSourceHash       string `json:"engineSourceHash"`
	MinimumCohort          int    `json:"minimumCohort"`
}

type catalogCombination struct {
	CombinationID string                   `json:"combinationId"`
	Reference     *catalogReferenceProfile `json:"referenceProfile,omitempty"`
	Strategies    []catalogStrategy        `json:"strategies"`
}

type referenceProvenance struct {
	Kind        string `json:"kind"`
	Environment string `json:"environment"`
}

type catalogSample struct {
	SemanticBundles int `json:"semanticBundles"`
	Contributors    int `json:"contributors"`
	Sessions        int `json:"sessions"`
}

type catalogReferenceProfile struct {
	TargetContractVersion string              `json:"targetContractVersion"`
	Provenance            referenceProvenance `json:"provenance"`
	Sample                catalogSample       `json:"sample"`
	Quality               qualitySummary      `json:"quality"`
	Fuel                  *metricSummary      `json:"fuel,omitempty"`
	VirtualEnergy         *metricSummary      `json:"virtualEnergy,omitempty"`
	Pace                  *presenceReason     `json:"pace,omitempty"`
	StintPaceCurve        *presenceReason     `json:"stintPaceCurve,omitempty"`
	Pit                   *pitSummary         `json:"pit,omitempty"`
}

type catalogStrategy struct {
	Rank           int                          `json:"rank"`
	ClusterDigest  string                       `json:"clusterDigest"`
	Representative curation.ObservedStrategyRef `json:"representative"`
	Provenance     referenceProvenance          `json:"provenance"`
	Sample         catalogSample                `json:"sample"`
	Quality        qualitySummary               `json:"quality"`
	Score          scoreSummary                 `json:"score"`
}
