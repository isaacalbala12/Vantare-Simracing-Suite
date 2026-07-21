// Package core owns the consumer-side ports of the canonical telemetry loop.
// This package contains contracts only until the runtime is implemented.
package core

import (
	"context"
	"errors"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

var (
	ErrBackpressure = errors.New("telemetry sink backpressure")
	ErrClosed       = errors.New("telemetry sink closed")
)

// Driver is consumed by the future driver manager. Run owns the driver's
// complete blocking lifecycle and must stop when ctx is cancelled.
// RuntimeSnapshot must be concurrency-safe, non-blocking and return data that
// the caller may copy; DriverManager owns transition validation.
type Driver[T any] interface {
	Run(ctx context.Context, sink driver.ObservationSink[T]) error
	RuntimeSnapshot() driver.RuntimeSnapshot
}

// Derivation is one pure, deterministic stage in the future ordered chain. It
// does no I/O, preserves the input header exactly, and returns a new owned
// snapshot without mutating its input.
type Derivation[T any] interface {
	Apply(snapshot envelope.Snapshot[T]) (envelope.Snapshot[T], error)
}

// RecordingSink is consumed by the future core. Writes are loss-intolerant:
// an implementation that cannot keep up returns ErrBackpressure. Close must
// flush accepted data or return an error before its context expires; it is
// idempotent and later writes return ErrClosed.
type RecordingSink[S any, F comparable] interface {
	WriteSnapshot(ctx context.Context, snapshot envelope.Snapshot[S]) error
	WriteFact(ctx context.Context, fact envelope.Fact[F]) error
	Close(ctx context.Context) error
}
