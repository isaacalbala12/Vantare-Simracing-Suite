// Package engineer defines the transport-neutral contract consumed by
// Engineer and Spotter. It acquires no simulator data and contains no product
// runtime, I/O or scheduling.
package engineer

import (
	"errors"
	"slices"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

var (
	ErrInvalidCapability     = errors.New("engineer capability has an invalid id or state")
	ErrDuplicateCapability   = errors.New("engineer capability manifest contains a duplicate id")
	ErrCapabilityUnknown     = errors.New("engineer capability is unknown")
	ErrCapabilityUnsupported = errors.New("engineer capability is unsupported")
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
	field           schema.Field[T]
	state           ValueState
}

func newField[T comparable](manifest Manifest, id CapabilityID, field schema.Field[T]) (Field[T], error) {
	if id == "" {
		return Field[T]{}, ErrInvalidCapability
	}
	capabilityState := manifest.State(id)
	_, present := field.Value()

	switch capabilityState {
	case CapabilityUnsupported:
		return Field[T]{}, ErrCapabilityUnsupported
	case CapabilityUnknown:
		if present || field.Freshness() != schema.FreshnessMissing {
			return Field[T]{}, ErrCapabilityUnknown
		}
	case CapabilitySupported, CapabilityDegraded:
	default:
		return Field[T]{}, ErrInvalidCapability
	}

	state, err := valueState(field)
	if err != nil {
		return Field[T]{}, err
	}
	return Field[T]{
		capability:      id,
		capabilityState: capabilityState,
		field:           field,
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
		field:           schema.MissingField[T](),
		state:           ValueUnsupported,
	}, nil
}

func (field Field[T]) Capability() CapabilityID { return field.capability }

func (field Field[T]) CapabilityState() CapabilityState { return field.capabilityState }

func (field Field[T]) State() ValueState { return field.state }

func (field Field[T]) Value() (T, bool) { return field.field.Value() }

func (field Field[T]) Provenance() Provenance {
	switch field.field.Provenance() {
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
