package strategyprojection

import (
	"math"
	"time"
)

// ObservedStrategyV1 es la estrategia observada de cada carrera (D16).
// Familia de derivacion de primera clase del corpus de carreras reales.
type ObservedStrategyV1 struct {
	ContractVersion ContractVersion   `json:"contractVersion"`
	SessionID       string            `json:"sessionId"`
	GeneratedAt     time.Time         `json:"generatedAt"`
	Presence        Presence          `json:"presence"`
	Provenance      Provenance        `json:"provenance"`
	Confidence      Confidence        `json:"confidence"`
	Stints          []ObservedStint   `json:"stints"`
	PitStops        []ObservedPitStop `json:"pitStops"`
	Changes         []ObservedChange  `json:"changes"`
	Result          *ObservedResult   `json:"result,omitempty"`
}

type ObservedStint struct {
	StintNumber      int        `json:"stintNumber"`
	StartLap         int        `json:"startLap"`
	EndLap           int        `json:"endLap"`
	TotalTimeSeconds *float64   `json:"totalTimeSeconds,omitempty"`
	CompoundRaw      *int       `json:"compoundRaw,omitempty"`
	CompoundNote     string     `json:"compoundNote"`
	Presence         Presence   `json:"presence"`
	Provenance       Provenance `json:"provenance"`
}

type ObservedPitStop struct {
	LapNumber       int        `json:"lapNumber"`
	PitLaneSeconds  float64    `json:"pitLaneSeconds"`
	FuelAddedLiters *float64   `json:"fuelAddedLiters,omitempty"`
	VEAddedPercent  *float64   `json:"veAddedPercent,omitempty"`
	Presence        Presence   `json:"presence"`
	Provenance      Provenance `json:"provenance"`
}

type ObservedResult struct {
	CompletedLaps    int     `json:"completedLaps"`
	TotalTimeSeconds float64 `json:"totalTimeSeconds"`
	Position         *int    `json:"position,omitempty"`
	Completed        bool    `json:"completed"`
}

type ObservedChangeKind string

const (
	ObservedChangeFuelRise   ObservedChangeKind = "fuel_rise"
	ObservedChangeWearRise   ObservedChangeKind = "wear_rise"
	ObservedChangeTyreChange ObservedChangeKind = "tyre_change"
)

type ObservedChange struct {
	LapNumber  int                `json:"lapNumber"`
	Kind       ObservedChangeKind `json:"kind"`
	Delta      *float64           `json:"delta,omitempty"`
	Presence   Presence           `json:"presence"`
	Provenance Provenance         `json:"provenance"`
}

func (o ObservedStrategyV1) Validate() error {
	if o.ContractVersion != ContractVersionObservedStrategyV1 {
		return contractError("unsupported_contract_version", "contractVersion", "unsupported observed strategy version")
	}
	if err := validateIdentifier("sessionId", o.SessionID); err != nil {
		return err
	}
	if err := validateTimestamp("generatedAt", o.GeneratedAt); err != nil {
		return err
	}
	if !o.Presence.Valid() {
		return contractError("invalid_document", "presence", "unknown presence")
	}
	if err := o.Provenance.Validate(); err != nil {
		return err
	}
	if err := o.Confidence.Validate(); err != nil {
		return err
	}
	for _, s := range o.Stints {
		if s.EndLap < s.StartLap {
			return contractError("invalid_document", "stints", "endLap must be >= startLap")
		}
		if s.TotalTimeSeconds != nil && (*s.TotalTimeSeconds <= 0 || math.IsNaN(*s.TotalTimeSeconds) || math.IsInf(*s.TotalTimeSeconds, 0)) {
			return contractError("invalid_document", "stints.totalTimeSeconds", "must be positive and finite")
		}
		if !s.Presence.Valid() {
			return contractError("invalid_document", "stints.presence", "unknown presence")
		}
		if err := s.Provenance.Validate(); err != nil {
			return err
		}
	}
	for _, stop := range o.PitStops {
		if stop.LapNumber <= 0 || stop.PitLaneSeconds <= 0 {
			return contractError("invalid_document", "pitStops", "lap and pit lane duration must be positive")
		}
		if !stop.Presence.Valid() {
			return contractError("invalid_document", "pitStops.presence", "unknown presence")
		}
		if err := stop.Provenance.Validate(); err != nil {
			return err
		}
	}
	for _, change := range o.Changes {
		if change.LapNumber <= 0 {
			return contractError("invalid_document", "changes.lapNumber", "must be positive")
		}
		if !change.Presence.Valid() {
			return contractError("invalid_document", "changes.presence", "unknown presence")
		}
		if err := change.Provenance.Validate(); err != nil {
			return err
		}
	}
	if o.Result != nil {
		invalidTime := o.Result.TotalTimeSeconds < 0 ||
			math.IsNaN(o.Result.TotalTimeSeconds) ||
			math.IsInf(o.Result.TotalTimeSeconds, 0)
		if o.Result.CompletedLaps < 0 || invalidTime {
			return contractError("invalid_document", "result", "completed laps and total time must be non-negative")
		}
	}
	return nil
}
