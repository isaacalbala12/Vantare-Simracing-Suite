package projection

import (
	"errors"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

var ErrUnknownProjectionVersion = errors.New("unknown telemetry projection version")

type Version uint16

type VersionPolicy struct {
	Current          Version
	MinimumSupported Version
}

func (policy VersionPolicy) Validate(version Version) error {
	if version == 0 || policy.Current == 0 || policy.MinimumSupported == 0 ||
		policy.MinimumSupported > policy.Current ||
		version < policy.MinimumSupported || version > policy.Current {
		return ErrUnknownProjectionVersion
	}
	return nil
}

func (policy VersionPolicy) Deprecated(version Version) bool {
	return policy.Validate(version) == nil && version < policy.Current
}

// Metadata versions the canonical input and product projection independently.
// RecordingVersionV1 deliberately does not appear in a live projection.
type Metadata struct {
	CanonicalVersion  schema.Version  `json:"canonicalVersion"`
	ProjectionVersion Version         `json:"projectionVersion"`
	Epoch             schema.Epoch    `json:"epoch"`
	Sequence          schema.Sequence `json:"sequence"`
	CapturedAt        string          `json:"capturedAt"`
}

func NewMetadata(header envelope.Header, projectionVersion Version) (Metadata, error) {
	if projectionVersion == 0 {
		return Metadata{}, ErrUnknownProjectionVersion
	}
	capturedAt := header.Clock.ReceivedUTC.Round(0).UTC()
	return Metadata{
		CanonicalVersion:  schema.CanonicalVersionV1,
		ProjectionVersion: projectionVersion,
		Epoch:             header.Cursor.Epoch,
		Sequence:          header.Cursor.Sequence,
		CapturedAt:        capturedAt.Format(time.RFC3339Nano),
	}, nil
}

type Provenance string

const (
	ProvenanceUnknown   Provenance = "unknown"
	ProvenanceObserved  Provenance = "observed"
	ProvenanceDerived   Provenance = "derived"
	ProvenanceEstimated Provenance = "estimated"
)

type Freshness string

const (
	FreshnessMissing Freshness = "missing"
	FreshnessFresh   Freshness = "fresh"
	FreshnessStale   Freshness = "stale"
	FreshnessInvalid Freshness = "invalid"
)

// Field keeps presence independent from the value, so false, zero and empty
// strings remain valid observations in JSON.
type Field[T comparable] struct {
	Present    bool       `json:"present"`
	Value      T          `json:"value"`
	Provenance Provenance `json:"provenance"`
	Freshness  Freshness  `json:"freshness"`
}

// MissingField returns an explicit unavailable value. Product projections use
// it instead of the Go zero value so their JSON never loses quality semantics.
func MissingField[T comparable]() Field[T] {
	return Field[T]{
		Provenance: ProvenanceUnknown,
		Freshness:  FreshnessMissing,
	}
}

func FromField[T comparable](field schema.Field[T]) Field[T] {
	return MapField(field, func(value T) T { return value })
}

func MapField[Source, Target comparable](field schema.Field[Source], convert func(Source) Target) Field[Target] {
	value, present := field.Value()
	var target Target
	if present {
		target = convert(value)
	}
	return Field[Target]{
		Present:    present,
		Value:      target,
		Provenance: projectProvenance(field.Provenance()),
		Freshness:  projectFreshness(field.Freshness()),
	}
}

func Available[T comparable](field Field[T]) bool {
	return field.Present && field.Freshness != FreshnessInvalid
}

func FromFreshness(value schema.Freshness) Freshness {
	return projectFreshness(value)
}

func SessionTypeName(value session.Type) string {
	switch value {
	case session.TypePractice:
		return "practice"
	case session.TypeQualifying:
		return "qualifying"
	case session.TypeRace:
		return "race"
	case session.TypeWarmup:
		return "warmup"
	case session.TypeEndurance:
		return "endurance"
	default:
		return "unknown"
	}
}

func projectProvenance(value schema.Provenance) Provenance {
	switch value {
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

func projectFreshness(value schema.Freshness) Freshness {
	switch value {
	case schema.FreshnessFresh:
		return FreshnessFresh
	case schema.FreshnessStale:
		return FreshnessStale
	case schema.FreshnessInvalid:
		return FreshnessInvalid
	default:
		return FreshnessMissing
	}
}
