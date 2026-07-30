// Package engineer defines the transport-neutral contract consumed by
// Engineer and Spotter. It acquires no simulator data and contains no product
// runtime, I/O or scheduling.
package engineer

import (
	"errors"
	"slices"

	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

var (
	ErrInvalidCapability     = errors.New("engineer capability has an invalid id or state")
	ErrDuplicateCapability   = errors.New("engineer capability manifest contains a duplicate id")
	ErrCapabilityUnknown     = errors.New("engineer capability is unknown")
	ErrCapabilityUnsupported = errors.New("engineer capability is unsupported")
	ErrInvalidProjectedField = errors.New("engineer projected field has invalid quality metadata")
)

type CapabilityID string

// CapabilityState reports what the canonical telemetry pipeline can
// demonstrate. Unknown is the safe zero value and differs from an explicit
// Unsupported result.
type CapabilityState uint8

const (
	CapabilityUnknown CapabilityState = iota
	CapabilitySupported
	CapabilityUnsupported
	CapabilityDegraded
)

func (state CapabilityState) valid() bool {
	return state >= CapabilityUnknown && state <= CapabilityDegraded
}

type Capability struct {
	ID    CapabilityID
	State CapabilityState
}

// Manifest is an immutable capability declaration. Missing IDs are read as
// Unknown; callers must never infer support from a telemetry value. Versioning
// belongs to the transversal projection envelope defined by TC-05A.
type Manifest struct {
	entries []Capability
}

func NewManifest(entries []Capability) (Manifest, error) {
	seen := make(map[CapabilityID]struct{}, len(entries))
	for _, capability := range entries {
		if capability.ID == "" || !capability.State.valid() {
			return Manifest{}, ErrInvalidCapability
		}
		if _, exists := seen[capability.ID]; exists {
			return Manifest{}, ErrDuplicateCapability
		}
		seen[capability.ID] = struct{}{}
	}
	return Manifest{entries: slices.Clone(entries)}, nil
}

func (manifest Manifest) Entries() []Capability {
	return slices.Clone(manifest.entries)
}

func (manifest Manifest) State(id CapabilityID) CapabilityState {
	for _, capability := range manifest.entries {
		if capability.ID == id {
			return capability.State
		}
	}
	return CapabilityUnknown
}

// ValueState keeps a valid zero distinct from absence and records why a value
// must not be used. Missing is the safe zero value.
type ValueState uint8

const (
	ValueMissing ValueState = iota
	ValueFresh
	ValueStale
	ValueInvalid
	ValueUnsupported
)

// Provenance is the product-facing origin of one projected value. It mirrors
// canonical semantics without requiring Engineer consumers to import schema.
type Provenance uint8

const (
	ProvenanceUnknown Provenance = iota
	ProvenanceObserved
	ProvenanceDerived
	ProvenanceEstimated
)

// Field is a value-semantic projection field tied to one declared capability.
// Constructors enforce the relationship between capability and value state.
type Field[T comparable] struct {
	capability      CapabilityID
	capabilityState CapabilityState
	value           T
	present         bool
	provenance      Provenance
	state           ValueState
}

func newField[T comparable](manifest Manifest, id CapabilityID, field schema.Field[T]) (Field[T], error) {
	state, err := valueState(field)
	if err != nil {
		return Field[T]{}, err
	}
	value, present := field.Value()
	return newFieldValue(
		manifest,
		id,
		value,
		present,
		projectSchemaProvenance(field.Provenance()),
		state,
	)
}

func newProjectedField[T comparable](
	manifest Manifest,
	id CapabilityID,
	field telemetryprojection.Field[T],
) (Field[T], error) {
	state, err := projectedValueState(field.Freshness)
	if err != nil {
		return Field[T]{}, err
	}
	provenance, err := projectedProvenance(field.Provenance)
	if err != nil {
		return Field[T]{}, err
	}
	return newFieldValue(manifest, id, field.Value, field.Present, provenance, state)
}

func newFieldValue[T comparable](
	manifest Manifest,
	id CapabilityID,
	value T,
	present bool,
	provenance Provenance,
	state ValueState,
) (Field[T], error) {
	if id == "" {
		return Field[T]{}, ErrInvalidCapability
	}
	capabilityState := manifest.State(id)
	switch capabilityState {
	case CapabilityUnsupported:
		return Field[T]{}, ErrCapabilityUnsupported
	case CapabilityUnknown:
		if present || state != ValueMissing {
			return Field[T]{}, ErrCapabilityUnknown
		}
	case CapabilitySupported, CapabilityDegraded:
	default:
		return Field[T]{}, ErrInvalidCapability
	}
	if !present && state != ValueMissing {
		return Field[T]{}, ErrInvalidProjectedField
	}
	if present && state == ValueMissing {
		return Field[T]{}, ErrInvalidProjectedField
	}
	var zero T
	if !present && value != zero {
		return Field[T]{}, ErrInvalidProjectedField
	}
	if state == ValueMissing && provenance != ProvenanceUnknown {
		return Field[T]{}, ErrInvalidProjectedField
	}
	if present && provenance == ProvenanceUnknown {
		return Field[T]{}, ErrInvalidProjectedField
	}
	return Field[T]{
		capability:      id,
		capabilityState: capabilityState,
		value:           value,
		present:         present,
		provenance:      provenance,
		state:           state,
	}, nil
}

func newUnsupportedField[T comparable](manifest Manifest, id CapabilityID) (Field[T], error) {
	if id == "" {
		return Field[T]{}, ErrInvalidCapability
	}
	if manifest.State(id) != CapabilityUnsupported {
		return Field[T]{}, ErrCapabilityUnsupported
	}
	return Field[T]{
		capability:      id,
		capabilityState: CapabilityUnsupported,
		state:           ValueUnsupported,
	}, nil
}

func (field Field[T]) Capability() CapabilityID { return field.capability }

func (field Field[T]) CapabilityState() CapabilityState { return field.capabilityState }

func (field Field[T]) State() ValueState { return field.state }

func (field Field[T]) Value() (T, bool) { return field.value, field.present }

func (field Field[T]) Provenance() Provenance { return field.provenance }

func (field Field[T]) Usable() bool {
	return field.state == ValueFresh && field.capabilityState == CapabilitySupported
}

func valueState[T comparable](field schema.Field[T]) (ValueState, error) {
	switch field.Freshness() {
	case schema.FreshnessMissing:
		return ValueMissing, nil
	case schema.FreshnessFresh:
		return ValueFresh, nil
	case schema.FreshnessStale:
		return ValueStale, nil
	case schema.FreshnessInvalid:
		return ValueInvalid, nil
	default:
		return ValueMissing, schema.ErrUnknownFreshness
	}
}

func projectedValueState(freshness telemetryprojection.Freshness) (ValueState, error) {
	switch freshness {
	case telemetryprojection.FreshnessMissing:
		return ValueMissing, nil
	case telemetryprojection.FreshnessFresh:
		return ValueFresh, nil
	case telemetryprojection.FreshnessStale:
		return ValueStale, nil
	case telemetryprojection.FreshnessInvalid:
		return ValueInvalid, nil
	default:
		return ValueMissing, ErrInvalidProjectedField
	}
}

func projectSchemaProvenance(provenance schema.Provenance) Provenance {
	switch provenance {
	case schema.ProvenanceObserved:
		return ProvenanceObserved
	case schema.ProvenanceDerived:
		return ProvenanceDerived
	case schema.ProvenanceEstimated:
		return ProvenanceEstimated
	default:
		return ProvenanceUnknown
	}
}

func projectedProvenance(provenance telemetryprojection.Provenance) (Provenance, error) {
	switch provenance {
	case telemetryprojection.ProvenanceUnknown:
		return ProvenanceUnknown, nil
	case telemetryprojection.ProvenanceObserved:
		return ProvenanceObserved, nil
	case telemetryprojection.ProvenanceDerived:
		return ProvenanceDerived, nil
	case telemetryprojection.ProvenanceEstimated:
		return ProvenanceEstimated, nil
	default:
		return ProvenanceUnknown, ErrInvalidProjectedField
	}
}
