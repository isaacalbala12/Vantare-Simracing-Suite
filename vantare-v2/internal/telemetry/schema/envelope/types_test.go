package envelope

import (
	"errors"
	"slices"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestObservationKeepsValueAndMetadataSeparate(t *testing.T) {
	t.Parallel()

	field, err := schema.NewField(0, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatalf("NewField() error = %v", err)
	}
	header := Header{Source: "shared-memory", Cursor: schema.Cursor{Epoch: 1, Sequence: 4}, Identity: runIdentity()}
	observation := NewObservation(header, field)

	value, present := observation.Field().Value()
	if !present || value != 0 {
		t.Fatalf("observation value = (%d, %v), want (0, true)", value, present)
	}
	if observation.Header() != header {
		t.Fatalf("Header() = %+v, want %+v", observation.Header(), header)
	}
}

func TestSourceChangeDoesNotChangeRunIdentity(t *testing.T) {
	t.Parallel()

	first := Header{Source: "shared-memory", Identity: runIdentity()}
	second := first
	second.Source = "rest"
	if !first.Identity.SameRun(second.Identity) {
		t.Fatal("source change must not create a new run identity")
	}
}

func TestSnapshotClonesMutablePayloadAtBothBoundaries(t *testing.T) {
	t.Parallel()

	original := []int{1, 2, 3}
	snapshot, err := NewSnapshot(Header{}, original, slices.Clone)
	if err != nil {
		t.Fatalf("NewSnapshot() error = %v", err)
	}
	original[0] = 99
	first, ok := snapshot.Value()
	if !ok {
		t.Fatal("constructed snapshot must contain a value")
	}
	if first[0] != 1 {
		t.Fatalf("snapshot changed through input alias: %v", first)
	}
	first[1] = 88
	second, ok := snapshot.Value()
	if !ok {
		t.Fatal("constructed snapshot must contain a value")
	}
	if second[1] != 2 {
		t.Fatalf("snapshot changed through output alias: %v", second)
	}
}

func TestSnapshotRequiresOwnershipFunction(t *testing.T) {
	t.Parallel()

	if _, err := NewSnapshot[[]int](Header{}, nil, nil); !errors.Is(err, ErrCloneRequired) {
		t.Fatalf("NewSnapshot() error = %v, want %v", err, ErrCloneRequired)
	}
}

func TestZeroSnapshotIsSafeAndEmpty(t *testing.T) {
	t.Parallel()

	value, ok := (Snapshot[[]int]{}).Value()
	if ok || value != nil {
		t.Fatalf("zero snapshot Value() = (%v, %v), want (nil, false)", value, ok)
	}
}

func TestFactCarriesOrderedValueSemanticPayload(t *testing.T) {
	t.Parallel()

	header := Header{Cursor: schema.Cursor{Epoch: 3, Sequence: 9}, Identity: runIdentity()}
	fact := NewFact(header, "lap-completed")
	if fact.Value() != "lap-completed" || fact.Header().Cursor != header.Cursor {
		t.Fatalf("fact = (%q, %+v), want payload and cursor %+v", fact.Value(), fact.Header(), header.Cursor)
	}
}

func runIdentity() identity.RunIdentity {
	return identity.RunIdentity{Event: "event", Session: "session", Vehicle: "vehicle", Team: "team", Driver: "driver"}
}
