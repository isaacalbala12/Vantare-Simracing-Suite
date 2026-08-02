package engineer

import "errors"

var ErrInvalidSourceStatus = errors.New("engineer source status is invalid")

// SourceState is the transport-neutral availability of the canonical live
// source. It carries no simulator details and never makes telemetry fields
// present by itself.
type SourceState string

const (
	SourceStopped    SourceState = "stopped"
	SourceDetecting  SourceState = "detecting"
	SourceConnecting SourceState = "connecting"
	SourceLive       SourceState = "live"
	SourceDegraded   SourceState = "degraded"
	SourceStale      SourceState = "stale"
	SourceError      SourceState = "error"
	SourceStopping   SourceState = "stopping"
)

func (state SourceState) Known() bool {
	switch state {
	case SourceStopped, SourceDetecting, SourceConnecting, SourceLive,
		SourceDegraded, SourceStale, SourceError, SourceStopping:
		return true
	default:
		return false
	}
}

func (state SourceState) Available() bool {
	return state == SourceLive || state == SourceDegraded
}

type SourceStatusV1 struct {
	State            SourceState
	ReconnectAttempt int
}

func NewSourceStatusV1(state SourceState, reconnectAttempt int) (SourceStatusV1, error) {
	if !state.Known() || reconnectAttempt < 0 {
		return SourceStatusV1{}, ErrInvalidSourceStatus
	}
	return SourceStatusV1{State: state, ReconnectAttempt: reconnectAttempt}, nil
}
