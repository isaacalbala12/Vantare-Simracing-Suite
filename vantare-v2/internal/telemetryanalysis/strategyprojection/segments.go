package strategyprojection

import "time"

// ContinuousSegment representa un tramo continuo de telemetria sin comprimir
// huecos en silencio. Si hay un hueco de cobertura o no-participacion del
// piloto, se representa como Gap, no saltando el tiempo.
//
// Recomendacion minima del informe F0-1 §5 / §12 implementada tal cual.
type ContinuousSegment struct {
	SegmentID      string     `json:"segmentId"`
	SourceStart    *time.Time `json:"sourceStart,omitempty"`
	SessionStartTs time.Time  `json:"sessionStartTs"`
	SessionEndTs   time.Time  `json:"sessionEndTs"`
	DriverID       *string    `json:"driverId,omitempty"`
	Reason         string     `json:"reason"`
	Presence       Presence   `json:"presence"`
	Provenance     Provenance `json:"provenance"`
	Confidence     Confidence `json:"confidence"`
}

// CoverageGap representa un hueco temporal que nunca se comprime.
// Es el complemento de ContinuousSegment en la linea de tiempo.
type CoverageGap struct {
	GapID      string     `json:"gapId"`
	StartTs    time.Time  `json:"startTs"`
	EndTs      time.Time  `json:"endTs"`
	Reason     string     `json:"reason"`
	Presence   Presence   `json:"presence"`
	Provenance Provenance `json:"provenance"`
}

// TrackLocation es distancia normalizada 0..1 por vuelta. No se inventa mapping
// de esquina sin versionado; si no hay mapping, el consumidor ve missing.
type TrackLocation struct {
	NormalizedDistance float64  `json:"normalizedDistance"`
	Presence           Presence `json:"presence"`
}

// LapBoundarySource indica que fuente produjo el limite de vuelta.
type LapBoundarySource string

const (
	LapBoundarySourceLapDistReset LapBoundarySource = "lap_dist_reset"
	LapBoundarySourceLapEvent     LapBoundarySource = "lap_event"
	LapBoundarySourceReconciled   LapBoundarySource = "reconciled"
	LapBoundarySourceUnknown      LapBoundarySource = "unknown"
)

func (s LapBoundarySource) Valid() bool {
	switch s {
	case LapBoundarySourceLapDistReset, LapBoundarySourceLapEvent, LapBoundarySourceReconciled, LapBoundarySourceUnknown:
		return true
	default:
		return false
	}
}

// LapBoundary es un limite de vuelta reconciliado con fuente y calidad.
type LapBoundary struct {
	LapNumber  int               `json:"lapNumber"`
	Timestamp  time.Time         `json:"timestamp"`
	Source     LapBoundarySource `json:"source"`
	Quality    Presence          `json:"quality"`
	Provenance Provenance        `json:"provenance"`
	Confidence Confidence        `json:"confidence"`
	Location   TrackLocation     `json:"location"`
}

// StintBoundaryCause enumera causas posibles de cambio de stint.
type StintBoundaryCause string

const (
	StintCausePit          StintBoundaryCause = "pit"
	StintCauseFuelJump     StintBoundaryCause = "fuel_jump"
	StintCauseTyreChange   StintBoundaryCause = "tyre_change"
	StintCauseDriverChange StintBoundaryCause = "driver_change"
	StintCauseUnknown      StintBoundaryCause = "unknown"
)

func (c StintBoundaryCause) Valid() bool {
	switch c {
	case StintCausePit, StintCauseFuelJump, StintCauseTyreChange, StintCauseDriverChange, StintCauseUnknown:
		return true
	default:
		return false
	}
}

// StintBoundary separa stints con causa y confianza. La confianza captura
// el N y la varianza del salto observado (p. ej. Fuel).
type StintBoundary struct {
	StintNumber int                `json:"stintNumber"`
	Timestamp   time.Time          `json:"timestamp"`
	Cause       StintBoundaryCause `json:"cause"`
	Presence    Presence           `json:"presence"`
	Provenance  Provenance         `json:"provenance"`
	Confidence  Confidence         `json:"confidence"`
}

// TemporalSegmentsV1 es el contrato de segmentos temporales. Sin comprimir huecos.
type TemporalSegmentsV1 struct {
	ContractVersion ContractVersion     `json:"contractVersion"`
	Segments        []ContinuousSegment `json:"segments"`
	Gaps            []CoverageGap       `json:"gaps"`
	LapBoundaries   []LapBoundary       `json:"lapBoundaries"`
	StintBoundaries []StintBoundary     `json:"stintBoundaries"`
}

// ContractVersion es tipo local para versionado.
type ContractVersion string

func (v ContractVersion) ValidateTemporal() error {
	if v != ContractVersionTemporalSegmentsV1 {
		return contractError("unsupported_contract_version", "contractVersion", "unsupported temporal segments version")
	}
	return nil
}

func (s ContinuousSegment) Validate() error {
	if err := validateIdentifier("segmentId", s.SegmentID); err != nil {
		return err
	}
	if !s.Presence.Valid() {
		return contractError("invalid_document", "presence", "unknown presence")
	}
	if err := s.Provenance.Validate(); err != nil {
		return err
	}
	if err := s.Confidence.Validate(); err != nil {
		return err
	}
	if s.SessionEndTs.Before(s.SessionStartTs) {
		return contractError("invalid_document", "sessionEndTs", "must be >= sessionStartTs")
	}
	return nil
}

func (g CoverageGap) Validate() error {
	if err := validateIdentifier("gapId", g.GapID); err != nil {
		return err
	}
	if !g.Presence.Valid() {
		return contractError("invalid_document", "presence", "unknown presence")
	}
	if g.EndTs.Before(g.StartTs) {
		return contractError("invalid_document", "endTs", "must be >= startTs")
	}
	return g.Provenance.Validate()
}

func (b LapBoundary) Validate() error {
	if !b.Source.Valid() {
		return contractError("invalid_document", "source", "unknown lap boundary source")
	}
	if !b.Quality.Valid() {
		return contractError("invalid_document", "quality", "unknown quality")
	}
	if err := b.Provenance.Validate(); err != nil {
		return err
	}
	if err := b.Confidence.Validate(); err != nil {
		return err
	}
	if b.Location.NormalizedDistance < 0 || b.Location.NormalizedDistance > 1 {
		return contractError("invalid_document", "location.normalizedDistance", "must be in [0,1]")
	}
	return nil
}

func (b StintBoundary) Validate() error {
	if !b.Cause.Valid() {
		return contractError("invalid_document", "cause", "unknown stint boundary cause")
	}
	if !b.Presence.Valid() {
		return contractError("invalid_document", "presence", "unknown presence")
	}
	if err := b.Provenance.Validate(); err != nil {
		return err
	}
	return b.Confidence.Validate()
}
