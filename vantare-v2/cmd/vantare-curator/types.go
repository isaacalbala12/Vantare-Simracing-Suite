package main

import "github.com/vantare/overlays/v2/internal/strategy/curation"

const (
	summaryContractVersion = "vantare.curator.summary.v2"
	minimumCohort          = 3
)

type summary struct {
	ContractVersion string               `json:"contractVersion"`
	MinimumCohort   int                  `json:"minimumCohort"`
	Engine          engineSummary        `json:"engine"`
	Input           inputSummary         `json:"input"`
	Environments    []environmentSummary `json:"environments"`
	Rejections      []rejectionSummary   `json:"rejections"`
}

type engineSummary struct {
	Version    string `json:"version"`
	SourceHash string `json:"sourceHash"`
}

type inputSummary struct {
	Files      int `json:"files"`
	Accepted   int `json:"accepted"`
	Rejected   int `json:"rejected"`
	Duplicates int `json:"duplicates"`
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

type rejectionSummary struct {
	SourceRef   string `json:"sourceRef"`
	Environment string `json:"environment"`
	Code        string `json:"code"`
	Reason      string `json:"reason"`
}
