// Package envelope defines transport-neutral metadata wrappers. It does not
// define a universal telemetry payload or know any simulator or product.
package envelope

import (
	"errors"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

var ErrCloneRequired = errors.New("snapshot payload requires an ownership clone function")

type SourceID string

// Header carries ordering, time, source and run identity independently.
type Header struct {
	Source   SourceID
	Cursor   schema.Cursor
	Clock    schema.Clock
	Identity identity.RunIdentity
}

// Observation carries a continuous value-semantic field. Slices and maps are
// excluded by the comparable constraint.
type Observation[T comparable] struct {
	header Header
	field  schema.Field[T]
}

func NewObservation[T comparable](header Header, field schema.Field[T]) Observation[T] {
	return Observation[T]{header: header, field: field}
}

func (observation Observation[T]) Header() Header { return observation.header }

func (observation Observation[T]) Field() schema.Field[T] { return observation.field }

type Clone[T any] func(T) T

// Snapshot owns its payload. The clone function copies mutable collections at
// construction and every read, so no slice or map is shared with consumers.
type Snapshot[T any] struct {
	header Header
	value  T
	clone  Clone[T]
}

func NewSnapshot[T any](header Header, value T, clone Clone[T]) (Snapshot[T], error) {
	if clone == nil {
		return Snapshot[T]{}, ErrCloneRequired
	}
	return Snapshot[T]{header: header, value: clone(value), clone: clone}, nil
}

// NewSnapshotOwned stores an already-owned value without an extra clone.
// The caller transfers ownership and must not mutate the value after the call.
// Reads via Value() still clone, so the snapshot remains value-semantic for
// consumers and no mutable slice is shared between frames.
func NewSnapshotOwned[T any](header Header, value T, clone Clone[T]) (Snapshot[T], error) {
	if clone == nil {
		return Snapshot[T]{}, ErrCloneRequired
	}
	return Snapshot[T]{header: header, value: value, clone: clone}, nil
}

func (snapshot Snapshot[T]) Header() Header { return snapshot.header }

func (snapshot Snapshot[T]) Value() (T, bool) {
	if snapshot.clone == nil {
		var zero T
		return zero, false
	}
	return snapshot.clone(snapshot.value), true
}

// Peek returns the internal value without cloning. The caller must not mutate
// the returned value: the snapshot and its owner share the same mutable
// collections until the next frame clones them. Use for read-only derives.
func (snapshot Snapshot[T]) Peek() (T, bool) {
	if snapshot.clone == nil {
		var zero T
		return zero, false
	}
	return snapshot.value, true
}

// Fact carries one ordered, value-semantic discrete occurrence.
type Fact[T comparable] struct {
	header Header
	value  T
}

func NewFact[T comparable](header Header, value T) Fact[T] {
	return Fact[T]{header: header, value: value}
}

func (fact Fact[T]) Header() Header { return fact.header }

func (fact Fact[T]) Value() T { return fact.value }
