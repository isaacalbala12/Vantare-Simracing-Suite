// Package driver defines simulator-neutral contracts consumed by telemetry
// drivers. Concrete drivers live below internal/telemetry/drivers.
package driver

import (
	"context"
	"errors"
)

// ErrTeardown identifies a lifecycle cleanup failure that must reach the
// caller of DriverManager.Stop even when Run also returns context cancellation.
var ErrTeardown = errors.New("telemetry driver teardown failed")

// State is the externally observable lifecycle of one active driver.
type State uint8

const (
	StateStopped State = iota
	StateDetecting
	StateConnecting
	StateLive
	StateDegraded
	StateStale
	StateError
	StateStopping
)

func (state State) Known() bool { return state <= StateStopping }

func (state State) String() string {
	switch state {
	case StateStopped:
		return "stopped"
	case StateDetecting:
		return "detecting"
	case StateConnecting:
		return "connecting"
	case StateLive:
		return "live"
	case StateDegraded:
		return "degraded"
	case StateStale:
		return "stale"
	case StateError:
		return "error"
	case StateStopping:
		return "stopping"
	default:
		return "unknown"
	}
}

// CanTransitionTo defines lifecycle edges, not automatic retry policy. The
// manager must explicitly request a restart after stopped or error.
func (state State) CanTransitionTo(next State) bool {
	if !state.Known() || !next.Known() || state == next {
		return false
	}
	switch state {
	case StateStopped:
		return next == StateDetecting
	case StateDetecting:
		return next == StateConnecting || next == StateStopping || next == StateError
	case StateConnecting:
		return next == StateLive || next == StateDegraded || next == StateStale || next == StateStopping || next == StateError
	case StateLive:
		return next == StateDegraded || next == StateStale || next == StateStopping || next == StateError
	case StateDegraded:
		return next == StateLive || next == StateStale || next == StateStopping || next == StateError
	case StateStale:
		return next == StateConnecting || next == StateLive || next == StateDegraded || next == StateStopping || next == StateError
	case StateError:
		return next == StateStopped || next == StateDetecting || next == StateStopping
	case StateStopping:
		return next == StateStopped || next == StateError
	default:
		return false
	}
}

// ObservationSink is consumed by a driver. WriteObservation may block only
// until ctx is cancelled and must return an inspectable flow-control error
// rather than silently dropping an observation. It consumes mutable payloads
// synchronously: the sink must clone anything it retains, and the driver may
// reuse its buffers only after WriteObservation returns.
type ObservationSink[T any] interface {
	WriteObservation(ctx context.Context, observation T) error
}
