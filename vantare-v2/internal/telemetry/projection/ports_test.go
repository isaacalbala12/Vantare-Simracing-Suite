package projection

import (
	"context"
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

type fakeSnapshotReader struct{}

func (fakeSnapshotReader) Latest(context.Context) (envelope.Snapshot[[]int], error) {
	return envelope.Snapshot[[]int]{}, nil
}

type fakeFactSubscription struct{}

func (fakeFactSubscription) Next(context.Context) (envelope.Fact[int], error) {
	return envelope.Fact[int]{}, nil
}
func (fakeFactSubscription) Close(context.Context) error { return nil }

type fakeFactSubscriber struct{}

func (fakeFactSubscriber) Subscribe(context.Context, schema.Cursor) (FactSubscription[int], error) {
	return fakeFactSubscription{}, nil
}

type fakeProjector struct{}

func (fakeProjector) Project(envelope.Snapshot[[]int]) (envelope.Snapshot[int], error) {
	return envelope.Snapshot[int]{}, nil
}

func TestPortsAreSatisfiedByNarrowFakes(t *testing.T) {
	t.Parallel()

	var _ SnapshotReader[[]int] = fakeSnapshotReader{}
	var _ FactSubscription[int] = fakeFactSubscription{}
	var _ FactSubscriber[int] = fakeFactSubscriber{}
	var _ Projector[[]int, int] = fakeProjector{}
}

func TestResyncRequiredErrorPreservesCursors(t *testing.T) {
	t.Parallel()

	wantPrevious := schema.Cursor{Epoch: 2, Sequence: 8}
	wantNext := schema.Cursor{Epoch: 2, Sequence: 11}
	err := &ResyncRequiredError{Previous: wantPrevious, Next: wantNext}

	if !errors.Is(err, ErrResyncRequired) {
		t.Fatal("typed resync error must match ErrResyncRequired")
	}
	var typed *ResyncRequiredError
	if !errors.As(err, &typed) {
		t.Fatal("typed resync error must remain inspectable")
	}
	if typed.Previous != wantPrevious || typed.Next != wantNext {
		t.Fatalf("cursors = %+v -> %+v, want %+v -> %+v", typed.Previous, typed.Next, wantPrevious, wantNext)
	}
}

func TestSubscriptionClosureDiffersFromResync(t *testing.T) {
	t.Parallel()

	if errors.Is(ErrSubscriptionClosed, ErrResyncRequired) {
		t.Fatal("subscription closure must not request a snapshot resync")
	}
}
