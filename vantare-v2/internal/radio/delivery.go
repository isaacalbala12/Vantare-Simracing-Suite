package radio

import (
	"context"
	"errors"
	"sort"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
)

var (
	ErrInvalidRequest    = errors.New("radio delivery request is invalid")
	ErrInvalidTransition = errors.New("radio delivery transition is invalid")
	ErrLifecycleBoundary = errors.New("radio delivery cancelled by lifecycle boundary")
	ErrSourceUnavailable = errors.New("radio delivery cancelled because source is unavailable")
)

// State describes the queued, started and terminal delivery lifecycle.
type State string

const (
	StateQueued      State = "queued"
	StateStarted     State = "started"
	StateCompleted   State = "completed"
	StateInterrupted State = "interrupted"
	StateFailed      State = "failed"
	StateCancelled   State = "cancelled"
)

// Reason explains terminal delivery states without exposing message content.
type Reason string

const (
	ReasonNone               Reason = ""
	ReasonPreemptedBySpotter Reason = "preempted_by_spotter"
	ReasonLifecycleBoundary  Reason = "lifecycle_boundary"
	ReasonDeadlineElapsed    Reason = "deadline_elapsed"
	ReasonSourceUnavailable  Reason = "source_unavailable"
	ReasonPolicyRejected     Reason = "policy_rejected"
	ReasonTransportError     Reason = "transport_error"
)

// Request binds one selected radio message to a bounded delivery identity.
type Request struct {
	Version     string
	DeliveryID  string
	DecidedAtMS int64
	Message     RadioMessage
}

// Acknowledgement records lifecycle only; it excludes text, audio paths and telemetry.
type Acknowledgement struct {
	Version, DeliveryID, MessageID string
	State                          State
	Reason                         Reason
	AtMS                           int64
}

// Reporter accepts a valid queued to started to terminal transition sequence.
type Reporter interface{ Acknowledge(State, Reason) error }

// Port performs one cancelable user-facing delivery.
type Port interface {
	Deliver(context.Context, Request, Reporter) error
}

// Session validates ACK transitions and records bounded latency metrics.
type Session struct {
	mu       sync.Mutex
	request  Request
	clock    Clock
	metrics  *Metrics
	observer func(Acknowledgement) error
	state    State
}

// NewSession creates the reporter for one valid request.
func NewSession(request Request, clock Clock, metrics *Metrics, observer func(Acknowledgement) error) (*Session, error) {
	if clock == nil || metrics == nil || request.Version != VersionV1 || request.Message.Version != VersionV1 ||
		!validField(request.DeliveryID, 256) || !validField(request.Message.ID, 256) || request.DecidedAtMS < 0 ||
		request.Message.CreatedAtMS < 0 || request.Message.ExpiresAtMS <= request.Message.CreatedAtMS ||
		request.DecidedAtMS >= request.Message.ExpiresAtMS {
		return nil, ErrInvalidRequest
	}
	return &Session{request: request, clock: clock, metrics: metrics, observer: observer}, nil
}

// Acknowledge validates and persists one lifecycle transition.
func (session *Session) Acknowledge(state State, reason Reason) error {
	if !validStateReason(state, reason) {
		return ErrInvalidTransition
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	if !validTransition(session.state, state) {
		return ErrInvalidTransition
	}
	now := session.clock.NowMS()
	ack := Acknowledgement{Version: VersionV1, DeliveryID: session.request.DeliveryID, MessageID: session.request.Message.ID, State: state, Reason: reason, AtMS: now}
	if session.observer != nil {
		if err := session.observer(ack); err != nil {
			return err
		}
	}
	session.state = state
	session.metrics.record(state, session.request.DecidedAtMS, now)
	return nil
}

func validTransition(from, to State) bool {
	switch from {
	case "":
		return to == StateQueued
	case StateQueued:
		return to == StateStarted || to == StateCancelled || to == StateFailed
	case StateStarted:
		return to == StateCompleted || to == StateInterrupted || to == StateCancelled || to == StateFailed
	default:
		return false
	}
}

func validStateReason(state State, reason Reason) bool {
	switch state {
	case StateQueued, StateStarted, StateCompleted:
		return reason == ReasonNone
	case StateInterrupted:
		return reason == ReasonPreemptedBySpotter
	case StateFailed:
		return reason == ReasonTransportError
	case StateCancelled:
		return reason == ReasonLifecycleBoundary || reason == ReasonDeadlineElapsed || reason == ReasonSourceUnavailable ||
			reason == ReasonPolicyRejected || reason == ReasonPreemptedBySpotter
	default:
		return false
	}
}

// MetricsSnapshot reports observed decision-to-start latency; Wails p95 remains an F3 gate.
type MetricsSnapshot struct {
	Samples          int
	P95MS, MaximumMS int64
}

// Metrics keeps a bounded rolling latency sample.
type Metrics struct {
	mu      sync.Mutex
	limit   int
	latency []int64
}

// NewMetrics creates a bounded metrics collector.
func NewMetrics(limit int) *Metrics {
	if limit <= 0 {
		limit = 128
	}
	return &Metrics{limit: limit, latency: make([]int64, 0, limit)}
}

func (metrics *Metrics) record(state State, decided, at int64) {
	if state != StateStarted {
		return
	}
	metrics.mu.Lock()
	defer metrics.mu.Unlock()
	latency := at - decided
	if latency < 0 {
		latency = 0
	}
	if len(metrics.latency) == metrics.limit {
		copy(metrics.latency, metrics.latency[1:])
		metrics.latency[len(metrics.latency)-1] = latency
	} else {
		metrics.latency = append(metrics.latency, latency)
	}
}

// Snapshot returns the nearest-rank p95 of the retained samples.
func (metrics *Metrics) Snapshot() MetricsSnapshot {
	metrics.mu.Lock()
	defer metrics.mu.Unlock()
	result := MetricsSnapshot{Samples: len(metrics.latency)}
	if len(metrics.latency) == 0 {
		return result
	}
	ordered := append([]int64(nil), metrics.latency...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i] < ordered[j] })
	index := (95*len(ordered)+99)/100 - 1
	result.P95MS = ordered[index]
	result.MaximumMS = ordered[len(ordered)-1]
	return result
}

// UIPublisher emits the always-on visual radio event.
type UIPublisher interface {
	PublishRadio(context.Context, Presentation) error
}

// CachedAudioResolver matches audio.AudioRouter.ResolveCached and never synthesizes.
type CachedAudioResolver interface {
	ResolveCached(context.Context, string, audio.Channel) (string, error)
}

// AudioPlayer matches audio.Player.PlayContext.
type AudioPlayer interface {
	PlayContext(context.Context, string) error
}

// DualPort publishes UI and optionally plays an already cached audio file.
type DualPort struct {
	Resolver *Resolver
	UI       UIPublisher
	Audio    CachedAudioResolver
	Player   AudioPlayer
	Clock    Clock
}

// Deliver emits queued, started and exactly one terminal ACK.
func (port DualPort) Deliver(ctx context.Context, request Request, reporter Reporter) error {
	if reporter == nil || port.Resolver == nil || port.UI == nil || request.Version != VersionV1 ||
		request.Message.Version != VersionV1 || !validField(request.DeliveryID, 256) || !validField(request.Message.ID, 256) {
		return ErrInvalidRequest
	}
	if err := reporter.Acknowledge(StateQueued, ReasonNone); err != nil {
		return err
	}
	now := port.Clock
	if now == nil {
		now = systemClock{}
	}
	if reason := cancellationReason(ctx, request.Message.ExpiresAtMS, now.NowMS()); reason != ReasonNone {
		return reporter.Acknowledge(StateCancelled, reason)
	}
	presentation, err := port.Resolver.Resolve(request.Message)
	if err != nil {
		_ = reporter.Acknowledge(StateFailed, ReasonTransportError)
		return err
	}
	path := ""
	if port.Audio != nil && port.Player != nil {
		path, _ = port.Audio.ResolveCached(ctx, presentation.VoiceText, presentation.Channel)
	}
	if reason := cancellationReason(ctx, request.Message.ExpiresAtMS, now.NowMS()); reason != ReasonNone {
		return reporter.Acknowledge(StateCancelled, reason)
	}
	if err := reporter.Acknowledge(StateStarted, ReasonNone); err != nil {
		return err
	}
	if err := port.UI.PublishRadio(ctx, presentation); err != nil {
		if reason := cancellationReason(ctx, request.Message.ExpiresAtMS, now.NowMS()); reason != ReasonNone {
			if reason == ReasonPreemptedBySpotter {
				return reporter.Acknowledge(StateInterrupted, reason)
			}
			return reporter.Acknowledge(StateCancelled, reason)
		}
		_ = reporter.Acknowledge(StateFailed, ReasonTransportError)
		return err
	}
	if path != "" {
		if err := port.Player.PlayContext(ctx, path); err != nil {
			if errors.Is(context.Cause(ctx), ErrPreemptedBySpotter) {
				return reporter.Acknowledge(StateInterrupted, ReasonPreemptedBySpotter)
			}
			_ = reporter.Acknowledge(StateFailed, ReasonTransportError)
			return err
		}
	}
	if reason := cancellationReason(ctx, request.Message.ExpiresAtMS, now.NowMS()); reason != ReasonNone {
		if reason == ReasonPreemptedBySpotter {
			return reporter.Acknowledge(StateInterrupted, reason)
		}
		return reporter.Acknowledge(StateCancelled, reason)
	}
	return reporter.Acknowledge(StateCompleted, ReasonNone)
}

func cancellationReason(ctx context.Context, expires, now int64) Reason {
	if errors.Is(context.Cause(ctx), ErrPreemptedBySpotter) {
		return ReasonPreemptedBySpotter
	}
	if errors.Is(context.Cause(ctx), ErrSourceUnavailable) {
		return ReasonSourceUnavailable
	}
	if ctx.Err() != nil {
		return ReasonLifecycleBoundary
	}
	if expires > 0 && now >= expires {
		return ReasonDeadlineElapsed
	}
	return ReasonNone
}
