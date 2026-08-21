package strategyprojection

import "time"

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
	Result          *ObservedResult   `json:"result,omitempty"`
}

type ObservedStint struct {
	StintNumber  int        `json:"stintNumber"`
	StartLap     int        `json:"startLap"`
	EndLap       int        `json:"endLap"`
	CompoundRaw  *int       `json:"compoundRaw,omitempty"`
	CompoundNote string     `json:"compoundNote"`
	Presence     Presence   `json:"presence"`
	Provenance   Provenance `json:"provenance"`
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
	TotalTimeSeconds float64 `json:"totalTimeSeconds"`
	Position         *int    `json:"position,omitempty"`
	Completed        bool    `json:"completed"`
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
		if err := s.Provenance.Validate(); err != nil {
			return err
		}
	}
	return nil
}
