// Package strategy contains the deterministic, simulator-agnostic Strategy
// Planner domain. It deliberately has no Wails, persistence, or UI concerns.
package producta

// RaceKind selects the rule used to determine the race length.
type RaceKind string

const (
	RaceByLaps RaceKind = "laps"
	RaceByTime RaceKind = "time"
)

// Confidence describes the user's confidence in manually supplied inputs.
type Confidence string

const (
	ConfidenceLow    Confidence = "low"
	ConfidenceMedium Confidence = "medium"
	ConfidenceHigh   Confidence = "high"
)

// Draft is the complete user-editable strategy input document.
type Draft struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Simulator     string        `json:"simulator"`
	Vehicle       string        `json:"vehicle"`
	Track         string        `json:"track"`
	Race          RaceInput     `json:"race"`
	Fuel          ResourceInput `json:"fuel"`
	VirtualEnergy ResourceInput `json:"virtualEnergy"`
	Pit           PitInput      `json:"pit"`
	Tyres         TyreInput     `json:"tyres"`
	Objective     Objective     `json:"objective"`
	Confidence    Confidence    `json:"confidence"`
}

// RaceInput describes the manual race-length and pace assumptions.
type RaceInput struct {
	Kind            RaceKind `json:"kind"`
	Laps            int      `json:"laps"`
	DurationSeconds float64  `json:"durationSeconds"`
	ExtraLap        bool     `json:"extraLap"`
	FormationLaps   float64  `json:"formationLaps"`
	LapTimeSeconds  float64  `json:"lapTimeSeconds"`
}

// ResourceInput describes one consumable resource, such as fuel or VE.
type ResourceInput struct {
	Enabled           bool        `json:"enabled"`
	Capacity          float64     `json:"capacity"`
	UsableCapacity    float64     `json:"usableCapacity"`
	StartAmount       float64     `json:"startAmount"`
	ConsumptionPerLap float64     `json:"consumptionPerLap"`
	FormationAmount   float64     `json:"formationAmount"`
	FormationLaps     float64     `json:"formationLaps"`
	Margin            MarginInput `json:"margin"`
}

// MarginInput stores a resource reserve in an explicit unit.
type MarginInput struct {
	Kind  string  `json:"kind"`
	Value float64 `json:"value"`
}

// PitInput is the draft-facing alias for the pit-service contract.
type PitInput = PitStop

// TyreInput is the draft-facing alias for the per-wheel tyre contract.
type TyreInput = TyrePlan

// Objective is reserved for the solver objective contract introduced in phase 4.
type Objective struct{}
