// Package projection defines consumer-side ports shared by pure product
// projections. It acquires no simulator data and knows no transport.
package projection

import (
	"context"
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

var (
	ErrResyncRequired     = errors.New("telemetry subscriber requires a full snapshot resync")
	ErrSubscriptionClosed = errors.New("telemetry fact subscription closed")
)

// ResyncRequiredError reports the discontinuity that invalidated incremental
// consumption. The consumer must read a full snapshot before subscribing again.
type ResyncRequiredError struct {
	Previous schema.Cursor
	Next     schema.Cursor
}

func (err *ResyncRequiredError) Error() string {
	return fmt.Sprintf("%v: cursor %d/%d followed by %d/%d", ErrResyncRequired,
		err.Previous.Epoch, err.Previous.Sequence, err.Next.Epoch, err.Next.Sequence)
}

func (err *ResyncRequiredError) Unwrap() error { return ErrResyncRequired }

// SnapshotReader returns a complete owned snapshot. A consumer uses it first
// and again whenever fact delivery reports ErrResyncRequired.
type SnapshotReader[T any] interface {
	Latest(ctx context.Context) (envelope.Snapshot[T], error)
}

// FactSubscription is pull-based so a slow consumer cannot require an
// unbounded channel. Next blocks only until ctx is cancelled. Close is
// idempotent; after closure Next returns an inspectable closed error.
type FactSubscription[T comparable] interface {
	Next(ctx context.Context) (envelope.Fact[T], error)
	Close() error
}

// FactSubscriber resumes strictly after the supplied cursor. If retained
// history cannot satisfy it, Subscribe returns ErrResyncRequired.
type FactSubscriber[T comparable] interface {
	Subscribe(ctx context.Context, after schema.Cursor) (FactSubscription[T], error)
}

// Projector is a pure, deterministic mapping between owned snapshots. It does
// no I/O and preserves ordering metadata unless its versioned contract says otherwise.
type Projector[Canonical any, Product any] interface {
	Project(snapshot envelope.Snapshot[Canonical]) (envelope.Snapshot[Product], error)
}
