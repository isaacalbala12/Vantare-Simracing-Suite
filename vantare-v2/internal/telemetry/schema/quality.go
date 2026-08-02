package schema

import "errors"

var (
	ErrUnknownProvenance = errors.New("unknown telemetry provenance")
	ErrUnknownFreshness  = errors.New("unknown telemetry freshness")
	ErrMissingValue      = errors.New("missing telemetry field cannot carry a value")
)

// Provenance describes how a field value was produced.
type Provenance uint8

const (
	ProvenanceUnknown Provenance = iota
	ProvenanceObserved
	ProvenanceDerived
	ProvenanceEstimated
)

func (value Provenance) Known() bool {
	return value >= ProvenanceObserved && value <= ProvenanceEstimated
}

// Freshness describes whether a field can be used without inferring presence
// from its value. Missing is the safe zero value.
type Freshness uint8

const (
	FreshnessMissing Freshness = iota
	FreshnessFresh
	FreshnessStale
	FreshnessInvalid
)

func (value Freshness) Known() bool {
	return value >= FreshnessMissing && value <= FreshnessInvalid
}

// Field carries one value-semantic telemetry value and its explicit quality.
// The comparable constraint excludes slices and maps from this hot-path type.
type Field[T comparable] struct {
	value      T
	present    bool
	provenance Provenance
	freshness  Freshness
}

func NewField[T comparable](value T, provenance Provenance, freshness Freshness) (Field[T], error) {
	if !provenance.Known() {
		return Field[T]{}, ErrUnknownProvenance
	}
	if !freshness.Known() {
		return Field[T]{}, ErrUnknownFreshness
	}
	if freshness == FreshnessMissing {
		return Field[T]{}, ErrMissingValue
	}
	return Field[T]{
		value:      value,
		present:    true,
		provenance: provenance,
		freshness:  freshness,
	}, nil
}

func MissingField[T comparable]() Field[T] {
	return Field[T]{freshness: FreshnessMissing}
}

func (field Field[T]) Value() (T, bool) { return field.value, field.present }

func (field Field[T]) Provenance() Provenance { return field.provenance }

func (field Field[T]) Freshness() Freshness { return field.freshness }
