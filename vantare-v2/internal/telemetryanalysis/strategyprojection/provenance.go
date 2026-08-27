package strategyprojection

import (
	"strings"
	"time"
)

// ProvenanceKind es el vocabulario de procedencia del contrato vigente
// (internal/strategy/contract ProvenanceKind) mas el valor nuevo `reference`
// introducido en v2 para datos del catalogo comunitario.
// "measured" de producto mapea a `observed`.
type ProvenanceKind string

const (
	ProvenanceUnknown   ProvenanceKind = "unknown"
	ProvenanceObserved  ProvenanceKind = "observed"
	ProvenanceCorrected ProvenanceKind = "corrected"
	ProvenanceManual    ProvenanceKind = "manual"
	ProvenanceDerived   ProvenanceKind = "derived"
	ProvenanceEstimated ProvenanceKind = "estimated"
	ProvenanceRange     ProvenanceKind = "range"
	ProvenanceReference ProvenanceKind = "reference"
)

func (k ProvenanceKind) Valid() bool {
	switch k {
	case ProvenanceUnknown, ProvenanceObserved, ProvenanceCorrected, ProvenanceManual, ProvenanceDerived, ProvenanceEstimated, ProvenanceRange, ProvenanceReference:
		return true
	default:
		return false
	}
}

// Provenance describe de donde viene un dato. Es independiente de Presence.
type Provenance struct {
	Kind       ProvenanceKind `json:"kind"`
	SourceID   string         `json:"sourceId,omitempty"`
	ObservedAt *time.Time     `json:"observedAt,omitempty"`
}

func (p Provenance) Validate() error {
	switch p.Kind {
	case ProvenanceUnknown:
		if strings.TrimSpace(p.SourceID) != "" || p.ObservedAt != nil {
			return contractError("invalid_provenance", "provenance", "unknown provenance cannot claim a source")
		}
		return nil
	case ProvenanceObserved, ProvenanceCorrected, ProvenanceManual, ProvenanceDerived, ProvenanceEstimated, ProvenanceRange, ProvenanceReference:
		if strings.TrimSpace(p.SourceID) == "" {
			return contractError("invalid_provenance", "provenance.sourceId", "source is required")
		}
		if p.ObservedAt != nil {
			if err := validateTimestamp("provenance.observedAt", *p.ObservedAt); err != nil {
				return err
			}
		}
		return nil
	default:
		return contractError("invalid_provenance", "provenance.kind", "unknown provenance kind")
	}
}
